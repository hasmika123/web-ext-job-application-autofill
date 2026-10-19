package com.dossier.api.service.ent.mkt.interviews;

import com.dossier.api.domain.ent.mkt.MktInterviewEvent;
import com.dossier.api.domain.ent.mkt.MktInterviewFeedback;
import com.dossier.api.domain.ent.mkt.MktInterviewMeta;
import com.dossier.api.domain.ent.mkt.MktInterviewPrepItem;
import com.dossier.api.domain.ent.talent.TalentInterview;
import com.dossier.api.repository.ent.mkt.MktInterviewEventRepository;
import com.dossier.api.repository.ent.mkt.MktInterviewFeedbackRepository;
import com.dossier.api.repository.ent.mkt.MktInterviewMetaRepository;
import com.dossier.api.repository.ent.mkt.MktInterviewPrepItemRepository;
import com.dossier.api.repository.ent.mkt.MktInterviewRepository;
import com.dossier.api.service.ent.mkt.MktScope;
import com.dossier.api.service.ent.mkt.interviews.MktInterviewsDto.Checklist;
import com.dossier.api.service.ent.mkt.interviews.MktInterviewsDto.ClientOption;
import com.dossier.api.service.ent.mkt.interviews.MktInterviewsDto.FeedbackRequest;
import com.dossier.api.service.ent.mkt.interviews.MktInterviewsDto.FeedbackRow;
import com.dossier.api.service.ent.mkt.interviews.MktInterviewsDto.Kpi;
import com.dossier.api.service.ent.mkt.interviews.MktInterviewsDto.Overview;
import com.dossier.api.service.ent.mkt.interviews.MktInterviewsDto.PrepItem;
import com.dossier.api.service.ent.mkt.interviews.MktInterviewsDto.Query;
import com.dossier.api.service.ent.mkt.interviews.MktInterviewsDto.Reminder;
import com.dossier.api.service.ent.mkt.interviews.MktInterviewsDto.RescheduleRequest;
import com.dossier.api.service.ent.mkt.interviews.MktInterviewsDto.Row;
import com.dossier.api.service.ent.mkt.interviews.MktInterviewsDto.Schedule;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.privacy.SensitiveContent;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Marketing Interviews page (permission {@code interviews.coordinate}, ASSIGNED scope). One read returns the whole board (KPI tiles,
 * the filtered schedule, Upcoming, Pending Feedback, the Preparation Checklist of the next interview, Reminders); a handful of writes
 * record what the marketer did.
 *
 * <p><b>E1:</b> every write RECORDS or PROPOSES. A reschedule is a proposal the consultant confirms (the slot's time only moves when the
 * marketer records the new slot as confirmed); "request a reminder" is a record, nothing is sent; nothing here submits for a consultant.
 *
 * <p><b>Derived status</b> (never stored as such): a finished slot (status COMPLETED, or its end has passed) is PENDING_FEEDBACK until the
 * marketer records feedback, then COMPLETED; an open slot shows its coordination status (CONFIRMED / SCHEDULED / RESCHEDULED /
 * AWAITING_CONFIRMATION) from {@code mkt_interview_meta}, SCHEDULED when no meta row exists yet. Cancelled slots are not on the board.
 *
 * <p><b>KPI math</b> (weeks start on Sunday in the viewer's offset; the "week" is the current calendar week, not the picker range):
 * Interviews This Week = live slots starting in the week; Confirmed = those whose coordination status is CONFIRMED; Pending Feedback =
 * finished slots with no feedback right now (previous = the same count as of 7 days ago, from the feedback timestamps); Reschedules =
 * RESCHEDULE_PROPOSED events in the week. Deltas compare with the previous week and are omitted when it was zero; sparklines are the last
 * 8 weekly buckets. Everything is filtered by the caller's consultant scope.
 */
@Service
public class MktInterviewsService {

    public static final String PERMISSION = "interviews.coordinate";
    public static final int MAX_SIZE = 100;
    public static final int DEFAULT_SIZE = 25;

    public static final String A_RESCHEDULE = "MARKETER_INTERVIEW_RESCHEDULE";
    public static final String A_CONFIRM = "MARKETER_INTERVIEW_CONFIRM";
    public static final String A_FEEDBACK = "MARKETER_INTERVIEW_FEEDBACK";
    public static final String A_REMIND = "MARKETER_INTERVIEW_REMIND";
    public static final String TARGET = "INTERVIEW";

    /** The default Preparation Checklist (the board's seven lines), created lazily per interview. */
    public static final List<String> DEFAULT_PREP = List.of(
        "Review consultant resume and past feedback",
        "Share interview details with consultant",
        "Send calendar invite and meeting link",
        "Share client briefing and interview agenda",
        "Confirm technical requirements (if applicable)",
        "Prepare role-specific questions",
        "Notify internal stakeholders"
    );

    static final Set<String> TYPES = Set.of("VIDEO", "ONSITE", "TECHNICAL", "PANEL", "CLIENT");
    static final Set<String> STATUSES = Set.of("CONFIRMED", "SCHEDULED", "PENDING_FEEDBACK", "RESCHEDULED", "AWAITING_CONFIRMATION", "COMPLETED");
    static final Set<String> OUTCOMES = Set.of("PASSED", "REJECTED", "NO_SHOW", "PENDING");
    private static final Duration WEEK = Duration.ofDays(7);
    private static final Duration REMINDER_DEDUPE = Duration.ofHours(1);
    private static final int BUCKETS = 8;

    private final MktScope scope;
    private final MktInterviewRepository interviews;
    private final MktInterviewMetaRepository metas;
    private final MktInterviewPrepItemRepository prep;
    private final MktInterviewFeedbackRepository feedback;
    private final MktInterviewEventRepository events;
    private final OrgAuditService audit;
    private final MktInterviewPrepTx prepTx;
    private final Clock clock;

    @Autowired
    public MktInterviewsService(
        MktScope scope, MktInterviewRepository interviews, MktInterviewMetaRepository metas, MktInterviewPrepItemRepository prep,
        MktInterviewFeedbackRepository feedback, MktInterviewEventRepository events, OrgAuditService audit, MktInterviewPrepTx prepTx
    ) {
        this(scope, interviews, metas, prep, feedback, events, audit, prepTx, Clock.systemUTC());
    }

    MktInterviewsService(
        MktScope scope, MktInterviewRepository interviews, MktInterviewMetaRepository metas, MktInterviewPrepItemRepository prep,
        MktInterviewFeedbackRepository feedback, MktInterviewEventRepository events, OrgAuditService audit, MktInterviewPrepTx prepTx, Clock clock
    ) {
        this.prepTx = prepTx;
        this.scope = scope;
        this.interviews = interviews;
        this.metas = metas;
        this.prep = prep;
        this.feedback = feedback;
        this.events = events;
        this.audit = audit;
        this.clock = clock;
    }

    // ------------------------------------------------------------------------------------------------ the board

    @Transactional
    public Overview overview(OrgMembership me, Query q) {
        MktScope.View view = scope.resolve(me, PERMISSION);
        Long orgId = view.orgId();
        Instant now = clock.instant();
        int off = Math.max(-840, Math.min(840, q.tzOffsetMinutes()));
        Instant weekStart = weekStart(now, off);
        Instant weekEnd = weekStart.plus(WEEK);

        LocalDate from = q.from() != null ? q.from() : localDate(weekStart, off);
        LocalDate to = q.to() != null ? q.to() : from.plusDays(6);
        if (to.isBefore(from)) throw OrgException.invalid("to", "must not be before from");
        if (ChronoUnit.DAYS.between(from, to) > 366) throw OrgException.invalid("to", "the range is at most one year");
        String statusFilter = q.status() == null || q.status().isBlank() ? null : q.status().trim().toUpperCase(Locale.ROOT);
        if (statusFilter != null && !STATUSES.contains(statusFilter)) throw OrgException.invalid("status", "unknown status");

        List<TalentInterview> kpiRows = visible(view, interviews.findLiveInWindow(orgId, weekStart.minus(WEEK.multipliedBy(BUCKETS - 1)), weekEnd));
        List<TalentInterview> rangeRows = visible(view, interviews.findLiveInWindow(orgId, startOf(from, off), startOf(to.plusDays(1), off)));
        List<TalentInterview> past = visible(view, interviews.findLiveStartedBefore(orgId, now));
        List<TalentInterview> future = visible(view, interviews.findLiveFrom(orgId, now));

        Map<Long, TalentInterview> all = new LinkedHashMap<>();
        for (List<TalentInterview> l : List.of(kpiRows, rangeRows, past, future)) for (TalentInterview i : l) all.putIfAbsent(i.getId(), i);
        Ctx ctx = load(orgId, all.values());

        // ---- KPI tiles
        List<Long> thisWeek = new ArrayList<>();
        List<Long> confirmed = new ArrayList<>();
        for (int k = 0; k < BUCKETS; k++) {
            Instant b0 = weekStart.minus(WEEK.multipliedBy(BUCKETS - 1 - k));
            Instant b1 = b0.plus(WEEK);
            long n = 0, c = 0;
            for (TalentInterview i : kpiRows) {
                if (i.getScheduledAt().isBefore(b0) || !i.getScheduledAt().isBefore(b1)) continue;
                n++;
                MktInterviewMeta m = ctx.metas.get(i.getId());
                if (m != null && "CONFIRMED".equals(m.getCoordinationStatus())) c++;
            }
            thisWeek.add(n);
            confirmed.add(c);
        }
        List<Long> pending = new ArrayList<>();
        for (int k = 0; k < BUCKETS; k++) {
            Instant t = now.minus(WEEK.multipliedBy(BUCKETS - 1 - k));
            long n = 0;
            for (TalentInterview i : past) {
                if (!endedBy(i, t)) continue;
                Instant fb = ctx.firstFeedback.get(i.getId());
                if (fb == null || fb.isAfter(t)) n++;
            }
            pending.add(n);
        }
        List<Long> reschedules = new ArrayList<>(java.util.Collections.nCopies(BUCKETS, 0L));
        Instant evFrom = weekStart.minus(WEEK.multipliedBy(BUCKETS - 1));
        for (Object[] row : events.findOccurrencesWithConsultant(orgId, MktInterviewEvent.RESCHEDULE_PROPOSED, evFrom, weekEnd)) {
            if (!view.sees((Long) row[1])) continue;
            Instant at = (Instant) row[0];
            int k = (int) Math.floorDiv(Duration.between(evFrom, at).toMillis(), WEEK.toMillis());
            if (k >= 0 && k < BUCKETS) reschedules.set(k, reschedules.get(k) + 1);
        }
        List<Kpi> kpis = List.of(kpi("interviewsThisWeek", thisWeek), kpi("confirmedInterviews", confirmed), kpi("pendingFeedback", pending), kpi("reschedules", reschedules));

        // ---- schedule (filtered, sorted, paged)
        String needle = q.q() == null ? "" : q.q().trim().toLowerCase(Locale.ROOT);
        List<Row> filtered = new ArrayList<>();
        for (TalentInterview i : rangeRows) {
            Row r = toRow(i, ctx, now);
            if (statusFilter != null && !statusFilter.equals(r.status())) continue;
            if (q.clientId() != null && !q.clientId().equals(i.getClientId())) continue;
            if (!needle.isEmpty() && !(low(r.consultant()).contains(needle) || low(r.client()).contains(needle) || low(r.role()).contains(needle) || low(r.recruiter()).contains(needle))) continue;
            filtered.add(r);
        }
        filtered.sort(comparator(q.sort(), q.dir()));
        int size = q.size() <= 0 ? DEFAULT_SIZE : Math.min(q.size(), MAX_SIZE);
        int page = Math.max(0, q.page());
        int fromIdx = Math.min(filtered.size(), page * size);
        Schedule schedule = new Schedule(List.copyOf(filtered.subList(fromIdx, Math.min(filtered.size(), fromIdx + size))), filtered.size(), page, size, from, to);

        // ---- the three cards under the table + reminders
        List<Row> upcoming = new ArrayList<>();
        for (TalentInterview i : future) {
            if (upcoming.size() == 5) break;
            if ("COMPLETED".equals(i.getStatus())) continue;
            upcoming.add(toRow(i, ctx, now));
        }
        List<FeedbackRow> pendingRows = new ArrayList<>();
        List<TalentInterview> pendingSorted = new ArrayList<>(past);
        pendingSorted.sort(Comparator.comparing(TalentInterview::getScheduledAt));
        for (TalentInterview i : pendingSorted) {
            if (pendingRows.size() == 5) break;
            if (!"PENDING_FEEDBACK".equals(statusOf(i, ctx.metas.get(i.getId()), ctx.firstFeedback.containsKey(i.getId()), now))) continue;
            MktInterviewMeta m = ctx.metas.get(i.getId());
            Instant due = m != null && m.getFeedbackDueAt() != null ? m.getFeedbackDueAt() : endOf(i).plus(Duration.ofDays(1));
            long days = Math.max(0, Duration.between(due, now).toDays());
            pendingRows.add(new FeedbackRow(i.getId(), i.getScheduledAt(), ctx.consultantName(i), null, ctx.clientName(i), nz(i.getRoundLabel()), (int) days));
        }
        List<Reminder> reminders = new ArrayList<>();
        for (Row r : upcoming) reminders.add(new Reminder(r.id(), r.startsAt(), r.consultant(), r.client(), r.type()));
        Checklist checklist = upcoming.isEmpty() ? null : checklistOf(orgId, all.get(upcoming.get(0).id()), ctx);

        Map<Long, String> clientNames = new java.util.TreeMap<>();
        for (TalentInterview i : all.values()) clientNames.put(i.getClientId(), ctx.clientName(i));
        List<ClientOption> clients = new ArrayList<>();
        clientNames.forEach((id, name) -> clients.add(new ClientOption(id, name)));
        clients.sort(Comparator.comparing(c -> low(c.name())));

        return new Overview(now, kpis, schedule, upcoming, pendingRows, checklist, reminders, clients);
    }

    // ------------------------------------------------------------------------------------------------ the writes (E1: record / propose)

    @Transactional
    public Checklist checklist(OrgMembership me, Long interviewId) {
        TalentInterview i = open(me, interviewId).interview;
        return checklistOf(i.getOrgId(), i, load(i.getOrgId(), List.of(i)));
    }

    @Transactional
    public Checklist tick(OrgMembership me, Long interviewId, Long itemId, boolean done) {
        TalentInterview i = open(me, interviewId).interview;
        ensurePrep(i.getOrgId(), i.getId());
        MktInterviewPrepItem item = prep.findByOrgIdAndInterviewIdAndId(i.getOrgId(), i.getId(), itemId).orElseThrow(OrgNotFoundException::new);
        item.setDone(done);
        item.setDoneAt(done ? clock.instant() : null);
        prep.save(item);
        return checklistOf(i.getOrgId(), i, load(i.getOrgId(), List.of(i)));
    }

    /** Propose a new time. The slot keeps its time until the new one is recorded as confirmed; the consultant is the one who confirms. */
    @Transactional
    public Row proposeReschedule(OrgMembership me, Long interviewId, RescheduleRequest req) {
        Opened o = open(me, interviewId);
        Instant now = clock.instant();
        requireOpenSlot(o.interview, now);
        if (req.proposedAt() == null || !req.proposedAt().isAfter(now)) throw OrgException.invalid("proposedAt", "must be in the future");
        String note = cleanNote(req.note());
        MktInterviewMeta m = metaFor(o.interview);
        m.setCoordinationStatus("RESCHEDULED");
        m.setRescheduleCount(m.getRescheduleCount() + 1);
        m.setProposedFor(req.proposedAt());
        metas.save(m);
        record(o, MktInterviewEvent.RESCHEDULE_PROPOSED, "proposed " + req.proposedAt() + (note == null ? "" : " - " + note));
        audit.record(me, A_RESCHEDULE, TARGET, null, String.valueOf(interviewId), "proposed " + req.proposedAt());
        return rowOf(o.interview, now);
    }

    /** Record that a slot was confirmed (the proposed one when there is a proposal). The consultant/client confirmed; this only writes it down. */
    @Transactional
    public Row confirmSlot(OrgMembership me, Long interviewId) {
        Opened o = open(me, interviewId);
        Instant now = clock.instant();
        requireOpenSlot(o.interview, now);
        MktInterviewMeta m = metaFor(o.interview);
        if (m.getProposedFor() != null) {
            o.interview.setScheduledAt(m.getProposedFor());
            interviews.save(o.interview);
            m.setProposedFor(null);
        }
        m.setCoordinationStatus("CONFIRMED");
        metas.save(m);
        record(o, MktInterviewEvent.SLOT_CONFIRMED, "slot confirmed for " + o.interview.getScheduledAt());
        audit.record(me, A_CONFIRM, TARGET, null, String.valueOf(interviewId), "slot confirmed for " + o.interview.getScheduledAt());
        return rowOf(o.interview, now);
    }

    /** Record feedback after the interview. A slot that is still in the future cannot have feedback (409). */
    @Transactional
    public Row recordFeedback(OrgMembership me, Long interviewId, FeedbackRequest req) {
        Opened o = open(me, interviewId);
        Instant now = clock.instant();
        TalentInterview i = o.interview;
        if (!"COMPLETED".equals(i.getStatus()) && endOf(i).isAfter(now)) throw new OrgException(409, "INTERVIEW_NOT_DONE", "The interview has not happened yet", Map.of());
        String outcome = req.outcome() == null ? "" : req.outcome().trim().toUpperCase(Locale.ROOT);
        if (!OUTCOMES.contains(outcome)) throw OrgException.invalid("outcome", "must be one of " + String.join(", ", new java.util.TreeSet<>(OUTCOMES)));
        String note = req.note() == null || req.note().isBlank() ? null : req.note().trim();
        if (note != null) SensitiveContent.check("note", "note", note);
        if (!"COMPLETED".equals(i.getStatus())) {
            i.setStatus("COMPLETED");
            interviews.save(i);
        }
        MktInterviewFeedback f = new MktInterviewFeedback();
        f.setOrgId(i.getOrgId());
        f.setInterviewId(i.getId());
        f.setRecordedByMemberId(me.memberId());
        f.setOutcome(outcome);
        f.setNote(note);
        f.setCreatedAt(now);
        feedback.save(f);
        record(o, MktInterviewEvent.FEEDBACK_RECORDED, "outcome " + outcome);
        audit.record(me, A_FEEDBACK, TARGET, null, String.valueOf(interviewId), "outcome " + outcome);
        return rowOf(i, now);
    }

    /** A reminder REQUEST for the consultant (nothing is sent from here). Asking again within the hour is a no-op. */
    @Transactional
    public Row requestReminder(OrgMembership me, Long interviewId) {
        Opened o = open(me, interviewId);
        Instant now = clock.instant();
        requireOpenSlot(o.interview, now);
        if (events.findByOrgIdAndInterviewIdAndKindAndOccurredAtGreaterThanEqual(o.interview.getOrgId(), interviewId, MktInterviewEvent.REMINDER_REQUESTED, now.minus(REMINDER_DEDUPE)).isEmpty()) {
            record(o, MktInterviewEvent.REMINDER_REQUESTED, "reminder requested for " + o.interview.getScheduledAt());
            audit.record(me, A_REMIND, TARGET, null, String.valueOf(interviewId), "reminder requested");
        }
        return rowOf(o.interview, now);
    }

    // ------------------------------------------------------------------------------------------------ internals

    private record Opened(OrgMembership me, MktScope.View view, TalentInterview interview) {}

    /** Gate + load + scope: another tenant's id, a missing id and an unassigned consultant's interview are all the same 404. */
    private Opened open(OrgMembership me, Long interviewId) {
        MktScope.View view = scope.resolve(me, PERMISSION);
        TalentInterview i = interviews.findByOrgIdAndId(view.orgId(), interviewId).orElseThrow(OrgNotFoundException::new);
        scope.require(view, i.getConsultantId());
        return new Opened(me, view, i);
    }

    private void requireOpenSlot(TalentInterview i, Instant now) {
        if ("CANCELLED".equals(i.getStatus()) || "COMPLETED".equals(i.getStatus()) || !endOf(i).isAfter(now)) {
            throw new OrgException(409, "INTERVIEW_NOT_OPEN", "This interview is no longer open for scheduling changes", Map.of());
        }
    }

    private static String cleanNote(String note) {
        if (note == null || note.isBlank()) return null;
        String n = note.trim();
        SensitiveContent.check("note", "note", n);
        return n;
    }

    private MktInterviewMeta metaFor(TalentInterview i) {
        return metas.findByOrgIdAndInterviewId(i.getOrgId(), i.getId()).orElseGet(() -> {
            MktInterviewMeta m = new MktInterviewMeta();
            m.setOrgId(i.getOrgId());
            m.setInterviewId(i.getId());
            return m;
        });
    }

    private void record(Opened o, String kind, String detail) {
        MktInterviewEvent e = new MktInterviewEvent();
        e.setOrgId(o.interview.getOrgId());
        e.setInterviewId(o.interview.getId());
        e.setKind(kind);
        e.setActorMemberId(o.me.memberId());
        e.setOccurredAt(clock.instant());
        e.setDetail(detail == null || detail.length() <= 400 ? detail : detail.substring(0, 400));
        events.save(e);
    }

    private Row rowOf(TalentInterview i, Instant now) {
        return toRow(i, load(i.getOrgId(), List.of(i)), now);
    }

    private List<PrepItem> ensurePrep(Long orgId, Long interviewId) {
        List<MktInterviewPrepItem> items = prep.findByOrgIdAndInterviewIdOrderByPositionAsc(orgId, interviewId);
        if (items.isEmpty()) {
            // First touch: created in its own transaction so a request that loses the race to another page (home + interviews) does not fail the page;
            // it re-reads what the winner committed (a plain read here would not see it: this transaction's snapshot predates the winner's commit).
            try {
                items = new ArrayList<>(prepTx.create(orgId, interviewId, DEFAULT_PREP, clock.instant()));
            } catch (org.springframework.dao.DataIntegrityViolationException lostRace) {
                items = new ArrayList<>(prepTx.read(orgId, interviewId));
            }
        }
        List<PrepItem> out = new ArrayList<>();
        for (MktInterviewPrepItem it : items) out.add(new PrepItem(it.getId(), it.getLabel(), it.isDone()));
        return out;
    }

    private Checklist checklistOf(Long orgId, TalentInterview i, Ctx ctx) {
        return new Checklist(i.getId(), ctx.consultantName(i), ctx.clientName(i), ensurePrep(orgId, i.getId()));
    }

    private static List<TalentInterview> visible(MktScope.View view, List<TalentInterview> rows) {
        List<TalentInterview> out = new ArrayList<>();
        for (TalentInterview i : rows) if (view.sees(i.getConsultantId())) out.add(i);
        return out;
    }

    /** Names, roles, metas and first-feedback times for the given interviews (all org-scoped reads). */
    private Ctx load(Long orgId, Collection<TalentInterview> rows) {
        Ctx ctx = new Ctx();
        if (rows.isEmpty()) return ctx;
        Set<Long> ids = new LinkedHashSet<>(), consultants = new LinkedHashSet<>(), clients = new LinkedHashSet<>(), apps = new LinkedHashSet<>();
        for (TalentInterview i : rows) {
            ids.add(i.getId());
            consultants.add(i.getConsultantId());
            clients.add(i.getClientId());
            if (i.getApplicationId() != null) apps.add(i.getApplicationId());
        }
        for (Object[] r : interviews.findConsultantNames(orgId, consultants)) ctx.consultants.put((Long) r[0], new String[] { str(r[1]), str(r[2]) });
        for (Object[] r : interviews.findClientNames(orgId, clients)) ctx.clients.put((Long) r[0], str(r[1]));
        if (!apps.isEmpty()) for (Object[] r : interviews.findRoleTitles(orgId, apps)) ctx.roles.put((Long) r[0], str(r[1]));
        for (MktInterviewMeta m : metas.findByOrgIdAndInterviewIdIn(orgId, ids)) ctx.metas.put(m.getInterviewId(), m);
        for (MktInterviewFeedback f : feedback.findByOrgIdAndInterviewIdIn(orgId, ids)) ctx.firstFeedback.merge(f.getInterviewId(), f.getCreatedAt(), (a, b) -> a.isBefore(b) ? a : b);
        return ctx;
    }

    private static final class Ctx {
        final Map<Long, String[]> consultants = new HashMap<>();
        final Map<Long, String> clients = new HashMap<>();
        final Map<Long, String> roles = new HashMap<>();
        final Map<Long, MktInterviewMeta> metas = new HashMap<>();
        final Map<Long, Instant> firstFeedback = new HashMap<>();

        String consultantName(TalentInterview i) {
            String[] c = consultants.get(i.getConsultantId());
            return c == null ? "" : c[0];
        }

        String clientName(TalentInterview i) {
            return clients.getOrDefault(i.getClientId(), "");
        }

        String role(TalentInterview i) {
            String r = i.getApplicationId() == null ? null : roles.get(i.getApplicationId());
            if (r != null && !r.isBlank()) return r;
            String[] c = consultants.get(i.getConsultantId());
            return c == null ? "" : c[1];
        }
    }

    private Row toRow(TalentInterview i, Ctx ctx, Instant now) {
        MktInterviewMeta m = ctx.metas.get(i.getId());
        String status = statusOf(i, m, ctx.firstFeedback.containsKey(i.getId()), now);
        String recruiter = m != null && m.getRecruiterName() != null && !m.getRecruiterName().isBlank() ? m.getRecruiterName() : nz(i.getInterviewerName());
        String type = m != null && TYPES.contains(m.getInterviewType()) ? m.getInterviewType() : "VIDEO";
        Instant proposed = m != null && "RESCHEDULED".equals(status) ? m.getProposedFor() : null;
        return new Row(
            i.getId(), i.getConsultantId(), ctx.consultantName(i), null, ctx.role(i), i.getClientId(), ctx.clientName(i), type, i.getScheduledAt(),
            i.getDurationMinutes() == null ? 45 : i.getDurationMinutes(), nz(i.getRoundLabel()), recruiter, status, proposed, m == null ? 0 : m.getRescheduleCount()
        );
    }

    /** The derived status (see the class comment). Package-private for the unit tests. */
    static String statusOf(TalentInterview i, MktInterviewMeta m, boolean hasFeedback, Instant now) {
        boolean done = "COMPLETED".equals(i.getStatus()) || !endOf(i).isAfter(now);
        if (done) return hasFeedback ? "COMPLETED" : "PENDING_FEEDBACK";
        String c = m == null ? "SCHEDULED" : m.getCoordinationStatus();
        return "CONFIRMED".equals(c) || "RESCHEDULED".equals(c) || "AWAITING_CONFIRMATION".equals(c) ? c : "SCHEDULED";
    }

    private static boolean endedBy(TalentInterview i, Instant t) {
        return "COMPLETED".equals(i.getStatus()) ? !i.getScheduledAt().isAfter(t) : !endOf(i).isAfter(t);
    }

    static Instant endOf(TalentInterview i) {
        return i.getScheduledAt().plus(Duration.ofMinutes(i.getDurationMinutes() == null ? 45 : i.getDurationMinutes()));
    }

    private static Kpi kpi(String key, List<Long> buckets) {
        long cur = buckets.get(buckets.size() - 1);
        long prev = buckets.get(buckets.size() - 2);
        return new Kpi(key, cur, prev == 0 ? null : Math.round((cur - prev) * 1000.0 / prev) / 10.0, List.copyOf(buckets));
    }

    private static Comparator<Row> comparator(String sort, String dir) {
        String key = sort == null ? "date" : sort.trim().toLowerCase(Locale.ROOT);
        Comparator<Row> c = switch (key) {
            case "consultant" -> Comparator.comparing(r -> low(r.consultant()));
            case "client" -> Comparator.comparing(r -> low(r.client()));
            case "role" -> Comparator.comparing(r -> low(r.role()));
            case "status" -> Comparator.comparing(Row::status);
            case "round" -> Comparator.comparing(r -> low(r.round()));
            default -> Comparator.comparing(Row::startsAt);
        };
        if ("desc".equalsIgnoreCase(dir)) c = c.reversed();
        return c.thenComparing(Row::startsAt).thenComparing(Row::id);
    }

    /** Start of the viewer's calendar week (Sunday), as an instant. */
    static Instant weekStart(Instant now, int offsetMinutes) {
        LocalDate d = localDate(now, offsetMinutes);
        return startOf(d.minusDays(d.getDayOfWeek().getValue() % 7), offsetMinutes);
    }

    static LocalDate localDate(Instant t, int offsetMinutes) {
        return t.plus(offsetMinutes, ChronoUnit.MINUTES).atZone(ZoneOffset.UTC).toLocalDate();
    }

    static Instant startOf(LocalDate d, int offsetMinutes) {
        return d.atStartOfDay().toInstant(ZoneOffset.UTC).minus(offsetMinutes, ChronoUnit.MINUTES);
    }

    private static String low(String s) {
        return s == null ? "" : s.toLowerCase(Locale.ROOT);
    }

    private static String nz(String s) {
        return s == null ? "" : s;
    }

    private static String str(Object o) {
        return o == null ? "" : o.toString();
    }
}
