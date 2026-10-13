package com.dossier.api.service.ent.jobs;

import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.RequirementMatch;
import com.dossier.api.service.dto.ent.JobDTO;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * The four KPI tiles of the Jobs board, computed from rows (talent-foundation.md section 5), with an honest "last period" and a weekly
 * sparkline per tile. Pure: the caller passes the organization's rows and "now", so every formula is unit-testable.
 *
 * <ul>
 *   <li><b>Open Jobs</b>: jobs with status OPEN; last month = jobs that were open at now-30d ({@code posted_at <= at} and OPEN now, or FILLED/CLOSED later than {@code at}).</li>
 *   <li><b>New This Week</b>: jobs posted in the last 7 days; last week = the 7 days before.</li>
 *   <li><b>Assigned Opportunities</b>: matches with status ASSIGNED; last month = those assigned before now-30d.</li>
 *   <li><b>High Match Jobs</b>: jobs with a live (not dismissed) match scoring 90 or more; last month = the same, for jobs posted before now-30d.</li>
 * </ul>
 * A month-based tile has no "previous" when the organization has no job older than a month (no history to compare with): never estimated.
 */
public final class JobKpis {

    public static final int HIGH_SCORE = 90;
    public static final int WEEKS = 8;
    static final Duration MONTH = Duration.ofDays(30);
    static final Duration WEEK = Duration.ofDays(7);

    private JobKpis() {}

    public static boolean isOpenAt(ClientRequirement r, Instant at) {
        if (r.getPostedAt() == null || r.getPostedAt().isAfter(at)) return false;
        String s = r.getStatus();
        if ("OPEN".equals(s)) return true;
        return ("FILLED".equals(s) || "CLOSED".equals(s)) && r.getClosedAt() != null && r.getClosedAt().isAfter(at);
    }

    /** The best live score of each job (dismissed matches never count). */
    public static Map<Long, Integer> bestScores(List<RequirementMatch> matches) {
        Map<Long, Integer> best = new HashMap<>();
        for (RequirementMatch m : matches) {
            if ("DISMISSED".equals(m.getStatus()) || m.getScore() == null) continue;
            best.merge(m.getRequirementId(), m.getScore(), Math::max);
        }
        return best;
    }

    public static Tiles compute(List<ClientRequirement> jobs, List<RequirementMatch> matches, Instant now) {
        Instant monthAgo = now.minus(MONTH);
        boolean history = jobs.stream().anyMatch(j -> j.getPostedAt() != null && j.getPostedAt().isBefore(monthAgo));
        Map<Long, Integer> best = bestScores(matches);

        // Open Jobs
        long open = jobs.stream().filter(j -> "OPEN".equals(j.getStatus())).count();
        long openThen = jobs.stream().filter(j -> isOpenAt(j, monthAgo)).count();
        List<Long> openSeries = new ArrayList<>();
        for (int i = 0; i < WEEKS; i++) {
            Instant at = weekEnd(now, i);
            openSeries.add(i == WEEKS - 1 ? open : jobs.stream().filter(j -> isOpenAt(j, at)).count());
        }

        // New This Week
        long fresh = postedBetween(jobs, now.minus(WEEK), null);
        long freshBefore = postedBetween(jobs, now.minus(WEEK.multipliedBy(2)), now.minus(WEEK));
        List<Long> freshSeries = new ArrayList<>();
        for (int i = 0; i < WEEKS; i++) {
            Instant end = weekEnd(now, i);
            freshSeries.add(postedBetween(jobs, end.minus(WEEK), i == WEEKS - 1 ? null : end));
        }

        // Assigned Opportunities
        long assigned = matches.stream().filter(m -> "ASSIGNED".equals(m.getStatus())).count();
        long assignedThen = matches.stream().filter(m -> "ASSIGNED".equals(m.getStatus()) && m.getAssignedAt() != null && m.getAssignedAt().isBefore(monthAgo)).count();
        List<Long> assignedSeries = new ArrayList<>();
        for (int i = 0; i < WEEKS; i++) {
            Instant at = weekEnd(now, i);
            assignedSeries.add(i == WEEKS - 1 ? assigned : matches.stream().filter(m -> "ASSIGNED".equals(m.getStatus()) && m.getAssignedAt() != null && !m.getAssignedAt().isAfter(at)).count());
        }

        // High Match Jobs
        long high = jobs.stream().filter(j -> best.getOrDefault(j.getId(), 0) >= HIGH_SCORE).count();
        long highThen = jobs.stream().filter(j -> best.getOrDefault(j.getId(), 0) >= HIGH_SCORE && j.getPostedAt() != null && !j.getPostedAt().isAfter(monthAgo)).count();
        List<Long> highSeries = new ArrayList<>();
        for (int i = 0; i < WEEKS; i++) {
            Instant at = weekEnd(now, i);
            highSeries.add(i == WEEKS - 1 ? high : jobs.stream().filter(j -> best.getOrDefault(j.getId(), 0) >= HIGH_SCORE && j.getPostedAt() != null && !j.getPostedAt().isAfter(at)).count());
        }

        return new Tiles(
            tile(open, history ? openThen : null, openSeries),
            tile(fresh, freshBefore, freshSeries),
            tile(assigned, history ? assignedThen : null, assignedSeries),
            tile(high, history ? highThen : null, highSeries)
        );
    }

    public record Tiles(JobDTO.Tile open, JobDTO.Tile fresh, JobDTO.Tile assigned, JobDTO.Tile high) {}

    /** The end of week {@code i} of {@link #WEEKS}: the last one ends now, the first {@code WEEKS - 1} weeks earlier. */
    static Instant weekEnd(Instant now, int i) {
        return now.minus(WEEK.multipliedBy(WEEKS - 1 - i));
    }

    private static long postedBetween(List<ClientRequirement> jobs, Instant fromInclusive, Instant toExclusive) {
        return jobs.stream().filter(j -> j.getPostedAt() != null && !j.getPostedAt().isBefore(fromInclusive) && (toExclusive == null || j.getPostedAt().isBefore(toExclusive))).count();
    }

    static JobDTO.Tile tile(long value, Long previous, List<Long> series) {
        if (previous == null) return new JobDTO.Tile(value, null, null, null, series);
        long delta = value - previous;
        Double pct = previous > 0 ? Math.round(delta * 1000.0 / previous) / 10.0 : null;
        return new JobDTO.Tile(value, previous, delta, pct, series);
    }
}
