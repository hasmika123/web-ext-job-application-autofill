package com.dossier.api.service.ent.mkt.performance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.ent.mkt.MktBenchmark;
import com.dossier.api.domain.ent.mkt.MktGoal;
import com.dossier.api.repository.ent.mkt.MktBenchmarkRepository;
import com.dossier.api.repository.ent.mkt.MktGoalRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ent.TalentDemoSeeder;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/** The Performance demo seed: the board's targets and benchmarks, idempotent per table, and silent when demo seeding is refused. */
class MktPerformanceDemoSeederTest {

    private final TalentDemoSeeder gate = mock(TalentDemoSeeder.class);
    private final OrganizationRepository orgs = mock(OrganizationRepository.class);
    private final MktGoalRepository goals = mock(MktGoalRepository.class);
    private final MktBenchmarkRepository benchmarks = mock(MktBenchmarkRepository.class);
    private final MktPerformanceDemoSeeder seeder = new MktPerformanceDemoSeeder(gate, orgs, goals, benchmarks);

    @Test
    void anEmptyOrgGetsTheBoardsTargetsAndIndustryFigures() {
        assertThat(seeder.seedOrg(5L)).isEqualTo(7);
        ArgumentCaptor<MktGoal> g = ArgumentCaptor.forClass(MktGoal.class);
        verify(goals, times(4)).save(g.capture());
        assertThat(g.getAllValues()).extracting(MktGoal::getMetric).containsExactly("SUBMISSIONS", "INTERVIEWS", "OFFERS", "PLACEMENTS");
        assertThat(g.getAllValues()).extracting(MktGoal::getTarget).containsExactly(200, 60, 40, 15);
        assertThat(g.getAllValues()).allMatch(x -> x.getOwnerMemberId() == null && Long.valueOf(5L).equals(x.getOrgId()) && "MONTH".equals(x.getPeriod()));
        ArgumentCaptor<MktBenchmark> b = ArgumentCaptor.forClass(MktBenchmark.class);
        verify(benchmarks, times(3)).save(b.capture());
        assertThat(b.getAllValues()).extracting(MktBenchmark::getMetric).containsExactly("INTERVIEW_RATE", "OFFER_RATE", "PLACEMENT_RATE");
        assertThat(b.getAllValues()).extracting(x -> x.getIndustryValue().doubleValue()).containsExactly(25.0, 12.0, 5.0);
    }

    @Test
    void anOrgThatAlreadyHasRowsIsLeftAlone() {
        when(goals.countByOrgId(5L)).thenReturn(1L);
        when(benchmarks.countByOrgId(5L)).thenReturn(1L);
        assertThat(seeder.seedOrg(5L)).isZero();
        verify(goals, never()).save(any());
        verify(benchmarks, never()).save(any());
    }

    @Test
    void eachTableIsFilledOnItsOwn() {
        when(goals.countByOrgId(5L)).thenReturn(4L);
        assertThat(seeder.seedOrg(5L)).isEqualTo(3);
        verify(goals, never()).save(any());
    }

    @Test
    void nothingRunsWhenDemoSeedingIsRefused() {
        when(gate.refusal()).thenReturn("not in prod");
        Map<String, Integer> done = seeder.seed();
        assertThat(done).isEmpty();
        verify(orgs, never()).findBySlug(any());
    }
}
