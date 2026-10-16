package com.dossier.api.service.ent.mkt.opportunities;

import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.RequirementSkill;
import com.dossier.api.repository.ent.talent.RequirementSkillRepository;
import com.dossier.api.service.ApplicationKeys;
import com.dossier.api.service.ent.IdempotencyService.Outcome;
import com.dossier.api.service.ent.jobs.IdempotentCreate;
import com.dossier.api.service.ent.jobs.JobDataLedger;
import com.dossier.api.service.ent.jobs.JobDetailMapper;
import com.dossier.api.service.ent.jobs.JobIdentityService;
import com.dossier.api.service.ent.jobs.JobIdentityService.Found;
import com.dossier.api.service.ent.jobs.UrlKeys;
import com.dossier.api.service.ent.mkt.MktScope;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.privacy.SensitiveContent;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * MKT-40: a marketer adds a job BY HAND in the Marketing workspace (title, company, location, work mode, description, an optional link), source
 * label {@code MANUAL}. It needs {@code opportunities.manage} (the permission of the whole Opportunities board and of the extension's Save for
 * consultant), NOT {@code requirements.manage}: the Marketing Specialist never gets to edit or close the organization's jobs, only to put a job of their
 * own in front of their consultants. The job is org-owned (the org comes from the caller's membership, never from the body), found-or-created by the
 * same identity as a captured job (the normalized link when there is one, else company + title + place via {@link ApplicationKeys}), so typing in a job
 * that is already stored answers the stored one instead of a duplicate. Audited ({@code MARKETER_JOB_CREATE}, the marketer is the actor) and written to
 * the job data ledger as CAPTURED by that member, all in the idempotency transaction.
 *
 * <p>Never: fetches the link, assigns anyone (the marketer then adds an opportunity on the board), applies or signs in as anyone.
 */
@Service
public class MktManualJobService {

    public static final String PERMISSION = "opportunities.manage";
    public static final String AUDIT_ACTION = "MARKETER_JOB_CREATE";
    public static final String AUDIT_TARGET = "REQUIREMENT";
    public static final String SOURCE = "MANUAL";
    public static final int MAX_SKILLS = 8;
    private static final Set<String> WORK_MODES = Set.of("REMOTE", "HYBRID", "ONSITE");

    /** What the marketer typed. {@code jobUrl} is optional (https only); {@code skills} at most {@value #MAX_SKILLS}. */
    public record Request(String title, String company, String location, String workMode, String description, String jobUrl, List<String> skills) {}

    /** {@code existingJob}: the same job was already stored, so nothing was created or changed. */
    public record Response(Long jobId, boolean existingJob, String source) {}

    private record Clean(String title, String company, String location, String workMode, String description, String jobUrl, List<String> skills) {}

    private final MktScope scope;
    private final JobIdentityService identity;
    private final RequirementSkillRepository skills;
    private final JobDataLedger ledger;
    private final IdempotentCreate idempotent;
    private final OrgAuditService audit;
    private final Clock clock;

    @Autowired
    public MktManualJobService(MktScope scope, JobIdentityService identity, RequirementSkillRepository skills, JobDataLedger ledger, IdempotentCreate idempotent, OrgAuditService audit) {
        this.scope = scope;
        this.identity = identity;
        this.skills = skills;
        this.ledger = ledger;
        this.idempotent = idempotent;
        this.audit = audit;
        this.clock = Clock.systemUTC();
    }

    /** Gate (generic 404), validate (400 / 422), then the idempotent write. */
    public Outcome<Response> create(OrgMembership me, String idempotencyKey, Request request) {
        MktScope.View view = scope.resolve(me, PERMISSION);
        Clean c = validate(request);
        String path = "/api/orgs/" + me.orgId() + "/mkt/opportunities/job";
        return idempotent.run(me, idempotencyKey, path, request, 201, Response.class, () -> write(view, me, c, requestId(me.orgId(), idempotencyKey)));
    }

    private Response write(MktScope.View view, OrgMembership me, Clean c, String requestId) {
        Instant now = clock.instant();
        String keyText;
        String keyHash;
        if (c.jobUrl() != null) {
            UrlKeys.Key k = UrlKeys.of(c.jobUrl(), null);
            if (k == null) throw invalid("jobUrl", "that is not a valid link");
            keyText = k.key();
            keyHash = k.hash();
        } else {
            keyText = cap("manual:" + ApplicationKeys.company(c.company()) + "|" + ApplicationKeys.title(c.title()) + "|" + c.location().toLowerCase(Locale.ROOT).replaceAll("[^\\p{L}\\p{N}]+", ""), 1000);
            keyHash = UrlKeys.hash(keyText);
        }
        Found<ClientRequirement> existing = identity.findRequirement(view, keyHash, null, null).map(f -> new Found<>(f, true)).orElse(null);
        if (existing != null) return new Response(existing.value().getId(), true, existing.value().getSource());

        Found<ClientAccount> client = identity.findOrCreateClient(view, c.company(), () -> newClient(me, now));
        final String key = keyText;
        final String hash = keyHash;
        Found<ClientRequirement> job = identity.findOrCreateRequirement(
            view,
            hash,
            null,
            null,
            () -> newJob(me, c, client.value().getId(), key, hash, now),
            created -> ledger.enteredByHandEvent(created, me.memberId(), requestId, fieldNames(c)),
            created -> saveSkills(created, c.skills())
        );
        audit.record(me, AUDIT_ACTION, AUDIT_TARGET, null, String.valueOf(job.value().getId()), "{\"created\":" + !job.existing() + ",\"source\":\"" + SOURCE + "\"}");
        return new Response(job.value().getId(), job.existing(), SOURCE);
    }

    private static ClientAccount newClient(OrgMembership me, Instant now) {
        ClientAccount a = new ClientAccount();
        a.setOwnerMemberId(me.memberId());
        a.setCreatedAt(now);
        a.setUpdatedAt(now);
        return a;
    }

    private static ClientRequirement newJob(OrgMembership me, Clean c, Long clientId, String key, String hash, Instant now) {
        ClientRequirement j = new ClientRequirement();
        j.setClientId(clientId);
        j.setTitle(c.title());
        j.setDescriptionText(c.description());
        j.setLocation(c.location());
        j.setWorkMode(c.workMode());
        j.setStatus("OPEN");
        j.setPostedAt(now);
        j.setOwnerMemberId(me.memberId());
        j.setSource(SOURCE);
        j.setCreatedAt(now);
        j.setUpdatedAt(now);
        j.setJobUrl(c.jobUrl());
        j.setUrlKey(key);
        j.setUrlKeyHash(hash);
        j.setCaptureSource(SOURCE);
        j.setCapturedByMemberId(me.memberId());
        j.setCapturedAt(now);
        j.setCaptureMethod("MANUAL_ENTRY");
        j.setDetailLevel(JobDetailMapper.MINIMAL);
        j.setDetailLevelChangedAt(now);
        j.setDetailLevelChangedBy(me.memberId());
        return j;
    }

    private void saveSkills(ClientRequirement job, List<String> names) {
        int order = 0;
        for (String name : names) {
            RequirementSkill s = new RequirementSkill();
            s.setOrgId(job.getOrgId());
            s.setRequirementId(job.getId());
            s.setSkill(name);
            s.setSortOrder(order++);
            skills.save(s);
        }
    }

    private static List<String> fieldNames(Clean c) {
        List<String> names = new ArrayList<>(List.of("title", "company", "location", "workMode", "description"));
        if (c.jobUrl() != null) names.add("jobUrl");
        if (!c.skills().isEmpty()) names.add("skills");
        return names;
    }

    // ---- validation ---------------------------------------------------------------------------------------------------------------

    private static Clean validate(Request r) {
        if (r == null) throw invalid("body", "send the job as a JSON object");
        String title = required("title", r.title(), 2, 300);
        String company = required("company", r.company(), 1, 200);
        String location = required("location", r.location(), 1, 300);
        String workMode = r.workMode() == null || r.workMode().isBlank() ? null : r.workMode().trim().toUpperCase(Locale.ROOT);
        if (workMode == null || !WORK_MODES.contains(workMode)) throw invalid("workMode", "one of ONSITE, HYBRID, REMOTE");
        String description = required("description", r.description(), 1, 4000);
        String jobUrl = r.jobUrl() == null || r.jobUrl().isBlank() ? null : r.jobUrl().trim();
        if (jobUrl != null) UrlKeys.requireAllowed(jobUrl);
        List<String> skillNames = cleanSkills(r.skills());
        // free text goes through the never-collected scan (SSN, bank, tax id, passport, date of birth ...); the link is an identifier, not scanned
        SensitiveContent.check("title", "title", title);
        SensitiveContent.check("company", "company", company);
        SensitiveContent.check("location", "location", location);
        SensitiveContent.check("description", "description", description);
        for (int i = 0; i < skillNames.size(); i++) SensitiveContent.check("skills[" + i + "]", "skills", skillNames.get(i));
        return new Clean(title, company, location, workMode, description, jobUrl, skillNames);
    }

    private static String required(String field, String value, int min, int max) {
        String v = value == null ? "" : value.strip();
        if (v.length() < min || v.length() > max) throw invalid(field, "enter " + min + " to " + max + " characters");
        if (v.chars().anyMatch(ch -> Character.isISOControl(ch) && ch != '\n' && ch != '\r' && ch != '\t') || v.indexOf('<') >= 0 || v.indexOf('>') >= 0) {
            throw invalid(field, "contains characters that are not allowed");
        }
        return v;
    }

    private static List<String> cleanSkills(List<String> raw) {
        if (raw == null) return List.of();
        Set<String> seen = new LinkedHashSet<>();
        List<String> out = new ArrayList<>();
        for (String s : raw) {
            String v = s == null ? "" : s.strip();
            if (v.isEmpty()) continue;
            if (v.length() > 60) throw invalid("skills", "each skill is 1 to 60 characters");
            if (seen.add(v.toLowerCase(Locale.ROOT))) out.add(v);
        }
        if (out.size() > MAX_SKILLS) throw invalid("skills", "at most " + MAX_SKILLS + " skills");
        return List.copyOf(out);
    }

    private static String cap(String s, int max) {
        return s.length() <= max ? s : s.substring(0, max);
    }

    private static OrgException invalid(String field, String message) {
        return OrgException.coded(400, "VALIDATION", field + ": " + message, Map.of("field", field));
    }

    private static String requestId(Long orgId, String idempotencyKey) {
        try {
            String hex = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest((orgId + ":" + (idempotencyKey == null ? "" : idempotencyKey.strip())).getBytes(StandardCharsets.UTF_8)));
            return hex.substring(0, 32);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
