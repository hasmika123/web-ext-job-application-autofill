package com.dossier.api.service.ent.mkt.matches;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.service.ent.mkt.MktScope;
import com.dossier.api.service.ent.pipeline.OpportunityMatchLifecycleService;
import com.dossier.api.service.ent.pipeline.OrgMatchQueryService;
import com.dossier.api.service.ent.pipeline.OrgMatchViews;
import com.dossier.api.service.org.OrgMembership;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;

class MktCanonicalMatchesServiceTest {

    private final MktScope scope = mock(MktScope.class);
    private final OrgMatchQueryService canonical = mock(OrgMatchQueryService.class);
    private final OpportunityMatchLifecycleService lifecycle = mock(OpportunityMatchLifecycleService.class);
    private final com.dossier.api.repository.ent.talent.ConsultantProfileRepository consultants = mock(com.dossier.api.repository.ent.talent.ConsultantProfileRepository.class);
    private final com.dossier.api.repository.ent.talent.ConsultantSkillRepository skills = mock(com.dossier.api.repository.ent.talent.ConsultantSkillRepository.class);
    private final MktCanonicalMatchesService service = new MktCanonicalMatchesService(scope, canonical, lifecycle, consultants, skills);
    private final OrgMembership actor = new OrgMembership(1L, 9L, 90L, "sarah", OrgRole.MARKETER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE);

    @Test
    void labelsTheCanonicalSourceAndDelegatesTheSafeRows() {
        OrgMatchViews.Query query = new OrgMatchViews.Query(7L, "SUGGESTED");
        OrgMatchViews.Row row = new OrgMatchViews.Row(11L, 7L, 101L, "JOB_POSTING", "Backend Engineer", "Acme", "Remote", "https://jobs.example/101", "https://jobs.example/apply/101", "BOARD_API", 91, "Strong Java fit", "gpt-test", "SUGGESTED_AI", "SUGGESTED", null, null);
        com.dossier.api.domain.ent.talent.ConsultantProfile profile = new com.dossier.api.domain.ent.talent.ConsultantProfile();
        profile.setId(17L);
        profile.setMemberId(7L);
        profile.setOrgId(1L);
        profile.setDisplayName("Alex Morgan");
        profile.setJobTitle("Java Developer");
        profile.setAvailabilityStatus("AVAILABLE");
        when(consultants.findByOrgIdAndMemberId(1L, 7L)).thenReturn(java.util.Optional.of(profile));
        when(skills.findByOrgIdAndConsultantIdOrderBySortOrderAsc(1L, 17L)).thenReturn(List.of());
        when(canonical.list(actor, query)).thenReturn(new OrgMatchViews.Response(List.of(row), 1));

        MktCanonicalMatchesDto.Response response = service.list(actor, query);

        assertThat(response.source()).isEqualTo(MktCanonicalMatchesDto.SOURCE);
        assertThat(response.total()).isEqualTo(1);
        assertThat(response.items()).singleElement().satisfies(item -> {
            assertThat(item.source()).isEqualTo(MktCanonicalMatchesDto.SOURCE);
            assertThat(item.match()).isSameAs(row);
            assertThat(item.consultant().name()).isEqualTo("Alex Morgan");
        });
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
    void omitsRowsWithNoConsultantProfile() {
        OrgMatchViews.Row row = new OrgMatchViews.Row(11L, 7L, 101L, "JOB_POSTING", "Backend Engineer", "Acme", "Remote", null, null, "BOARD_API", 91, "Strong Java fit", "gpt-test", "SUGGESTED_AI", "SUGGESTED", null, null);
        when(canonical.list(actor, new OrgMatchViews.Query(null, null))).thenReturn(new OrgMatchViews.Response(List.of(row), 1));
        when(consultants.findByOrgIdAndMemberId(1L, 7L)).thenReturn(java.util.Optional.empty());

        MktCanonicalMatchesDto.Response response = service.list(actor, null);

        assertThat(response.items()).isEmpty();
        assertThat(response.total()).isZero();
    }

    @Test
    void keepsDetailAndActionsOnTheCanonicalSeams() {
        OrgMatchViews.Row row = new OrgMatchViews.Row(11L, 7L, 101L, "JOB_POSTING", "Backend Engineer", "Acme", "Remote", null, null, "BOARD_API", 91, "Strong Java fit", "gpt-test", "SUGGESTED_AI", "SUGGESTED", null, null);
        com.dossier.api.domain.ent.pipeline.OpportunityMatch match = new com.dossier.api.domain.ent.pipeline.OpportunityMatch();
        match.setId(11L);
        com.dossier.api.domain.ent.talent.ConsultantProfile profile = new com.dossier.api.domain.ent.talent.ConsultantProfile();
        profile.setId(17L);
        profile.setMemberId(7L);
        profile.setOrgId(1L);
        profile.setDisplayName("Alex Morgan");
        profile.setJobTitle("Java Developer");
        profile.setAvailabilityStatus("AVAILABLE");
        profile.setAvailableFrom(LocalDate.of(2026, 11, 21));
        when(consultants.findByOrgIdAndMemberId(1L, 7L)).thenReturn(java.util.Optional.of(profile));
        when(skills.findByOrgIdAndConsultantIdOrderBySortOrderAsc(1L, 17L)).thenReturn(List.of());
        when(canonical.get(actor, 11L)).thenReturn(row);
        when(lifecycle.assign(actor, 11L)).thenReturn(match);
        when(lifecycle.dismiss(actor, 11L)).thenReturn(match);
        when(canonical.row(match)).thenReturn(row);

        assertThat(service.detail(actor, 11L).consultant().name()).isEqualTo("Alex Morgan");
        assertThat(service.assign(actor, 11L).match()).isSameAs(row);
        assertThat(service.dismiss(actor, 11L).match()).isSameAs(row);
        verify(canonical, org.mockito.Mockito.times(3)).get(actor, 11L);
        verify(lifecycle).assign(actor, 11L);
        verify(lifecycle).dismiss(actor, 11L);
        verify(canonical, org.mockito.Mockito.times(2)).row(match);
    }

    @Test
    void preflightsProfileContextBeforeCanonicalActions() {
        OrgMatchViews.Row row = new OrgMatchViews.Row(11L, 7L, 101L, "JOB_POSTING", "Backend Engineer", "Acme", "Remote", null, null, "BOARD_API", 91, "Strong Java fit", "gpt-test", "SUGGESTED_AI", "SUGGESTED", null, null);
        when(canonical.get(actor, 11L)).thenReturn(row);
        when(consultants.findByOrgIdAndMemberId(1L, 7L)).thenReturn(java.util.Optional.empty());

        assertThatThrownBy(() -> service.assign(actor, 11L)).isInstanceOf(com.dossier.api.service.org.OrgNotFoundException.class);
        verifyNoInteractions(lifecycle);
    }
}
