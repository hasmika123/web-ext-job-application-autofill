package com.dossier.api.service.ent.mkt.performance;

import com.dossier.api.domain.ent.mkt.MktBenchmark;
import com.dossier.api.domain.ent.mkt.MktGoal;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.TalentApplication;
import com.dossier.api.domain.ent.talent.TalentApplicationEvent;
import com.dossier.api.domain.ent.talent.TalentPlacement;
import com.dossier.api.domain.enumeration.ShareScope;
import com.dossier.api.repository.ent.mkt.MktApplicationClientRepository;
import com.dossier.api.repository.ent.mkt.MktApplicationEventRepository;
import com.dossier.api.repository.ent.mkt.MktApplicationLookupRepository;
import com.dossier.api.repository.ent.mkt.MktApplicationRepository;
import com.dossier.api.repository.ent.mkt.MktBenchmarkRepository;
import com.dossier.api.repository.ent.mkt.MktGoalRepository;
import com.dossier.api.repository.ent.mkt.MktPerformanceFollowupRepository;
import com.dossier.api.repository.ent.mkt.MktPerformanceMatchRepository;
import com.dossier.api.repository.ent.mkt.MktPerformancePlacementRepository;
import com.dossier.api.service.ent.mkt.MktScope;
import com.dossier.api.service.ent.mkt.applications.MktApplicationStages;
import com.dossier.api.service.ent.mkt.performance.MktPerformanceDto.Action;
import com.dossier.api.service.ent.mkt.performance.MktPerformanceDto.BenchmarkRow;
import com.dossier.api.service.ent.mkt.performance.MktPerformanceDto.Benchmarks;
import com.dossier.api.service.ent.mkt.performance.MktPerformanceDto.Bucket;
import com.dossier.api.service.ent.mkt.performance.MktPerformanceDto.Funnel;
import com.dossier.api.service.ent.mkt.performance.MktPerformanceDto.GoalRow;
import com.dossier.api.service.ent.mkt.performance.MktPerformanceDto.Goals;
import com.dossier.api.service.ent.mkt.performance.MktPerformanceDto.GoalsRequest;
import com.dossier.api.service.ent.mkt.performance.MktPerformanceDto.Kpi;
import com.dossier.api.service.ent.mkt.performance.MktPerformanceDto.Query;
import com.dossier.api.service.ent.mkt.performance.MktPerformanceDto.Readiness;
import com.dossier.api.service.ent.mkt.performance.MktPerformanceDto.Stage;
import com.dossier.api.service.ent.mkt.performance.MktPerformanceDto.StreamRow;
import com.dossier.api.service.ent.mkt.performance.MktPerformanceDto.Streams;
import com.dossier.api.service.ent.mkt.performance.MktPerformanceDto.TopConsultant;
import com.dossier.api.service.ent.mkt.performance.MktPerformanceDto.Trend;
import com.dossier.api.service.ent.mkt.performance.MktPerformanceDto.TrendPoint;
import com.dossier.api.service.ent.mkt.performance.MktPerformanceDto.View;
import com.dossier.api.service.ent.mkt.performance.MktPerformanceDto.Week;
import com.dossier.api.service.ent.mkt.performance.MktPerformanceDto.WeeklyChart;
import com.dossier.api.service.ent.mkt.talent.MktTalentDtos;
import com.dossier.api.service.ent.mkt.talent.MktTalentService;
import com.dossier.api.service.org.DataShareService;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Supplier;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Marketing Performance board in one call (`/api/orgs/{orgId}/mkt/performance`). Permission {@code reports.view}, ASSIGNED scope: every number is counted over
 * the consultants the caller is assigned to (backup included), never anyone else's. Read-only apart from {@link #updateGoals} (the marketer's own monthly targets).
 *
 * <p><b>Definitions</b> (one place, the web only draws what it is given):
 * <ul>
 *   <li><b>Submission</b> = an application row ({@code talent_application}) of an assigned consultant, counted on its {@code applied_on} day (the consultant submitted; the
 *       marketer only records it). <b>Interview</b> = that application reached Interviewing, <b>Offer</b> = it reached Offer, both read like the Applications funnel
 *       ({@link MktApplicationStages}: the stage it is in now or any stage its history proves). So the rates are cohort rates and Interviews &lt;= Submissions.
 *       <b>Placement</b> = a {@code talent_placement} row by its {@code start_date}.</li>
 *   <li>Interview / Offer / Placement Rate = interviews / offers / placements divided by submissions of the same window.</li>
 *   <li><b>This Month</b> = the last 30 days, <b>last month</b> = the 30 days before that (the T-30 convention of the foundation doc). Deltas with no previous value are null.</li>
 *   <li><b>Active Submissions</b> = applications not yet CLOSED (stage now; its stage 30 days ago for the delta, rebuilt from the event history, as the Applications page does).</li>
 *   <li><b>Follow-up Completion</b> = of the follow-ups that fell due in the window, the share that is COMPLETED.</li>
 *   <li><b>Job Stream Effectiveness</b> is per <b>client</b> (the board lists clients); the Offer Rate chip is green at or above the window's overall offer rate.</li>
 *   <li><b>Readiness</b> over the assigned active consultants (same rows as My Assigned Talent): Inactive = on a project or unavailable; Needs Attention = resume needs an update
 *       or profile completeness below {@value #ATTENTION_BELOW}; Ready to Submit = up-to-date resume, available now and completeness of at least {@value #READY_AT_LEAST};
 *       In Progress = everyone else.</li>
 *   <li><b>Match Rate</b> = average score of the consultant's matches that were not dismissed. Top Performing = placements, then offers, interviews, submissions (last 3 months).</li>
 * </ul>
 *
 * <p>Consent: a consultant who shares nothing with the organization ({@link DataShareService}, same rule as Applications) is left out of every count. Assigned Consultants and
 * Readiness come from the Talent page's service, and need {@code consultants.view}; without it those two are empty (the sibling answers 404, caught here).
 */
@Service
public class MktPerformanceService {

    public static final String PERMISSION = "reports.view";
    static final String AUDIT_GOALS = "MARKETER_GOALS_UPDATE";
    static final String TARGET = "PERFORMANCE_GOALS";
    static final int WEEKS_SPARK = 8;
    static final int STREAM_ROWS = 5;
    static final int TOP_ROWS = 5;
    static final int QUIET_DAYS = 14;
    static final int ATTENTION_BELOW = 50;
    static final int READY_AT_LEAST = 70;
    static final int GOAL_MAX = 100_000;
    private static final List<Long> NO_IDS = List.of(-1L);

    private static final Map<String, String> BUCKET_LABELS = Map.of("ready", "Ready to Submit", "progress", "In Progress", "attention", "Needs Attention", "inactive", "Inactive");
    private static final List<String> BUCKET_ORDER = List.of("ready", "progress", "attention", "inactive");
    private static final Map<String, String> GOAL_LABELS = Map.of("SUBMISSIONS", "Submissions", "INTERVIEWS", "Interviews", "OFFERS", "Offers", "PLACEMENTS", "Placements");
    private static final Map<String, String> BENCH_LABELS = Map.of("INTERVIEW_RATE", "Interview Rate", "OFFER_RATE", "Offer Rate", "PLACEMENT_RATE", "Placement Rate");

    private final MktScope scope;
    private final MktTalentService talent;
    private final MktApplicationRepository apps;
    private final MktApplicationEventRepository events;
    private final MktApplicationLookupRepository consultants;
    private final MktApplicationClientRepository clients;
    private final MktPerformancePlacementRepository placements;
    private final MktPerformanceFollowupRepository followups;
    private final MktPerformanceMatchRepository matches;
    private final MktGoalRepository goals;
    private final MktBenchmarkRepository benchmarks;
    private final DataShareService shares;
    private final OrgAuditService audit;
    private final Clock clock;

    @Autowired
    public MktPerformanceService(
        MktScope scope, MktTalentService talent, MktApplicationRepository apps, MktApplicationEventRepository events, MktApplicationLookupRepository consultants,
        MktApplicationClientRepository clients, MktPerformancePlacementRepository placements, MktPerformanceFollowupRepository followups,
        MktPerformanceMatchRepository matches, MktGoalRepository goals, MktBenchmarkRepository benchmarks, DataShareService shares, OrgAuditService audit
    ) {
        this(scope, talent, apps, events, consultants, clients, placements, followups, matches, goals, benchmarks, shares, audit, Clock.systemUTC());
    }

    MktPerformanceService(
        MktScope scope, MktTalentService talent, MktApplicationRepository apps, MktApplicationEventRepository events, MktApplicationLookupRepository consultants,
        MktApplicationClientRepository clients, MktPerformancePlacementRepository placements, MktPerformanceFollowupRepository followups,
        MktPerformanceMatchRepository matches, MktGoalRepository goals, MktBenchmarkRepository benchmarks, DataShareService shares, OrgAuditService audit, Clock clock
    ) {
        this.scope = scope;
        this.talent = talent;
        this.apps = apps;
        this.events = events;
        this.consultants = consultants;
        this.clients = clients;
        this.placements = placements;
        this.followups = followups;
        this.matches = matches;
        this.goals = goals;
        this.benchmarks = benchmarks;
        this.shares = shares;
        this.audit = audit;
        this.clock = clock;
    }

    // ---- the data, loaded once per call ------------------------------------------------------------------------------------------

    /** One application with its reach (the furthest funnel position it proves) and its last movement. */
    record A(TalentApplication app, int reach, Instant lastEvent) {
        boolean interviewed() {
            return reach >= 2;
        }

        boolean offered() {
            return reach >= 3;
        }

        LocalDate day() {
            return app.getAppliedOn();
        }
    }

    /** Everything the page is drawn from. {@code consultantName} covers every consultant that appears in {@code apps} or {@code placed}. */
    record Book(List<A> apps, Map<Long, List<TalentApplicationEvent>> history, List<TalentPlacement> placed, Map<Long, ConsultantProfile> consultantName, Map<Long, String> clientName) {}

    @Transactional(readOnly = true)
    public View view(OrgMembership me, Query q) {
        MktScope.View v = scope.resolve(me, PERMISSION);
        Instant now = clock.instant();
        LocalDate today = LocalDate.ofInstant(now, ZoneOffset.UTC);
        Book book = load(v, today.minusDays(400));
        Query query = q == null ? new Query(null, null, null, null, null, null) : q;

        Optional<MktTalentDtos.Response> t = guarded(() -> talent.list(me, new MktTalentService.ListQuery(null, null, null, null, null, null, null, 0, MktTalentService.MAX_SIZE)));
        List<MktTalentDtos.Row> talentRows = t.map(r -> allTalentRows(me, r)).orElse(List.of());

        int weeks = weeksOf(query.weeks());
        String trendPeriod = monthsKey(query.trend());
        String funnelPeriod = monthsKey(query.funnel());
        String streamPeriod = monthsKey(query.streams());
        String benchPeriod = monthKey(query.benchmarks());
        String goalPeriod = monthKey(query.goals());

        List<TopConsultant> top = top(v, book, today, now);
        Streams streams = streams(book, streamPeriod, today);
        return new View(
            now, kpis(v, book, t, today, now), weekly(book, weeks, today), trend(book, trendPeriod, today), funnel(book, funnelPeriod, today), readiness(v, t, talentRows),
            streams, top, benchmarks(v, book, benchPeriod, today), goals(v, book, goalPeriod, today), actions(v, book, talentRows, top, streams, today)
        );
    }

    /** Record the caller's own monthly targets (only the metrics given); returns the Goals card for this month. Records numbers only, nothing is submitted or sent. */
    @Transactional
    public Goals updateGoals(OrgMembership me, GoalsRequest req) {
        MktScope.View v = scope.resolve(me, PERMISSION);
        Map<String, Integer> wanted = new LinkedHashMap<>();
        if (req != null) {
            put(wanted, MktGoal.SUBMISSIONS, req.submissions());
            put(wanted, MktGoal.INTERVIEWS, req.interviews());
            put(wanted, MktGoal.OFFERS, req.offers());
            put(wanted, MktGoal.PLACEMENTS, req.placements());
        }
        if (wanted.isEmpty()) throw OrgException.invalid("targets", "give at least one monthly target");
        Instant now = clock.instant();
        Map<String, MktGoal> own = new HashMap<>();
        for (MktGoal g : goals.findByOrgIdAndOwnerMemberId(v.orgId(), v.memberId())) if (MktGoal.MONTH.equals(g.getPeriod())) own.put(g.getMetric(), g);
        for (Map.Entry<String, Integer> e : wanted.entrySet()) {
            MktGoal g = own.get(e.getKey());
            if (g == null) {
                g = new MktGoal();
                g.setOrgId(v.orgId());
                g.setOwnerMemberId(v.memberId());
                g.setMetric(e.getKey());
                g.setPeriod(MktGoal.MONTH);
                g.setCreatedAt(now);
            }
            g.setTarget(e.getValue());
            g.setUpdatedAt(now);
            goals.save(g);
        }
        audit.record(me, AUDIT_GOALS, TARGET, null, String.valueOf(v.memberId()), "metrics=" + String.join(",", wanted.keySet()));
        LocalDate today = LocalDate.ofInstant(now, ZoneOffset.UTC);
        return goals(v, load(v, today.minusDays(400)), "month", today);
    }

    private static void put(Map<String, Integer> out, String metric, Integer value) {
        if (value == null) return;
        if (value < 0 || value > GOAL_MAX) throw OrgException.invalid(metric.toLowerCase(), "must be between 0 and " + GOAL_MAX);
        out.put(metric, value);
    }

    private static <T> Optional<T> guarded(Supplier<T> call) {
        try {
            return Optional.ofNullable(call.get());
        } catch (OrgNotFoundException e) {
            return Optional.empty();
        }
    }

    /** Every row of the Talent page (it pages at {@link MktTalentService#MAX_SIZE}); the first page is already in hand. */
    private List<MktTalentDtos.Row> allTalentRows(OrgMembership me, MktTalentDtos.Response first) {
        List<MktTalentDtos.Row> rows = new ArrayList<>(first.items());
        int page = 1;
        while (rows.size() < first.total() && page < 50) {
            MktTalentDtos.Response next = talent.list(me, new MktTalentService.ListQuery(null, null, null, null, null, null, null, page, MktTalentService.MAX_SIZE));
            if (next.items().isEmpty()) break;
            rows.addAll(next.items());
            page++;
        }
        return rows;
    }

    private Book load(MktScope.View v, LocalDate placedSince) {
        Long orgId = v.orgId();
        List<TalentApplication> rows = v.all()
            ? apps.findByOrgId(orgId)
            : v.consultantIds().isEmpty() ? List.of() : apps.findByOrgIdAndConsultantIdIn(orgId, v.consultantIds());
        rows = rows.stream().filter(a -> v.sees(a.getConsultantId())).toList();
        List<TalentPlacement> placed = v.all() || !v.consultantIds().isEmpty()
            ? placements.findStartedSince(orgId, v.all(), ids(v), placedSince).stream().filter(p -> v.sees(p.getConsultantId())).toList()
            : List.of();

        Set<Long> people = new HashSet<>();
        rows.forEach(a -> people.add(a.getConsultantId()));
        placed.forEach(p -> people.add(p.getConsultantId()));
        if (people.isEmpty()) return new Book(List.of(), Map.of(), List.of(), Map.of(), Map.of());

        Map<Long, ConsultantProfile> byConsultant = new HashMap<>();
        for (ConsultantProfile c : consultants.findByOrgIdAndIdIn(orgId, people)) byConsultant.put(c.getId(), c);
        Map<Long, Boolean> shared = new HashMap<>();
        for (ConsultantProfile c : byConsultant.values()) shared.put(c.getId(), consentOf(orgId, c) != ShareScope.NONE);
        rows = rows.stream().filter(a -> shared.getOrDefault(a.getConsultantId(), false)).toList();
        placed = placed.stream().filter(p -> shared.getOrDefault(p.getConsultantId(), false)).toList();
        byConsultant.keySet().removeIf(id -> !shared.get(id));

        Map<Long, List<TalentApplicationEvent>> history = new HashMap<>();
        if (!rows.isEmpty()) {
            for (TalentApplicationEvent e : events.findByOrgIdAndApplicationIdIn(orgId, rows.stream().map(TalentApplication::getId).toList())) {
                history.computeIfAbsent(e.getApplicationId(), k -> new ArrayList<>()).add(e);
            }
            history.values().forEach(h -> h.sort(Comparator.comparing(TalentApplicationEvent::getOccurredAt).thenComparing(TalentApplicationEvent::getId, Comparator.nullsLast(Comparator.naturalOrder()))));
        }
        List<A> list = new ArrayList<>();
        for (TalentApplication a : rows) {
            List<TalentApplicationEvent> h = history.getOrDefault(a.getId(), List.of());
            int reach = MktApplicationStages.of(a.getStage(), a.getClosedReason()).rank();
            Instant last = a.getStageChangedAt();
            for (TalentApplicationEvent e : h) {
                reach = Math.max(reach, MktApplicationStages.rankOfStage(e.getToStage()));
                if (last == null || e.getOccurredAt().isAfter(last)) last = e.getOccurredAt();
            }
            list.add(new A(a, reach, last));
        }
        Set<Long> clientIds = new HashSet<>();
        rows.forEach(a -> clientIds.add(a.getClientId()));
        placed.forEach(p -> clientIds.add(p.getClientId()));
        Map<Long, String> clientName = new HashMap<>();
        if (!clientIds.isEmpty()) for (ClientAccount c : clients.findByOrgIdAndIdIn(orgId, clientIds)) clientName.put(c.getId(), c.getName());
        return new Book(list, history, placed, byConsultant, clientName);
    }

    /** FULL for an org-managed profile (no seat, so nobody to ask); a seat's effective scope otherwise (the Applications page rule). */
    private ShareScope consentOf(Long orgId, ConsultantProfile c) {
        if (c.getMemberId() == null) return ShareScope.FULL;
        ShareScope s = shares.scopeOf(orgId, c.getMemberId());
        return s == null ? ShareScope.NONE : s;
    }

    private static Collection<Long> ids(MktScope.View v) {
        return v.all() || v.consultantIds().isEmpty() ? NO_IDS : v.consultantIds();
    }

    // ---- periods -----------------------------------------------------------------------------------------------------------------

    static int weeksOf(String p) {
        return "4w".equals(p) ? 4 : "12w".equals(p) ? 12 : 8;
    }

    static String monthsKey(String p) {
        return "1m".equals(p) || "6m".equals(p) ? p : "3m";
    }

    static String monthKey(String p) {
        return "lastMonth".equals(p) ? "lastMonth" : "month";
    }

    static LocalDate since(String months, LocalDate today) {
        return switch (months) {
            case "1m" -> today.minusMonths(1);
            case "6m" -> today.minusMonths(6);
            default -> today.minusMonths(3);
        };
    }

    /** The calendar weeks (Monday to Sunday, UTC) ending with the week of {@code today}, oldest first. */
    static List<LocalDate> weekStarts(LocalDate today, int n) {
        LocalDate monday = today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        List<LocalDate> out = new ArrayList<>(n);
        for (int i = n - 1; i >= 0; i--) out.add(monday.minusWeeks(i));
        return out;
    }

    // ---- counting ----------------------------------------------------------------------------------------------------------------

    record Counts(long submissions, long interviews, long offers) {}

    /** Applications applied on a day in {@code [from, to]}. */
    static Counts count(Collection<A> all, LocalDate from, LocalDate to) {
        long s = 0;
        long i = 0;
        long o = 0;
        for (A a : all) {
            LocalDate d = a.day();
            if (d == null || d.isBefore(from) || d.isAfter(to)) continue;
            s++;
            if (a.interviewed()) i++;
            if (a.offered()) o++;
        }
        return new Counts(s, i, o);
    }

    static long placementsBetween(Collection<TalentPlacement> all, LocalDate from, LocalDate to) {
        return all.stream().filter(p -> p.getStartDate() != null && !p.getStartDate().isBefore(from) && !p.getStartDate().isAfter(to)).count();
    }

    static Double rate(long part, long whole) {
        return whole <= 0 ? null : Math.round(part * 1000.0 / whole) / 10.0;
    }

    static int pctInt(long part, long whole) {
        return whole <= 0 ? 0 : (int) Math.round(part * 100.0 / whole);
    }

    /** Relative change in percent (one decimal); null when there is no previous value to compare. */
    static Double change(Double current, Double previous) {
        if (current == null || previous == null || previous <= 0) return null;
        return Math.round((current - previous) * 1000.0 / previous) / 10.0;
    }

    private static Double d(long n) {
        return (double) n;
    }

    // ---- KPI tiles ----------------------------------------------------------------------------------------------------------------

    private List<Kpi> kpis(MktScope.View v, Book b, Optional<MktTalentDtos.Response> t, LocalDate today, Instant now) {
        LocalDate curFrom = today.minusDays(30);
        LocalDate prevFrom = today.minusDays(60);
        LocalDate prevTo = today.minusDays(31);
        Counts cur = count(b.apps(), curFrom, today);
        Counts prev = count(b.apps(), prevFrom, prevTo);
        List<LocalDate> weeks = weekStarts(today, WEEKS_SPARK);

        List<Kpi> out = new ArrayList<>();
        Kpi assigned = t.flatMap(r -> r.kpis().stream().filter(k -> "assigned".equals(k.key())).findFirst())
            .map(k -> new Kpi("assignedConsultants", d(k.value()), k.deltaPct(), k.sparkline().stream().map(MktPerformanceService::d).toList()))
            .orElse(new Kpi("assignedConsultants", null, null, List.of()));
        out.add(assigned);

        long activeNow = b.apps().stream().filter(a -> !MktApplicationStages.CLOSED.equals(a.app().getStage())).count();
        long activeBefore = activeAt(b, now.minus(30, ChronoUnit.DAYS), now);
        List<Double> activeSpark = new ArrayList<>();
        for (LocalDate w : weeks) activeSpark.add(d(activeAt(b, endOfDay(w.plusDays(6), now), now)));
        out.add(new Kpi("activeSubmissions", b.apps().isEmpty() ? null : d(activeNow), change(d(activeNow), d(activeBefore)), activeSpark));

        Double ir = rate(cur.interviews(), cur.submissions());
        Double or = rate(cur.offers(), cur.submissions());
        List<Double> irSpark = new ArrayList<>();
        List<Double> orSpark = new ArrayList<>();
        List<Double> plSpark = new ArrayList<>();
        List<Double> fuSpark = new ArrayList<>();
        for (LocalDate w : weeks) {
            Counts c = count(b.apps(), w, w.plusDays(6));
            irSpark.add(orZero(rate(c.interviews(), c.submissions())));
            orSpark.add(orZero(rate(c.offers(), c.submissions())));
            plSpark.add(d(placementsBetween(b.placed(), w, w.plusDays(6))));
            Instant from = w.atStartOfDay().toInstant(ZoneOffset.UTC);
            Instant to = min(w.plusDays(7).atStartOfDay().toInstant(ZoneOffset.UTC), now);
            fuSpark.add(orZero(followRate(v, from, to)));
        }
        out.add(new Kpi("interviewRate", ir, change(ir, rate(prev.interviews(), prev.submissions())), irSpark));
        out.add(new Kpi("offerRate", or, change(or, rate(prev.offers(), prev.submissions())), orSpark));
        long placedNow = placementsBetween(b.placed(), curFrom, today);
        long placedBefore = placementsBetween(b.placed(), prevFrom, prevTo);
        out.add(new Kpi("placements", d(placedNow), placedBefore > 0 ? change(d(placedNow), d(placedBefore)) : null, plSpark));

        Instant nowMinus30 = now.minus(30, ChronoUnit.DAYS);
        Double fu = followRate(v, nowMinus30, now);
        out.add(new Kpi("followupCompletion", fu, change(fu, followRate(v, now.minus(60, ChronoUnit.DAYS), nowMinus30)), fuSpark));
        return out;
    }

    private static double orZero(Double x) {
        return x == null ? 0 : x;
    }

    private static Instant min(Instant a, Instant b) {
        return a.isBefore(b) ? a : b;
    }

    private static Instant endOfDay(LocalDate day, Instant cap) {
        return min(day.plusDays(1).atStartOfDay().toInstant(ZoneOffset.UTC), cap);
    }

    private Double followRate(MktScope.View v, Instant from, Instant to) {
        if (!v.all() && v.consultantIds().isEmpty()) return null;
        long due = followups.countDue(v.orgId(), v.all(), ids(v), from, to);
        return rate(followups.countDueAndCompleted(v.orgId(), v.all(), ids(v), from, to), due);
    }

    /** Applications not CLOSED at {@code t}: its stored stage then, rebuilt from the event history (as the Applications page does). */
    private static long activeAt(Book b, Instant t, Instant now) {
        long n = 0;
        for (A a : b.apps()) {
            String s = stageAt(a.app(), b.history().getOrDefault(a.app().getId(), List.of()), t, now);
            if (s != null && !MktApplicationStages.CLOSED.equals(s)) n++;
        }
        return n;
    }

    static String stageAt(TalentApplication app, List<TalentApplicationEvent> history, Instant t, Instant now) {
        if (!t.isBefore(now)) return app.getStage();
        String stage = null;
        for (TalentApplicationEvent e : history) {
            if (e.getOccurredAt().isAfter(t)) break;
            if (e.getToStage() != null) stage = e.getToStage();
        }
        if (stage == null && history.isEmpty() && !app.getCreatedAt().isAfter(t)) return app.getStage();
        return stage;
    }

    // ---- Submissions by Week ------------------------------------------------------------------------------------------------------

    private WeeklyChart weekly(Book b, int weeks, LocalDate today) {
        List<Week> out = new ArrayList<>();
        for (LocalDate w : weekStarts(today, weeks)) {
            Counts c = count(b.apps(), w, w.plusDays(6));
            out.add(new Week(w, w.plusDays(6), c.submissions(), c.interviews(), c.offers()));
        }
        return new WeeklyChart(weeks + "w", out);
    }

    // ---- Interviews vs Offers (running totals) -------------------------------------------------------------------------------------

    private Trend trend(Book b, String period, LocalDate today) {
        LocalDate since = since(period, today);
        List<TrendPoint> out = new ArrayList<>();
        LocalDate end = since.with(TemporalAdjusters.nextOrSame(DayOfWeek.SUNDAY));
        while (true) {
            LocalDate at = end.isAfter(today) ? today : end;
            Counts c = count(b.apps(), since, at);
            out.add(new TrendPoint(at, c.submissions(), c.interviews(), c.offers()));
            if (!end.isBefore(today)) break;
            end = end.plusWeeks(1);
        }
        return new Trend(period, out);
    }

    // ---- Placement Funnel ----------------------------------------------------------------------------------------------------------

    private Funnel funnel(Book b, String period, LocalDate today) {
        LocalDate since = since(period, today);
        Counts c = count(b.apps(), since, today);
        long placed = placementsBetween(b.placed(), since, today);
        long total = c.submissions();
        List<Stage> stages = List.of(
            new Stage("submissions", "Submissions", c.submissions(), total == 0 ? 0 : 100),
            new Stage("interviews", "Interviews", c.interviews(), pctInt(c.interviews(), total)),
            new Stage("offers", "Offers", c.offers(), pctInt(c.offers(), total)),
            new Stage("placements", "Placements", placed, pctInt(placed, total))
        );
        return new Funnel(period, total, stages);
    }

    // ---- Consultant Readiness ------------------------------------------------------------------------------------------------------

    private Readiness readiness(MktScope.View v, Optional<MktTalentDtos.Response> t, List<MktTalentDtos.Row> rows) {
        if (t.isEmpty() || rows.isEmpty()) return null;
        Map<String, Long> counts = new LinkedHashMap<>();
        BUCKET_ORDER.forEach(k -> counts.put(k, 0L));
        Map<Long, Integer> completeness = new HashMap<>();
        for (ConsultantProfile c : consultants.findByOrgIdAndIdIn(v.orgId(), rows.stream().map(MktTalentDtos.Row::id).toList())) {
            completeness.put(c.getId(), c.getProfileCompleteness() == null ? 0 : c.getProfileCompleteness());
        }
        for (MktTalentDtos.Row r : rows) counts.merge(bucketOf(r.availability().code(), r.resume().state(), completeness.getOrDefault(r.id(), 0)), 1L, Long::sum);
        long total = rows.size();
        List<Bucket> buckets = new ArrayList<>();
        for (String k : BUCKET_ORDER) buckets.add(new Bucket(k, BUCKET_LABELS.get(k), counts.get(k), pctInt(counts.get(k), total)));
        return new Readiness(total, buckets);
    }

    /** The readiness bucket of one consultant (see the class doc). Pure. */
    static String bucketOf(String availabilityCode, String resumeState, int completeness) {
        if ("ON_PROJECT".equals(availabilityCode) || "UNAVAILABLE".equals(availabilityCode)) return "inactive";
        if ("NEEDS_UPDATE".equals(resumeState) || completeness < ATTENTION_BELOW) return "attention";
        if ("UP_TO_DATE".equals(resumeState) && "AVAILABLE_NOW".equals(availabilityCode) && completeness >= READY_AT_LEAST) return "ready";
        return "progress";
    }

    // ---- Job Stream Effectiveness (per client) ---------------------------------------------------------------------------------------

    private Streams streams(Book b, String period, LocalDate today) {
        LocalDate since = since(period, today);
        Map<Long, long[]> perClient = new LinkedHashMap<>();
        for (A a : b.apps()) {
            LocalDate day = a.day();
            if (day == null || day.isBefore(since) || day.isAfter(today)) continue;
            long[] c = perClient.computeIfAbsent(a.app().getClientId(), k -> new long[4]);
            c[0]++;
            if (a.interviewed()) c[1]++;
            if (a.offered()) c[2]++;
        }
        for (TalentPlacement p : b.placed()) {
            if (p.getStartDate() == null || p.getStartDate().isBefore(since) || p.getStartDate().isAfter(today)) continue;
            perClient.computeIfAbsent(p.getClientId(), k -> new long[4])[3]++;
        }
        long subs = perClient.values().stream().mapToLong(c -> c[0]).sum();
        long offers = perClient.values().stream().mapToLong(c -> c[2]).sum();
        Double overall = rate(offers, subs);
        List<StreamRow> rows = perClient.entrySet().stream().map(e -> {
            long[] c = e.getValue();
            Double r = rate(c[2], c[0]);
            return new StreamRow(e.getKey(), b.clientName().getOrDefault(e.getKey(), "Client " + e.getKey()), c[0], c[1], c[2], c[3], r, r != null && overall != null && r >= overall);
        }).sorted(Comparator.comparingLong(StreamRow::submissions).reversed().thenComparing(StreamRow::client, String.CASE_INSENSITIVE_ORDER)).limit(STREAM_ROWS).toList();
        return new Streams(period, rows);
    }

    // ---- Top Performing Consultants ------------------------------------------------------------------------------------------------------

    private List<TopConsultant> top(MktScope.View v, Book b, LocalDate today, Instant now) {
        LocalDate since = since("3m", today);
        Map<Long, long[]> per = new LinkedHashMap<>();
        for (A a : b.apps()) {
            LocalDate day = a.day();
            if (day == null || day.isBefore(since) || day.isAfter(today)) continue;
            long[] c = per.computeIfAbsent(a.app().getConsultantId(), k -> new long[4]);
            c[0]++;
            if (a.interviewed()) c[1]++;
            if (a.offered()) c[2]++;
        }
        for (TalentPlacement p : b.placed()) {
            if (p.getStartDate() == null || p.getStartDate().isBefore(since) || p.getStartDate().isAfter(today)) continue;
            per.computeIfAbsent(p.getConsultantId(), k -> new long[4])[3]++;
        }
        List<Map.Entry<Long, long[]>> ranked = per.entrySet().stream()
            .filter(e -> b.consultantName().containsKey(e.getKey()))
            .sorted((x, y) -> {
                long[] p = x.getValue();
                long[] q = y.getValue();
                int c = Long.compare(q[3], p[3]);
                if (c == 0) c = Long.compare(q[2], p[2]);
                if (c == 0) c = Long.compare(q[1], p[1]);
                if (c == 0) c = Long.compare(q[0], p[0]);
                return c != 0 ? c : b.consultantName().get(x.getKey()).getDisplayName().compareToIgnoreCase(b.consultantName().get(y.getKey()).getDisplayName());
            })
            .limit(TOP_ROWS).toList();
        if (ranked.isEmpty()) return List.of();
        List<Long> ids = ranked.stream().map(Map.Entry::getKey).toList();
        Map<Long, Integer> match = new HashMap<>();
        for (Object[] r : matches.averageScoreByConsultant(v.orgId(), ids)) match.put((Long) r[0], (int) Math.round(((Number) r[1]).doubleValue()));
        List<LocalDate> weeks = weekStarts(today, WEEKS_SPARK);
        List<TopConsultant> out = new ArrayList<>();
        int rank = 1;
        for (Map.Entry<Long, long[]> e : ranked) {
            Long id = e.getKey();
            List<A> mine = b.apps().stream().filter(a -> id.equals(a.app().getConsultantId())).toList();
            List<Long> trend = new ArrayList<>();
            for (LocalDate w : weeks) trend.add(count(mine, w, w.plusDays(6)).submissions());
            Instant last = mine.stream().map(A::lastEvent).filter(java.util.Objects::nonNull).max(Comparator.naturalOrder()).orElse(null);
            long[] c = e.getValue();
            out.add(new TopConsultant(rank++, id, b.consultantName().get(id).getDisplayName(), null, c[0], c[1], c[2], c[3], match.get(id), last, trend));
        }
        return out;
    }

    // ---- Performance Benchmarks ----------------------------------------------------------------------------------------------------------

    private Benchmarks benchmarks(MktScope.View v, Book b, String period, LocalDate today) {
        LocalDate shift = "lastMonth".equals(period) ? today.minusDays(30) : today;
        LocalDate curFrom = shift.minusDays(30);
        LocalDate prevFrom = shift.minusDays(60);
        LocalDate prevTo = shift.minusDays(31);
        Counts cur = count(b.apps(), curFrom, shift);
        Counts prev = count(b.apps(), prevFrom, prevTo);
        Map<String, Double> industry = new HashMap<>();
        for (MktBenchmark m : benchmarks.findByOrgId(v.orgId())) industry.put(m.getMetric(), m.getIndustryValue().doubleValue());
        Double[] now = { rate(cur.interviews(), cur.submissions()), rate(cur.offers(), cur.submissions()), rate(placementsBetween(b.placed(), curFrom, shift), cur.submissions()) };
        Double[] before = { rate(prev.interviews(), prev.submissions()), rate(prev.offers(), prev.submissions()), rate(placementsBetween(b.placed(), prevFrom, prevTo), prev.submissions()) };
        String[] keys = { "interviewRate", "offerRate", "placementRate" };
        String[] metrics = { MktBenchmark.INTERVIEW_RATE, MktBenchmark.OFFER_RATE, MktBenchmark.PLACEMENT_RATE };
        List<BenchmarkRow> rows = new ArrayList<>();
        for (int i = 0; i < keys.length; i++) rows.add(new BenchmarkRow(keys[i], BENCH_LABELS.get(metrics[i]), now[i], change(now[i], before[i]), industry.get(metrics[i])));
        return new Benchmarks(period, rows);
    }

    // ---- Goals Progress ------------------------------------------------------------------------------------------------------------------

    private Goals goals(MktScope.View v, Book b, String period, LocalDate today) {
        LocalDate shift = "lastMonth".equals(period) ? today.minusDays(30) : today;
        LocalDate from = shift.minusDays(30);
        Counts c = count(b.apps(), from, shift);
        Map<String, Integer> target = new HashMap<>();
        for (MktGoal g : goals.findDefaults(v.orgId())) if (MktGoal.MONTH.equals(g.getPeriod())) target.put(g.getMetric(), g.getTarget());
        if (v.memberId() != null) for (MktGoal g : goals.findByOrgIdAndOwnerMemberId(v.orgId(), v.memberId())) if (MktGoal.MONTH.equals(g.getPeriod())) target.put(g.getMetric(), g.getTarget());
        long[] actual = { c.submissions(), c.interviews(), c.offers(), placementsBetween(b.placed(), from, shift) };
        List<GoalRow> rows = new ArrayList<>();
        for (int i = 0; i < MktGoal.METRICS.size(); i++) {
            String m = MktGoal.METRICS.get(i);
            Integer t = target.get(m);
            rows.add(new GoalRow(m.toLowerCase(), GOAL_LABELS.get(m), actual[i], t, t == null || t <= 0 ? null : pctInt(actual[i], t)));
        }
        return new Goals(period, rows, true);
    }

    // ---- Recommended Actions --------------------------------------------------------------------------------------------------------------

    private List<Action> actions(MktScope.View v, Book b, List<MktTalentDtos.Row> talentRows, List<TopConsultant> top, Streams streams, LocalDate today) {
        List<Action> out = new ArrayList<>();
        Set<Long> assigned = talentRows.stream().map(MktTalentDtos.Row::id).collect(Collectors.toCollection(HashSet::new));
        if (assigned.isEmpty()) b.apps().forEach(a -> assigned.add(a.app().getConsultantId()));
        Instant cutoff = today.minusDays(QUIET_DAYS).atStartOfDay().toInstant(ZoneOffset.UTC);
        Map<Long, Instant> lastBy = new HashMap<>();
        for (A a : b.apps()) if (a.lastEvent() != null) lastBy.merge(a.app().getConsultantId(), a.lastEvent(), (x, y) -> x.isAfter(y) ? x : y);
        long quiet = assigned.stream().filter(id -> v.sees(id) && (lastBy.get(id) == null || lastBy.get(id).isBefore(cutoff))).count();
        if (quiet > 0) out.add(new Action("quiet", "Follow up with " + quiet + (quiet == 1 ? " consultant" : " consultants"), "with no recent activity", "followups"));

        Set<Long> interviewing = new HashSet<>();
        for (A a : b.apps()) if ("INTERVIEWING".equals(a.app().getStage()) && v.sees(a.app().getConsultantId())) interviewing.add(a.app().getConsultantId());
        if (!interviewing.isEmpty()) {
            int n = interviewing.size();
            out.add(new Action("interviewing", "Focus on " + n + " high-potential " + (n == 1 ? "candidate" : "candidates"), "in interview stage", "interviews"));
        }

        if (!top.isEmpty()) {
            long fresh = 0;
            for (Object[] r : matches.countSuggestedByConsultant(v.orgId(), top.stream().map(TopConsultant::id).toList())) fresh += ((Number) r[1]).longValue();
            if (fresh > 0) out.add(new Action("matches", "Explore " + fresh + " new job " + (fresh == 1 ? "match" : "matches"), "for top performers", "matches"));
        }

        streams.rows().stream().filter(r -> r.submissions() >= 3 && r.offerRatePct() != null && !r.good()).min(Comparator.comparingDouble(StreamRow::offerRatePct))
            .ifPresent(r -> out.add(new Action("offerRate", "Improve offer rate for " + r.client() + " opportunities", null, "submissions")));
        return out;
    }
}
