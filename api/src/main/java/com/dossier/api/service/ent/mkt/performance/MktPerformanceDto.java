package com.dossier.api.service.ent.mkt.performance;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/**
 * The Performance board (`GET /api/orgs/{orgId}/mkt/performance`), exactly the JSON the web lib {@code marketer-ws/performance.ts} parses. A section with no
 * rows is an empty list / null, never a made-up number; a delta with nothing to compare is null. E1: read-only apart from the marketer's own monthly targets.
 */
public final class MktPerformanceDto {

    private MktPerformanceDto() {}

    /**
     * A KPI tile. {@code key}: assignedConsultants, activeSubmissions, interviewRate, offerRate, placements, followupCompletion. {@code value} is a count, or a
     * percent (one decimal) for the rates and the completion; null = nothing to measure yet ("Nothing yet"). {@code sparkline}: eight weekly points.
     */
    public record Kpi(String key, Double value, Double deltaPct, List<Double> sparkline) {}

    /** One calendar week (Monday to Sunday, UTC) of the Submissions by Week chart; submissions are counted by the day they were applied. */
    public record Week(LocalDate start, LocalDate end, long submissions, long interviews, long offers) {}

    public record WeeklyChart(String period, List<Week> weeks) {}

    /** One point of the Interviews vs Offers line: running totals up to {@code date}. */
    public record TrendPoint(LocalDate date, long submissions, long interviews, long offers) {}

    public record Trend(String period, List<TrendPoint> points) {}

    public record Stage(String key, String label, long count, int pct) {}

    public record Funnel(String period, long total, List<Stage> stages) {}

    /** {@code key}: ready, progress, attention, inactive. */
    public record Bucket(String key, String label, long count, int pct) {}

    public record Readiness(long total, List<Bucket> buckets) {}

    /** One client of the Job Stream Effectiveness table. {@code offerRatePct} null when it has no submissions; {@code good}: at or above the window's overall offer rate. */
    public record StreamRow(Long clientId, String client, long submissions, long interviews, long offers, long placements, Double offerRatePct, boolean good) {}

    public record Streams(String period, List<StreamRow> rows) {}

    /** {@code matchRatePct}: average match score of the consultant's matches (null = none); {@code lastActivityAt} null = no activity; {@code trend}: eight weekly submission counts. */
    public record TopConsultant(
        int rank, Long id, String name, String avatarUrl, long submissions, long interviews, long offers, long placements, Integer matchRatePct, Instant lastActivityAt, List<Long> trend
    ) {}

    /** One benchmark row. {@code key}: interviewRate, offerRate, placementRate. {@code value} null when no submissions in the period; {@code industry} null when none is configured. */
    public record BenchmarkRow(String key, String label, Double value, Double deltaPct, Double industry) {}

    public record Benchmarks(String period, List<BenchmarkRow> rows) {}

    /** {@code key}: submissions, interviews, offers, placements. {@code target} null = no target set; {@code pct} is actual/target (may pass 100). */
    public record GoalRow(String key, String label, long actual, Integer target, Integer pct) {}

    public record Goals(String period, List<GoalRow> rows, boolean canEdit) {}

    /** {@code page}: the menu key of the Marketing page to open (followups, interviews, matches, submissions); the web turns it into the member's link. */
    public record Action(String key, String text, String detail, String page) {}

    public record View(
        Instant generatedAt, List<Kpi> kpis, WeeklyChart weekly, Trend trend, Funnel funnel, Readiness readiness, Streams streams, List<TopConsultant> top,
        Benchmarks benchmarks, Goals goals, List<Action> actions
    ) {}

    /** What the page asks for. Every period is optional and falls back to the board's default. */
    public record Query(String weeks, String trend, String funnel, String streams, String benchmarks, String goals) {}

    /** The marketer's own monthly targets (null leaves a metric unchanged; 0 or more). */
    public record GoalsRequest(Integer submissions, Integer interviews, Integer offers, Integer placements) {}
}
