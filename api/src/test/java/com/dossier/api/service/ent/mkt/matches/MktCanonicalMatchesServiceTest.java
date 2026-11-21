package com.dossier.api.service.ent.mkt.matches;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.service.ent.mkt.MktScope;
import com.dossier.api.service.ent.pipeline.OpportunityMatchLifecycleService;
import com.dossier.api.service.ent.pipeline.OrgMatchQueryService;
import com.dossier.api.service.ent.pipeline.OrgMatchViews;
import com.dossier.api.service.org.OrgMembership;
import java.util.List;
import org.junit.jupiter.api.Test;

class MktCanonicalMatchesServiceTest {

    private final MktScope scope = mock(MktScope.class);
    private final OrgMatchQueryService canonical = mock(OrgMatchQueryService.class);
    private final OpportunityMatchLifecycleService lifecycle = mock(OpportunityMatchLifecycleService.class);
    private final MktCanonicalMatchesService service = new MktCanonicalMatchesService(scope, canonical, lifecycle);
    private final OrgMembership actor = new OrgMembership(1L, 9L, 90L, "sarah", OrgRole.MARKETER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE);

    @Test
    void labelsTheCanonicalSourceAndDelegatesTheSafeRows() {
        OrgMatchViews.Query query = new OrgMatchViews.Query(7L, "SUGGESTED");
        OrgMatchViews.Row row = new OrgMatchViews.Row(11L, 7L, 101L, "JOB_POSTING", "Backend Engineer", "Acme", "Remote", "https://jobs.example/101", "https://jobs.example/apply/101", "BOARD_API", 91, "Strong Java fit", "gpt-test", "SUGGESTED_AI", "SUGGESTED", null, null);
        when(canonical.list(actor, query)).thenReturn(new OrgMatchViews.Response(List.of(row), 1));

        MktCanonicalMatchesDto.Response response = service.list(actor, query);

        assertThat(response.source()).isEqualTo(MktCanonicalMatchesDto.SOURCE);
        assertThat(response.total()).isEqualTo(1);
        assertThat(response.items()).containsExactly(row);
        verify(scope).resolve(actor, MktMatchesService.PAGE_KEY);
        verify(canonical).list(actor, query);
    }

    @Test
    void suppliesAnEmptyCanonicalQueryWhenTheCallerOmitsIt() {
        when(canonical.list(actor, new OrgMatchViews.Query(null, null))).thenReturn(new OrgMatchViews.Response(List.of(), 0));

        MktCanonicalMatchesDto.Response response = service.list(actor, null);

        assertThat(response.source()).isEqualTo("OPPORTUNITY_MATCH");
        assertThat(response.items()).isEmpty();
        verify(canonical).list(actor, new OrgMatchViews.Query(null, null));
    }

    @Test
    void keepsDetailAndActionsOnTheCanonicalSeams() {
        OrgMatchViews.Row row = new OrgMatchViews.Row(11L, 7L, 101L, "JOB_POSTING", "Backend Engineer", "Acme", "Remote", null, null, "BOARD_API", 91, "Strong Java fit", "gpt-test", "SUGGESTED_AI", "SUGGESTED", null, null);
        com.dossier.api.domain.ent.pipeline.OpportunityMatch match = new com.dossier.api.domain.ent.pipeline.OpportunityMatch();
        match.setId(11L);
        when(canonical.get(actor, 11L)).thenReturn(row);
        when(lifecycle.assign(actor, 11L)).thenReturn(match);
        when(lifecycle.dismiss(actor, 11L)).thenReturn(match);
        when(canonical.row(match)).thenReturn(row);

        assertThat(service.detail(actor, 11L)).isSameAs(row);
        assertThat(service.assign(actor, 11L)).isSameAs(row);
        assertThat(service.dismiss(actor, 11L)).isSameAs(row);
        verify(canonical).get(actor, 11L);
        verify(lifecycle).assign(actor, 11L);
        verify(lifecycle).dismiss(actor, 11L);
        verify(canonical, org.mockito.Mockito.times(2)).row(match);
    }
}
