package com.dossier.api.service.ent.mkt.opportunities;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.ent.mkt.MktOpportunity;
import com.dossier.api.domain.ent.mkt.MktOpportunityEvent;
import com.dossier.api.repository.ent.mkt.MktOpportunityEventRepository;
import com.dossier.api.repository.ent.mkt.MktOpportunityRepository;
import com.dossier.api.repository.ent.mkt.MktOpportunityRow;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ent.EnterpriseDemoSeeder;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.PlatformTransactionManager;

/** The demo seeder without a database: it follows the board's mix, includes every open assigned opportunity, never sets a ready answer for NO_RESPONSE, and is idempotent. */
class MktOpportunityDemoSeederTest {

    static final Long ORG = 7L;
    EnterpriseDemoSeeder base = mock(EnterpriseDemoSeeder.class);
    OrganizationRepository orgs = mock(OrganizationRepository.class);
    MktOpportunityRepository repo = mock(MktOpportunityRepository.class);
    MktOpportunityEventRepository events = mock(MktOpportunityEventRepository.class);
    MktOpportunityDemoSeeder seeder;
    List<MktOpportunity> savedOpps = new ArrayList<>();
    List<MktOpportunityEvent> savedEvents = new ArrayList<>();

    @BeforeEach
    void wire() {
        seeder = new MktOpportunityDemoSeeder(base, orgs, repo, events, mock(PlatformTransactionManager.class));
        AtomicLong ids = new AtomicLong();
        when(repo.save(any(MktOpportunity.class))).thenAnswer(i -> {
            MktOpportunity o = i.getArgument(0);
            o.setId(ids.incrementAndGet());
            savedOpps.add(o);
            return o;
        });
        when(events.save(any(MktOpportunityEvent.class))).thenAnswer(i -> {
            MktOpportunityEvent e = i.getArgument(0);
            savedEvents.add(e);
            return e;
        });
    }

    private MktOpportunityRow row(long id, String matchStatus, int score, String jobStatus) {
        return new MktOpportunityRow(id, id, "C" + id, 100 + id, "Role", "Austin", "HYBRID", jobStatus, 1L, "Client", score, "fit", matchStatus, null, Instant.now(), null, null, null, null, null, null, null, 9L);
    }

    @Test
    void itSeedsEveryOpenAssignedOpportunityPlusTheBestSuggestionsUpToTheTarget() {
        List<MktOpportunityRow> rows = new ArrayList<>();
        for (long i = 1; i <= 20; i++) rows.add(row(i, "ASSIGNED", 70, "OPEN"));
        for (long i = 21; i <= 200; i++) rows.add(row(i, "SUGGESTED", (int) (i % 30) + 70, "OPEN"));
        rows.add(row(500, "ASSIGNED", 99, "FILLED")); // a closed job gets nothing
        when(repo.findRows(ORG)).thenReturn(rows);
        when(repo.countByOrgId(ORG)).thenReturn(0L);

        int made = seeder.seedOrg(ORG);

        assertThat(made).isEqualTo(MktOpportunityDemoSeeder.TARGET);
        assertThat(savedOpps).extracting(MktOpportunity::getMatchId).contains(1L, 20L).doesNotContain(500L);
        assertThat(savedOpps).extracting(MktOpportunity::getInterest).isSubsetOf("VERY_INTERESTED", "INTERESTED", "OPEN", "NOT_INTERESTED", "NO_RESPONSE");
        assertThat(savedOpps).allSatisfy(o -> {
            assertThat(o.getOrgId()).isEqualTo(ORG);
            assertThat(o.getOwnerMemberId()).isEqualTo(9L);
            if ("NO_RESPONSE".equals(o.getInterest())) assertThat(o.getLastResponseAt()).isNull();
            else assertThat(o.getLastResponseAt()).isNotNull();
        });
        assertThat(savedOpps.stream().filter(o -> "VERY_INTERESTED".equals(o.getInterest())).count()).as("the biggest slice of the board's mix").isGreaterThan(10);
        assertThat(savedEvents).isNotEmpty().allSatisfy(e -> assertThat(e.getText()).isNotBlank().hasSizeLessThan(200));
    }

    @Test
    void anOrganizationThatAlreadyHasStateIsLeftAlone() {
        when(repo.countByOrgId(ORG)).thenReturn(5L);
        assertThat(seeder.seedOrg(ORG)).isZero();
        verify(repo, never()).findRows(any());
        verify(repo, never()).save(any(MktOpportunity.class));
    }

    @Test
    void anOrganizationWithoutTalentDataIsSkipped() {
        when(repo.countByOrgId(ORG)).thenReturn(0L);
        when(repo.findRows(ORG)).thenReturn(List.of());
        assertThat(seeder.seedOrg(ORG)).isZero();
    }

    @Test
    void itDoesNothingWhenTheDemoSwitchesAreOff() {
        when(base.refusal()).thenReturn("DEMO_ENABLED is off");
        assertThat(seeder.seed()).isZero();
        verify(orgs, never()).findBySlug(any());
    }
}
