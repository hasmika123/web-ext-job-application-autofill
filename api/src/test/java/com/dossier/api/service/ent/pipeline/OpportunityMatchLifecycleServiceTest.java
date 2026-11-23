package com.dossier.api.service.ent.pipeline;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.ent.pipeline.JobOpportunity;
import com.dossier.api.domain.ent.pipeline.OpportunityMatch;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.repository.ent.pipeline.JobOpportunityRepository;
import com.dossier.api.repository.ent.pipeline.OpportunityMatchRepository;
import com.dossier.api.service.ent.authz.AuthzRequest;
import com.dossier.api.service.ent.authz.AuthorizationService;
import com.dossier.api.service.ent.authz.Beneficiary;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class OpportunityMatchLifecycleServiceTest {

    private static final Long ORG = 7L;
    private static final Long MARKETER = 70L;
    private static final Long CONSULTANT = 10L;
    private static final Long MATCH = 501L;
    private static final Long OPPORTUNITY = 601L;
    private static final Instant NOW = Instant.parse("2026-11-21T10:15:00Z");

    @Mock OpportunityMatchRepository matches;
    @Mock JobOpportunityRepository opportunities;
    @Mock AuthorizationService authorization;
    @Mock OrgAuditService audit;

    private OpportunityMatchLifecycleService service;
    private final OrgMembership marketer = new OrgMembership(ORG, MARKETER, 700L, "marketer", OrgRole.MARKETER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE);
    private final OrgMembership consultant = new OrgMembership(ORG, CONSULTANT, 100L, "consultant", OrgRole.MEMBER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE);

    @BeforeEach
    void setUp() {
        service = new OpportunityMatchLifecycleService(matches, opportunities, authorization, audit, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    void marketerCanAssignWithActForPermissionAndAudit() {
        OpportunityMatch match = match("SUGGESTED");
        JobOpportunity opportunity = opportunity("NEW");
        stub(match, opportunity);

        OpportunityMatch result = service.assign(marketer, MATCH);

        assertThat(result.getStatus()).isEqualTo("ASSIGNED");
        assertThat(result.getAssignedByMemberId()).isEqualTo(MARKETER);
        assertThat(result.getAssignedAt()).isEqualTo(NOW);
        assertThat(result.getUpdatedByMemberId()).isEqualTo(MARKETER);
        assertThat(opportunity.getStatus()).isEqualTo("ASSIGNED");
        assertThat(opportunity.getUpdatedByMemberId()).isEqualTo(MARKETER);
        assertPermission("opportunities.manage", Beneficiary.PATH_MEMBER, CONSULTANT);
        verify(opportunities).save(opportunity);
        verify(matches).save(match);
        verify(audit).record(marketer, "PIPELINE_MATCH_ASSIGN", "OPPORTUNITY_MATCH", null, String.valueOf(MATCH), "SUGGESTED -> ASSIGNED");
    }

    @Test
    void marketerCanDismissWithMatchRunPermission() {
        OpportunityMatch match = match("SUGGESTED");
        stub(match, opportunity("TRIAGED"));

        OpportunityMatch result = service.dismiss(marketer, MATCH);

        assertThat(result.getStatus()).isEqualTo("DISMISSED");
        assertThat(result.getUpdatedByMemberId()).isEqualTo(MARKETER);
        assertPermission("matches.run", Beneficiary.PATH_MEMBER, CONSULTANT);
        verify(matches).save(match);
        verify(audit).record(marketer, "PIPELINE_MATCH_DISMISS", "OPPORTUNITY_MATCH", null, String.valueOf(MATCH), "SUGGESTED -> DISMISSED");
    }

    @Test
    void consultantCanAcceptTheirAssignedMatch() {
        OpportunityMatch match = match("ASSIGNED");
        stub(match, opportunity("ASSIGNED"));

        OpportunityMatch result = service.accept(consultant, MATCH);

        assertThat(result.getStatus()).isEqualTo("ACCEPTED");
        assertThat(result.getConsultantDecidedAt()).isEqualTo(NOW);
        assertThat(result.getUpdatedByMemberId()).isEqualTo(CONSULTANT);
        assertPermission("opportunities.respond", Beneficiary.SELF, null);
        verify(matches).save(match);
        verify(audit).record(consultant, "PIPELINE_MATCH_ACCEPT", "OPPORTUNITY_MATCH", null, String.valueOf(MATCH), "ASSIGNED -> ACCEPTED");
    }

    @Test
    void consultantDeclineRequiresAReasonAndCanBeReaccepted() {
        OpportunityMatch match = match("ASSIGNED");
        stub(match, opportunity("ASSIGNED"));

        OpportunityMatch declined = service.decline(consultant, MATCH, "LOCATION", "Remote only");

        assertThat(declined.getStatus()).isEqualTo("DECLINED");
        assertThat(declined.getConsultantDecidedAt()).isEqualTo(NOW);
        assertThat(declined.getDeclineReason()).isEqualTo("LOCATION");
        assertThat(declined.getDeclineNote()).isEqualTo("Remote only");
        verify(matches).save(match);

        when(matches.lockByOrgIdAndId(ORG, MATCH)).thenReturn(Optional.of(match));
        OpportunityMatch reopened = service.accept(consultant, MATCH);

        assertThat(reopened.getStatus()).isEqualTo("ACCEPTED");
        assertThat(reopened.getDeclineReason()).isNull();
        assertThat(reopened.getDeclineNote()).isNull();
        verify(matches, org.mockito.Mockito.times(2)).save(match);
    }

    @Test
    void illegalTransitionReturnsPipelineTransitionDetails() {
        OpportunityMatch match = match("DISMISSED");
        when(matches.lockByOrgIdAndId(ORG, MATCH)).thenReturn(Optional.of(match));

        assertThatThrownBy(() -> service.assign(marketer, MATCH)).isInstanceOfSatisfying(OrgException.class, error -> {
            assertThat(error.getStatus()).isEqualTo(409);
            assertThat(error.getCode()).isEqualTo("PIPELINE_TRANSITION");
            assertThat(error.getExtra()).containsEntry("entity", "opportunity_match").containsEntry("from", "DISMISSED").containsEntry("to", "ASSIGNED");
        });

        verify(matches, never()).save(any());
        verify(audit, never()).record(any(OrgMembership.class), any(), any(), any(), any(), any());
    }

    @Test
    void foreignTenantMatchIsNotFoundBeforeAuthorization() {
        when(matches.lockByOrgIdAndId(ORG, MATCH)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.assign(marketer, MATCH)).isInstanceOf(OrgNotFoundException.class);

        verify(authorization, never()).require(any(AuthzRequest.class));
        verify(opportunities, never()).lockByOrgIdAndId(any(), any());
    }

    @Test
    void consultantCannotActOnAnotherConsultantsMatch() {
        OpportunityMatch match = match("ASSIGNED");
        match.setConsultantMemberId(99L);
        when(matches.lockByOrgIdAndId(ORG, MATCH)).thenReturn(Optional.of(match));

        assertThatThrownBy(() -> service.accept(consultant, MATCH)).isInstanceOf(OrgNotFoundException.class);

        verify(authorization, never()).require(any(AuthzRequest.class));
        verify(matches, never()).save(any());
    }

    @Test
    void repeatedMarketerActionsAreIdempotent() {
        OpportunityMatch match = match("ASSIGNED");
        when(matches.lockByOrgIdAndId(ORG, MATCH)).thenReturn(Optional.of(match));

        OpportunityMatch result = service.assign(marketer, MATCH);

        assertThat(result).isSameAs(match);
        verify(authorization).require(any(AuthzRequest.class));
        verify(matches, never()).save(any());
        verify(opportunities, never()).lockByOrgIdAndId(any(), any());
        verify(audit, never()).record(any(OrgMembership.class), any(), any(), any(), any(), any());
    }

    @Test
    void closedOpportunityCannotReceiveAFirstLifecycleTransition() {
        OpportunityMatch match = match("SUGGESTED");
        stub(match, opportunity("CLOSED"));

        assertThatThrownBy(() -> service.assign(marketer, MATCH)).isInstanceOfSatisfying(OrgException.class, error -> {
            assertThat(error.getStatus()).isEqualTo(409);
            assertThat(error.getCode()).isEqualTo("OPPORTUNITY_NOT_OPEN");
        });

        verify(matches, never()).save(any());
        verify(audit, never()).record(any(OrgMembership.class), any(), any(), any(), any(), any());
    }

    @Test
    void authorizationFailureStopsBeforeAnyLifecycleWrite() {
        OpportunityMatch match = match("SUGGESTED");
        when(matches.lockByOrgIdAndId(ORG, MATCH)).thenReturn(Optional.of(match));
        doThrow(new OrgNotFoundException()).when(authorization).require(any(AuthzRequest.class));

        assertThatThrownBy(() -> service.assign(marketer, MATCH)).isInstanceOf(OrgNotFoundException.class);

        verify(matches, never()).save(any());
        verify(opportunities, never()).save(any());
        verify(audit, never()).record(any(OrgMembership.class), any(), any(), any(), any(), any());
    }

    @Test
    void declineValidatesReasonAndNoteBeforeWriting() {
        OpportunityMatch match = match("ASSIGNED");
        when(matches.lockByOrgIdAndId(ORG, MATCH)).thenReturn(Optional.of(match));

        assertThatThrownBy(() -> service.decline(consultant, MATCH, "NOPE", null)).isInstanceOfSatisfying(OrgException.class, error -> {
            assertThat(error.getStatus()).isEqualTo(400);
            assertThat(error.getCode()).isEqualTo("VALIDATION");
        });
        assertThatThrownBy(() -> service.decline(consultant, MATCH, "OTHER", "x".repeat(201))).isInstanceOfSatisfying(OrgException.class, error -> {
            assertThat(error.getStatus()).isEqualTo(400);
            assertThat(error.getCode()).isEqualTo("VALIDATION");
        });

        verify(matches, never()).save(any());
    }

    private void stub(OpportunityMatch match, JobOpportunity opportunity) {
        when(matches.lockByOrgIdAndId(ORG, MATCH)).thenReturn(Optional.of(match));
        when(opportunities.lockByOrgIdAndId(ORG, OPPORTUNITY)).thenReturn(Optional.of(opportunity));
    }

    private OpportunityMatch match(String status) {
        OpportunityMatch match = new OpportunityMatch();
        match.setId(MATCH);
        match.setOrgId(ORG);
        match.setOpportunityId(OPPORTUNITY);
        match.setConsultantMemberId(CONSULTANT);
        match.setStatus(status);
        return match;
    }

    private JobOpportunity opportunity(String status) {
        JobOpportunity opportunity = new JobOpportunity();
        opportunity.setId(OPPORTUNITY);
        opportunity.setOrgId(ORG);
        opportunity.setStatus(status);
        return opportunity;
    }

    private void assertPermission(String permission, Beneficiary beneficiary, Long beneficiaryMemberId) {
        ArgumentCaptor<AuthzRequest> requests = ArgumentCaptor.forClass(AuthzRequest.class);
        verify(authorization).require(requests.capture());
        AuthzRequest request = requests.getValue();
        assertThat(request.orgId()).isEqualTo(ORG);
        assertThat(request.permissionKeys()).containsExactly(permission);
        assertThat(request.beneficiary()).isEqualTo(beneficiary);
        assertThat(request.beneficiaryMemberId()).isEqualTo(beneficiaryMemberId);
        assertThat(request.actor()).isEqualTo(beneficiary == Beneficiary.SELF ? consultant : marketer);
    }
}
