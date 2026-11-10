package com.dossier.api.service.ent.mkt.followups;

import com.dossier.api.domain.ent.mkt.MktFollowup;
import com.dossier.api.domain.ent.mkt.MktFollowupEvent;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.TalentApplication;
import com.dossier.api.repository.ent.mkt.MktConsultantLookupRepository;
import com.dossier.api.repository.ent.mkt.MktFollowupEventRepository;
import com.dossier.api.repository.ent.mkt.MktFollowupRepository;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.TalentApplicationRepository;
import com.dossier.api.service.ent.mkt.MktScope;
import com.dossier.api.service.ent.mkt.followups.MktFollowupDto.ActionResult;
import com.dossier.api.service.ent.mkt.followups.MktFollowupDto.Bucket;
import com.dossier.api.service.ent.mkt.followups.MktFollowupDto.CallRequest;
import com.dossier.api.service.ent.mkt.followups.MktFollowupDto.CreateRequest;
import com.dossier.api.service.ent.mkt.followups.MktFollowupDto.Insights;
import com.dossier.api.service.ent.mkt.followups.MktFollowupDto.Kpi;
import com.dossier.api.service.ent.mkt.followups.MktFollowupDto.Page;
import com.dossier.api.service.ent.mkt.followups.MktFollowupDto.ReminderRequest;
import com.dossier.api.service.ent.mkt.followups.MktFollowupDto.Row;
import com.dossier.api.service.ent.mkt.followups.MktFollowupDto.View;
import com.dossier.api.service.ent.mkt.followups.MktFollowupDto.Window;
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
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Marketing workspace's follow-up service. One table ({@code mkt_followup}) serves the Follow-ups page now and the Tasks page and the Home board's
 * "Today's Follow-ups and Tasks" card later, so the due-window queries are public methods taking the caller's {@link MktScope.View}:
 * {@link #today}, {@link #overdue}, {@link #upcoming} (plus {@link #completedToday}, {@link #waiting}).
 *
 * <p>Windows (UTC, "now" from the clock): <b>overdue</b> is derived, not COMPLETED and due before now; <b>today</b> is open items still ahead today
 * (due from now to the end of the UTC day), so nothing is in both lists; <b>upcoming</b> is open items due after today. WAITING items (a call or
 * reminder went out and the other side owes an answer) are in none of the three lists unless they pass their due time (then they are overdue, as chasing
 * is due); they are counted by "Waiting on Response". Every read is filtered to the consultants the caller may see; a consultant or follow-up outside
 * that set is the generic 404.
 *
 * <p>E1: all writes only record. "Send Reminder" stores a {@code REMINDER_SENT} event (a reminder request) and never mails a client or recruiter.
 */
@Service
public class MktFollowupService {

    public static final String PERMISSION = "followups.manage";
    public static final int MAX_SIZE = 100;
    public static final int DEFAULT_SIZE = 50;

    static final String AUDIT_CREATE = "MARKETER_FOLLOWUP_CREATE";
    static final String AUDIT_STATUS = "MARKETER_FOLLOWUP_STATUS";
    static final String AUDIT_CALL = "MARKETER_FOLLOWUP_CALL";
    static final String AUDIT_REMINDER = "MARKETER_FOLLOWUP_REMINDER";
    static final String TARGET = "FOLLOWUP";
    private static final List<Long> NO_IDS = List.of(-1L);

    private final MktScope scope;
    private final MktFollowupRepository followups;
    private final MktFollowupEventRepository events;
    private final MktConsultantLookupRepository consultants;
    private final ClientAccountRepository clients;
    private final TalentApplicationRepository applications;
    private final OrgAuditService audit;
    private final Clock clock;

    @Autowired
    public MktFollowupService(
        MktScope scope, MktFollowupRepository followups, MktFollowupEventRepository events, MktConsultantLookupRepository consultants,
        ClientAccountRepository clients, TalentApplicationRepository applications, OrgAuditService audit
    ) {
        this(scope, followups, events, consultants, clients, applications, audit, Clock.systemUTC());
    }

    MktFollowupService(
        MktScope scope, MktFollowupRepository followups, MktFollowupEventRepository events, MktConsultantLookupRepository consultants,
        ClientAccountRepository clients, TalentApplicationRepository applications, OrgAuditService audit, Clock clock
    ) {
        this.scope = scope;
        this.followups = followups;
        this.events = events;
        this.consultants = consultants;
        this.clients = clients;
        this.applications = applications;
        this.audit = audit;
        this.clock = clock;
    }

    // ---- the page ------------------------------------------------------------------------------------------------------

    /** The whole board in one call: four KPI tiles, the three lists (first {@code size} rows each, with the full totals) and the Insights for {@code window}. */
    @Transactional(readOnly = true)
    public View view(OrgMembership me, Window window, int size, String q) {
        MktScope.View v = scope.resolve(me, PERMISSION);
        Instant now = clock.instant();
        int cap = clampSize(size);
        Window w = window == null ? Window.THIS_WEEK : window;
        List<MktFollowup> todayAll = todayItems(v, now);
        List<MktFollowup> overdueAll = overdueItems(v, now);
        List<MktFollowup> todayRows = filter(todayAll, q, v);
        List<MktFollowup> overdueRows = filter(overdueAll, q, v);
        List<MktFollowup> upcomingRows = filter(upcomingItems(v, now), q, v);
        List<MktFollowup> shown = new ArrayList<>(todayRows.subList(0, Math.min(cap, todayRows.size())));
        shown.addAll(overdueRows.subList(0, Math.min(cap, overdueRows.size())));
        shown.addAll(upcomingRows.subList(0, Math.min(cap, upcomingRows.size())));
        Map<Long, ConsultantProfile> names = consultantsOf(v.orgId(), shown);
        return new View(
            now, kpis(v, now, todayAll.size(), overdueAll.size()),
            page(todayRows, names, now, 0, cap), page(overdueRows, names, now, 0, cap), page(upcomingRows, names, now, 0, cap),
            insights(v, now, w)
        );
    }

    /** One bucket as a page (the Tasks page and the "View all" of a card): {@code sort} is {@code dueAt}, {@code priority} or {@code consultant}, optionally {@code ,desc}. */
    @Transactional(readOnly = true)
    public Page list(OrgMembership me, Bucket bucket, int page, int size, String q, String sort) {
        MktScope.View v = scope.resolve(me, PERMISSION);
        Instant now = clock.instant();
        List<MktFollowup> rows = switch (bucket == null ? Bucket.TODAY : bucket) {
            case TODAY -> todayItems(v, now);
            case OVERDUE -> overdueItems(v, now);
            case UPCOMING -> upcomingItems(v, now);
            case COMPLETED -> completedTodayItems(v, now);
            case WAITING -> waitingItems(v);
        };
        rows = filter(rows, q, v);
        Map<Long, ConsultantProfile> names = consultantsOf(v.orgId(), rows);
        rows = sorted(rows, sort, names);
        return page(rows, names, now, Math.max(0, page), clampSize(size));
    }

    // ---- reusable due-window queries (Tasks page, Home card) ---------------------------------------------------------

    /** Open items still ahead today (now to the end of the UTC day), soonest first. */
    @Transactional(readOnly = true)
    public List<Row> today(MktScope.View v) {
        Instant now = clock.instant();
        List<MktFollowup> rows = todayItems(v, now);
        return rows(rows, consultantsOf(v.orgId(), rows), now);
    }

    /**
     * Every not-completed follow-up of the organization that is overdue by at least {@code olderThanDays} days (MM-04, the escalation rule). Entities, for the rules
     * of {@code EscalationRules}; 0 means every overdue follow-up. The caller has already decided that the organization is theirs (a job, per organization).
     */
    @Transactional(readOnly = true)
    public List<MktFollowup> overdue(Long orgId, int olderThanDays) {
        return followups.findOverdue(orgId, true, NO_IDS, clock.instant().minus(java.time.Duration.ofDays(Math.max(0, olderThanDays))));
    }

    /** Not completed and due before now (derived), oldest first. */
    @Transactional(readOnly = true)
    public List<Row> overdue(MktScope.View v) {
        Instant now = clock.instant();
        List<MktFollowup> rows = overdueItems(v, now);
        return rows(rows, consultantsOf(v.orgId(), rows), now);
    }

    /** Open items due after today, soonest first. */
    @Transactional(readOnly = true)
    public List<Row> upcoming(MktScope.View v) {
        Instant now = clock.instant();
        List<MktFollowup> rows = upcomingItems(v, now);
        return rows(rows, consultantsOf(v.orgId(), rows), now);
    }

    @Transactional(readOnly = true)
    public List<Row> completedToday(MktScope.View v) {
        Instant now = clock.instant();
        List<MktFollowup> rows = completedTodayItems(v, now);
        return rows(rows, consultantsOf(v.orgId(), rows), now);
    }

    @Transactional(readOnly = true)
    public List<Row> waiting(MktScope.View v) {
        Instant now = clock.instant();
        List<MktFollowup> rows = waitingItems(v);
        return rows(rows, consultantsOf(v.orgId(), rows), now);
    }

    // ---- writes (record only; ASSIGNED scope; 404 outside it) ---------------------------------------------------------

    @Transactional
    public ActionResult create(OrgMembership me, CreateRequest req) {
        MktScope.View v = scope.resolve(me, PERMISSION);
        Long orgId = v.orgId();
        scope.require(v, req.consultantId());
        ConsultantProfile consultant = consultants.findByOrgIdAndIdIn(orgId, List.of(req.consultantId())).stream().findFirst().orElseThrow(OrgNotFoundException::new);
        String title = text("title", req.title(), 160, true);
        String detail = text("detail", req.detail(), 200, false);
        String counterpart = text("counterpartLabel", req.counterpartLabel(), 120, false);
        String channel = oneOf("channel", req.channel(), MktFollowup.CHANNELS, MktFollowup.PHONE);
        String priority = oneOf("priority", req.priority(), MktFollowup.PRIORITIES, "MEDIUM");
        if (req.applicationId() != null) {
            TalentApplication app = applications.findByOrgIdAndId(orgId, req.applicationId()).orElseThrow(OrgNotFoundException::new);
            if (!app.getConsultantId().equals(consultant.getId())) throw new OrgNotFoundException();
        }
        if (req.clientAccountId() != null) {
            ClientAccount client = clients.findByOrgIdAndId(orgId, req.clientAccountId()).orElseThrow(OrgNotFoundException::new);
            if (counterpart == null) counterpart = client.getName();
        }
        Instant now = clock.instant();
        String status = req.status() == null || req.status().isBlank()
            ? (req.dueAt().isBefore(endOfDay(now)) ? "PENDING" : "NOT_STARTED")
            : oneOf("status", req.status(), MktFollowup.STATUSES, "PENDING");
        MktFollowup f = new MktFollowup();
        f.setOrgId(orgId);
        f.setConsultantId(consultant.getId());
        f.setApplicationId(req.applicationId());
        f.setClientAccountId(req.clientAccountId());
        f.setTitle(title);
        f.setDetail(detail != null ? detail : consultant.getDisplayName() + (consultant.getJobTitle() == null ? "" : " - " + consultant.getJobTitle()));
        f.setCounterpartLabel(counterpart);
        f.setChannel(channel);
        f.setPriority(priority);
        f.setStatus(status);
        f.setDueAt(req.dueAt());
        f.setCompletedAt(MktFollowup.COMPLETED.equals(status) ? now : null);
        f.setOwnerMemberId(me.memberId());
        f.setCreatedAt(now);
        f.setUpdatedAt(now);
        followups.save(f);
        audit.record(me, AUDIT_CREATE, TARGET, null, String.valueOf(f.getId()), "consultant=" + consultant.getId() + " channel=" + channel + " priority=" + priority);
        return new ActionResult(row(f, Map.of(consultant.getId(), consultant), now), null, false);
    }

    @Transactional
    public ActionResult updateStatus(OrgMembership me, Long id, String status) {
        MktScope.View v = scope.resolve(me, PERMISSION);
        MktFollowup f = visible(v, id);
        String next = oneOf("status", status, MktFollowup.STATUSES, null);
        return changeStatus(me, f, next, v);
    }

    @Transactional
    public ActionResult complete(OrgMembership me, Long id) {
        MktScope.View v = scope.resolve(me, PERMISSION);
        return changeStatus(me, visible(v, id), MktFollowup.COMPLETED, v);
    }

    /** Logs a call and its note; optionally parks the item as WAITING for the other side's answer. */
    @Transactional
    public ActionResult logCall(OrgMembership me, Long id, CallRequest req) {
        MktScope.View v = scope.resolve(me, PERMISSION);
        MktFollowup f = visible(v, id);
        String note = text("note", req.note(), 500, true);
        Instant now = clock.instant();
        event(f, MktFollowupEvent.CALL_LOGGED, note, me, now);
        if (Boolean.TRUE.equals(req.awaitingReply()) && !MktFollowup.COMPLETED.equals(f.getStatus())) {
            f.setStatus(MktFollowup.WAITING);
        } else if (("PENDING".equals(f.getStatus()) || "NOT_STARTED".equals(f.getStatus()) || "SCHEDULED".equals(f.getStatus()))) {
            f.setStatus("IN_PROGRESS");
        }
        f.setUpdatedAt(now);
        followups.save(f);
        audit.record(me, AUDIT_CALL, TARGET, null, String.valueOf(f.getId()), "call logged");
        return new ActionResult(row(f, consultantsOf(v.orgId(), List.of(f)), now), MktFollowupEvent.CALL_LOGGED, false);
    }

    /** Records a reminder REQUEST. Nothing is emailed or messaged to the client, recruiter or consultant (E1: no outbound mail from this build). */
    @Transactional
    public ActionResult sendReminder(OrgMembership me, Long id, ReminderRequest req) {
        MktScope.View v = scope.resolve(me, PERMISSION);
        MktFollowup f = visible(v, id);
        String note = req == null ? null : text("note", req.note(), 500, false);
        Instant now = clock.instant();
        event(f, MktFollowupEvent.REMINDER_SENT, note, me, now);
        f.setUpdatedAt(now);
        followups.save(f);
        audit.record(me, AUDIT_REMINDER, TARGET, null, String.valueOf(f.getId()), "reminder requested (recorded only, nothing sent)");
        return new ActionResult(row(f, consultantsOf(v.orgId(), List.of(f)), now), MktFollowupEvent.REMINDER_SENT, false);
    }

    private ActionResult changeStatus(OrgMembership me, MktFollowup f, String next, MktScope.View v) {
        Instant now = clock.instant();
        String prev = f.getStatus();
        if (!prev.equals(next)) {
            f.setStatus(next);
            f.setCompletedAt(MktFollowup.COMPLETED.equals(next) ? now : null);
            f.setUpdatedAt(now);
            followups.save(f);
            event(f, MktFollowupEvent.STATUS_CHANGED, prev + " -> " + next, me, now);
            audit.record(me, AUDIT_STATUS, TARGET, null, String.valueOf(f.getId()), prev + " -> " + next);
        }
        return new ActionResult(row(f, consultantsOf(v.orgId(), List.of(f)), now), MktFollowupEvent.STATUS_CHANGED, false);
    }

    private void event(MktFollowup f, String kind, String note, OrgMembership me, Instant at) {
        MktFollowupEvent e = new MktFollowupEvent();
        e.setOrgId(f.getOrgId());
        e.setFollowupId(f.getId());
        e.setKind(kind);
        e.setNote(note);
        e.setOccurredAt(at);
        e.setByMemberId(me.memberId());
        events.save(e);
    }

    private MktFollowup visible(MktScope.View v, Long id) {
        MktFollowup f = followups.findByOrgIdAndId(v.orgId(), id).orElseThrow(OrgNotFoundException::new);
        scope.require(v, f.getConsultantId());
        return f;
    }

    // ---- window queries (entity level) ---------------------------------------------------------------------------------

    private List<MktFollowup> todayItems(MktScope.View v, Instant now) {
        return followups.findOpenDueBetween(v.orgId(), v.all(), ids(v), now, endOfDay(now));
    }

    private List<MktFollowup> overdueItems(MktScope.View v, Instant now) {
        return followups.findOverdue(v.orgId(), v.all(), ids(v), now);
    }

    private List<MktFollowup> upcomingItems(MktScope.View v, Instant now) {
        return followups.findOpenDueBetween(v.orgId(), v.all(), ids(v), endOfDay(now), Instant.parse("9999-01-01T00:00:00Z"));
    }

    private List<MktFollowup> completedTodayItems(MktScope.View v, Instant now) {
        return followups.findCompletedBetween(v.orgId(), v.all(), ids(v), startOfDay(now), endOfDay(now));
    }

    private List<MktFollowup> waitingItems(MktScope.View v) {
        return followups.findWaiting(v.orgId(), v.all(), ids(v));
    }

    // ---- KPIs and insights ---------------------------------------------------------------------------------------------

    private List<Kpi> kpis(MktScope.View v, Instant now, long dueToday, long overdue) {
        Long org = v.orgId();
        boolean all = v.all();
        Collection<Long> ids = ids(v);
        Instant start = startOfDay(now);
        Instant end = endOfDay(now);
        Instant weekAgo = now.minus(7, ChronoUnit.DAYS);

        List<Long> dueSpark = new ArrayList<>();
        List<Long> overdueSpark = new ArrayList<>();
        List<Long> doneSpark = new ArrayList<>();
        List<Long> waitSpark = new ArrayList<>();
        for (int back = 7; back >= 0; back--) {
            Instant from = start.minus(back, ChronoUnit.DAYS);
            Instant to = from.plus(1, ChronoUnit.DAYS);
            dueSpark.add(followups.countDueBetween(org, all, ids, from, to));
            overdueSpark.add(followups.countOverdueAt(org, all, ids, to.isAfter(now) ? now : to));
            doneSpark.add(followups.countCompletedBetween(org, all, ids, from, to));
            waitSpark.add(followups.countWaitingChangedBetween(org, all, ids, from, to));
        }
        long completedToday = followups.countCompletedBetween(org, all, ids, start, end);
        long waiting = followups.countWaiting(org, all, ids);
        return List.of(
            new Kpi("dueToday", dueToday, pct(dueToday, followups.countDueBetween(org, all, ids, weekAgo, end.minus(7, ChronoUnit.DAYS))), dueSpark),
            new Kpi("overdue", overdue, pct(overdue, followups.countOverdueAt(org, all, ids, weekAgo)), overdueSpark),
            new Kpi("completedToday", completedToday, pct(completedToday, followups.countCompletedBetween(org, all, ids, start.minus(7, ChronoUnit.DAYS), weekAgo)), doneSpark),
            new Kpi("waiting", waiting, null, waitSpark)
        );
    }

    /** Response rate = completed / (completed + waiting) in the window; avg response time = reminder-or-call to completion, from the event log. */
    Insights insights(MktScope.View v, Instant now, Window window) {
        Instant from = now.minus(window.fromDaysAgo, ChronoUnit.DAYS);
        Instant to = now.minus(window.toDaysAgo, ChronoUnit.DAYS);
        long completed = followups.countCompletedBetween(v.orgId(), v.all(), ids(v), from, to);
        long waiting = followups.countWaitingChangedBetween(v.orgId(), v.all(), ids(v), from, to);
        Double rate = completed + waiting == 0 ? null : round1(completed * 100.0 / (completed + waiting));
        Double avg = avgResponseHours(v, from, to);
        return new Insights(window.name(), rate, avg, completed, waiting);
    }

    private Double avgResponseHours(MktScope.View v, Instant from, Instant to) {
        List<MktFollowup> done = followups.findCompletedBetween(v.orgId(), v.all(), ids(v), from, to);
        if (done.isEmpty()) return null;
        Map<Long, MktFollowup> byId = done.stream().collect(Collectors.toMap(MktFollowup::getId, f -> f));
        Map<Long, Instant> firstOut = new HashMap<>();
        for (MktFollowupEvent e : events.findByOrgIdAndFollowupIdIn(v.orgId(), byId.keySet())) {
            if (!MktFollowupEvent.CALL_LOGGED.equals(e.getKind()) && !MktFollowupEvent.REMINDER_SENT.equals(e.getKind())) continue;
            firstOut.merge(e.getFollowupId(), e.getOccurredAt(), (a, b) -> a.isBefore(b) ? a : b);
        }
        double sum = 0;
        int n = 0;
        for (Map.Entry<Long, Instant> en : firstOut.entrySet()) {
            Instant doneAt = byId.get(en.getKey()).getCompletedAt();
            if (doneAt == null || doneAt.isBefore(en.getValue())) continue;
            sum += Duration.between(en.getValue(), doneAt).toMinutes() / 60.0;
            n++;
        }
        return n == 0 ? null : round1(sum / n);
    }

    // ---- helpers -------------------------------------------------------------------------------------------------------

    private static Collection<Long> ids(MktScope.View v) {
        return v.all() || v.consultantIds().isEmpty() ? NO_IDS : v.consultantIds();
    }

    static Instant startOfDay(Instant now) {
        return LocalDate.ofInstant(now, ZoneOffset.UTC).atStartOfDay().toInstant(ZoneOffset.UTC);
    }

    static Instant endOfDay(Instant now) {
        return startOfDay(now).plus(1, ChronoUnit.DAYS);
    }

    /** Percent change, null when there is no previous value to compare to. */
    static Double pct(long current, long previous) {
        return previous <= 0 ? null : round1((current - previous) * 100.0 / previous);
    }

    private static Double round1(double d) {
        return Math.round(d * 10.0) / 10.0;
    }

    private static int clampSize(int size) {
        return size <= 0 ? DEFAULT_SIZE : Math.min(size, MAX_SIZE);
    }

    private Map<Long, ConsultantProfile> consultantsOf(Long orgId, List<MktFollowup> rows) {
        Set<Long> ids = new java.util.LinkedHashSet<>();
        for (MktFollowup f : rows) ids.add(f.getConsultantId());
        if (ids.isEmpty()) return Map.of();
        return consultants.findByOrgIdAndIdIn(orgId, ids).stream().collect(Collectors.toMap(ConsultantProfile::getId, c -> c, (a, b) -> a));
    }

    private List<MktFollowup> filter(List<MktFollowup> rows, String q, MktScope.View v) {
        if (q == null || q.isBlank()) return rows;
        String needle = q.strip().toLowerCase(Locale.ROOT);
        Map<Long, ConsultantProfile> names = consultantsOf(v.orgId(), rows);
        return rows.stream().filter(f -> contains(f.getTitle(), needle) || contains(f.getDetail(), needle) || contains(f.getCounterpartLabel(), needle)
            || Optional.ofNullable(names.get(f.getConsultantId())).map(c -> contains(c.getDisplayName(), needle)).orElse(false)).toList();
    }

    private static boolean contains(String hay, String needle) {
        return hay != null && hay.toLowerCase(Locale.ROOT).contains(needle);
    }

    private List<MktFollowup> sorted(List<MktFollowup> rows, String sort, Map<Long, ConsultantProfile> names) {
        if (sort == null || sort.isBlank()) return rows;
        String[] parts = sort.split(",");
        boolean desc = parts.length > 1 && "desc".equalsIgnoreCase(parts[1].strip());
        Comparator<MktFollowup> cmp = switch (parts[0].strip()) {
            case "priority" -> Comparator.comparingInt((MktFollowup f) -> MktFollowup.PRIORITIES.indexOf(f.getPriority()));
            case "consultant" -> Comparator.comparing((MktFollowup f) -> Optional.ofNullable(names.get(f.getConsultantId())).map(ConsultantProfile::getDisplayName).orElse(""), String.CASE_INSENSITIVE_ORDER);
            default -> Comparator.comparing(MktFollowup::getDueAt);
        };
        List<MktFollowup> out = new ArrayList<>(rows);
        out.sort(desc ? cmp.reversed() : cmp);
        return out;
    }

    private Page page(List<MktFollowup> rows, Map<Long, ConsultantProfile> names, Instant now, int page, int size) {
        int from = Math.min(rows.size(), page * size);
        int to = Math.min(rows.size(), from + size);
        return new Page(rows(rows.subList(from, to), names, now), rows.size(), page, size);
    }

    private List<Row> rows(List<MktFollowup> rows, Map<Long, ConsultantProfile> names, Instant now) {
        return rows.stream().map(f -> row(f, names, now)).toList();
    }

    private Row row(MktFollowup f, Map<Long, ConsultantProfile> names, Instant now) {
        ConsultantProfile c = names.get(f.getConsultantId());
        return new Row(
            f.getId(), f.getTitle(), f.getDetail(), f.getConsultantId(), c == null ? "" : c.getDisplayName(), null, f.getApplicationId(), f.getClientAccountId(),
            f.getCounterpartLabel(), f.getChannel(), f.getPriority(), f.getStatus(), f.isOverdueAt(now), f.getDueAt(), f.getCompletedAt()
        );
    }

    /** Free text: trimmed, no control characters or angle brackets, length-capped, never a sensitive identifier. */
    static String text(String field, String raw, int max, boolean required) {
        String t = raw == null ? "" : raw.strip().replaceAll("\\s+", " ");
        if (t.isEmpty()) {
            if (required) throw OrgException.invalid(field, "is required");
            return null;
        }
        if (t.length() > max) throw OrgException.invalid(field, "at most " + max + " characters");
        if (t.chars().anyMatch(Character::isISOControl) || t.indexOf('<') >= 0 || t.indexOf('>') >= 0) throw OrgException.invalid(field, "contains characters that are not allowed");
        SensitiveContent.check(field, field, t);
        return t;
    }

    private static String oneOf(String field, String raw, List<String> allowed, String fallback) {
        if (raw == null || raw.isBlank()) {
            if (fallback == null) throw OrgException.invalid(field, "is required");
            return fallback;
        }
        String v = raw.strip().toUpperCase(Locale.ROOT);
        if (!allowed.contains(v)) throw OrgException.invalid(field, "must be one of " + String.join(", ", allowed));
        return v;
    }
}
