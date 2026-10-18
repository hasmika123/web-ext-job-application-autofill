package com.dossier.api.service.ent.resumes;

import com.dossier.api.domain.Resume;
import com.dossier.api.domain.ResumeDoc;
import com.dossier.api.domain.ent.mkt.MktResumeEvent;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.OrgResume;
import com.dossier.api.domain.ent.talent.OrgResumeExperience;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.ResumeDocRepository;
import com.dossier.api.repository.ResumeRepository;
import com.dossier.api.repository.ent.mkt.MktResumeEventRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.OrgResumeExperienceRepository;
import com.dossier.api.repository.ent.talent.OrgResumeRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.domain.enumeration.NotificationKind;
import com.dossier.api.service.NotificationService;
import com.dossier.api.service.ResumeDocVersionService;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.resume.ResumeActAs;
import com.dossier.api.service.resume.ResumeDocEvent;
import com.dossier.api.service.resume.ResumeDocument;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Keeps the organization directory in step with the Resume Builder (Enterprise V2, doc 30 sections 2 and 3: the org links to a person's resume
 * and never copies it; {@code org_resume.resume_id} is the link). The builder is the only editor, so every org resume list (the consultant's
 * My Resumes, the marketer's Resumes board, the admin Resumes board) simply reads {@code org_resume}; this class is the one writer that
 * makes a builder resume appear there and keeps its metadata and preview rows current, with no manual linking.
 *
 * <ul>
 *   <li><b>CREATED</b>: when the request is for an organization (the host, or the organization an act-for call was authorised against, never a
 *       client-supplied id) and the owner holds an ACTIVE seat linked to a consultant profile, a link is written. The consultant's own resume is
 *       approved by definition (the consultant attests their own words); a resume a marketer made for them (see {@link ResumeActAs}) starts
 *       {@code PENDING} and waits for the consultant, with a CREATED and an APPROVAL_REQUESTED line in the change log.</li>
 *   <li><b>CONTENT_CHANGED / RENAMED</b>: the name, target role, version number and the headline / summary / experience preview rows are projected again
 *       from the document, in every organization that links this resume. A marketer's edit sends an approved resume back to {@code PENDING}
 *       (the consultant approves the new version), exactly as the Marketing page's own metadata edit does; the consultant's edits of their own
 *       resume never change approval.</li>
 * </ul>
 * A person with no consultant profile, a request that is not for an organization, and a personal account are all silently not linked. Nothing here
 * ever submits anything for anybody.
 */
@Service
public class OrgResumeLinkService {

    private static final Logger LOG = LoggerFactory.getLogger(OrgResumeLinkService.class);

    /** The directory shows at most this many experience rows per resume (the preview is a summary, the document is the truth). */
    static final int MAX_EXPERIENCE_ROWS = 12;
    /** Autosave fires every few seconds: one "updated" line per editing session of this length, not one per save. */
    static final Duration UPDATE_LOG_WINDOW = Duration.ofMinutes(30);
    static final int NAME_MAX = 200;
    static final int TARGET_MAX = 120;
    static final int HEADLINE_MAX = 120;
    static final int SUMMARY_MAX = 1000;
    static final int VERSION_MAX = 30000; // org_resume.version_no is a smallint

    private final OrgResumeRepository resumes;
    private final OrgResumeExperienceRepository experience;
    private final ConsultantProfileRepository consultants;
    private final OrgMemberRepository members;
    private final MktResumeEventRepository events;
    private final ResumeRepository resumeRepository;
    private final ResumeDocRepository docRepository;
    private final ResumeDocVersionService versions;
    private final Clock clock;

    /** The change audit and the consultant's notice for a reopened approval; absent in hand-wired unit tests (then neither is written). */
    @Autowired(required = false)
    private OrgAuditService audit;

    @Autowired(required = false)
    private NotificationService notifications;

    public static final String AUDIT_STALE = "RESUME_STALE";

    @Autowired
    public OrgResumeLinkService(
        OrgResumeRepository resumes,
        OrgResumeExperienceRepository experience,
        ConsultantProfileRepository consultants,
        OrgMemberRepository members,
        MktResumeEventRepository events,
        ResumeRepository resumeRepository,
        ResumeDocRepository docRepository,
        ResumeDocVersionService versions
    ) {
        this(resumes, experience, consultants, members, events, resumeRepository, docRepository, versions, Clock.systemUTC());
    }

    OrgResumeLinkService(
        OrgResumeRepository resumes,
        OrgResumeExperienceRepository experience,
        ConsultantProfileRepository consultants,
        OrgMemberRepository members,
        MktResumeEventRepository events,
        ResumeRepository resumeRepository,
        ResumeDocRepository docRepository,
        ResumeDocVersionService versions,
        Clock clock
    ) {
        this.resumes = resumes;
        this.experience = experience;
        this.consultants = consultants;
        this.members = members;
        this.events = events;
        this.resumeRepository = resumeRepository;
        this.docRepository = docRepository;
        this.versions = versions;
        this.clock = clock;
    }

    /** The synchronous listener the builder's writes reach. A create that cannot be linked fails with it (nothing half-made); a later sync never fails a save. */
    @EventListener
    @Transactional
    public void on(ResumeDocEvent e) {
        if (e == null || e.resumeId() == null || e.ownerUserId() == null) return;
        if (e.type() == ResumeDocEvent.Type.CREATED) {
            OrgResumeCap.orgOfThisRequest().ifPresent(orgId -> link(orgId, e));
            return;
        }
        try {
            sync(e);
        } catch (RuntimeException ex) {
            LOG.warn("Could not refresh the organization link of resume {}: {}", e.resumeId(), ex.toString());
        }
    }

    // ---- create -----------------------------------------------------------------------------------------------------------------

    /** Writes the directory link for a resume that was just created. Idempotent. Empty when the owner is not a consultant of {@code orgId}. */
    @Transactional
    public Optional<OrgResume> link(Long orgId, ResumeDocEvent e) {
        Optional<OrgResume> existing = resumes.findFirstByOrgIdAndResumeIdOrderByIdAsc(orgId, e.resumeId());
        if (existing.isPresent()) return existing;
        Optional<OrgMember> seat = seatOf(orgId, e.ownerUserId());
        if (seat.isEmpty()) return Optional.empty();
        Optional<ConsultantProfile> consultant = consultants.findByOrgIdAndMemberId(orgId, seat.get().getId());
        if (consultant.isEmpty()) return Optional.empty();
        Resume resume = resumeRepository.findById(e.resumeId()).orElse(null);
        if (resume == null) return Optional.empty();

        Instant now = clock.instant();
        Optional<ResumeActAs.Scope> acting = ResumeActAs.current();
        OrgMember actor = acting.flatMap(a -> seatOf(orgId, a.actorUserId())).orElse(null);
        // a marketer who is also this consultant is simply making their own resume
        boolean madeForThem = acting.isPresent() && actor != null && !actor.getId().equals(seat.get().getId());

        OrgResume row = new OrgResume();
        row.setOrgId(orgId);
        row.setConsultantId(consultant.get().getId());
        row.setMemberId(seat.get().getId());
        row.setOwnerMemberId(seat.get().getId());
        row.setResumeId(resume.getId());
        row.setKind(madeForThem ? "ORG_MANAGED" : "PERSONAL_SHARED");
        row.setVisibility("INTERNAL");
        row.setApprovalStatus(madeForThem ? "PENDING" : "APPROVED");
        // D10: a consultant's FIRST approved resume is their primary one (the personal flag already says so: the first resume of an account is its default)
        row.setPrimaryForOrg(!madeForThem && resumes.findByOrgIdAndConsultantId(orgId, consultant.get().getId()).stream().noneMatch(OrgResume::isPrimaryForOrg));
        row.setCreatedAt(now);
        row.setUpdatedAt(now);
        ResumeDoc firstDoc = docOf(resume);
        project(row, resume, firstDoc);
        // X7.4: the consultant's own resume is approved by definition, so what is there now is the approved text
        if ("APPROVED".equals(row.getApprovalStatus())) OrgResumeApproval.pin(row, firstDoc == null ? null : firstDoc.getContentHash());
        row = resumes.saveAndFlush(row);
        replaceExperience(orgId, row.getId(), resume);

        Long actorMemberId = madeForThem ? actor.getId() : seat.get().getId();
        log(row, MktResumeEvent.CREATED, actorMemberId, null, now);
        if (madeForThem) log(row, MktResumeEvent.APPROVAL_REQUESTED, actorMemberId, null, now.plusMillis(1));
        if (row.isPrimaryForOrg()) log(row, "PRIMARY_SET", actorMemberId, "First resume", now.plusMillis(1));
        return Optional.of(row);
    }

    // ---- change -----------------------------------------------------------------------------------------------------------------

    private void sync(ResumeDocEvent e) {
        Resume resume = resumeRepository.findById(e.resumeId()).orElse(null);
        if (resume == null) return;
        for (Long orgId : orgsFor(e.ownerUserId())) {
            Optional<OrgResume> found = resumes.findFirstByOrgIdAndResumeIdOrderByIdAsc(orgId, e.resumeId());
            if (found.isEmpty()) continue;
            OrgResume row = found.get();
            Instant now = clock.instant();
            boolean content = e.type() == ResumeDocEvent.Type.CONTENT_CHANGED;
            project(row, resume, content ? docOf(resume) : null);
            row.setUpdatedAt(now);
            if (content) {
                Optional<ResumeActAs.Scope> acting = ResumeActAs.current();
                Long actorMemberId = acting.flatMap(a -> seatOf(orgId, a.actorUserId())).map(OrgMember::getId).orElse(row.getMemberId());
                boolean byMarketer = acting.isPresent() && !actorMemberId.equals(row.getMemberId());
                boolean reopened = false;
                // the first edit by a marketer makes it an organization-managed resume (doc 30 section 3): from then on only the consultant approves it
                if (byMarketer && !"ORG_MANAGED".equals(row.getKind())) row.setKind("ORG_MANAGED");
                if (byMarketer && !"PENDING".equals(row.getApprovalStatus())) {
                    // X7.4: the approved pin (hash and version) stays as the "what was approved" reference for the consultant's review
                    row.setApprovalStatus("PENDING"); // the new version waits for the consultant; a marketer's words never count until then
                    row.setApprovedAt(null);
                    row.setApprovedByMemberId(null);
                    reopened = true;
                } else if (!byMarketer && "APPROVED".equals(row.getApprovalStatus())) {
                    // the consultant's own edit keeps it approved: the pin moves with their words
                    ResumeDoc current = docOf(resume);
                    OrgResumeApproval.pin(row, current == null ? null : current.getContentHash());
                }
                resumes.saveAndFlush(row);
                replaceExperience(orgId, row.getId(), resume);
                if (reopened || shouldLogUpdate(orgId, row, now)) {
                    log(row, MktResumeEvent.UPDATED, actorMemberId, reopened ? "Edited for the consultant; waiting for their approval" : null, now);
                }
                if (reopened) announceStale(orgId, row, e, acting.map(ResumeActAs.Scope::actorLogin).orElse(e.actorLogin()));
            } else {
                resumes.saveAndFlush(row);
            }
        }
    }

    /** X7.4: the approval was reopened by a change that was not the consultant's: one change-audit row and one in-app notice to the consultant. Never fails the save. */
    private void announceStale(Long orgId, OrgResume row, ResumeDocEvent e, String actorLogin) {
        try {
            if (audit != null) {
                audit.record(orgId, actorLogin, null, AUDIT_STALE, OrgAuditService.TARGET_RESUME, null, String.valueOf(row.getId()), "approved text changed by someone else; approval reopened version=" + row.getVersionNo(), null, null, null, "MEDIUM");
            }
            if (notifications != null && e.ownerUserId() != null) {
                // existing kind SYSTEM, in-app only: the consultant reviews it on My Resumes
                notifications.publish(
                    NotificationKind.SYSTEM,
                    e.ownerUserId(),
                    new NotificationService.Payload("A resume of yours changed and needs your approval", "\"" + clip(blankTo(row.getName(), "Your resume"), 80) + "\" was edited for you. Review the new version before it is used.", "/", null, null, null, null, false, null)
                );
            }
        } catch (RuntimeException ex) {
            LOG.warn("Could not record the reopened approval of resume {}: {}", row.getId(), ex.toString());
        }
    }

    /** One "updated" line per editing session: the newest change-log line is older than the window, or is not an update at all. */
    private boolean shouldLogUpdate(Long orgId, OrgResume row, Instant now) {
        List<MktResumeEvent> list = events.forResumes(orgId, List.of(row.getId()));
        if (list.isEmpty()) return true;
        MktResumeEvent last = list.get(list.size() - 1);
        return !MktResumeEvent.UPDATED.equals(last.getKind()) || last.getOccurredAt().isBefore(now.minus(UPDATE_LOG_WINDOW));
    }

    // ---- projection -------------------------------------------------------------------------------------------------------------

    /** Name, target, version and (with a document) the headline and summary: the directory's metadata mirror of the builder document. */
    void project(OrgResume row, Resume resume, ResumeDoc doc) {
        row.setName(clip(blankTo(resume.getLabel(), "My resume"), NAME_MAX));
        row.setTargetRole(clip(resume.getTarget(), TARGET_MAX));
        if (doc == null) return;
        JsonNode docJson = ResumeDocument.parse(doc.getDocJson());
        row.setHeadline(clip(text(docJson.path("basics").path("headline")), HEADLINE_MAX));
        JsonNode structured = structured(resume);
        row.setSummaryText(clip(text(structured.path("summary")), SUMMARY_MAX));
        int v = versions.latest(resume.getId(), resume.getUser().getId()).map(x -> x.getVersionNo()).orElse(1);
        row.setVersionNo(Math.max(1, Math.min(v, VERSION_MAX)));
    }

    private void replaceExperience(Long orgId, Long orgResumeId, Resume resume) {
        experience.deleteByOrgIdAndResumeId(orgId, orgResumeId);
        experience.flush();
        int order = 0;
        for (JsonNode x : structured(resume).path("experience")) {
            if (order >= MAX_EXPERIENCE_ROWS) break;
            String title = clip(text(x.path("title")), 120);
            String employer = clip(text(x.path("company")), 120);
            if (title == null && employer == null) continue;
            Integer start = year(text(x.path("startDate")));
            if (start == null) continue; // the column is required: an undated entry is left out of the preview (it stays in the document)
            OrgResumeExperience y = new OrgResumeExperience();
            y.setOrgId(orgId);
            y.setResumeId(orgResumeId);
            y.setTitle(title == null ? "" : title);
            y.setEmployer(employer == null ? "" : employer);
            y.setStartYear(start);
            y.setEndYear(x.path("current").asBoolean(false) ? null : year(text(x.path("endDate"))));
            y.setSortOrder(order++);
            experience.save(y);
        }
    }

    // ---- helpers ----------------------------------------------------------------------------------------------------------------

    private void log(OrgResume row, String kind, Long actorMemberId, String detail, Instant at) {
        MktResumeEvent e = new MktResumeEvent();
        e.setOrgId(row.getOrgId());
        e.setResumeId(row.getId());
        e.setConsultantId(row.getConsultantId());
        e.setActorMemberId(actorMemberId);
        e.setKind(kind);
        e.setVersionNo(row.getVersionNo());
        e.setDetail(detail);
        e.setOccurredAt(at);
        events.saveAndFlush(e);
    }

    private Optional<OrgMember> seatOf(Long orgId, Long userId) {
        if (orgId == null || userId == null) return Optional.empty();
        return members.findByOrgIdAndUserIdAndStatusIn(orgId, userId, List.of(OrgMemberStatus.ACTIVE)).stream().findFirst();
    }

    /** The organizations that may link this person's resume: the request's own, else every organization they hold an ACTIVE seat in. */
    private Set<Long> orgsFor(Long userId) {
        Set<Long> out = new LinkedHashSet<>();
        OrgResumeCap.orgOfThisRequest().ifPresent(out::add);
        if (out.isEmpty()) {
            for (OrgMember m : members.findMine(userId)) if (m.getStatus() == OrgMemberStatus.ACTIVE) out.add(m.getOrgId());
        }
        return out;
    }

    private ResumeDoc docOf(Resume resume) {
        return docRepository.findByResumeIdAndUserId(resume.getId(), resume.getUser().getId()).orElse(null);
    }

    private static JsonNode structured(Resume resume) {
        return ResumeDocument.parse(resume.getParsedJson() == null ? "{}" : resume.getParsedJson());
    }

    private static String text(JsonNode n) {
        return n == null || !n.isTextual() ? null : n.textValue();
    }

    private static String clip(String s, int max) {
        if (s == null) return null;
        String t = s.strip().replaceAll("\\s+", " ");
        if (t.isEmpty()) return null;
        return t.length() > max ? t.substring(0, max) : t;
    }

    private static String blankTo(String s, String fallback) {
        return s == null || s.isBlank() ? fallback : s;
    }

    /**
     * A resume a marketer made (or edited) for a consultant through the builder in act-for mode: it is the consultant's, and only the consultant
     * approves it (doc 30 section 5). The org admin's approve / reject on the boards refuses it with 409 CONSULTANT_APPROVAL_REQUIRED.
     */
    public static boolean requiresConsultantApproval(OrgResume r) {
        return r != null && r.getResumeId() != null && "ORG_MANAGED".equals(r.getKind());
    }

    private static final java.util.regex.Pattern YEAR = java.util.regex.Pattern.compile("(?<!\\d)(19[5-9]\\d|20\\d\\d|2100)(?!\\d)");

    /** The first four-digit year in "2019" / "2019-03" / "Jan 2020", or null (`Present` and blanks have none). */
    static Integer year(String s) {
        if (s == null) return null;
        java.util.regex.Matcher m = YEAR.matcher(s);
        return m.find() ? Integer.valueOf(m.group(1)) : null;
    }

    /** Test seam: every organization that links the resume, so a test can assert on it without a request. */
    List<OrgResume> linksOf(Resume resume) {
        List<OrgResume> out = new ArrayList<>();
        for (Long orgId : orgsFor(resume.getUser().getId())) resumes.findFirstByOrgIdAndResumeIdOrderByIdAsc(orgId, resume.getId()).ifPresent(out::add);
        return out;
    }
}
