package com.dossier.api.service.ent.mkt.matches;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.service.ent.mkt.MktScope;
import com.dossier.api.service.ent.pipeline.OrgMatchQueryService;
import com.dossier.api.service.ent.pipeline.OrgMatchViews;
import com.dossier.api.service.org.OrgMembership;
import java.util.List;
import org.junit.jupiter.api.Test;

class MktCanonicalMatchesServiceTest {

    private final MktScope scope = mock(MktScope.class);
    private final OrgMatchQueryService canonical = mock(OrgMatchQueryService.class);
    private final MktCanonicalMatchesService service = new MktCanonicalMatchesService(scope, canonical);
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
}
