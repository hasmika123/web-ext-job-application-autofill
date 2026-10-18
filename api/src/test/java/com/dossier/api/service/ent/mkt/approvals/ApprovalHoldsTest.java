package com.dossier.api.service.ent.mkt.approvals;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.ent.mgmt.MktApprovalRequest;
import com.dossier.api.domain.ent.mkt.MktOpportunity;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.MarketerAssignment;
import com.dossier.api.domain.ent.talent.RequirementMatch;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.repository.ent.mgmt.MktApprovalRequestRepository;
import com.dossier.api.repository.ent.mkt.MktOpportunityRepository;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.MarketerAssignmentRepository;
import com.dossier.api.repository.ent.talent.RequirementMatchRepository;
import com.dossier.api.service.ent.pipeline.DuplicateGuard;
import com.dossier.api.service.ent.pipeline.PipelineGuardSettings;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;

/**
 * Parking a step for a manager without a database (MM-02): when a setting holds the step (NEVER holds nothing), the suggested pair, the opportunity overlay,
 * the request and the link between them are written in one piece in a transaction of their own, an already open request is named instead of duplicated, and
 * the answer is the 409 the caller throws.
 */
class ApprovalHoldsTest {

    static final Long ORG = 7L;
    static final Long CON = 10L;
    static final Long JOB = 100L;
    static final Instant NOW = Instant.parse("2026-10-17T12:00:00Z");

    PipelineGuardSettings settings = mock(PipelineGuardSettings.class);
    ApprovalService approvals = mock(ApprovalService.class);
    MktApprovalRequestRepository requests = mock(MktApprovalRequestRepository.class);
    RequirementMatchRepository matches = mock(RequirementMatchRepository.class);
    MktOpportunityRepository opportunities = mock(MktOpportunityRepository.class);
    ConsultantProfileRepository consultants = mock(ConsultantProfileRepository.class);
    ClientAccountRepository clients = mock(ClientAccountRepository.class);
    MarketerAssignmentRepository assignments = mock(MarketerAssignmentRepository.class);
    PlatformTransactionManager txm = mock(PlatformTransactionManager.class);
    ObjectMapper json = new ObjectMapper();
    ApprovalHolds holds;
    OrgMembership me = new OrgMembership(ORG, 70L, 700L, "marketer", OrgRole.MARKETER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE);
    ClientRequirement job = new ClientRequirement();

    @BeforeEach
    void wire() {
        holds = new ApprovalHolds(settings, approvals, requests, matches, opportunities, consultants, clients, assignments, txm, json, Clock.fixed(NOW, ZoneOffset.UTC));
        when(txm.getTransaction(any())).thenReturn(new SimpleTransactionStatus());
        job.setId(JOB);
        job.setOrgId(ORG);
        job.setClientId(3L);
        job.setTitle("SWE II");
        ConsultantProfile c = new ConsultantProfile();
        c.setId(CON);
        c.setDisplayName("Anika Rao");
        when(consultants.findByOrgIdAndId(ORG, CON)).thenReturn(Optional.of(c));
        ClientAccount client = new ClientAccount();
        client.setName("Stripe");
        when(clients.findByOrgIdAndId(ORG, 3L)).thenReturn(Optional.of(client));
        when(matches.saveAndFlush(any(RequirementMatch.class))).thenAnswer(call -> {
            RequirementMatch m = call.getArgument(0);
            if (m.getId() == null) m.setId(1L);
            return m;
        });
        when(opportunities.save(any(MktOpportunity.class))).thenAnswer(call -> {
            MktOpportunity o = call.getArgument(0);
            if (o.getId() == null) o.setId(55L);
            return o;
        });
        when(approvals.open(any(), any())).thenReturn(dto(500L));
    }

    static ApprovalRequestDTO dto(Long id) {
        return new ApprovalRequestDTO(id, "OPPORTUNITY_ASSIGN", "MKT_OPPORTUNITY", 55L, null, null, NOW, "t", null, "PENDING", null, null, null, NOW, Map.of());
    }

    ApprovalHolds.Spec spec() {
        return new ApprovalHolds.Spec(70L, true, "Lead with Java", "HIGH", LocalDate.parse("2026-11-01"), 82, "Assigned by a marketer", "MANUAL");
    }

    // ---- when a step is held ----------------------------------------------------------------------------------------------------

    @Test
    void neverHoldsNothingAlwaysHoldsEverythingAndHighPriorityHoldsOnlyHighAssignments() {
        when(settings.managerApproval(ORG)).thenReturn("NEVER");
        assertThat(holds.holdsAssignment(ORG, CON)).isFalse();
        when(settings.managerApproval(ORG)).thenReturn("ALWAYS");
        assertThat(holds.holdsAssignment(ORG, CON)).isTrue();
        when(settings.managerApproval(ORG)).thenReturn("HIGH_PRIORITY");
        MarketerAssignment a = new MarketerAssignment();
        a.setPriority("MEDIUM");
        when(assignments.findByOrgIdAndConsultantId(ORG, CON)).thenReturn(Optional.of(a));
        assertThat(holds.holdsAssignment(ORG, CON)).isFalse();
        a.setPriority("HIGH");
        assertThat(holds.holdsAssignment(ORG, CON)).isTrue();
        when(assignments.findByOrgIdAndConsultantId(ORG, CON)).thenReturn(Optional.empty());
        assertThat(holds.holdsAssignment(ORG, CON)).as("an unassigned consultant has no priority").isFalse();
    }

    @Test
    void resumeReviewFollowsItsSetting() {
        when(settings.managerReview(ORG)).thenReturn(false);
        assertThat(holds.reviewsResumes(ORG)).isFalse();
        when(settings.managerReview(ORG)).thenReturn(true);
        assertThat(holds.reviewsResumes(ORG)).isTrue();
    }

    // ---- parking an assignment --------------------------------------------------------------------------------------------------

    @Test
    void parkingCreatesTheSuggestedPairTheOverlayTheRequestAndTheLinkInOneNewTransaction() {
        OrgException parked = holds.holdAssignment(me, job, CON, spec(), DuplicateGuard.Confirm.NONE);

        assertThat(parked.getStatus()).isEqualTo(409);
        assertThat(parked.getCode()).isEqualTo("APPROVAL_PENDING");
        assertThat(parked.getExtra()).containsEntry("requestId", 500L).containsEntry("kind", "OPPORTUNITY_ASSIGN");

        ArgumentCaptor<RequirementMatch> match = ArgumentCaptor.forClass(RequirementMatch.class);
        verify(matches).saveAndFlush(match.capture());
        assertThat(match.getValue().getStatus()).isEqualTo("SUGGESTED");
        assertThat(match.getValue().getScore()).isEqualTo(82);
        assertThat(match.getValue().getAssignedAt()).as("nothing reaches the consultant").isNull();

        ArgumentCaptor<ApprovalService.Request> request = ArgumentCaptor.forClass(ApprovalService.Request.class);
        verify(approvals).open(any(), request.capture());
        assertThat(request.getValue().kind()).isEqualTo("OPPORTUNITY_ASSIGN");
        assertThat(request.getValue().subjectType()).isEqualTo("MKT_OPPORTUNITY");
        assertThat(request.getValue().subjectId()).isEqualTo(55L);
        assertThat(request.getValue().title()).isEqualTo("Anika Rao to Stripe, SWE II");
        JsonNode payload = request.getValue().payload();
        assertThat(payload.get("jobId").asLong()).isEqualTo(JOB);
        assertThat(payload.get("ownerMemberId").asLong()).isEqualTo(70L);
        assertThat(payload.get("askInterest").asBoolean()).isTrue();
        assertThat(payload.get("marketerNote").asText()).isEqualTo("Lead with Java");
        assertThat(payload.get("priority").asText()).isEqualTo("HIGH");
        assertThat(payload.get("dueOn").asText()).isEqualTo("2026-11-01");
        assertThat(payload.get("confirmDuplicate").asBoolean()).isFalse();

        ArgumentCaptor<MktOpportunity> overlay = ArgumentCaptor.forClass(MktOpportunity.class);
        verify(opportunities, org.mockito.Mockito.atLeastOnce()).save(overlay.capture());
        assertThat(overlay.getValue().getApprovalRequestId()).as("the overlay points at the open request").isEqualTo(500L);
        verify(txm).commit(any());
    }

    @Test
    void anExistingPairAndOverlayAreKeptAndADismissedPairIsSuggestedAgain() {
        RequirementMatch dismissed = new RequirementMatch();
        dismissed.setId(9L);
        dismissed.setStatus("DISMISSED");
        dismissed.setAssignedAt(NOW);
        when(matches.findByOrgIdAndRequirementIdAndConsultantId(ORG, JOB, CON)).thenReturn(Optional.of(dismissed));
        MktOpportunity existing = new MktOpportunity();
        existing.setId(77L);
        when(opportunities.findByOrgIdAndMatchId(ORG, 9L)).thenReturn(Optional.of(existing));

        holds.holdAssignment(me, job, CON, spec(), DuplicateGuard.Confirm.NONE);

        assertThat(dismissed.getStatus()).isEqualTo("SUGGESTED");
        assertThat(dismissed.getAssignedAt()).isNull();
        assertThat(existing.getApprovalRequestId()).isEqualTo(500L);
        ArgumentCaptor<ApprovalService.Request> request = ArgumentCaptor.forClass(ApprovalService.Request.class);
        verify(approvals).open(any(), request.capture());
        assertThat(request.getValue().subjectId()).isEqualTo(77L);
    }

    @Test
    void anAlreadyAssignedPairBeingReopenedIsLeftAsItIs() {
        RequirementMatch assigned = new RequirementMatch();
        assigned.setId(9L);
        assigned.setStatus("ASSIGNED");
        when(matches.findByOrgIdAndRequirementIdAndConsultantId(ORG, JOB, CON)).thenReturn(Optional.of(assigned));
        MktOpportunity declined = new MktOpportunity();
        declined.setId(77L);
        declined.setState("DECLINED");
        when(opportunities.findByOrgIdAndMatchId(ORG, 9L)).thenReturn(Optional.of(declined));
        holds.holdAssignment(me, job, CON, spec(), DuplicateGuard.Confirm.NONE);
        assertThat(assigned.getStatus()).isEqualTo("ASSIGNED");
        assertThat(declined.getState()).isEqualTo("DECLINED");
        assertThat(declined.getApprovalRequestId()).isEqualTo(500L);
    }

    @Test
    void aRequestThatIsAlreadyOpenIsNamedAndNothingNewIsWritten() {
        MktApprovalRequest open = new MktApprovalRequest();
        open.setId(444L);
        when(requests.findByOrgIdAndSubjectTypeAndSubjectIdAndKindAndStatus(ORG, "MKT_OPPORTUNITY", 55L, "OPPORTUNITY_ASSIGN", "PENDING")).thenReturn(Optional.of(open));
        OrgException parked = holds.holdAssignment(me, job, CON, spec(), DuplicateGuard.Confirm.NONE);
        assertThat(parked.getCode()).isEqualTo("APPROVAL_PENDING");
        assertThat(parked.getExtra()).containsEntry("requestId", 444L);
        verify(approvals, never()).open(any(), any());
        verify(txm).rollback(any());
    }

    // ---- parking a duplicate override -------------------------------------------------------------------------------------------

    @Test
    void parkingADuplicateOverrideCarriesTheStatedReasonAndAnswersWithTheRequestId() {
        List<DuplicateGuard.Finding> findings = List.of(new DuplicateGuard.Finding(DuplicateGuard.SAME_JOB, "Same role", 8L, "SWE II", "Stripe", "Austin", NOW, null));
        OrgException parked = holds.holdDuplicate(me, job, CON, spec(), findings, "The client asked for both");
        assertThat(parked.getStatus()).isEqualTo(409);
        assertThat(parked.getCode()).isEqualTo("DUPLICATE_APPROVAL_REQUIRED");
        assertThat(parked.getExtra()).containsEntry("requestId", 500L).containsEntry("rules", List.of("SAME_JOB"));
        ArgumentCaptor<ApprovalService.Request> request = ArgumentCaptor.forClass(ApprovalService.Request.class);
        verify(approvals).open(any(), request.capture());
        assertThat(request.getValue().kind()).isEqualTo("DUPLICATE_OVERRIDE");
        assertThat(request.getValue().payload().get("confirmDuplicate").asBoolean()).isTrue();
        assertThat(request.getValue().payload().get("duplicateReason").asText()).isEqualTo("The client asked for both");
        assertThat(request.getValue().payload().get("rules").get(0).asText()).isEqualTo("SAME_JOB");
    }

    // ---- parking a resume -------------------------------------------------------------------------------------------------------

    @Test
    void aHeldResumeOpensOneRequestAndAnOpenOneIsNotDuplicated() {
        assertThat(holds.holdResume(me, CON, 31L, "Anika v3")).isTrue();
        ArgumentCaptor<ApprovalService.Request> request = ArgumentCaptor.forClass(ApprovalService.Request.class);
        verify(approvals).open(any(), request.capture());
        assertThat(request.getValue().kind()).isEqualTo("RESUME_RELEASE");
        assertThat(request.getValue().subjectType()).isEqualTo("ORG_RESUME");
        assertThat(request.getValue().subjectId()).isEqualTo(31L);
        assertThat(request.getValue().title()).isEqualTo("Anika Rao, resume Anika v3");
        MktApprovalRequest open = new MktApprovalRequest();
        when(requests.findByOrgIdAndSubjectTypeAndSubjectIdAndKindAndStatus(ORG, "ORG_RESUME", 31L, "RESUME_RELEASE", "PENDING")).thenReturn(Optional.of(open));
        assertThat(holds.holdResume(me, CON, 31L, "Anika v3")).isFalse();
        verify(approvals, org.mockito.Mockito.times(1)).open(any(), any());
    }
}
