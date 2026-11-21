package com.dossier.api.service.ent.pipeline;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.domain.ent.pipeline.JobOpportunity;
import com.dossier.api.domain.ent.pipeline.OpportunityMatch;
import com.dossier.api.repository.ent.pipeline.JobOpportunityRepository;
import com.dossier.api.repository.ent.pipeline.OpportunityMatchRepository;
import com.dossier.api.service.ent.authz.AuthzRequest;
import com.dossier.api.service.ent.authz.AuthorizationService;
import com.dossier.api.service.ent.authz.Beneficiary;
import com.dossier.api.service.ent.authz.ScopeEvaluator;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class OrgMatchQueryServiceTest {

    private static final Long ORG = 1L;
    private static final Long ACTOR = 9L;
    private static final Long CONSULTANT = 7L;
    private static final Instant NOW = Instant.parse("2026-11-21T10:00:00Z");

    private final OpportunityMatchRepository matches = mock(OpportunityMatchRepository.class);
    private final JobOpportunityRepository opportunities = mock(JobOpportunityRepository.class);
    private final AuthorizationService authorization = mock(AuthorizationService.class);
    private final ScopeEvaluator scopes = mock(ScopeEvaluator.class);
    private final OrgMembership actor = new OrgMembership(
        ORG,
        ACTOR,
        90L,
        "sarah",
        OrgRole.MARKETER,
        OrgMemberStatus.ACTIVE,
        OrgStatus.ACTIVE,
        List.of(),
        Map.of("matches.run", PermissionScope.ASSIGNED)
    );
    private final OrgMatchQueryService service = new OrgMatchQueryService(matches, opportunities, authorization, scopes);

    @Test
    void listAppliesStatusAndEffectiveScopeBeforeMappingOpportunityMetadata() {
        OpportunityMatch visible = match(11L, CONSULTANT, "SUGGESTED", 91, NOW);
        OpportunityMatch hidden = match(12L, 8L, "SUGGESTED", 88, NOW.minusSeconds(1));
        OpportunityMatch otherStatus = match(13L, CONSULTANT, "DISMISSED", 71, NOW.minusSeconds(2));
        when(matches.findByOrgIdOrderByUpdatedAtDesc(ORG)).thenReturn(List.of(visible, hidden, otherStatus));
        when(scopes.inScope(actor, PermissionScope.ASSIGNED, CONSULTANT)).thenReturn(true);
        when(scopes.inScope(actor, PermissionScope.ASSIGNED, 8L)).thenReturn(false);
        when(opportunities.findByOrgIdAndId(ORG, 101L)).thenReturn(java.util.Optional.of(opportunity(101L)));

        OrgMatchViews.Response response = service.list(actor, new OrgMatchViews.Query(null, "suggested"));

        assertThat(response.total()).isEqualTo(1);
        assertThat(response.items()).extracting(OrgMatchViews.Row::id).containsExactly(11L);
        assertThat(response.items().get(0).title()).isEqualTo("Backend Engineer");
        assertThat(response.items().get(0).reason()).isEqualTo("Strong Java fit");
        ArgumentCaptor<AuthzRequest> request = ArgumentCaptor.forClass(AuthzRequest.class);
        verify(authorization).require(request.capture());
        assertThat(request.getValue().permissionKeys()).containsExactly("matches.run");
        assertThat(request.getValue().beneficiary()).isEqualTo(Beneficiary.NONE);
    }

    @Test
    void consultantFilterUsesTheQueryMemberAuthorizationBoundary() {
        when(matches.findByOrgIdOrderByUpdatedAtDesc(ORG)).thenReturn(List.of());

        service.list(actor, new OrgMatchViews.Query(CONSULTANT, null));

        ArgumentCaptor<AuthzRequest> request = ArgumentCaptor.forClass(AuthzRequest.class);
        verify(authorization).require(request.capture());
        assertThat(request.getValue().permissionKeys()).containsExactly("matches.run");
        assertThat(request.getValue().beneficiary()).isEqualTo(Beneficiary.PATH_MEMBER);
        assertThat(request.getValue().beneficiaryMemberId()).isEqualTo(CONSULTANT);
        assertThat(request.getValue().operation()).isEqualTo(com.dossier.api.service.ent.authz.AuthzOperation.READ);
    }

    @Test
    void rejectsAnUnknownStatusBeforeReadingRows() {
        assertThatThrownBy(() -> service.list(actor, new OrgMatchViews.Query(null, "pending")))
            .isInstanceOf(OrgException.class)
            .hasFieldOrPropertyWithValue("code", OrgException.CODE_ORG_INVALID);
    }

    private static OpportunityMatch match(Long id, Long consultant, String status, int score, Instant updatedAt) {
        OpportunityMatch match = new OpportunityMatch();
        match.setId(id);
        match.setOrgId(ORG);
        match.setOpportunityId(101L);
        match.setConsultantMemberId(consultant);
        match.setStatus(status);
        match.setScore(score);
        match.setReason("Strong Java fit");
        match.setModel("gpt-test");
        match.setSource("SUGGESTED_AI");
        match.setCreatedAt(updatedAt.minusSeconds(10));
        match.setUpdatedAt(updatedAt);
        return match;
    }

    private static JobOpportunity opportunity(Long id) {
        JobOpportunity opportunity = new JobOpportunity();
        opportunity.setId(id);
        opportunity.setOrgId(ORG);
        opportunity.setKind("JOB_POSTING");
        opportunity.setTitle("Backend Engineer");
        opportunity.setCompany("Acme");
        opportunity.setLocation("Remote");
        opportunity.setUrl("https://jobs.example/101");
        opportunity.setApplyUrl("https://jobs.example/apply/101");
        opportunity.setSourceLabel("BOARD_API");
        return opportunity;
    }
}
