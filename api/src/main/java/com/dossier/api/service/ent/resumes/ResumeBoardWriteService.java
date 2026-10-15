package com.dossier.api.service.ent.resumes;

import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.OrgResume;
import com.dossier.api.domain.ent.talent.OrgResumeExperience;
import com.dossier.api.repository.ent.resumes.ResumeBoardSearchRepository;
import com.dossier.api.repository.ent.resumes.ResumeBoardSearchRepository.Hit;
import com.dossier.api.repository.ent.resumes.ResumeBoardSearchRepository.Scope;
import com.dossier.api.repository.ent.talent.OrgResumeExperienceRepository;
import com.dossier.api.repository.ent.talent.OrgResumeRepository;
import com.dossier.api.service.dto.ent.ResumeBoardDTO;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.privacy.SensitiveContent;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The writes of the Resumes board. All of them need the organization to be writable, a key held at a scope that covers the consultant, and answer the
 * generic 404 otherwise. Rules (docs/enterprise-v2/30-resume-management.md): a new resume starts PENDING (the consultant's approval is recorded by
 * someone other than the person who prepared it); only an APPROVED resume can be primary and a consultant has at most one primary; setting a new
 * primary clears the old one in the same transaction. Free text is scanned for never-collected values. Each change writes one audit row.
 */
@Service
public class ResumeBoardWriteService {

    public static final String A_CREATE = "RESUME_CREATE";
    public static final String A_PRIMARY = "RESUME_PRIMARY";
    public static final String A_VISIBILITY = "RESUME_VISIBILITY";
    public static final String A_APPROVE = "RESUME_APPROVE";
    public static final String A_REJECT = "RESUME_REJECT";
    public static final String A_REOPEN = "RESUME_REOPEN";
    public static final String A_BULK = "RESUME_BULK";

    public static final int MAX_BULK = 100;
    static final int MAX_EXPERIENCE = 8;
    private static final Pattern FILE_NAME = Pattern.compile("[A-Za-z0-9][A-Za-z0-9 ._()\\-]{0,198}");

    private final ResumeBoardSearchRepository search;
    private final ResumeAccess access;
    private final ResumeBoardQueryService query;
    private final OrgResumeRepository resumes;
    private final OrgResumeExperienceRepository experience;
    private final OrgAuditService audit;

    public ResumeBoardWriteService(
        ResumeBoardSearchRepository search,
        ResumeAccess access,
        ResumeBoardQueryService query,
        OrgResumeRepository resumes,
        OrgResumeExperienceRepository experience,
        OrgAuditService audit
    ) {
        this.search = search;
        this.access = access;
        this.query = query;
        this.resumes = resumes;
        this.experience = experience;
        this.audit = audit;
    }

    // ---- primary ---------------------------------------------------------------------------------------------------------------

    @Transactional
    public ResumeBoardDTO.PrimaryResult setPrimary(OrgMembership me, Long resumeId, Boolean primary) {
        if (primary == null) throw OrgException.invalid("primary", "send true or false");
        Scope scope = access.writeScope(me, ResumeAccess.EDIT);
        Hit hit = search.findOne(me.orgId(), resumeId, scope).orElseThrow(OrgNotFoundException::new);
        Long previous = applyPrimary(me, hit, primary);
        return new ResumeBoardDTO.PrimaryResult(query.detailOf(me, reload(me, hit)), previous);
    }

    /** Returns the id of the resume that lost the flag (null when none did). */
    private Long applyPrimary(OrgMembership me, Hit hit, boolean primary) {
        OrgResume r = hit.resume();
        if (r.isPrimaryForOrg() == primary) return null;
        Long lost = null;
        if (primary) {
            if (!"APPROVED".equals(r.getApprovalStatus())) {
                throw OrgException.coded(409, "NOT_APPROVED", "Only an approved resume can be the primary one", Map.of());
            }
            for (OrgResume other : resumes.findByOrgIdAndConsultantId(me.orgId(), r.getConsultantId())) {
                if (other.isPrimaryForOrg() && !other.getId().equals(r.getId())) {
                    other.setPrimaryForOrg(false);
                    resumes.saveAndFlush(other); // the unique key allows one primary per consultant: clear before setting
                    lost = other.getId();
                }
            }
        }
        r.setPrimaryForOrg(primary);
        resumes.saveAndFlush(r);
        record(me, A_PRIMARY, r, "primary=" + primary + (lost != null ? " replaced=" + lost : "") + " resume=" + ResumeBoardQueryService.clip(r.getName()), hit.consultant());
        return lost;
    }

    // ---- visibility ------------------------------------------------------------------------------------------------------------

    @Transactional
    public ResumeBoardDTO.VisibilityResult setVisibility(OrgMembership me, Long resumeId, String visibility) {
        String v = visibilityOf(visibility);
        Scope scope = access.writeScope(me, ResumeAccess.EDIT);
        Hit hit = search.findOne(me.orgId(), resumeId, scope).orElseThrow(OrgNotFoundException::new);
        String previous = applyVisibility(me, hit, v);
        return new ResumeBoardDTO.VisibilityResult(query.detailOf(me, reload(me, hit)), previous);
    }

    private static String visibilityOf(String raw) {
        String v = raw == null ? "" : raw.trim().toUpperCase(java.util.Locale.ROOT);
        if (!ResumeBoardQueryService.VISIBILITIES.contains(v)) throw OrgException.invalid("visibility", "must be INTERNAL, PUBLIC or PRIVATE");
        return v;
    }

    /** Returns the previous visibility. */
    private String applyVisibility(OrgMembership me, Hit hit, String v) {
        OrgResume r = hit.resume();
        String previous = r.getVisibility();
        if (previous.equals(v)) return previous;
        r.setVisibility(v);
        resumes.saveAndFlush(r);
        record(me, A_VISIBILITY, r, previous + "->" + v + " resume=" + ResumeBoardQueryService.clip(r.getName()), hit.consultant());
        return previous;
    }

    // ---- approval --------------------------------------------------------------------------------------------------------------

    @Transactional
    public ResumeBoardDTO.DecisionResult decide(OrgMembership me, Long resumeId, String decision, String note) {
        String d = decisionOf(decision);
        String cleanNote = cleanText("note", note, 300);
        Scope scope = access.writeScope(me, ResumeAccess.APPROVE);
        Hit hit = search.findOne(me.orgId(), resumeId, scope).orElseThrow(OrgNotFoundException::new);
        String previous = applyDecision(me, hit, d, cleanNote);
        return new ResumeBoardDTO.DecisionResult(query.detailOf(me, reload(me, hit)), previous);
    }

    private static String decisionOf(String raw) {
        String d = raw == null ? "" : raw.trim().toUpperCase(java.util.Locale.ROOT);
        if (!List.of("APPROVE", "REJECT", "REOPEN").contains(d)) throw OrgException.invalid("decision", "must be APPROVE, REJECT or REOPEN");
        return d;
    }

    /** Returns the status the resume had before. */
    private String applyDecision(OrgMembership me, Hit hit, String decision, String note) {
        OrgResume r = hit.resume();
        String previous = r.getApprovalStatus();
        if (decision.equals("REOPEN")) {
            if ("PENDING".equals(previous)) return previous;
            r.setApprovalStatus("PENDING");
            r.setApprovedAt(null);
            r.setApprovedByMemberId(null);
            if (r.isPrimaryForOrg()) r.setPrimaryForOrg(false); // only an approved resume can be primary
            resumes.saveAndFlush(r);
            record(me, A_REOPEN, r, previous + "->PENDING resume=" + ResumeBoardQueryService.clip(r.getName()), hit.consultant());
            return previous;
        }
        if (!"PENDING".equals(previous)) throw OrgException.coded(409, "NOT_PENDING", "This resume has already been decided", Map.of());
        if (OrgResumeLinkService.requiresConsultantApproval(r)) throw OrgException.coded(409, "CONSULTANT_APPROVAL_REQUIRED", "Only the consultant can approve a resume made for them.", Map.of());
        if (java.util.Objects.equals(r.getOwnerMemberId(), me.memberId())) {
            throw OrgException.coded(422, "SELF_DECISION", "Someone other than the person who prepared this resume records its approval", Map.of());
        }
        boolean approve = decision.equals("APPROVE");
        r.setApprovalStatus(approve ? "APPROVED" : "REJECTED");
        r.setApprovedAt(Instant.now());
        r.setApprovedByMemberId(me.memberId());
        resumes.saveAndFlush(r);
        record(me, approve ? A_APPROVE : A_REJECT, r, "PENDING->" + r.getApprovalStatus() + " resume=" + ResumeBoardQueryService.clip(r.getName()) + (note != null ? " note=" + note : ""), hit.consultant());
        return previous;
    }

    // ---- create ----------------------------------------------------------------------------------------------------------------

    /**
     * Upload Resume: records a NEW resume (metadata plus the structured fields). There is no file store, so a file name is a plain label; the record
     * starts PENDING, version 1, not primary, owned by the person who prepared it.
     */
    @Transactional
    public ResumeBoardDTO.Detail create(OrgMembership me, ResumeBoardDTO.CreateRequest body) {
        if (body == null) throw OrgException.invalid("body", "send the resume details");
        Scope scope = access.writeScope(me, ResumeAccess.EDIT);
        if (body.consultantId() == null) throw OrgException.invalid("consultantId", "choose a consultant");
        ConsultantProfile consultant = search.consultantInScope(me.orgId(), body.consultantId(), scope).orElseThrow(OrgNotFoundException::new);

        String name = required("name", cleanText("name", body.name(), 200));
        String fileName = cleanFileName(body.fileName());
        String role = cleanText("targetRole", body.targetRole(), 120);
        String headline = cleanText("headline", body.headline(), 120);
        String summary = cleanText("summary", body.summary(), 1000);
        String visibility = body.visibility() == null || body.visibility().isBlank() ? "INTERNAL" : visibilityOf(body.visibility());
        List<ResumeBoardDTO.ExperienceInput> exp = body.experience() == null ? List.of() : body.experience();
        if (exp.size() > MAX_EXPERIENCE) throw OrgException.invalid("experience", "at most " + MAX_EXPERIENCE + " entries");
        int maxYear = LocalDate.now(ZoneOffset.UTC).getYear() + 1;
        List<OrgResumeExperience> rows = new ArrayList<>();
        int i = 0;
        for (ResumeBoardDTO.ExperienceInput e : exp) {
            String path = "experience[" + i + "]";
            String title = required(path + ".title", cleanText(path + ".title", e.title(), 120));
            String employer = required(path + ".employer", cleanText(path + ".employer", e.employer(), 120));
            if (e.startYear() == null || e.startYear() < 1960 || e.startYear() > maxYear) throw OrgException.invalid(path + ".startYear", "use a year from 1960");
            if (e.endYear() != null && (e.endYear() < e.startYear() || e.endYear() > maxYear)) throw OrgException.invalid(path + ".endYear", "cannot be before the start year");
            OrgResumeExperience x = new OrgResumeExperience();
            x.setOrgId(me.orgId());
            x.setTitle(title);
            x.setEmployer(employer);
            x.setStartYear(e.startYear());
            x.setEndYear(e.endYear());
            x.setSortOrder(i);
            rows.add(x);
            i++;
        }

        Instant now = Instant.now();
        OrgResume r = new OrgResume();
        r.setOrgId(me.orgId());
        r.setConsultantId(consultant.getId());
        r.setMemberId(consultant.getMemberId());
        r.setKind("ORG_MANAGED");
        r.setName(name);
        r.setFileName(fileName);
        r.setTargetRole(role);
        r.setHeadline(headline);
        r.setSummaryText(summary);
        r.setVersionNo(1);
        r.setPrimaryForOrg(false);
        r.setVisibility(visibility);
        r.setApprovalStatus("PENDING");
        r.setOwnerMemberId(me.memberId());
        r.setCreatedAt(now);
        r.setUpdatedAt(now);
        r = resumes.saveAndFlush(r);
        for (OrgResumeExperience x : rows) x.setResumeId(r.getId());
        experience.saveAll(rows);
        record(me, A_CREATE, r, "resume=" + ResumeBoardQueryService.clip(name) + " visibility=" + visibility + (fileName != null ? " file=" + fileName : ""), consultant);
        return query.detailOf(me, new Hit(r, consultant));
    }

    // ---- bulk ------------------------------------------------------------------------------------------------------------------

    public void validateBulk(ResumeBoardDTO.BulkRequest body) {
        if (body == null || body.ids() == null || body.ids().isEmpty()) throw OrgException.invalid("ids", "choose at least one resume");
        if (new LinkedHashSet<>(body.ids()).size() > MAX_BULK) throw OrgException.invalid("ids", "at most " + MAX_BULK + " at a time");
        String a = body.action() == null ? "" : body.action().trim().toUpperCase(java.util.Locale.ROOT);
        if (!List.of("VISIBILITY", "APPROVE", "REJECT", "REOPEN").contains(a)) throw OrgException.invalid("action", "must be VISIBILITY, APPROVE, REJECT or REOPEN");
        if (a.equals("VISIBILITY")) visibilityOf(body.visibility());
    }

    /** Which key a bulk action needs (so the resource can refuse before reading the body further). */
    public static String keyFor(String action) {
        return action != null && action.trim().equalsIgnoreCase("VISIBILITY") ? ResumeAccess.EDIT : ResumeAccess.APPROVE;
    }

    @Transactional
    public ResumeBoardDTO.BulkResult bulk(OrgMembership me, ResumeBoardDTO.BulkRequest body) {
        validateBulk(body);
        String action = body.action().trim().toUpperCase(java.util.Locale.ROOT);
        Scope scope = access.writeScope(me, keyFor(action));
        LinkedHashSet<Long> ids = new LinkedHashSet<>(body.ids());
        Map<Long, Hit> found = new java.util.HashMap<>();
        for (Hit h : search.findMany(me.orgId(), ids, scope)) found.put(h.resume().getId(), h);
        List<ResumeBoardDTO.BulkRowResult> results = new ArrayList<>();
        int applied = 0;
        int skipped = 0;
        for (Long id : ids) {
            Hit hit = found.get(id);
            if (hit == null) {
                results.add(new ResumeBoardDTO.BulkRowResult(id, "SKIPPED", "NOT_FOUND", null));
                skipped++;
                continue;
            }
            try {
                String previous;
                if (action.equals("VISIBILITY")) previous = applyVisibility(me, hit, visibilityOf(body.visibility()));
                else previous = applyDecision(me, hit, action, null);
                boolean changed = action.equals("VISIBILITY") ? !previous.equals(visibilityOf(body.visibility())) : !(action.equals("REOPEN") && "PENDING".equals(previous));
                results.add(new ResumeBoardDTO.BulkRowResult(id, changed ? "APPLIED" : "SKIPPED", changed ? null : "UNCHANGED", previous));
                if (changed) applied++;
                else skipped++;
            } catch (OrgException e) {
                results.add(new ResumeBoardDTO.BulkRowResult(id, "SKIPPED", e.getCode() == null ? "REFUSED" : e.getCode(), null));
                skipped++;
            }
        }
        audit.record(me.orgId(), me.login(), me.role(), A_BULK, OrgAuditService.TARGET_RESUME, null, null, action + " applied=" + applied + " skipped=" + skipped, null, null, null, null);
        return new ResumeBoardDTO.BulkResult(applied, skipped, results);
    }

    // ---- helpers ---------------------------------------------------------------------------------------------------------------

    private Hit reload(OrgMembership me, Hit hit) {
        OrgResume fresh = resumes.findByOrgIdAndId(me.orgId(), hit.resume().getId()).orElseThrow(OrgNotFoundException::new);
        return new Hit(fresh, hit.consultant());
    }

    /** The change log line a board action leaves on the row ("Modified <time> by <name>" reads it), besides the audit row. */
    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private com.dossier.api.repository.ent.mkt.MktResumeEventRepository events;

    private void record(OrgMembership me, String action, OrgResume r, String details, ConsultantProfile consultant) {
        audit.record(me.orgId(), me.login(), me.role(), action, OrgAuditService.TARGET_RESUME, null, String.valueOf(r.getId()), details, null, null, null, null);
        String kind = action.equals(A_PRIMARY) ? "PRIMARY_SET" : action.equals(A_VISIBILITY) ? "DETAILS_CHANGED" : action.equals(A_APPROVE) || action.equals(A_REJECT) || action.equals(A_REOPEN) ? "DECIDED" : null;
        if (events != null && kind != null) {
            com.dossier.api.domain.ent.mkt.MktResumeEvent e = new com.dossier.api.domain.ent.mkt.MktResumeEvent();
            e.setOrgId(r.getOrgId());
            e.setResumeId(r.getId());
            e.setConsultantId(r.getConsultantId());
            e.setActorMemberId(me.memberId());
            e.setKind(kind);
            e.setVersionNo(r.getVersionNo());
            e.setOccurredAt(Instant.now());
            events.saveAndFlush(e);
        }
    }

    private static String required(String field, String value) {
        if (value == null || value.isEmpty()) throw OrgException.invalid(field, "is required");
        return value;
    }

    /** Trimmed text, null when blank; no control characters or angle brackets; never a sensitive value. */
    static String cleanText(String field, String raw, int max) {
        if (raw == null) return null;
        String t = raw.strip();
        if (t.isEmpty()) return null;
        if (t.length() > max) throw OrgException.invalid(field, "at most " + max + " characters");
        for (int i = 0; i < t.length(); i++) {
            char c = t.charAt(i);
            if ((Character.isISOControl(c) && c != '\n') || c == '<' || c == '>') throw OrgException.invalid(field, "contains characters that are not allowed");
        }
        SensitiveContent.check(field, field, t);
        return t;
    }

    static String cleanFileName(String raw) {
        if (raw == null || raw.isBlank()) return null;
        String t = raw.strip();
        if (!FILE_NAME.matcher(t).matches() || t.contains("..")) throw OrgException.invalid("fileName", "use letters, digits, spaces, dots, dashes and brackets only (no folders)");
        SensitiveContent.check("fileName", "fileName", t);
        return t;
    }
}
