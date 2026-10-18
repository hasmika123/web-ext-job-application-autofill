package com.dossier.api.service.ent.reports;

import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.repository.ent.OrgReportsRepository;
import com.dossier.api.service.dto.ent.ReportsDTO;
import com.dossier.api.service.dto.ent.ReportsDTO.ClientRow;
import com.dossier.api.service.dto.ent.ReportsDTO.FirstSubmission;
import com.dossier.api.service.dto.ent.ReportsDTO.Funnel;
import com.dossier.api.service.dto.ent.ReportsDTO.Interviews;
import com.dossier.api.service.dto.ent.ReportsDTO.MarketerRow;
import com.dossier.api.service.dto.ent.ReportsDTO.MonthPoint;
import com.dossier.api.service.dto.ent.ReportsDTO.Placements;
import com.dossier.api.service.dto.ent.ReportsDTO.Roster;
import com.dossier.api.service.dto.ent.ReportsDTO.Slice;
import com.dossier.api.service.dto.ent.ReportsDTO.StageRow;
import com.dossier.api.service.dto.ent.ReportsDTO.Tile;
import com.dossier.api.service.dto.ent.ReportsDTO.WeekPoint;
import com.dossier.api.service.ent.applications.ApplicationNames;
import com.dossier.api.service.ent.applications.ApplicationStages;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * {@code GET /api/orgs/{orgId}/reports/overview}: the Org Admin Reports page. Every figure is a query over the organization's own rows
 * (consultants, applications and their stage events, interviews, placements, clients, marketer assignments, opportunities); nothing is
 * sample data, nothing is money, and people appear by display name only. Reading needs {@code reports.view} held at ORG scope: a narrower
 * key (a marketer's own performance, a team lead's slice) is not this page, and everyone who fails gets the same generic 404.
 */
@Service
public class OrgReportsService {

    public static final String PERMISSION = "reports.view";
    public static final int DEFAULT_RANGE_DAYS = 30;
    public static final Set<Integer> RANGES = Set.of(30, 90);
    private static final int MONTHS = 6;
    private static final int TOP_CLIENTS = 5;
    private static final Set<String> CLOSED_OPPORTUNITY_STATES = Set.of("DECLINED", "CLOSED", "APPLIED");

    private static final List<String> MARKETING_ORDER = List.of("ACTIVE", "PREPARING", "PAUSED", "NOT_MARKETED");
    private static final List<String> AVAILABILITY_ORDER = List.of("AVAILABLE", "ON_PROJECT", "NOTICE", "UNAVAILABLE");

    private final OrgReportsRepository repo;
    private final ApplicationNames names;
    private final Clock clock;

    @Autowired
    public OrgReportsService(OrgReportsRepository repo, ApplicationNames names) {
        this(repo, names, Clock.systemUTC());
    }

    OrgReportsService(OrgReportsRepository repo, ApplicationNames names, Clock clock) {
        this.repo = repo;
        this.names = names;
        this.clock = clock;
    }

    /** The accepted spellings of the range parameter: {@code 30}, {@code 90}, {@code 30d}, {@code 90d}; absent means 30. Anything else is a 400. */
    public static int parseRange(String raw) {
        if (raw == null || raw.isBlank()) return DEFAULT_RANGE_DAYS;
        String s = raw.strip().toLowerCase(Locale.ROOT);
        if (s.endsWith("d")) s = s.substring(0, s.length() - 1);
        try {
            int days = Integer.parseInt(s);
            if (RANGES.contains(days)) return days;
        } catch (NumberFormatException ignored) {
            // falls through to the refusal
        }
        throw OrgException.coded(400, "RANGE_INVALID", "Range must be 30 or 90 (days)", Map.of("allowed", List.of(30, 90)));
    }

    @Transactional(readOnly = true)
    public ReportsDTO.Overview overview(OrgMembership me, String rangeParam) {
        if (me == null || me.scopeFor(PERMISSION).filter(sc -> sc == PermissionScope.ORG).isEmpty()) throw new OrgNotFoundException();
        int days = parseRange(rangeParam);
        Long org = me.orgId();
        Instant now = Instant.now(clock);
        LocalDate today = now.atOffset(ZoneOffset.UTC).toLocalDate();
        LocalDate from = today.minusDays(days - 1L);
        Instant fromInstant = from.atStartOfDay().toInstant(ZoneOffset.UTC);
        Instant tomorrow = today.plusDays(1).atStartOfDay().toInstant(ZoneOffset.UTC);

        Roster roster = roster(org);
        Funnel funnel = funnel(org, today, from, now);
        Interviews interviews = interviews(org, fromInstant, now, tomorrow);
        Placements placements = placements(org, today, from);
        FirstSubmission first = firstSubmission(org, fromInstant);

        long prevApplied = repo.countApplied(org, from.minusDays(days), from);
        long prevCompleted = repo.countCompletedInterviews(org, fromInstant.minus(Duration.ofDays(days)), fromInstant);
        long onBench = repo.roster(org).stream().filter(r -> "AVAILABLE".equals(r[1]) && "ACTIVE".equals(r[0])).mapToLong(r -> ((Number) r[2]).longValue()).sum();
        List<Tile> tiles = List.of(
            new Tile("consultants", "Active consultants", (double) roster.total(), null, "count"),
            new Tile("onBench", "Available and in marketing", (double) onBench, null, "count"),
            new Tile("applications", "Applications in range", (double) funnel.total(), (double) prevApplied, "count"),
            new Tile("interviewsCompleted", "Interviews completed", (double) interviews.completed(), (double) prevCompleted, "count"),
            new Tile("placements", "Active placements", (double) placements.active(), null, "count"),
            new Tile("timeToSubmit", "Median time to first submission", first.medianHours(), null, "hours")
        );

        return new ReportsDTO.Overview(org, now, days, tiles, roster, funnel, interviews, placements, topClients(org, today), marketers(org), first);
    }

    /* ── consultants ─────────────────────────────────────────────────────────────────────────────────────── */

    private Roster roster(Long org) {
        Map<String, Long> marketing = new HashMap<>();
        Map<String, Long> availability = new HashMap<>();
        long total = 0;
        for (Object[] r : repo.roster(org)) {
            long n = ((Number) r[2]).longValue();
            total += n;
            marketing.merge(String.valueOf(r[0]), n, Long::sum);
            availability.merge(String.valueOf(r[1]), n, Long::sum);
        }
        return new Roster(total, slices(marketing, MARKETING_ORDER), slices(availability, AVAILABILITY_ORDER));
    }

    private static List<Slice> slices(Map<String, Long> counts, List<String> order) {
        List<Slice> out = new ArrayList<>();
        for (String k : order) if (counts.containsKey(k)) out.add(new Slice(k, label(k), counts.get(k)));
        counts.keySet().stream().filter(k -> !order.contains(k)).sorted().forEach(k -> out.add(new Slice(k, label(k), counts.get(k))));
        return out;
    }

    static String label(String key) {
        String s = key.toLowerCase(Locale.ROOT).replace('_', ' ');
        return s.isEmpty() ? s : Character.toUpperCase(s.charAt(0)) + s.substring(1);
    }

    /* ── applications ────────────────────────────────────────────────────────────────────────────────────── */

    private Funnel funnel(Long org, LocalDate today, LocalDate from, Instant now) {
        Map<String, Long> byStage = new HashMap<>();
        long total = 0;
        for (Object[] r : repo.stageCounts(org, from)) {
            long n = ((Number) r[1]).longValue();
            byStage.merge(String.valueOf(r[0]), n, Long::sum);
            total += n;
        }
        Instant weekAgo = now.minus(Duration.ofDays(7));
        Instant twoWeeksAgo = now.minus(Duration.ofDays(14));
        Map<String, Long> thisWeek = entries(org, weekAgo, now.plusSeconds(1));
        Map<String, Long> lastWeek = entries(org, twoWeeksAgo, weekAgo);
        List<StageRow> stages = new ArrayList<>();
        for (String s : ApplicationStages.ORDER) {
            long tw = thisWeek.getOrDefault(s, 0L);
            long lw = lastWeek.getOrDefault(s, 0L);
            stages.add(new StageRow(s, ApplicationStages.label(s), byStage.getOrDefault(s, 0L), tw, lw, deltaPct(tw, lw)));
        }
        LocalDate weekStartNow = today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        Map<LocalDate, Long> perWeek = new TreeMap<>();
        for (LocalDate w = from.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)); !w.isAfter(weekStartNow); w = w.plusWeeks(1)) perWeek.put(w, 0L);
        for (Object[] r : repo.appliedPerDay(org, from, today.plusDays(1))) {
            LocalDate w = ((LocalDate) r[0]).with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
            perWeek.merge(w, ((Number) r[1]).longValue(), Long::sum);
        }
        List<WeekPoint> weekly = new ArrayList<>();
        perWeek.forEach((w, n) -> weekly.add(new WeekPoint(w.toString(), n, 0)));
        long appliedThisWeek = repo.countApplied(org, today.minusDays(6), today.plusDays(1));
        long appliedLastWeek = repo.countApplied(org, today.minusDays(13), today.minusDays(6));
        return new Funnel(total, appliedThisWeek, appliedLastWeek, deltaPct(appliedThisWeek, appliedLastWeek), stages, weekly);
    }

    private Map<String, Long> entries(Long org, Instant from, Instant to) {
        Map<String, Long> out = new HashMap<>();
        for (Object[] r : repo.stageEntries(org, from, to)) out.put(String.valueOf(r[0]), ((Number) r[1]).longValue());
        return out;
    }

    static Double deltaPct(long current, long previous) {
        if (previous <= 0) return null;
        return Math.round((current - previous) * 1000.0 / previous) / 10.0;
    }

    /* ── interviews ──────────────────────────────────────────────────────────────────────────────────────── */

    private Interviews interviews(Long org, Instant from, Instant now, Instant tomorrow) {
        long scheduled = 0, completed = 0, cancelled = 0, awaiting = 0;
        LocalDate fromDay = from.atOffset(ZoneOffset.UTC).toLocalDate();
        LocalDate weekStartNow = tomorrow.minusSeconds(1).atOffset(ZoneOffset.UTC).toLocalDate().with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        Map<LocalDate, long[]> perWeek = new TreeMap<>();
        for (LocalDate w = fromDay.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)); !w.isAfter(weekStartNow); w = w.plusWeeks(1)) perWeek.put(w, new long[2]);
        for (Object[] r : repo.interviews(org, from, tomorrow)) {
            Instant at = (Instant) r[0];
            String status = String.valueOf(r[1]);
            scheduled++;
            if ("COMPLETED".equals(status)) completed++;
            else if ("CANCELLED".equals(status)) cancelled++;
            else if (at.isBefore(now)) awaiting++; // still SCHEDULED / IN_PROGRESS although the time has passed: nobody recorded the outcome
            long[] bucket = perWeek.get(at.atOffset(ZoneOffset.UTC).toLocalDate().with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)));
            if (bucket != null) {
                bucket[0]++;
                if ("COMPLETED".equals(status)) bucket[1]++;
            }
        }
        long upcoming = repo.interviews(org, now, now.plus(Duration.ofDays(14))).stream().filter(r -> "SCHEDULED".equals(r[1])).count();
        List<WeekPoint> weekly = new ArrayList<>();
        perWeek.forEach((w, b) -> weekly.add(new WeekPoint(w.toString(), b[0], b[1])));
        return new Interviews(scheduled, completed, cancelled, awaiting, upcoming, weekly);
    }

    /* ── placements ──────────────────────────────────────────────────────────────────────────────────────── */

    private Placements placements(Long org, LocalDate today, LocalDate rangeFrom) {
        YearMonth thisMonth = YearMonth.from(today);
        YearMonth first = thisMonth.minusMonths(MONTHS - 1L);
        LocalDate since = first.atDay(1).isBefore(rangeFrom) ? first.atDay(1) : rangeFrom;
        Map<YearMonth, long[]> months = new LinkedHashMap<>();
        for (int i = 0; i < MONTHS; i++) months.put(first.plusMonths(i), new long[2]);
        long startedInRange = 0, endedInRange = 0;
        for (Object[] r : repo.placementDates(org, since)) {
            LocalDate start = (LocalDate) r[0];
            LocalDate end = (LocalDate) r[1];
            boolean ended = "ENDED".equals(r[2]) && end != null && !end.isAfter(today);
            if (start != null && !start.isAfter(today)) {
                long[] m = months.get(YearMonth.from(start));
                if (m != null) m[0]++;
                if (!start.isBefore(rangeFrom)) startedInRange++;
            }
            if (ended) {
                long[] m = months.get(YearMonth.from(end));
                if (m != null) m[1]++;
                if (!end.isBefore(rangeFrom)) endedInRange++;
            }
        }
        List<MonthPoint> out = new ArrayList<>();
        months.forEach((ym, v) -> out.add(new MonthPoint(ym.toString(), v[0], v[1])));
        return new Placements(repo.countActivePlacements(org, today), startedInRange, endedInRange, out);
    }

    private List<ClientRow> topClients(Long org, LocalDate today) {
        List<ClientRow> out = new ArrayList<>();
        for (Object[] r : repo.topClients(org, today, PageRequest.of(0, TOP_CLIENTS))) out.add(new ClientRow(String.valueOf(r[0]), ((Number) r[1]).longValue()));
        return out;
    }

    /* ── marketers ───────────────────────────────────────────────────────────────────────────────────────── */

    private List<MarketerRow> marketers(Long org) {
        Map<Long, long[]> perMarketer = new LinkedHashMap<>();
        for (Object[] r : repo.assignedConsultants(org)) perMarketer.computeIfAbsent((Long) r[0], k -> new long[2])[0] = ((Number) r[1]).longValue();
        for (Object[] r : repo.openOpportunities(org, CLOSED_OPPORTUNITY_STATES)) perMarketer.computeIfAbsent((Long) r[0], k -> new long[2])[1] = ((Number) r[1]).longValue();
        Map<Long, String> display = names.memberNames(org, new HashSet<>(perMarketer.keySet()));
        List<MarketerRow> out = new ArrayList<>();
        perMarketer.forEach((id, v) -> {
            String name = display.get(id);
            if (name != null) out.add(new MarketerRow(id, name, v[0], v[1])); // a seat of another organization has no name here, so it never shows
        });
        out.sort((a, b) -> {
            int byOpen = Long.compare(b.openOpportunities(), a.openOpportunities());
            return byOpen != 0 ? byOpen : a.name().compareToIgnoreCase(b.name());
        });
        return out;
    }

    /* ── time to first submission ────────────────────────────────────────────────────────────────────────── */

    private FirstSubmission firstSubmission(Long org, Instant from) {
        List<Double> hours = new ArrayList<>();
        for (Object[] r : repo.firstSubmissions(org, from)) {
            Instant created = (Instant) r[0];
            Instant submitted = (Instant) r[1];
            if (created == null || submitted == null) continue;
            hours.add(Math.max(0, Duration.between(created, submitted).toMinutes()) / 60.0);
        }
        if (hours.isEmpty()) return new FirstSubmission(null, 0);
        hours.sort(Double::compare);
        int n = hours.size();
        double median = n % 2 == 1 ? hours.get(n / 2) : (hours.get(n / 2 - 1) + hours.get(n / 2)) / 2.0;
        return new FirstSubmission(Math.round(median * 10) / 10.0, n);
    }
}
