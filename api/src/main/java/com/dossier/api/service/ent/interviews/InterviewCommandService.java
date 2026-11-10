package com.dossier.api.service.ent.interviews;

import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.TalentApplication;
import com.dossier.api.domain.ent.talent.TalentInterview;
import com.dossier.api.domain.ent.talent.TalentInterviewEvent;
import com.dossier.api.domain.ent.talent.TalentInterviewFeedback;
import com.dossier.api.domain.ent.talent.TalentInterviewInterviewer;
import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.TalentApplicationRepository;
import com.dossier.api.repository.ent.talent.TalentInterviewEventRepository;
import com.dossier.api.repository.ent.talent.TalentInterviewFeedbackRepository;
import com.dossier.api.repository.ent.talent.TalentInterviewInterviewerRepository;
import com.dossier.api.repository.ent.talent.TalentInterviewRepository;
import com.dossier.api.service.dto.ent.InterviewDTO;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.privacy.SensitiveContent;
import com.dossier.api.service.tracker.Changes;
import jakarta.persistence.EntityManager;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The write side of the Interviews board. Every change is a RECORD of what happened or was arranged: Kiwiply never attends, runs or sends
 * anything for an interview, so a reminder is a recorded request (no message leaves the system) and "completed" means someone recorded
 * that it was. Each mutation writes one history event on the interview and one organization audit row (never the free text). Everything is
 * checked against the caller's key and scope first; whatever fails is the same generic 404 as another tenant's row.
 */
@Service("entInterviewCommandService")
public class InterviewCommandService {

    public static final String AUDIT_CREATE = "INTERVIEW_CREATE";
    public static final String AUDIT_UPDATE = "INTERVIEW_UPDATE";
    public static final String AUDIT_RESCHEDULE = "INTERVIEW_RESCHEDULE";
    public static final String AUDIT_STATUS = "INTERVIEW_STATUS";
    public static final String AUDIT_STATUS_UNDO = "INTERVIEW_STATUS_UNDO";
    public static final String AUDIT_REMINDER = "INTERVIEW_REMINDER";
    public static final String AUDIT_FEEDBACK = "INTERVIEW_FEEDBACK";
    public static final String TARGET = "INTERVIEW";

    static final int DEFAULT_DURATION_MINUTES = 45;
    static final int MIN_DURATION_MINUTES = 15;
    static final int ROUND_MAX = 40;
    static final int LINK_MAX = 300;
    static final int LOCATION_MAX = 200;
    static final int NOTES_MAX = 1000;
    static final int NEXT_STEP_MAX = 120;
    static final int NAME_MAX = 120;
    static final int TITLE_MAX = 80;
    static final int REASON_MAX = 200;
    static final Set<String> PATCH_FIELDS = Set.of("nextStep", "notes", "meetingLink", "mode", "location", "interviewers");

    private final EntityManager em;
    private final InterviewAccess access;
    private final InterviewQueryService query;
    private final InterviewSettings settings;
    private final OrgAuditService audit;
    private final TalentInterviewRepository interviews;
    private final TalentInterviewInterviewerRepository interviewers;
    private final TalentInterviewEventRepository events;
    private final TalentInterviewFeedbackRepository feedback;
    private final TalentApplicationRepository applications;
    private final ConsultantProfileRepository consultants;
    private final ClientAccountRepository clients;
    private final Clock clock;

    @Autowired
    public InterviewCommandService(
        EntityManager em,
        InterviewAccess access,
        InterviewQueryService query,
        InterviewSettings settings,
        OrgAuditService audit,
        TalentInterviewRepository interviews,
        TalentInterviewInterviewerRepository interviewers,
        TalentInterviewEventRepository events,
        TalentInterviewFeedbackRepository feedback,
        TalentApplicationRepository applications,
        ConsultantProfileRepository consultants,
        ClientAccountRepository clients
    ) {
        this(em, access, query, settings, audit, interviews, interviewers, events, feedback, applications, consultants, clients, Clock.systemUTC());
    }

    InterviewCommandService(
        EntityManager em,
        InterviewAccess access,
        InterviewQueryService query,
        InterviewSettings settings,
        OrgAuditService audit,
        TalentInterviewRepository interviews,
        TalentInterviewInterviewerRepository interviewers,
        TalentInterviewEventRepository events,
        TalentInterviewFeedbackRepository feedback,
        TalentApplicationRepository applications,
        ConsultantProfileRepository consultants,
        ClientAccountRepository clients,
        Clock clock
    ) {
        this.em = em;
        this.access = access;
        this.query = query;
        this.settings = settings;
        this.audit = audit;
        this.interviews = interviews;
        this.interviewers = interviewers;
        this.events = events;
        this.feedback = feedback;
        this.applications = applications;
        this.consultants = consultants;
        this.clients = clients;
        this.clock = clock;
    }

    // ---- create ----------------------------------------------------------------------------------------------------------------

    @Transactional
    public InterviewDTO.Detail create(OrgMembership me, InterviewDTO.CreateRequest req) {
        PermissionScope scope = access.requireWriteScope(me);
        Long orgId = me.orgId();
        if (req == null || req.consultantId() == null) throw OrgException.invalid("consultantId", "is required");
        if (req.scheduledAt() == null) throw OrgException.invalid("scheduledAt", "is required");
        ConsultantProfile consultant = consultants.findByOrgIdAndId(orgId, req.consultantId()).orElseThrow(OrgNotFoundException::new);
        query.requireConsultantInReach(me, scope, consultant.getId());

        TalentApplication app = null;
        Long clientId;
        if (req.applicationId() != null) {
            app = applications.findByOrgIdAndId(orgId, req.applicationId()).orElseThrow(OrgNotFoundException::new);
            if (!app.getConsultantId().equals(consultant.getId())) throw OrgException.coded(422, "INVALID_APPLICATION", "That application belongs to a different consultant", Map.of());
            clientId = app.getClientId();
        } else {
            if (req.clientId() == null) throw OrgException.invalid("clientId", "pick the client when the interview is not linked to an application");
            clientId = clients.findByOrgIdAndId(orgId, req.clientId()).map(ClientAccount::getId).orElseThrow(OrgNotFoundException::new);
        }

        int duration = durationOf(orgId, req.durationMinutes() == null ? DEFAULT_DURATION_MINUTES : req.durationMinutes());
        String mode = modeOf(req.mode() == null ? "VIDEO" : req.mode());
        String link = linkOf(req.meetingLink());
        String location = text("location", req.location(), LOCATION_MAX);
        String notes = text("notes", req.notes(), NOTES_MAX);
        List<InterviewDTO.InterviewerInput> people = checkInterviewers(orgId, req.interviewers());
        requireFree(orgId, consultant.getId(), req.scheduledAt(), duration, null);

        int roundNo = app == null ? 1 : interviews.findByOrgIdAndApplicationIdOrderByScheduledAtAscIdAsc(orgId, app.getId()).size() + 1;
        String round = text("round", req.round(), ROUND_MAX);

        Instant now = Instant.now(clock);
        TalentInterview i = new TalentInterview();
        i.setOrgId(orgId);
        i.setApplicationId(app == null ? null : app.getId());
        i.setConsultantId(consultant.getId());
        i.setClientId(clientId);
        i.setScheduledAt(req.scheduledAt());
        i.setDurationMinutes(duration);
        i.setStatus(InterviewStatuses.SCHEDULED);
        i.setRoundLabel(round == null ? "Round " + roundNo : round);
        i.setRoundNo(roundNo);
        i.setMode(mode);
        i.setMeetingLink(link);
        i.setLocation(location);
        i.setNotes(notes);
        i.setInterviewerName(people.isEmpty() ? null : people.get(0).name());
        i.setCreatedAt(now);
        i.setUpdatedAt(now);
        i.setCreatedByMemberId(me.memberId());
        i.setUpdatedByMemberId(me.memberId());
        interviews.saveAndFlush(i);
        writeInterviewers(orgId, i.getId(), people);
        record(i, "CREATED", null, InterviewStatuses.SCHEDULED, me, "Scheduled for " + req.scheduledAt(), now, null);
        audit.record(me, AUDIT_CREATE, TARGET, null, String.valueOf(i.getId()), json(mapOf("consultantId", consultant.getId(), "applicationId", i.getApplicationId(), "status", i.getStatus())));
        return query.detailOf(me, i);
    }

    // ---- edit ------------------------------------------------------------------------------------------------------------------

    @Transactional
    public InterviewDTO.Detail patch(OrgMembership me, Long interviewId, Map<String, Object> body) {
        TalentInterview i = writable(me, interviewId);
        if (body == null || body.isEmpty()) throw OrgException.invalid("body", "send at least one field");
        for (String k : body.keySet()) if (!PATCH_FIELDS.contains(k)) throw OrgException.coded(422, "FIELD_UNKNOWN", "Unknown field: " + k, Map.of("field", k));
        Map<String, Object> audited = new LinkedHashMap<>();
        StringBuilder what = new StringBuilder();
        Changes changes = new Changes();

        if (body.containsKey("nextStep")) {
            String next = textOf("nextStep", body.get("nextStep"), NEXT_STEP_MAX);
            if (!Objects.equals(next, i.getNextStep())) {
                i.setNextStep(next);
                changes.text("nextStep");
                audited.put("nextStep", next);
                add(what, "Next step: " + (next == null ? "back to the suggestion" : next));
            }
        }
        if (body.containsKey("notes")) {
            String notes = textOf("notes", body.get("notes"), NOTES_MAX);
            if (!Objects.equals(notes, i.getNotes())) {
                i.setNotes(notes);
                changes.text("notes");
                audited.put("notes", notes == null ? "cleared" : "edited"); // the text itself never goes to the audit row
                add(what, notes == null ? "Notes cleared" : "Notes updated");
            }
        }
        if (body.containsKey("mode")) {
            String mode = body.get("mode") instanceof String s ? modeOf(s) : null;
            if (mode == null) throw OrgException.invalid("mode", "must be one of " + InterviewStatuses.MODES);
            if (!mode.equals(i.getMode())) {
                changes.code("mode", i.getMode(), mode);
                i.setMode(mode);
                audited.put("mode", mode);
                add(what, "Mode: " + InterviewStatuses.MODE_LABELS.get(mode));
            }
        }
        if (body.containsKey("meetingLink")) {
            String link = body.get("meetingLink") == null ? null : linkOf(body.get("meetingLink") instanceof String s ? s : badType("meetingLink"));
            if (!Objects.equals(link, i.getMeetingLink())) {
                i.setMeetingLink(link);
                changes.text("meetingLink");
                audited.put("meetingLink", link == null ? "cleared" : "set");
                add(what, link == null ? "Meeting link removed" : "Meeting link updated");
            }
        }
        if (body.containsKey("location")) {
            String location = textOf("location", body.get("location"), LOCATION_MAX);
            if (!Objects.equals(location, i.getLocation())) {
                i.setLocation(location);
                changes.text("location");
                audited.put("location", location == null ? "cleared" : "set");
                add(what, location == null ? "Location removed" : "Location updated");
            }
        }
        if (body.containsKey("interviewers")) {
            List<InterviewDTO.InterviewerInput> people = interviewersOf(me.orgId(), body.get("interviewers"));
            List<TalentInterviewInterviewer> before = interviewers.findByOrgIdAndInterviewIdOrderBySortOrderAsc(me.orgId(), i.getId());
            if (!sameInterviewers(before, people)) {
                interviewers.deleteByOrgIdAndInterviewId(me.orgId(), i.getId());
                interviewers.flush();
                writeInterviewers(me.orgId(), i.getId(), people);
                i.setInterviewerName(people.isEmpty() ? null : people.get(0).name());
                changes.text("interviewers");
                audited.put("interviewers", people.size());
                add(what, "Interviewers updated (" + people.size() + ")");
            }
        }
        if (audited.isEmpty()) return query.detailOf(me, i); // nothing changed: no event, no audit row
        i.setUpdatedAt(Instant.now(clock));
        interviews.save(i);
        record(i, "UPDATE", null, null, me, what.toString(), Instant.now(clock), changes);
        audit.record(me, AUDIT_UPDATE, TARGET, null, String.valueOf(i.getId()), json(audited));
        return query.detailOf(me, i);
    }

    // ---- reschedule ------------------------------------------------------------------------------------------------------------

    @Transactional
    public InterviewDTO.Detail reschedule(OrgMembership me, Long interviewId, InterviewDTO.RescheduleRequest req) {
        TalentInterview i = writable(me, interviewId);
        if (req == null || req.scheduledAt() == null) throw OrgException.invalid("scheduledAt", "is required");
        String from = i.getStatus();
        if (!InterviewStatuses.SCHEDULED.equals(from) && !InterviewStatuses.CANCELLED.equals(from)) {
            throw OrgException.coded(422, "INVALID_TRANSITION", "Only a scheduled or cancelled interview can be rescheduled", Map.of("from", from, "allowed", List.of(InterviewStatuses.SCHEDULED, InterviewStatuses.CANCELLED)));
        }
        int duration = req.durationMinutes() == null ? (i.getDurationMinutes() == null ? DEFAULT_DURATION_MINUTES : i.getDurationMinutes()) : durationOf(me.orgId(), req.durationMinutes());
        String reason = text("reason", req.reason(), REASON_MAX);
        if (InterviewStatuses.SCHEDULED.equals(from) && req.scheduledAt().equals(i.getScheduledAt()) && duration == (i.getDurationMinutes() == null ? 0 : i.getDurationMinutes())) {
            return query.detailOf(me, i); // nothing changed: no event, no audit row
        }
        requireFree(me.orgId(), i.getConsultantId(), req.scheduledAt(), duration, i.getId());
        Instant before = i.getScheduledAt();
        Integer durationBefore = i.getDurationMinutes();
        Instant now = Instant.now(clock);
        Changes moved = new Changes().instant("scheduledAt", before, req.scheduledAt());
        if (durationBefore == null || durationBefore != duration) moved.number("durationMinutes", durationBefore == null ? null : durationBefore.longValue(), (long) duration);
        if (!InterviewStatuses.SCHEDULED.equals(from)) moved.code("status", from, InterviewStatuses.SCHEDULED);
        i.setScheduledAt(req.scheduledAt());
        i.setDurationMinutes(duration);
        i.setStatus(InterviewStatuses.SCHEDULED);
        i.setReminderRequestedAt(null);
        i.setUpdatedAt(now);
        interviews.save(i);
        record(i, "RESCHEDULE", from, InterviewStatuses.SCHEDULED, me, "Moved from " + before + " to " + req.scheduledAt() + (reason == null ? "" : ": " + reason), now, moved);
        audit.record(me, AUDIT_RESCHEDULE, TARGET, null, String.valueOf(i.getId()), json(mapOf("from", before.toString(), "to", req.scheduledAt().toString())));
        return query.detailOf(me, i);
    }

    // ---- status ----------------------------------------------------------------------------------------------------------------

    @Transactional
    public InterviewDTO.Detail status(OrgMembership me, Long interviewId, InterviewDTO.StatusRequest req) {
        if (req == null) throw OrgException.invalid("body", "send a status");
        TalentInterview i = writable(me, interviewId);
        if (req.undoEventId() != null) return undo(me, i, req.undoEventId());
        String to = req.status() == null ? null : req.status().strip().toUpperCase(Locale.ROOT);
        if (!InterviewStatuses.valid(to)) throw OrgException.invalid("status", "must be one of " + InterviewStatuses.ORDER);
        String from = i.getStatus();
        if (!InterviewStatuses.allowed(from, to)) {
            throw OrgException.coded(422, "INVALID_TRANSITION", "An interview cannot move from " + InterviewStatuses.label(from) + " to " + InterviewStatuses.label(to), Map.of("from", from, "to", to, "allowed", InterviewStatuses.next(from)));
        }
        String reason = text("reason", req.reason(), REASON_MAX);
        Instant now = Instant.now(clock);
        i.setStatus(to);
        i.setUpdatedAt(now);
        interviews.save(i);
        record(i, "STATUS", from, to, me, reason, now, new Changes().code("status", from, to));
        audit.record(me, AUDIT_STATUS, TARGET, null, String.valueOf(i.getId()), json(Map.of("from", from, "to", to)));
        return query.detailOf(me, i);
    }

    /** Reverts the caller's own latest status change (within the organization's undo window, nothing recorded after it). History keeps both events. */
    private InterviewDTO.Detail undo(OrgMembership me, TalentInterview i, Long eventId) {
        List<TalentInterviewEvent> evs = events.findByOrgIdAndInterviewIdOrderByOccurredAtAscIdAsc(me.orgId(), i.getId());
        TalentInterviewEvent last = null;
        for (TalentInterviewEvent e : evs) if (!"UPDATE".equals(e.getEventType())) last = e;
        Instant now = Instant.now(clock);
        boolean ok = last != null && last.getId().equals(eventId) && "STATUS".equals(last.getEventType()) && last.getFromStatus() != null
            && me.memberId().equals(last.getActorMemberId()) && !last.getOccurredAt().plus(Duration.ofMinutes(settings.undoMinutes(me.orgId()))).isBefore(now);
        if (!ok) throw OrgException.coded(422, "UNDO_NOT_AVAILABLE", "That change can no longer be undone", Map.of());
        String undone = last.getToStatus();
        String back = last.getFromStatus();
        i.setStatus(back);
        i.setUpdatedAt(now);
        interviews.save(i);
        record(i, "STATUS_REVERT", undone, back, me, "Undone: back to " + InterviewStatuses.label(back), now, new Changes().code("status", undone, back));
        audit.record(me, AUDIT_STATUS_UNDO, TARGET, null, String.valueOf(i.getId()), json(Map.of("from", undone, "to", back)));
        return query.detailOf(me, i);
    }

    // ---- reminder --------------------------------------------------------------------------------------------------------------

    /** Records that a reminder was requested. No message is sent by Kiwiply: the record is what the team and the audit trail see. */
    @Transactional
    public InterviewDTO.Detail remind(OrgMembership me, Long interviewId) {
        TalentInterview i = writable(me, interviewId);
        if (!InterviewStatuses.SCHEDULED.equals(i.getStatus())) {
            throw OrgException.coded(422, "REMINDER_NOT_APPLICABLE", "A reminder can only be recorded for a scheduled interview", Map.of("status", i.getStatus()));
        }
        Instant now = Instant.now(clock);
        int cooldown = settings.reminderCooldownMinutes(me.orgId());
        if (i.getReminderRequestedAt() != null && i.getReminderRequestedAt().plus(Duration.ofMinutes(cooldown)).isAfter(now)) {
            throw OrgException.coded(409, "REMINDER_RECENT", "A reminder was already recorded a moment ago", Map.of("minutes", cooldown));
        }
        i.setReminderRequestedAt(now);
        i.setUpdatedAt(now);
        interviews.save(i);
        record(i, "REMINDER", null, null, me, "Reminder recorded for the consultant and the interviewers", now, new Changes().text("reminder"));
        audit.record(me, AUDIT_REMINDER, TARGET, null, String.valueOf(i.getId()), "{}");
        return query.detailOf(me, i);
    }

    // ---- feedback --------------------------------------------------------------------------------------------------------------

    @Transactional
    public InterviewDTO.Detail addFeedback(OrgMembership me, Long interviewId, InterviewDTO.FeedbackRequest req) {
        TalentInterview i = writable(me, interviewId);
        if (!InterviewStatuses.IN_PROGRESS.equals(i.getStatus()) && !InterviewStatuses.COMPLETED.equals(i.getStatus())) {
            throw OrgException.coded(422, "FEEDBACK_NOT_APPLICABLE", "Feedback can be added once the interview has started", Map.of("status", i.getStatus()));
        }
        if (req == null || req.rating() == null || req.rating() < 1 || req.rating() > 5) throw OrgException.invalid("rating", "must be 1 to 5");
        String rec = req.recommendation() == null ? null : req.recommendation().strip().toUpperCase(Locale.ROOT);
        if (rec == null || !InterviewStatuses.RECOMMENDATIONS.contains(rec)) throw OrgException.invalid("recommendation", "must be one of " + InterviewStatuses.RECOMMENDATIONS);
        String note = text("note", req.note(), NOTES_MAX);
        Instant now = Instant.now(clock);
        TalentInterviewFeedback f = new TalentInterviewFeedback();
        f.setOrgId(me.orgId());
        f.setInterviewId(i.getId());
        f.setAuthorMemberId(me.memberId());
        f.setRating(req.rating());
        f.setRecommendation(rec);
        f.setNote(note);
        f.setCreatedAt(now);
        feedback.saveAndFlush(f);
        i.setUpdatedAt(now);
        interviews.save(i);
        record(i, "FEEDBACK", null, null, me, "Feedback added: " + req.rating() + " of 5, " + rec.toLowerCase(Locale.ROOT), now, new Changes().text("feedback"));
        audit.record(me, AUDIT_FEEDBACK, TARGET, null, String.valueOf(i.getId()), "{\"feedbackId\":" + f.getId() + "}");
        return query.detailOf(me, i);
    }

    // ---- helpers ---------------------------------------------------------------------------------------------------------------

    /** The interview, only when the caller may read it AND write at a scope covering it; otherwise the generic 404. */
    private TalentInterview writable(OrgMembership me, Long interviewId) {
        TalentInterview i = query.visible(me, interviewId);
        access.requireWrite(me, query.marketersOf(me.orgId(), i));
        return i;
    }

    private int durationOf(Long orgId, int minutes) {
        int max = settings.maxDurationMinutes(orgId);
        if (minutes < MIN_DURATION_MINUTES || minutes > max) throw OrgException.invalid("durationMinutes", "must be " + MIN_DURATION_MINUTES + " to " + max);
        return minutes;
    }

    private static String modeOf(String raw) {
        String m = raw == null ? "" : raw.strip().toUpperCase(Locale.ROOT);
        if (!InterviewStatuses.MODES.contains(m)) throw OrgException.invalid("mode", "must be one of " + InterviewStatuses.MODES);
        return m;
    }

    private static String linkOf(String raw) {
        if (raw == null) return null;
        String t = raw.strip();
        if (t.isEmpty()) return null;
        if (t.length() > LINK_MAX) throw OrgException.invalid("meetingLink", "at most " + LINK_MAX + " characters");
        String lower = t.toLowerCase(Locale.ROOT);
        if (!(lower.startsWith("https://") || lower.startsWith("http://")) || t.chars().anyMatch(ch -> Character.isWhitespace(ch) || Character.isISOControl(ch)) || t.indexOf('<') >= 0 || t.indexOf('>') >= 0 || t.indexOf('"') >= 0) {
            throw OrgException.invalid("meetingLink", "must be a web address starting with https://");
        }
        return t;
    }

    private static String badType(String field) {
        throw OrgException.invalid(field, "must be text or null");
    }

    /** No other open interview of the consultant may overlap {@code [start, start + minutes)}. */
    @SuppressWarnings("unchecked")
    private void requireFree(Long orgId, Long consultantId, Instant start, int minutes, Long ignoreId) {
        Instant end = start.plus(Duration.ofMinutes(minutes));
        Instant maxStart = end;
        Instant minStart = start.minus(Duration.ofMinutes(settings.maxDurationMinutes(orgId)));
        List<TalentInterview> near = em.createQuery("select i from TalentInterview i where i.orgId = :o and i.consultantId = :c and i.status in ('SCHEDULED', 'IN_PROGRESS') and i.scheduledAt < :hi and i.scheduledAt > :lo")
            .setParameter("o", orgId).setParameter("c", consultantId).setParameter("hi", maxStart).setParameter("lo", minStart).getResultList();
        for (TalentInterview o : near) {
            if (ignoreId != null && ignoreId.equals(o.getId())) continue;
            Instant oEnd = o.getScheduledAt().plus(Duration.ofMinutes(o.getDurationMinutes() == null ? DEFAULT_DURATION_MINUTES : o.getDurationMinutes()));
            if (o.getScheduledAt().isBefore(end) && oEnd.isAfter(start)) {
                throw OrgException.coded(409, "SLOT_OVERLAP", "This consultant already has an interview at that time", Map.of("interviewId", o.getId()));
            }
        }
    }

    private List<InterviewDTO.InterviewerInput> checkInterviewers(Long orgId, List<InterviewDTO.InterviewerInput> raw) {
        List<InterviewDTO.InterviewerInput> out = new ArrayList<>();
        if (raw == null) return out;
        int max = settings.maxInterviewers(orgId);
        if (raw.size() > max) throw OrgException.invalid("interviewers", "at most " + max + " interviewers");
        boolean primarySeen = false;
        for (InterviewDTO.InterviewerInput p : raw) {
            if (p == null) continue;
            String name = text("interviewers.name", p.name(), NAME_MAX);
            if (name == null) throw OrgException.invalid("interviewers.name", "is required");
            String title = text("interviewers.title", p.title(), TITLE_MAX);
            boolean primary = Boolean.TRUE.equals(p.primary()) && !primarySeen;
            primarySeen |= primary;
            out.add(new InterviewDTO.InterviewerInput(name, title, primary));
        }
        if (!out.isEmpty() && !primarySeen) out.set(0, new InterviewDTO.InterviewerInput(out.get(0).name(), out.get(0).title(), true));
        return out;
    }

    @SuppressWarnings("unchecked")
    private List<InterviewDTO.InterviewerInput> interviewersOf(Long orgId, Object raw) {
        if (raw == null) return List.of();
        if (!(raw instanceof List<?> list)) throw OrgException.invalid("interviewers", "must be a list");
        List<InterviewDTO.InterviewerInput> in = new ArrayList<>();
        for (Object o : list) {
            if (!(o instanceof Map<?, ?> m)) throw OrgException.invalid("interviewers", "each interviewer is an object with a name");
            for (Object k : m.keySet()) if (!Set.of("name", "title", "primary").contains(String.valueOf(k))) throw OrgException.coded(422, "FIELD_UNKNOWN", "Unknown field: interviewers." + k, Map.of("field", "interviewers." + k));
            Object name = m.get("name");
            Object title = m.get("title");
            Object primary = m.get("primary");
            if (!(name instanceof String) || (title != null && !(title instanceof String)) || (primary != null && !(primary instanceof Boolean))) throw OrgException.invalid("interviewers", "name and title are text, primary is true or false");
            in.add(new InterviewDTO.InterviewerInput((String) name, (String) title, (Boolean) primary));
        }
        return checkInterviewers(orgId, in);
    }

    private void writeInterviewers(Long orgId, Long interviewId, List<InterviewDTO.InterviewerInput> people) {
        int n = 0;
        for (InterviewDTO.InterviewerInput p : people) {
            TalentInterviewInterviewer v = new TalentInterviewInterviewer();
            v.setOrgId(orgId);
            v.setInterviewId(interviewId);
            v.setName(p.name());
            v.setTitle(p.title());
            v.setPrimary(Boolean.TRUE.equals(p.primary()));
            v.setSortOrder(n++);
            interviewers.save(v);
        }
        interviewers.flush();
    }

    private static boolean sameInterviewers(List<TalentInterviewInterviewer> before, List<InterviewDTO.InterviewerInput> after) {
        if (before.size() != after.size()) return false;
        for (int k = 0; k < before.size(); k++) {
            TalentInterviewInterviewer b = before.get(k);
            InterviewDTO.InterviewerInput a = after.get(k);
            if (!b.getName().equals(a.name()) || !Objects.equals(b.getTitle(), a.title()) || b.isPrimary() != Boolean.TRUE.equals(a.primary())) return false;
        }
        return true;
    }

    /** The one writer of an interview's history: stamps the event (actor, PERSON, what changed) and the interview's own updated_by (change audit). */
    private void record(TalentInterview i, String type, String from, String to, OrgMembership actor, String detail, Instant at, Changes changes) {
        i.setUpdatedByMemberId(actor.memberId());
        TalentInterviewEvent e = new TalentInterviewEvent();
        e.setActorKind("PERSON");
        e.setChanges(changes == null ? null : changes.toJson());
        e.setOrgId(i.getOrgId());
        e.setInterviewId(i.getId());
        e.setEventType(type);
        e.setFromStatus(from);
        e.setToStatus(to);
        e.setActorMemberId(actor.memberId());
        e.setDetail(detail == null ? null : detail.length() > 300 ? detail.substring(0, 300) : detail);
        e.setOccurredAt(at);
        events.saveAndFlush(e);
    }

    private static void add(StringBuilder sb, String part) {
        if (sb.length() > 0) sb.append("; ");
        sb.append(part);
    }

    private static String text(String field, String raw, int max) {
        if (raw == null) return null;
        String t = raw.strip();
        if (t.isEmpty()) return null;
        if (t.length() > max) throw OrgException.invalid(field, "at most " + max + " characters");
        if (t.chars().anyMatch(ch -> Character.isISOControl(ch) && ch != '\n' && ch != '\r') || t.indexOf('<') >= 0 || t.indexOf('>') >= 0) throw OrgException.invalid(field, "contains characters that are not allowed");
        SensitiveContent.check(field, field, t);
        return t;
    }

    private static String textOf(String field, Object raw, int max) {
        if (raw == null) return null;
        if (!(raw instanceof String s)) throw OrgException.invalid(field, "must be text or null");
        return text(field, s, max);
    }

    private static Map<String, Object> mapOf(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int k = 0; k + 1 < kv.length; k += 2) m.put(String.valueOf(kv[k]), kv[k + 1]);
        return m;
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
