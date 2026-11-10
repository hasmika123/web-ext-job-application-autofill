package com.dossier.api.service.ent.jobs;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.RequirementMatch;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import org.junit.jupiter.api.Test;

/** The four tiles of the Jobs board, from rows only (talent-foundation.md section 5). */
class JobKpisTest {

    private static final Instant NOW = Instant.parse("2026-10-13T12:00:00Z");
    private static long id = 0;

    private static ClientRequirement job(String status, int postedDaysAgo, Integer closedDaysAgo) {
        ClientRequirement r = new ClientRequirement();
        r.setId(++id);
        r.setStatus(status);
        r.setPostedAt(NOW.minus(postedDaysAgo, ChronoUnit.DAYS));
        if (closedDaysAgo != null) r.setClosedAt(NOW.minus(closedDaysAgo, ChronoUnit.DAYS));
        return r;
    }

    private static RequirementMatch match(ClientRequirement j, int score, String status, Integer assignedDaysAgo) {
        RequirementMatch m = new RequirementMatch();
        m.setId(++id);
        m.setRequirementId(j.getId());
        m.setConsultantId(++id);
        m.setScore(score);
        m.setStatus(status);
        if (assignedDaysAgo != null) m.setAssignedAt(NOW.minus(assignedDaysAgo, ChronoUnit.DAYS));
        return m;
    }

    @Test
    void openJobsCountsOpenNowAndWhatWasOpenAMonthAgo() {
        ClientRequirement openNow = job("OPEN", 60, null);
        ClientRequirement openRecent = job("OPEN", 5, null);
        ClientRequirement filledSince = job("FILLED", 90, 10); // open 30 days ago (closed 10 days ago)
        ClientRequirement closedLongAgo = job("CLOSED", 90, 50); // already closed 30 days ago
        ClientRequirement onHold = job("ON_HOLD", 90, null);
        JobKpis.Tiles t = JobKpis.compute(List.of(openNow, openRecent, filledSince, closedLongAgo, onHold), List.of(), NOW);
        assertThat(t.open().value()).isEqualTo(2);
        assertThat(t.open().previous()).isEqualTo(2); // openNow + filledSince
        assertThat(t.open().delta()).isZero();
        assertThat(t.open().series()).hasSize(8);
        assertThat(t.open().series().get(7)).isEqualTo(2L);
    }

    @Test
    void newThisWeekComparesWithTheWeekBefore() {
        List<ClientRequirement> jobs = List.of(job("OPEN", 1, null), job("OPEN", 3, null), job("OPEN", 6, null), job("OPEN", 9, null), job("OPEN", 20, null));
        JobKpis.Tiles t = JobKpis.compute(jobs, List.of(), NOW);
        assertThat(t.fresh().value()).isEqualTo(3);
        assertThat(t.fresh().previous()).isEqualTo(1);
        assertThat(t.fresh().delta()).isEqualTo(2);
        assertThat(t.fresh().deltaPercent()).isEqualTo(200.0);
        assertThat(t.fresh().series().get(7)).isEqualTo(3L);
        assertThat(t.fresh().series().stream().mapToLong(Long::longValue).sum()).as("every job posted in the last 8 weeks lands in exactly one bucket").isEqualTo(5);
    }

    @Test
    void assignedOpportunitiesCountsAssignedMatchesAndThoseBeforeAMonthAgo() {
        ClientRequirement j = job("OPEN", 90, null);
        List<RequirementMatch> ms = List.of(match(j, 90, "ASSIGNED", 45), match(j, 80, "ASSIGNED", 5), match(j, 70, "SUGGESTED", null), match(j, 60, "DISMISSED", null));
        JobKpis.Tiles t = JobKpis.compute(List.of(j), ms, NOW);
        assertThat(t.assigned().value()).isEqualTo(2);
        assertThat(t.assigned().previous()).isEqualTo(1);
        assertThat(t.assigned().delta()).isEqualTo(1);
        assertThat(t.assigned().series().get(7)).isEqualTo(2L);
        assertThat(t.assigned().series().get(0)).as("seven weeks back nothing was assigned yet").isEqualTo(0L);
        assertThat(t.assigned().series().get(1)).as("six weeks back the oldest (45 days ago) had been").isEqualTo(1L);
    }

    @Test
    void highMatchJobsIgnoresDismissedMatchesAndRestrictsThePreviousToOlderJobs() {
        ClientRequirement old = job("OPEN", 60, null);
        ClientRequirement fresh = job("OPEN", 3, null);
        ClientRequirement dismissedOnly = job("OPEN", 60, null);
        ClientRequirement low = job("OPEN", 60, null);
        List<RequirementMatch> ms = List.of(match(old, 95, "SUGGESTED", null), match(fresh, 91, "SUGGESTED", null), match(dismissedOnly, 99, "DISMISSED", null), match(low, 89, "SUGGESTED", null));
        JobKpis.Tiles t = JobKpis.compute(List.of(old, fresh, dismissedOnly, low), ms, NOW);
        assertThat(t.high().value()).isEqualTo(2);
        assertThat(t.high().previous()).isEqualTo(1);
        assertThat(t.high().delta()).isEqualTo(1);
    }

    @Test
    void withNoJobOlderThanAMonthThereIsNoMonthlyComparisonButTheWeeklyOneStays() {
        ClientRequirement a = job("OPEN", 2, null);
        ClientRequirement b = job("OPEN", 5, null);
        JobKpis.Tiles t = JobKpis.compute(List.of(a, b), List.of(match(a, 95, "ASSIGNED", 1)), NOW);
        assertThat(t.open().previous()).isNull();
        assertThat(t.open().delta()).isNull();
        assertThat(t.open().deltaPercent()).isNull();
        assertThat(t.assigned().previous()).isNull();
        assertThat(t.high().previous()).isNull();
        assertThat(t.fresh().previous()).isZero();
        assertThat(t.fresh().deltaPercent()).as("no percent of zero").isNull();
    }

    @Test
    void anEmptyBoardIsAllZeros() {
        JobKpis.Tiles t = JobKpis.compute(List.of(), List.of(), NOW);
        assertThat(t.open().value()).isZero();
        assertThat(t.fresh().value()).isZero();
        assertThat(t.assigned().value()).isZero();
        assertThat(t.high().value()).isZero();
        assertThat(t.open().series()).containsOnly(0L);
    }
}
