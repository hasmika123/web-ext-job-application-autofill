package com.dossier.api.service.ent.mkt.opportunities;

import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.RequirementSkill;
import com.dossier.api.repository.ent.talent.RequirementSkillRepository;
import com.dossier.api.service.ent.IdempotencyService.Outcome;
import com.dossier.api.service.ent.jobs.IdempotentCreate;
import com.dossier.api.service.ent.jobs.JobDataLedger;
import com.dossier.api.service.ent.jobs.JobDetailMapper;
import com.dossier.api.service.ent.jobs.JobIdentityService;
import com.dossier.api.service.ent.jobs.JobIdentityService.Found;
import com.dossier.api.service.ent.jobs.OpportunityAssignmentService;
import com.dossier.api.service.ent.jobs.UrlKeys;
import com.dossier.api.service.ent.mkt.MktScope;
import com.dossier.api.service.ent.mkt.opportunities.MktFromExtensionDTO.ConsultantResult;
import com.dossier.api.service.ent.mkt.opportunities.MktFromExtensionDTO.Request;
import com.dossier.api.service.ent.mkt.opportunities.MktFromExtensionDTO.Response;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.privacy.SensitiveContent;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
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
 * "Save for consultant" from the marketer's browser extension (docs/enterprise-v2/60-job-phase1-contract.md sections 0 and 4, 61 sections 2 and 3):
 * the marketer, on a job page they are looking at, sends the trimmed job plus a note and picks consultants; this stores the job and puts it in front
 * of each of them.
 *
 * <p>What it does: finds or creates the employer ({@code client_account}, by name) and the job ({@code client_requirement}, by the normalized link
 * and then by ATS platform + external id), stamps the provenance (capture source EXTENSION, method USER_CLICK, who, when, extension version, a hash of
 * what was received) and the stored detail level MINIMAL, then assigns each consultant through the one {@link OpportunityAssignmentService} (the
 * resume gate is waived for extension jobs because the consultant applies for it themselves). The job-data ledger gets {@code CAPTURED} when the job is
 * created and {@code ASSIGNED} per consultant, in the same transaction as the change.
 *
 * <p>What it never does: accept {@code state}, {@code appliedAt} or a job description (the request is a whitelist, unknown fields are 400), fetch
 * the link (there is NO HTTP client in this class or its collaborators: a user-supplied URL is data, never a target), apply for anyone, or sign in as
 * anyone. A consultant outside the caller's scope is reported in the result ({@code NOT_IN_SCOPE}), never a 404 for the whole call.
 *
 * <p>Idempotency: the {@code Idempotency-Key} is required; the whole write (job, employer, skills, assignments, ledger, audit) runs in the
 * idempotency transaction, so a failure leaves nothing and a retry with the same key replays the stored reply.
 */
@Service
public class MktFromExtensionService {

    public static final String PERMISSION = "opportunities.manage";
    public static final String AUDIT_ACTION = "MARKETER_JOB_CAPTURE";
    public static final String AUDIT_TARGET = "REQUIREMENT";
    public static final String REASON_NOT_IN_SCOPE = "NOT_IN_SCOPE";
    public static final String REASON_INACTIVE = OpportunityAssignmentService.CONSULTANT_INACTIVE;
    public static final String REASON_RESUME = "RESUME_NOT_APPROVED";
    public static final int MAX_SKILLS = 8;
    public static final int MAX_CONSULTANTS = 20;

    private static final Set<String> WORK_MODES = Set.of("REMOTE", "HYBRID", "ONSITE");
    private static final Set<String> PAY_PERIODS = Set.of("HOUR", "MONTH", "YEAR");
    private static final Set<String> PRIORITIES = Set.of("LOW", "MEDIUM", "HIGH");
    /** The job fields that count as "set by the capture" in the ledger row (names only). */
    private static final List<String> JOB_FIELDS = List.of(
        "jobUrl", "title", "company", "location", "workMode", "employmentType", "payLabel", "payMin", "payMax", "payPeriod", "externalJobId", "atsPlatform", "postedOn", "skills", "keyInfo"
    );

    /** The request after validation and trimming. */
    record Clean(
        String jobUrl,
        String title,
        String company,
        String location,
        String workMode,
        String employmentType,
        String payLabel,
        Integer payMin,
        Integer payMax,
        String payPeriod,
        String externalJobId,
        String atsPlatform,
        LocalDate postedOn,
        List<String> skills,
        String keyInfo,
        String priority,
        LocalDate dueOn,
        List<Long> consultantIds,
        String extensionVersion,
        String payloadHash
    ) {}

    private final MktScope scope;
    private final JobIdentityService identity;
    private final OpportunityAssignmentService assignment;
    private final RequirementSkillRepository skills;
    private final JobDataLedger ledger;
    private final IdempotentCreate idempotent;
    private final OrgAuditService audit;
    private final Clock clock;

    @Autowired
    public MktFromExtensionService(
        MktScope scope,
        JobIdentityService identity,
        OpportunityAssignmentService assignment,
        RequirementSkillRepository skills,
        JobDataLedger ledger,
        IdempotentCreate idempotent,
        OrgAuditService audit
    ) {
        this(scope, identity, assignment, skills, ledger, idempotent, audit, Clock.systemUTC());
    }

    public MktFromExtensionService(
        MktScope scope,
        JobIdentityService identity,
        OpportunityAssignmentService assignment,
        RequirementSkillRepository skills,
        JobDataLedger ledger,
        IdempotentCreate idempotent,
        OrgAuditService audit,
        Clock clock
    ) {
        this.scope = scope;
        this.identity = identity;
        this.assignment = assignment;
        this.skills = skills;
        this.ledger = ledger;
        this.idempotent = idempotent;
        this.audit = audit;
        this.clock = clock;
    }

    /**
     * Gate (404), validate (400 / 422), then the idempotent write. Not {@code @Transactional} itself: the write runs inside the transaction of
     * {@link IdempotentCreate}, together with the stored reply.
     */
    public Outcome<Response> fromExtension(OrgMembership me, String idempotencyKey, byte[] body) {
        MktScope.View view = scope.resolve(me, PERMISSION); // the gate comes before the body is even read
        return fromExtension(me, view, idempotencyKey, MktFromExtensionDTO.parse(body));
    }

    /** The same for a body that was already parsed (tests). */
    public Outcome<Response> fromExtension(OrgMembership me, String idempotencyKey, Request request) {
        return fromExtension(me, scope.resolve(me, PERMISSION), idempotencyKey, request);
    }

    private Outcome<Response> fromExtension(OrgMembership me, MktScope.View view, String idempotencyKey, Request request) {
        Clean clean = validate(request);
        String path = "/api/orgs/" + me.orgId() + "/mkt/opportunities/from-extension";
        return idempotent.run(me, idempotencyKey, path, request, Response.class, () -> write(view, me, clean, requestId(me.orgId(), idempotencyKey)));
    }

    // ---- the write ---------------------------------------------------------------------------------------------------------------

    private Response write(MktScope.View view, OrgMembership me, Clean c, String requestId) {
        Instant now = clock.instant();
        UrlKeys.Key key = UrlKeys.of(c.jobUrl(), c.externalJobId());
        if (key == null) throw MktFromExtensionDTO.invalid("jobUrl", "enter the link of the job posting");

        Found<ClientAccount> client = identity.findOrCreateClient(view, c.company(), () -> newClient(me, now));
        Found<ClientRequirement> job = identity.findOrCreateRequirement(
            view,
            key.hash(),
            c.atsPlatform(),
            c.externalJobId(),
            () -> newJob(me, c, client.value().getId(), key, now),
            created -> ledger.capturedEvent(created, me.memberId(), requestId, capturedFields(c))
        );
        ClientRequirement j = job.value();
        if (job.existing() && !OpportunityAssignmentService.OPEN_JOB.contains(j.getStatus())) {
            throw OrgException.coded(409, "JOB_NOT_OPEN", "That job is not open.", Map.of());
        }
        if (!job.existing()) saveSkills(j, c.skills());

        List<ConsultantResult> results = new ArrayList<>();
        int assigned = 0;
        for (Long consultantId : c.consultantIds()) {
            ConsultantResult r = assignOne(view, me, j.getId(), consultantId, c);
            if (r.reason() == null && !r.existing()) assigned++;
            results.add(r);
        }
        audit.record(
            me,
            AUDIT_ACTION,
            AUDIT_TARGET,
            null,
            String.valueOf(j.getId()),
            "{\"created\":" + !job.existing() + ",\"consultants\":" + c.consultantIds().size() + ",\"assigned\":" + assigned + "}"
        );
        return new Response(j.getId(), job.existing(), List.copyOf(results));
    }

    private ConsultantResult assignOne(MktScope.View view, OrgMembership me, Long jobId, Long consultantId, Clean c) {
        if (!view.sees(consultantId)) return new ConsultantResult(consultantId, null, false, REASON_NOT_IN_SCOPE);
        OpportunityAssignmentService.Options options = OpportunityAssignmentService.Options.none()
            .withNewMatch(null, "Saved by a marketer from the browser extension", "MANUAL")
            .withOpportunity(c.keyInfo(), c.priority(), c.dueOn());
        try {
            OpportunityAssignmentService.Result r = assignment.assign(view, me, jobId, consultantId, options);
            if (r.refused()) return new ConsultantResult(consultantId, null, false, r.reason());
            return new ConsultantResult(consultantId, r.opportunityId(), r.existing(), null);
        } catch (OrgNotFoundException gone) {
            // an id that does not exist in this organization looks exactly like one outside the caller's scope
            return new ConsultantResult(consultantId, null, false, REASON_NOT_IN_SCOPE);
        } catch (OrgException refused) {
            if (REASON_RESUME.equals(refused.getCode())) return new ConsultantResult(consultantId, null, false, REASON_RESUME);
            throw refused; // JOB_NOT_OPEN and friends fail the whole call
        }
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

    private static ClientAccount newClient(OrgMembership me, Instant now) {
        ClientAccount a = new ClientAccount();
        a.setOwnerMemberId(me.memberId());
        a.setCreatedAt(now);
        a.setUpdatedAt(now);
        return a;
    }

    private static ClientRequirement newJob(OrgMembership me, Clean c, Long clientId, UrlKeys.Key key, Instant now) {
        ClientRequirement j = new ClientRequirement();
        j.setClientId(clientId);
        j.setTitle(c.title());
        j.setDescriptionText(c.keyInfo()); // the marketer's own summary; there is no field for the posting's text
        j.setLocation(c.location());
        j.setWorkMode(c.workMode());
        j.setEmploymentLabel(c.employmentType());
        j.setRateMinMinor(c.payMin() == null ? null : c.payMin() * 100L);
        j.setRateMaxMinor(c.payMax() == null ? null : c.payMax() * 100L);
        j.setRateUnit(c.payPeriod());
        j.setStatus("OPEN");
        j.setPostedAt(now);
        j.setOwnerMemberId(me.memberId());
        j.setSource("EXTENSION");
        j.setCreatedAt(now);
        j.setUpdatedAt(now);
        j.setJobUrl(c.jobUrl());
        j.setUrlKey(key.key());
        j.setUrlKeyHash(key.hash());
        j.setExternalJobId(c.externalJobId());
        j.setAtsPlatform(c.atsPlatform());
        j.setCaptureSource("EXTENSION");
        j.setCapturedByMemberId(me.memberId());
        j.setPostedOn(c.postedOn());
        j.setPayLabel(c.payLabel());
        // provenance and stored level (doc 61 section 2, doc 60 section 10): a page the user captured is never more than MINIMAL
        j.setCapturedAt(now);
        j.setCaptureMethod("USER_CLICK");
        j.setExtensionVersion(c.extensionVersion());
        j.setCapturePayloadHash(c.payloadHash());
        j.setDetailLevel(JobDetailMapper.MINIMAL);
        j.setDetailLevelChangedAt(now);
        j.setDetailLevelChangedBy(me.memberId());
        return j;
    }

    private static List<String> capturedFields(Clean c) {
        List<String> names = new ArrayList<>();
        for (String f : JOB_FIELDS) if (present(c, f)) names.add(f);
        return names;
    }

    private static boolean present(Clean c, String field) {
        return switch (field) {
            case "location" -> c.location() != null;
            case "workMode" -> c.workMode() != null;
            case "employmentType" -> c.employmentType() != null;
            case "payLabel" -> c.payLabel() != null;
            case "payMin" -> c.payMin() != null;
            case "payMax" -> c.payMax() != null;
            case "payPeriod" -> c.payPeriod() != null;
            case "externalJobId" -> c.externalJobId() != null;
            case "atsPlatform" -> c.atsPlatform() != null;
            case "postedOn" -> c.postedOn() != null;
            case "skills" -> !c.skills().isEmpty();
            default -> true; // jobUrl, title, company, keyInfo are required
        };
    }

    /** A short stable id for the ledger that ties its rows to one request without storing the client's key. */
    static String requestId(Long orgId, String idempotencyKey) {
        try {
            String hex = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest((orgId + ":" + (idempotencyKey == null ? "" : idempotencyKey.strip())).getBytes(StandardCharsets.UTF_8)));
            return hex.substring(0, 32);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    // ---- validation --------------------------------------------------------------------------------------------------------------

    /** The contract's limits, then the sensitive-text scan on every free-text field. Throws 400 {@code VALIDATION} / 422 {@code SENSITIVE_CONTENT}. */
    static Clean validate(Request r) {
        if (r == null) throw MktFromExtensionDTO.invalid("body", "send the job as a JSON object");
        String jobUrl = r.jobUrl() == null ? null : r.jobUrl().trim();
        UrlKeys.requireAllowed(jobUrl);
        String title = required("title", r.title(), 300);
        String company = required("company", r.company(), 200);
        String location = optional("location", r.location(), 300);
        String workMode = oneOf("workMode", r.workMode(), WORK_MODES);
        String employmentType = optional("employmentType", r.employmentType(), 20);
        String payLabel = optional("payLabel", r.payLabel(), 80);
        Integer payMin = amount("payMin", r.payMin());
        Integer payMax = amount("payMax", r.payMax());
        if (payMin != null && payMax != null && payMin > payMax) throw MktFromExtensionDTO.invalid("payMax", "must not be below payMin");
        String payPeriod = oneOf("payPeriod", r.payPeriod(), PAY_PERIODS);
        String externalJobId = optional("externalJobId", r.externalJobId(), 200);
        String atsPlatform = optional("atsPlatform", r.atsPlatform(), 40);
        if (atsPlatform != null) atsPlatform = atsPlatform.toLowerCase(Locale.ROOT);
        List<String> skillNames = skills(r.skills());
        String keyInfo = required("keyInfo", r.keyInfo(), 1000);
        String priority = oneOf("priority", r.priority(), PRIORITIES);
        if (priority == null) priority = "MEDIUM";
        List<Long> consultantIds = consultantIds(r.consultantIds());
        String extensionVersion = optional("extensionVersion", r.extensionVersion(), 20);

        // Every free-text field goes through the never-collected scan (SSN, bank, tax id, passport, date of birth ...). Identifiers (the link, the
        // external id, the platform, the version) are not text a person wrote and carry long digit runs by nature, so they are not scanned.
        SensitiveContent.check("title", "title", title);
        SensitiveContent.check("company", "company", company);
        SensitiveContent.check("location", "location", location);
        SensitiveContent.check("employmentType", "employmentType", employmentType);
        SensitiveContent.check("payLabel", "payLabel", payLabel);
        for (int i = 0; i < skillNames.size(); i++) SensitiveContent.check("skills[" + i + "]", "skills", skillNames.get(i));
        SensitiveContent.check("keyInfo", "keyInfo", keyInfo);

        return new Clean(
            jobUrl, title, company, location, workMode, employmentType, payLabel, payMin, payMax, payPeriod, externalJobId, atsPlatform, r.postedOn(), skillNames,
            keyInfo, priority, r.dueOn(), consultantIds, extensionVersion, MktFromExtensionDTO.payloadHash(r)
        );
    }

    private static String required(String field, String value, int max) {
        String v = value == null ? "" : value.trim();
        if (v.isEmpty() || v.length() > max) throw MktFromExtensionDTO.invalid(field, "enter 1 to " + max + " characters");
        return v;
    }

    private static String optional(String field, String value, int max) {
        if (value == null) return null;
        String v = value.trim();
        if (v.isEmpty()) return null;
        if (v.length() > max) throw MktFromExtensionDTO.invalid(field, "at most " + max + " characters");
        return v;
    }

    private static String oneOf(String field, String value, Set<String> allowed) {
        if (value == null) return null;
        if (!allowed.contains(value)) throw MktFromExtensionDTO.invalid(field, "one of " + String.join(", ", new java.util.TreeSet<>(allowed)));
        return value;
    }

    private static Integer amount(String field, Integer value) {
        if (value == null) return null;
        if (value < 0 || value > 100_000_000) throw MktFromExtensionDTO.invalid(field, "enter a whole amount of 0 to 100000000");
        return value;
    }

    private static List<String> skills(List<String> raw) {
        if (raw == null) return List.of();
        Set<String> seen = new LinkedHashSet<>();
        List<String> out = new ArrayList<>();
        for (String s : raw) {
            String v = s == null ? "" : s.trim();
            if (v.isEmpty() || v.length() > 60) throw MktFromExtensionDTO.invalid("skills", "each skill is 1 to 60 characters");
            if (seen.add(v.toLowerCase(Locale.ROOT))) out.add(v);
        }
        if (out.size() > MAX_SKILLS) throw MktFromExtensionDTO.invalid("skills", "at most " + MAX_SKILLS + " skills");
        return List.copyOf(out);
    }

    private static List<Long> consultantIds(List<Long> raw) {
        if (raw == null || raw.isEmpty()) throw MktFromExtensionDTO.invalid("consultantIds", "choose 1 to " + MAX_CONSULTANTS + " consultants");
        if (raw.size() > MAX_CONSULTANTS) throw MktFromExtensionDTO.invalid("consultantIds", "choose 1 to " + MAX_CONSULTANTS + " consultants");
        Set<Long> ids = new LinkedHashSet<>();
        for (Long id : raw) {
            if (id == null || id <= 0) throw MktFromExtensionDTO.invalid("consultantIds", "each id is a positive number");
            ids.add(id);
        }
        if (ids.size() > MAX_CONSULTANTS) throw MktFromExtensionDTO.invalid("consultantIds", "choose 1 to " + MAX_CONSULTANTS + " consultants");
        return List.copyOf(ids);
    }
}
