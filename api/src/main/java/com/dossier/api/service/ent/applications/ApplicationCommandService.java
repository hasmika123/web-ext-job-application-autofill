package com.dossier.api.service.ent.applications;

import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.OrgResume;
import com.dossier.api.domain.ent.talent.TalentApplication;
import com.dossier.api.domain.ent.talent.TalentApplicationEvent;
import com.dossier.api.domain.ent.talent.TalentApplicationNote;
import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.MarketerAssignmentRepository;
import com.dossier.api.repository.ent.talent.MarketerCapacityRepository;
import com.dossier.api.repository.ent.talent.OrgResumeRepository;
import com.dossier.api.repository.ent.talent.TalentApplicationEventRepository;
import com.dossier.api.repository.ent.talent.TalentApplicationNoteRepository;
import com.dossier.api.repository.ent.talent.TalentApplicationRepository;
import com.dossier.api.service.dto.ent.ApplicationDTO;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.privacy.SensitiveContent;
import jakarta.persistence.EntityManager;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The write side of the Applications board. Every change is a RECORD of what happened: Kiwiply never submits an application, the consultant
 * does, so there is no "submit" here, only "record that it was submitted". Each mutation writes one history event on the application
 * (the Activity tab) and one organization audit row. Everything is checked against the caller's key and scope first; whatever fails is the
 * same generic 404 as another tenant's row.
 */
@Service("entApplicationCommandService")
public class ApplicationCommandService {

    public static final String AUDIT_CREATE = "APPLICATION_CREATE";
    public static final String AUDIT_UPDATE = "APPLICATION_UPDATE";
    public static final String AUDIT_STAGE = "APPLICATION_STAGE";
    public static final String AUDIT_STAGE_UNDO = "APPLICATION_STAGE_UNDO";
    public static final String AUDIT_NOTE = "APPLICATION_NOTE";
    public static final String TARGET = "APPLICATION";

    static final int NEXT_ACTION_MAX = 120;
    static final int SOURCE_MAX = 40;
    static final int NOTE_MAX = 1000;
    static final Set<String> PATCH_FIELDS = Set.of("nextAction", "nextActionDue", "marketerMemberId");

    private final EntityManager em;
    private final ApplicationAccess access;
    private final ApplicationNames names;
    private final ApplicationQueryService query;
    private final OrgAuditService audit;
    private final TalentApplicationRepository applications;
    private final TalentApplicationEventRepository events;
    private final TalentApplicationNoteRepository notes;
    private final ClientRequirementRepository requirements;
    private final ConsultantProfileRepository consultants;
    private final MarketerAssignmentRepository assignments;
    private final MarketerCapacityRepository capacities;
    private final OrgResumeRepository resumes;
    private final Clock clock;

    @Autowired
    public ApplicationCommandService(
        EntityManager em,
        ApplicationAccess access,
        ApplicationNames names,
        ApplicationQueryService query,
        OrgAuditService audit,
        TalentApplicationRepository applications,
        TalentApplicationEventRepository events,
        TalentApplicationNoteRepository notes,
        ClientRequirementRepository requirements,
        ConsultantProfileRepository consultants,
        MarketerAssignmentRepository assignments,
        MarketerCapacityRepository capacities,
        OrgResumeRepository resumes
    ) {
        this(em, access, names, query, audit, applications, events, notes, requirements, consultants, assignments, capacities, resumes, Clock.systemUTC());
    }

    ApplicationCommandService(
        EntityManager em,
        ApplicationAccess access,
        ApplicationNames names,
        ApplicationQueryService query,
        OrgAuditService audit,
        TalentApplicationRepository applications,
        TalentApplicationEventRepository events,
        TalentApplicationNoteRepository notes,
        ClientRequirementRepository requirements,
        ConsultantProfileRepository consultants,
        MarketerAssignmentRepository assignments,
        MarketerCapacityRepository capacities,
        OrgResumeRepository resumes,
        Clock clock
    ) {
        this.em = em;
        this.access = access;
        this.names = names;
        this.query = query;
        this.audit = audit;
        this.applications = applications;
        this.events = events;
        this.notes = notes;
        this.requirements = requirements;
        this.consultants = consultants;
        this.assignments = assignments;
        this.capacities = capacities;
        this.resumes = resumes;
        this.clock = clock;
    }

    // ---- create ----------------------------------------------------------------------------------------------------------------

    @Transactional
    public ApplicationDTO.Detail create(OrgMembership me, ApplicationDTO.CreateRequest req) {
        PermissionScope scope = access.widest(me, ApplicationAccess.CREATE_KEYS).orElseThrow(OrgNotFoundException::new);
        access.requireWritable(me, ApplicationAccess.CREATE_KEYS);
        Long orgId = me.orgId();
        if (req == null || req.requirementId() == null) throw OrgException.invalid("requirementId", "is required");
        if (req.consultantId() == null) throw OrgException.invalid("consultantId", "is required");
        ClientRequirement job = requirements.findByOrgIdAndId(orgId, req.requirementId()).orElseThrow(OrgNotFoundException::new);
        ConsultantProfile consultant = consultants.findByOrgIdAndId(orgId, req.consultantId()).orElseThrow(OrgNotFoundException::new);

        Long marketer = req.marketerMemberId() != null ? req.marketerMemberId() : assignments.findByOrgIdAndConsultantId(orgId, consultant.getId()).map(a -> a.getMarketerMemberId()).orElse(null);
        if (req.marketerMemberId() != null) requireMarketer(orgId, req.marketerMemberId());
        if (scope != PermissionScope.ORG && (marketer == null || !access.covers(me, scope, marketer))) throw new OrgNotFoundException();

        String stage = req.stage() == null || req.stage().isBlank() ? ApplicationStages.ASSIGNED : req.stage().strip().toUpperCase(Locale.ROOT);
        if (!stage.equals(ApplicationStages.ASSIGNED) && !stage.equals(ApplicationStages.SUBMITTED)) throw OrgException.invalid("stage", "an application starts as Assigned, or as Submitted when the consultant already submitted it");
        if (stage.equals(ApplicationStages.SUBMITTED)) {
            PermissionScope rec = me.scopeFor(ApplicationAccess.KEY_RECORD).orElseThrow(OrgNotFoundException::new);
            if (!access.covers(me, rec, marketer)) throw new OrgNotFoundException();
        }
        String source = text("source", req.source(), SOURCE_MAX);
        String nextAction = text("nextAction", req.nextAction(), NEXT_ACTION_MAX);
        LocalDate today = LocalDate.now(clock);
        LocalDate applied = req.appliedOn() == null ? today : req.appliedOn();
        if (applied.isAfter(today)) throw OrgException.invalid("appliedOn", "cannot be in the future");

        Long dup = ((Number) em.createQuery("select count(a) from TalentApplication a where a.orgId = :o and a.requirementId = :r and a.consultantId = :c")
            .setParameter("o", orgId).setParameter("r", job.getId()).setParameter("c", consultant.getId()).getSingleResult()).longValue();
        if (dup > 0) throw OrgException.coded(409, "DUPLICATE_APPLICATION", "This consultant already has an application for this job", Map.of());

        Instant now = Instant.now(clock);
        TalentApplication a = new TalentApplication();
        a.setOrgId(orgId);
        a.setRequirementId(job.getId());
        a.setConsultantId(consultant.getId());
        a.setClientId(job.getClientId());
        a.setMarketerMemberId(marketer);
        a.setAppliedOn(applied);
        a.setSourceLabel(source);
        a.setNextAction(nextAction);
        a.setNextActionDue(req.nextActionDue());
        a.setStage(ApplicationStages.ASSIGNED);
        a.setStageChangedAt(now);
        a.setCreatedAt(now);
        a.setUpdatedAt(now);
        resumes.findByOrgIdAndConsultantId(orgId, consultant.getId()).stream().filter(OrgResume::isPrimaryForOrg).findFirst().ifPresent(r -> a.setResumeId(r.getId()));
        saveWithCode(a, applied.getYear());

        Map<Long, String> who = names.memberNames(orgId, java.util.Arrays.asList(me.memberId(), marketer));
        record(a, "CREATED", null, ApplicationStages.ASSIGNED, me, marketer == null ? "Added to the pipeline" : "Assigned to " + who.getOrDefault(marketer, "a marketer"), now);
        if (stage.equals(ApplicationStages.SUBMITTED)) {
            a.setStage(ApplicationStages.SUBMITTED);
            a.setStageChangedAt(now.plusMillis(1));
            applications.save(a);
            record(a, "STAGE_CHANGE", ApplicationStages.ASSIGNED, ApplicationStages.SUBMITTED, me, "Recorded as submitted by the consultant", now.plusMillis(1));
        }
        audit.record(me, AUDIT_CREATE, TARGET, null, String.valueOf(a.getId()), "{\"code\":\"" + a.getCode() + "\",\"stage\":\"" + a.getStage() + "\"}");
        return query.detailOf(me, a);
    }

    private void saveWithCode(TalentApplication a, int year) {
        for (int attempt = 0; attempt < 3; attempt++) {
            a.setCode(nextCode(a.getOrgId(), year));
            try {
                applications.saveAndFlush(a);
                return;
            } catch (DataIntegrityViolationException e) {
                em.clear(); // a concurrent create took the code: try the next one
                if (attempt == 2) throw e;
            }
        }
    }

    String nextCode(Long orgId, int year) {
        String prefix = "APP-" + year + "-";
        List<String> top = em.createQuery("select a.code from TalentApplication a where a.orgId = :o and a.code like :p order by a.code desc", String.class)
            .setParameter("o", orgId).setParameter("p", prefix + "%").setMaxResults(1).getResultList();
        int n = 0;
        if (!top.isEmpty()) {
            try {
                n = Integer.parseInt(top.get(0).substring(prefix.length()));
            } catch (NumberFormatException ignored) {
                n = 0;
            }
        }
        return String.format("%s%03d", prefix, n + 1);
    }

    // ---- edit ------------------------------------------------------------------------------------------------------------------

    @Transactional
    public ApplicationDTO.Detail patch(OrgMembership me, Long applicationId, Map<String, Object> body) {
        TalentApplication a = writable(me, applicationId, ApplicationAccess.WRITE_KEYS);
        if (body == null || body.isEmpty()) throw OrgException.invalid("body", "send at least one field");
        for (String k : body.keySet()) if (!PATCH_FIELDS.contains(k)) throw OrgException.coded(422, "FIELD_UNKNOWN", "Unknown field: " + k, Map.of("field", k));
        StringBuilder what = new StringBuilder();
        Map<String, Object> audited = new java.util.LinkedHashMap<>();
        boolean closed = ApplicationStages.CLOSED.equals(a.getStage());

        if (body.containsKey("nextAction") || body.containsKey("nextActionDue")) {
            if (closed) throw OrgException.coded(422, "APPLICATION_CLOSED", "A closed application has no next action", Map.of());
            String action = a.getNextAction();
            LocalDate due = a.getNextActionDue();
            if (body.containsKey("nextAction")) action = textOf("nextAction", body.get("nextAction"), NEXT_ACTION_MAX);
            if (body.containsKey("nextActionDue")) due = dateOf("nextActionDue", body.get("nextActionDue"));
            if (!java.util.Objects.equals(action, a.getNextAction()) || !java.util.Objects.equals(due, a.getNextActionDue())) {
                a.setNextAction(action);
                a.setNextActionDue(due);
                what.append("Next action: ").append(action == null ? "cleared" : action);
                if (due != null) what.append(", due ").append(due);
                audited.put("nextAction", action);
                audited.put("nextActionDue", due == null ? null : due.toString());
            }
        }
        if (body.containsKey("marketerMemberId")) {
            Long next = idOf("marketerMemberId", body.get("marketerMemberId"));
            if (!java.util.Objects.equals(next, a.getMarketerMemberId())) {
                if (!access.canWrite(me, List.of(ApplicationAccess.KEY_REASSIGN), a)) throw new OrgNotFoundException();
                if (next != null) requireMarketer(me.orgId(), next);
                Long before = a.getMarketerMemberId();
                a.setMarketerMemberId(next);
                Map<Long, String> who = names.memberNames(me.orgId(), java.util.Arrays.asList(next, before));
                if (what.length() > 0) what.append("; ");
                what.append("Marketer: ").append(next == null ? "unassigned" : who.getOrDefault(next, "a marketer"));
                audited.put("marketerMemberId", next);
            }
        }
        if (audited.isEmpty()) return query.detailOf(me, a); // nothing changed: no event, no audit row
        applications.save(a);
        record(a, "UPDATE", null, null, me, what.toString(), Instant.now(clock));
        audit.record(me, AUDIT_UPDATE, TARGET, null, String.valueOf(a.getId()), json(audited));
        return query.detailOf(me, a);
    }

    // ---- stage -----------------------------------------------------------------------------------------------------------------

    @Transactional
    public ApplicationDTO.Detail stage(OrgMembership me, Long applicationId, ApplicationDTO.StageRequest req) {
        if (req == null) throw OrgException.invalid("body", "send a stage");
        TalentApplication a = writable(me, applicationId, List.of(ApplicationAccess.KEY_RECORD, ApplicationAccess.KEY_FOLLOWUP, ApplicationAccess.KEY_OFFERS));
        if (req.undoEventId() != null) return undo(me, a, req.undoEventId());
        String to = req.stage() == null ? null : req.stage().strip().toUpperCase(Locale.ROOT);
        if (!ApplicationStages.valid(to)) throw OrgException.invalid("stage", "must be one of " + ApplicationStages.ORDER);
        String from = a.getStage();
        if (!ApplicationStages.allowed(from, to)) {
            throw OrgException.coded(422, "INVALID_TRANSITION", "An application cannot move from " + ApplicationStages.label(from) + " to " + ApplicationStages.label(to), Map.of("from", from, "to", to, "allowed", ApplicationStages.next(from)));
        }
        // a record of "submitted" is the one only a person who may record submissions can make; an offer needs the offers or follow-up key
        List<String> needs = switch (to) {
            case ApplicationStages.SUBMITTED -> List.of(ApplicationAccess.KEY_RECORD);
            case ApplicationStages.OFFER -> List.of(ApplicationAccess.KEY_OFFERS, ApplicationAccess.KEY_FOLLOWUP);
            default -> List.of(ApplicationAccess.KEY_RECORD, ApplicationAccess.KEY_FOLLOWUP, ApplicationAccess.KEY_OFFERS);
        };
        access.requireWrite(me, needs, a);
        String reason = req.closedReason() == null || req.closedReason().isBlank() ? null : req.closedReason().strip().toUpperCase(Locale.ROOT);
        if (to.equals(ApplicationStages.CLOSED)) {
            if (reason == null || !ApplicationStages.CLOSE_REASONS.contains(reason)) throw OrgException.invalid("closedReason", "must be one of " + ApplicationStages.CLOSE_REASONS);
        } else if (reason != null) {
            throw OrgException.invalid("closedReason", "only a closed application has a reason");
        }
        Instant now = Instant.now(clock);
        a.setStage(to);
        a.setClosedReason(reason);
        a.setStageChangedAt(now);
        applications.save(a);
        record(a, "STAGE_CHANGE", from, to, me, reason == null ? null : "Closed: " + reason.toLowerCase(Locale.ROOT).replace('_', ' '), now);
        audit.record(me, AUDIT_STAGE, TARGET, null, String.valueOf(a.getId()), json(Map.of("from", from, "to", to)));
        return query.detailOf(me, a);
    }

    /** Reverts the caller's own latest stage move (ten minutes, nothing recorded after it). The history keeps both events. */
    private ApplicationDTO.Detail undo(OrgMembership me, TalentApplication a, Long eventId) {
        List<TalentApplicationEvent> evs = events.findByOrgIdAndApplicationIdOrderByOccurredAtAsc(me.orgId(), a.getId()).stream().filter(e -> ApplicationStages.STATE_EVENTS.contains(e.getEventType())).toList();
        TalentApplicationEvent last = evs.isEmpty() ? null : evs.get(evs.size() - 1);
        if (last == null || !last.getId().equals(eventId) || !"STAGE_CHANGE".equals(last.getEventType()) || last.getFromStage() == null) {
            throw OrgException.coded(422, "UNDO_NOT_AVAILABLE", "That move can no longer be undone", Map.of());
        }
        Instant now = Instant.now(clock);
        if (!me.memberId().equals(last.getActorMemberId()) || last.getOccurredAt().plus(ApplicationQueryService.UNDO_WINDOW).isBefore(now)) {
            throw OrgException.coded(422, "UNDO_NOT_AVAILABLE", "That move can no longer be undone", Map.of());
        }
        String undone = last.getToStage();
        String back = last.getFromStage();
        a.setStage(back);
        a.setClosedReason(null);
        a.setStageChangedAt(evs.size() > 1 ? evs.get(evs.size() - 2).getOccurredAt() : a.getCreatedAt());
        applications.save(a);
        record(a, "STAGE_REVERT", undone, back, me, "Undone: back to " + ApplicationStages.label(back), now);
        audit.record(me, AUDIT_STAGE_UNDO, TARGET, null, String.valueOf(a.getId()), json(Map.of("from", undone, "to", back)));
        return query.detailOf(me, a);
    }

    // ---- notes -----------------------------------------------------------------------------------------------------------------

    @Transactional
    public ApplicationDTO.Detail addNote(OrgMembership me, Long applicationId, ApplicationDTO.NoteRequest req) {
        TalentApplication a = writable(me, applicationId, ApplicationAccess.WRITE_KEYS);
        String body = req == null || req.body() == null ? "" : req.body().strip();
        if (body.isEmpty()) throw OrgException.invalid("body", "write something first");
        if (body.length() > NOTE_MAX) throw OrgException.invalid("body", "at most " + NOTE_MAX + " characters");
        if (body.indexOf('<') >= 0 || body.indexOf('>') >= 0) throw OrgException.invalid("body", "contains characters that are not allowed");
        SensitiveContent.check("body", "body", body);
        Instant now = Instant.now(clock);
        TalentApplicationNote n = new TalentApplicationNote();
        n.setOrgId(me.orgId());
        n.setApplicationId(a.getId());
        n.setAuthorMemberId(me.memberId());
        n.setBody(body);
        n.setCreatedAt(now);
        notes.saveAndFlush(n);
        record(a, "NOTE", null, null, me, body.length() > 300 ? body.substring(0, 300) : body, now);
        audit.record(me, AUDIT_NOTE, TARGET, null, String.valueOf(a.getId()), "{\"noteId\":" + n.getId() + "}");
        return query.detailOf(me, a);
    }

    // ---- helpers ---------------------------------------------------------------------------------------------------------------

    /** The application, only when the caller may read it AND holds one of {@code keys} covering it; otherwise the generic 404. */
    private TalentApplication writable(OrgMembership me, Long applicationId, List<String> keys) {
        TalentApplication a = query.visible(me, applicationId);
        access.requireWrite(me, keys, a);
        return a;
    }

    private void requireMarketer(Long orgId, Long memberId) {
        boolean ok = capacities.findByOrgIdAndMemberId(orgId, memberId).filter(c -> "ACTIVE".equals(c.getStatus())).isPresent();
        if (!ok) throw OrgException.coded(422, "INVALID_MARKETER", "That person is not an active marketer of this organization", Map.of());
    }

    private void record(TalentApplication a, String type, String from, String to, OrgMembership actor, String detail, Instant at) {
        TalentApplicationEvent e = new TalentApplicationEvent();
        e.setOrgId(a.getOrgId());
        e.setApplicationId(a.getId());
        e.setEventType(type);
        e.setFromStage(from);
        e.setToStage(to);
        e.setActorMemberId(actor.memberId());
        e.setDetail(detail == null ? null : detail.length() > 300 ? detail.substring(0, 300) : detail);
        e.setOccurredAt(at);
        events.saveAndFlush(e);
    }

    private static String text(String field, String raw, int max) {
        if (raw == null) return null;
        String t = raw.strip();
        if (t.isEmpty()) return null;
        if (t.length() > max) throw OrgException.invalid(field, "at most " + max + " characters");
        if (t.chars().anyMatch(Character::isISOControl) || t.indexOf('<') >= 0 || t.indexOf('>') >= 0) throw OrgException.invalid(field, "contains characters that are not allowed");
        SensitiveContent.check(field, field, t);
        return t;
    }

    private static String textOf(String field, Object raw, int max) {
        if (raw == null) return null;
        if (!(raw instanceof String s)) throw OrgException.invalid(field, "must be text or null");
        return text(field, s, max);
    }

    private static LocalDate dateOf(String field, Object raw) {
        if (raw == null) return null;
        if (!(raw instanceof String s)) throw OrgException.invalid(field, "must be a date (yyyy-mm-dd) or null");
        try {
            return LocalDate.parse(s.strip());
        } catch (DateTimeParseException e) {
            throw OrgException.invalid(field, "must be a date (yyyy-mm-dd)");
        }
    }

    private static Long idOf(String field, Object raw) {
        if (raw == null) return null;
        if (raw instanceof Integer i) return i.longValue();
        if (raw instanceof Long l) return l;
        throw OrgException.invalid(field, "must be a number or null");
    }

    private static String json(Map<String, ?> m) {
        StringBuilder sb = new StringBuilder("{");
        boolean first = true;
        for (Map.Entry<String, ?> e : m.entrySet()) {
            if (!first) sb.append(',');
            first = false;
            sb.append('"').append(e.getKey()).append("\":");
            Object v = e.getValue();
            if (v == null) sb.append("null");
            else if (v instanceof Number) sb.append(v);
            else sb.append('"').append(v.toString().replace("\\", "\\\\").replace("\"", "\\\"")).append('"');
        }
        return sb.append('}').toString();
    }
}
