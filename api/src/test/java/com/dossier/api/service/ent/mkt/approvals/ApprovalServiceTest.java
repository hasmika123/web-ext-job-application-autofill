package com.dossier.api.service.ent.mkt.approvals;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.ent.mgmt.MktApprovalRequest;
import com.dossier.api.domain.ent.mkt.MktOpportunity;
import com.dossier.api.domain.ent.mkt.MktOpportunityEvent;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.repository.ent.mgmt.MgmtLookupRepository;
import com.dossier.api.repository.ent.mgmt.MktApprovalRequestRepository;
import com.dossier.api.repository.ent.mkt.MktOpportunityEventRepository;
import com.dossier.api.repository.ent.mkt.MktOpportunityRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.service.ent.applications.ApplicationNames;
import com.dossier.api.service.ent.authz.AuthzOperation;
import com.dossier.api.service.ent.jobs.AssignmentScope;
import com.dossier.api.service.ent.jobs.OpportunityAssignmentService;
import com.dossier.api.service.ent.mgmt.TeamScope;
import com.dossier.api.service.ent.mkt.resumes.MktResumesService;
import com.dossier.api.service.ent.pipeline.PipelineGuardSettings;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.privacy.SensitiveContentException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.ObjectProvider;

/**
 * Manager approvals without a database (MM-02): open (one per subject and kind, scanned, expiring), approve (the held action is re-run under the manager, in
 * the same transaction, and a failure leaves the request PENDING), reject (a note is required), withdraw (the requester only), expiry, and every refusal:
 * a request outside the team and an unknown id are the generic 404, a decided request 409 APPROVAL_NOT_PENDING, one's own request 409 SELF_APPROVAL (an
 * organization-wide manager may).
 */
@SuppressWarnings("unchecked")
class ApprovalServiceTest {

    static final Long ORG = 7L;
    static final Long REQUESTER = 70L;
    static final Long MANAGER = 90L;
    static final Long CON = 10L;
    static final Long JOB = 100L;
    static final Long OPP = 55L;
    static final Instant NOW = Instant.parse("2026-10-17T12:00:00Z");

    MktApprovalRequestRepository requests = mock(MktApprovalRequestRepository.class);
    MktOpportunityRepository opportunities = mock(MktOpportunityRepository.class);
    MktOpportunityEventRepository events = mock(MktOpportunityEventRepository.class);
    ConsultantProfileRepository consultants = mock(ConsultantProfileRepository.class);
    MgmtLookupRepository lookup = mock(MgmtLookupRepository.class);
    OrgMemberRepository members = mock(OrgMemberRepository.class);
    ApplicationNames names = mock(ApplicationNames.class);
    PipelineGuardSettings settings = mock(PipelineGuardSettings.class);
    OrgAuditService audit = mock(OrgAuditService.class);
    TeamScope teamScope = mock(TeamScope.class);
    OpportunityAssignmentService assignment = mock(OpportunityAssignmentService.class);
    MktResumesService resumes = mock(MktResumesService.class);
    ObjectProvider<OpportunityAssignmentService> assignmentProvider = mock(ObjectProvider.class);
    ObjectProvider<MktResumesService> resumesProvider = mock(ObjectProvider.class);
    ObjectMapper json = new ObjectMapper();
    ApprovalService service;

    OrgMembership requester = new OrgMembership(ORG, REQUESTER, 700L, "marketer", OrgRole.MARKETER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE);
    OrgMembership manager = new OrgMembership(ORG, MANAGER, 900L, "manager", OrgRole.MARKETER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE);
    TeamScope.View team = new TeamScope.View(ORG, MANAGER, false, Set.of(REQUESTER), Set.of(CON));
    TeamScope.View everyone = new TeamScope.View(ORG, MANAGER, true, Set.of(REQUESTER), Set.of(CON));
    final List<MktOpportunityEvent> eventLog = new ArrayList<>();
    final List<MktOpportunity> savedOpportunities = new ArrayList<>();

    @BeforeEach
    void wire() {
        when(assignmentProvider.getObject()).thenReturn(assignment);
        when(resumesProvider.getObject()).thenReturn(resumes);
        service = new ApprovalService(
            requests, opportunities, events, consultants, lookup, members, names, settings, audit, teamScope, json, assignmentProvider, resumesProvider,
            Clock.fixed(NOW, ZoneOffset.UTC)
        );
        when(settings.approvalExpiryDays(ORG)).thenReturn(7);
        when(consultants.findByOrgIdAndId(ORG, CON)).thenReturn(Optional.of(new ConsultantProfile()));
        when(requests.saveAndFlush(any(MktApprovalRequest.class))).thenAnswer(call -> {
            MktApprovalRequest r = call.getArgument(0);
            r.setId(500L);
            return r;
        });
        when(requests.save(any(MktApprovalRequest.class))).thenAnswer(call -> call.getArgument(0));
        when(events.save(any(MktOpportunityEvent.class))).thenAnswer(call -> {
            eventLog.add(call.getArgument(0));
            return call.getArgument(0);
        });
        when(opportunities.save(any(MktOpportunity.class))).thenAnswer(call -> {
            savedOpportunities.add(call.getArgument(0));
            return call.getArgument(0);
        });
        when(names.memberNames(eq(ORG), anyCollection())).thenReturn(Map.of(MANAGER, "Priya N.", REQUESTER, "Sam Spec"));
        when(teamScope.resolve(manager, AuthzOperation.WRITE, "approvals.decide")).thenReturn(team);
    }

    ApprovalService.Request request(String kind, String subjectType, Long subjectId) {
        return new ApprovalService.Request(kind, subjectType, subjectId, CON, "Anika Rao to Stripe, SWE II", "Lead with the integration work", json.createObjectNode().put("jobId", JOB));
    }

    MktApprovalRequest pending(String kind) {
        MktApprovalRequest r = new MktApprovalRequest();
        r.setId(500L);
        r.setOrgId(ORG);
        r.setKind(kind);
        r.setSubjectType(ApprovalKinds.RESUME_RELEASE.equals(kind) ? "ORG_RESUME" : "MKT_OPPORTUNITY");
        r.setSubjectId(OPP);
        r.setConsultantId(CON);
        r.setRequestedByMemberId(REQUESTER);
        r.setTitle("Anika Rao to Stripe, SWE II");
        r.setStatus("PENDING");
        r.setRequestedAt(NOW.minusSeconds(3600));
        r.setExpiresAt(NOW.plusSeconds(86400));
        r.setPayloadJson("{\"jobId\":100,\"consultantId\":10,\"ownerMemberId\":70,\"askInterest\":true,\"marketerNote\":\"Lead with Java\",\"priority\":\"HIGH\",\"confirmDuplicate\":false}");
        when(requests.lockByOrgIdAndId(ORG, 500L)).thenReturn(Optional.of(r));
        when(requests.findByOrgIdAndId(ORG, 500L)).thenReturn(Optional.of(r));
        return r;
    }

    MktOpportunity heldOpportunity() {
        MktOpportunity o = new MktOpportunity();
        o.setId(OPP);
        o.setOrgId(ORG);
        o.setApprovalRequestId(500L);
        when(opportunities.findByOrgIdAndId(ORG, OPP)).thenReturn(Optional.of(o));
        return o;
    }

    // ---- open ---------------------------------------------------------------------------------------------------------------------

    @Test
    void openRecordsAPendingRequestThatExpiresAfterTheConfiguredDaysAndAuditsIt() {
        ApprovalRequestDTO dto = service.open(requester, request("OPPORTUNITY_ASSIGN", "MKT_OPPORTUNITY", OPP));
        ArgumentCaptor<MktApprovalRequest> saved = ArgumentCaptor.forClass(MktApprovalRequest.class);
        verify(requests).saveAndFlush(saved.capture());
        MktApprovalRequest r = saved.getValue();
        assertThat(r.getStatus()).isEqualTo("PENDING");
        assertThat(r.getRequestedByMemberId()).isEqualTo(REQUESTER);
        assertThat(r.getExpiresAt()).isEqualTo(NOW.plusSeconds(7 * 86400L));
        assertThat(r.getPayloadJson()).contains("\"jobId\":100");
        assertThat(dto.status()).isEqualTo("PENDING");
        assertThat(dto.payload()).containsEntry("jobId", 100);
        verify(audit).record(eq(ORG), eq("marketer"), any(), eq("MKT_APPROVAL_OPEN"), eq("MKT_APPROVAL_REQUEST"), any(), eq("500"), anyString(), any(), any(), any(), eq("LOW"));
        assertThat(eventLog).extracting(MktOpportunityEvent::getKind).containsExactly("APPROVAL_REQUESTED");
    }

    @Test
    void aSecondOpenRequestForTheSameSubjectAndKindIsRefusedNamingTheFirst() {
        MktApprovalRequest first = pending("OPPORTUNITY_ASSIGN");
        when(requests.findByOrgIdAndSubjectTypeAndSubjectIdAndKindAndStatus(ORG, "MKT_OPPORTUNITY", OPP, "OPPORTUNITY_ASSIGN", "PENDING")).thenReturn(Optional.of(first));
        assertThatThrownBy(() -> service.open(requester, request("OPPORTUNITY_ASSIGN", "MKT_OPPORTUNITY", OPP))).isInstanceOfSatisfying(OrgException.class, e -> {
            assertThat(e.getStatus()).isEqualTo(409);
            assertThat(e.getCode()).isEqualTo("APPROVAL_PENDING");
            assertThat(e.getExtra()).containsEntry("requestId", 500L);
        });
        verify(requests, never()).saveAndFlush(any(MktApprovalRequest.class));
    }

    @Test
    void openRefusesWhatCannotBeAnApproval() {
        assertThatThrownBy(() -> service.open(requester, request("SUBMIT_IT", "MKT_OPPORTUNITY", OPP))).isInstanceOfSatisfying(OrgException.class, e -> assertThat(e.getStatus()).isEqualTo(422));
        assertThatThrownBy(() -> service.open(requester, request("RESUME_RELEASE", "MKT_OPPORTUNITY", OPP))).isInstanceOfSatisfying(OrgException.class, e -> assertThat(e.getStatus()).isEqualTo(422));
        assertThatThrownBy(() -> service.open(requester, request("OPPORTUNITY_ASSIGN", "MKT_OPPORTUNITY", null))).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> service.open(requester, new ApprovalService.Request("OPPORTUNITY_ASSIGN", "MKT_OPPORTUNITY", OPP, CON, " ", null, null))).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> service.open(requester, new ApprovalService.Request("OPPORTUNITY_ASSIGN", "MKT_OPPORTUNITY", OPP, CON, "x".repeat(161), null, null))).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> service.open(null, request("OPPORTUNITY_ASSIGN", "MKT_OPPORTUNITY", OPP))).isInstanceOf(OrgNotFoundException.class);
        when(consultants.findByOrgIdAndId(ORG, 999L)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.open(requester, new ApprovalService.Request("OPPORTUNITY_ASSIGN", "MKT_OPPORTUNITY", OPP, 999L, "t", null, null))).isInstanceOf(OrgNotFoundException.class);
        verify(requests, never()).saveAndFlush(any(MktApprovalRequest.class));
    }

    @Test
    void everyFreeTextOfARequestIsScannedForSensitiveData() {
        assertThatThrownBy(() -> service.open(requester, new ApprovalService.Request("OPPORTUNITY_ASSIGN", "MKT_OPPORTUNITY", OPP, CON, "t", "ssn 123-45-6789", null))).isInstanceOf(SensitiveContentException.class);
        assertThatThrownBy(() -> service.open(requester, new ApprovalService.Request("OPPORTUNITY_ASSIGN", "MKT_OPPORTUNITY", OPP, CON, "ssn 123-45-6789", null, null))).isInstanceOf(SensitiveContentException.class);
        assertThatThrownBy(() -> service.open(requester, new ApprovalService.Request("DUPLICATE_OVERRIDE", "MKT_OPPORTUNITY", OPP, CON, "t", null, json.createObjectNode().put("duplicateReason", "ssn 123-45-6789"))))
            .isInstanceOf(SensitiveContentException.class);
        verify(requests, never()).saveAndFlush(any(MktApprovalRequest.class));
    }

    // ---- approve ------------------------------------------------------------------------------------------------------------------

    @Test
    void approvingReRunsTheAssignmentUnderTheManagerSkippingTheHoldAndKeepingTheDuplicateGuard() {
        MktApprovalRequest r = pending("OPPORTUNITY_ASSIGN");
        MktOpportunity opp = heldOpportunity();
        when(assignment.assign(any(AssignmentScope.class), eq(manager), eq(JOB), eq(CON), any())).thenReturn(new OpportunityAssignmentService.Result(1L, OPP, JOB, CON, 80, false, false, false, null));

        ApprovalRequestDTO dto = service.approve(manager, 500L, "Looks right");

        ArgumentCaptor<AssignmentScope> scope = ArgumentCaptor.forClass(AssignmentScope.class);
        ArgumentCaptor<OpportunityAssignmentService.Options> options = ArgumentCaptor.forClass(OpportunityAssignmentService.Options.class);
        verify(assignment).assign(scope.capture(), eq(manager), eq(JOB), eq(CON), options.capture());
        assertThat(scope.getValue().sees(CON)).isTrue();
        assertThat(scope.getValue().sees(11L)).as("only the one consultant the request concerns").isFalse();
        assertThat(options.getValue().duplicate().approvedByManager()).isTrue();
        assertThat(options.getValue().duplicate().approvedByMemberId()).isEqualTo(MANAGER);
        assertThat(options.getValue().duplicate().requestedByMemberId()).isEqualTo(REQUESTER);
        assertThat(options.getValue().ownerMemberId()).isEqualTo(REQUESTER);
        assertThat(options.getValue().askInterest()).isTrue();
        assertThat(options.getValue().marketerNote()).isEqualTo("Lead with Java");
        assertThat(options.getValue().priority()).isEqualTo("HIGH");

        assertThat(r.getStatus()).isEqualTo("APPROVED");
        assertThat(r.getDecidedByMemberId()).isEqualTo(MANAGER);
        assertThat(r.getDecidedAt()).isEqualTo(NOW);
        assertThat(r.getDecisionNote()).isEqualTo("Looks right");
        assertThat(opp.getApprovalRequestId()).as("nothing is held any more").isNull();
        assertThat(eventLog).extracting(MktOpportunityEvent::getText).containsExactly("Approved by Priya N.");
        assertThat(eventLog.get(0).getActorMemberId()).isEqualTo(MANAGER);
        verify(audit).record(eq(ORG), eq("manager"), any(), eq("MKT_APPROVAL_APPROVE"), eq("MKT_APPROVAL_REQUEST"), any(), eq("500"), anyString(), any(), any(), any(), eq("LOW"));
        assertThat(dto.status()).isEqualTo("APPROVED");
    }

    @Test
    void anApprovedDuplicateOverrideIsAuditedAtHigh() {
        MktApprovalRequest r = pending("DUPLICATE_OVERRIDE");
        r.setPayloadJson("{\"jobId\":100,\"consultantId\":10,\"confirmDuplicate\":true,\"duplicateReason\":\"The client asked for both\"}");
        heldOpportunity();
        when(assignment.assign(any(AssignmentScope.class), eq(manager), eq(JOB), eq(CON), any())).thenReturn(new OpportunityAssignmentService.Result(1L, OPP, JOB, CON, 80, true, false, false, null));
        service.approve(manager, 500L, null);
        ArgumentCaptor<OpportunityAssignmentService.Options> options = ArgumentCaptor.forClass(OpportunityAssignmentService.Options.class);
        verify(assignment).assign(any(AssignmentScope.class), eq(manager), eq(JOB), eq(CON), options.capture());
        assertThat(options.getValue().duplicate().confirmed()).isTrue();
        assertThat(options.getValue().duplicate().reason()).isEqualTo("The client asked for both");
        verify(audit).record(eq(ORG), eq("manager"), any(), eq("MKT_APPROVAL_APPROVE"), eq("MKT_APPROVAL_REQUEST"), any(), eq("500"), anyString(), any(), any(), any(), eq("HIGH"));
    }

    @Test
    void ifTheHeldActionNoLongerWorksTheDecisionFailsAndTheRequestStaysPending() {
        MktApprovalRequest r = pending("OPPORTUNITY_ASSIGN");
        heldOpportunity();
        when(assignment.assign(any(AssignmentScope.class), eq(manager), eq(JOB), eq(CON), any())).thenReturn(new OpportunityAssignmentService.Result(null, null, JOB, CON, null, false, false, false, "CONSULTANT_PAUSED"));
        assertThatThrownBy(() -> service.approve(manager, 500L, null)).isInstanceOfSatisfying(OrgException.class, e -> {
            assertThat(e.getStatus()).isEqualTo(409);
            assertThat(e.getCode()).isEqualTo("CONSULTANT_PAUSED");
        });
        assertThat(r.getStatus()).isEqualTo("PENDING");
        verify(audit, never()).record(anyLong(), anyString(), any(), eq("MKT_APPROVAL_APPROVE"), anyString(), any(), anyString(), anyString(), any(), any(), any(), anyString());
        doThrow(OrgException.coded(409, "JOB_NOT_OPEN", "closed", Map.of())).when(assignment).assign(any(AssignmentScope.class), eq(manager), eq(JOB), eq(CON), any());
        assertThatThrownBy(() -> service.approve(manager, 500L, null)).isInstanceOfSatisfying(OrgException.class, e -> assertThat(e.getCode()).isEqualTo("JOB_NOT_OPEN"));
        assertThat(r.getStatus()).isEqualTo("PENDING");
    }

    @Test
    void approvingAHeldResumeReleasesItToTheConsultantsOwnApproval() {
        MktApprovalRequest r = pending("RESUME_RELEASE");
        r.setPayloadJson("{\"resumeId\":55,\"consultantId\":10}");
        service.approve(manager, 500L, null);
        verify(resumes).releaseApproved(manager, OPP);
        verify(assignment, never()).assign(any(AssignmentScope.class), any(), any(Long.class), any(), any());
        assertThat(r.getStatus()).isEqualTo("APPROVED");
        assertThat(eventLog).as("a resume has no opportunity timeline").isEmpty();
    }

    // ---- reject -------------------------------------------------------------------------------------------------------------------

    @Test
    void rejectingNeedsANoteChangesNothingElseAndTellsTheMarketer() {
        MktApprovalRequest r = pending("OPPORTUNITY_ASSIGN");
        MktOpportunity opp = heldOpportunity();
        assertThatThrownBy(() -> service.reject(manager, 500L, " ")).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> service.reject(manager, 500L, "x".repeat(301))).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> service.reject(manager, 500L, "ssn 123-45-6789")).isInstanceOf(SensitiveContentException.class);
        assertThat(r.getStatus()).isEqualTo("PENDING");

        ApprovalRequestDTO dto = service.reject(manager, 500L, "Not this client");
        assertThat(r.getStatus()).isEqualTo("REJECTED");
        assertThat(r.getDecisionNote()).isEqualTo("Not this client");
        assertThat(opp.getApprovalRequestId()).isNull();
        assertThat(eventLog).extracting(MktOpportunityEvent::getText).containsExactly("Manager declined: Not this client");
        verify(assignment, never()).assign(any(AssignmentScope.class), any(), any(Long.class), any(), any());
        verify(audit).record(eq(ORG), eq("manager"), any(), eq("MKT_APPROVAL_REJECT"), eq("MKT_APPROVAL_REQUEST"), any(), eq("500"), anyString(), any(), any(), any(), eq("LOW"));
        assertThat(dto.status()).isEqualTo("REJECTED");
    }

    @Test
    void rejectingAHeldResumeLeavesItAsItIsWithTheNoteOnItsHistory() {
        pending("RESUME_RELEASE");
        service.reject(manager, 500L, "Fix the summary first");
        verify(resumes).releaseDeclined(manager, OPP, "Fix the summary first");
        verify(resumes, never()).releaseApproved(any(), any());
    }

    // ---- who may decide -----------------------------------------------------------------------------------------------------------

    @Test
    void aRequestOutsideTheTeamAndAnUnknownIdAreTheGenericNotFound() {
        pending("OPPORTUNITY_ASSIGN");
        doThrow(new OrgNotFoundException()).when(teamScope).require(team, REQUESTER);
        assertThatThrownBy(() -> service.approve(manager, 500L, null)).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.approve(manager, 501L, null)).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.reject(manager, null, "no")).isInstanceOf(OrgNotFoundException.class);
        verify(requests, never()).save(any(MktApprovalRequest.class));
    }

    @Test
    void aManagerCannotDecideTheirOwnRequestButAnOrganizationWideManagerMay() {
        MktApprovalRequest r = pending("OPPORTUNITY_ASSIGN");
        r.setRequestedByMemberId(MANAGER);
        assertThatThrownBy(() -> service.approve(manager, 500L, null)).isInstanceOfSatisfying(OrgException.class, e -> {
            assertThat(e.getStatus()).isEqualTo(409);
            assertThat(e.getCode()).isEqualTo("SELF_APPROVAL");
        });
        assertThat(r.getStatus()).isEqualTo("PENDING");
        when(teamScope.resolve(manager, AuthzOperation.WRITE, "approvals.decide")).thenReturn(everyone);
        heldOpportunity();
        when(assignment.assign(any(AssignmentScope.class), eq(manager), eq(JOB), eq(CON), any())).thenReturn(new OpportunityAssignmentService.Result(1L, OPP, JOB, CON, 80, false, false, false, null));
        service.approve(manager, 500L, null);
        assertThat(r.getStatus()).isEqualTo("APPROVED");
        verify(teamScope, never()).require(everyone, MANAGER); // an organization-wide caller reaches the requester whatever their role
    }

    @Test
    void aDecidedOrExpiredRequestIsNoLongerPending() {
        MktApprovalRequest r = pending("OPPORTUNITY_ASSIGN");
        r.setStatus("APPROVED");
        assertThatThrownBy(() -> service.approve(manager, 500L, null)).isInstanceOfSatisfying(OrgException.class, e -> {
            assertThat(e.getStatus()).isEqualTo(409);
            assertThat(e.getCode()).isEqualTo("APPROVAL_NOT_PENDING");
        });
        r.setStatus("PENDING");
        r.setExpiresAt(NOW.minusSeconds(1));
        assertThatThrownBy(() -> service.reject(manager, 500L, "late")).isInstanceOfSatisfying(OrgException.class, e -> assertThat(e.getCode()).isEqualTo("APPROVAL_NOT_PENDING"));
        verify(assignment, never()).assign(any(AssignmentScope.class), any(), any(Long.class), any(), any());
    }

    // ---- withdraw and expiry ------------------------------------------------------------------------------------------------------

    @Test
    void onlyTheRequesterCanWithdrawAndOnlyWhilePending() {
        MktApprovalRequest r = pending("OPPORTUNITY_ASSIGN");
        MktOpportunity opp = heldOpportunity();
        assertThatThrownBy(() -> service.withdraw(manager, 500L)).isInstanceOf(OrgNotFoundException.class);
        ApprovalRequestDTO dto = service.withdraw(requester, 500L);
        assertThat(dto.status()).isEqualTo("WITHDRAWN");
        assertThat(r.getStatus()).isEqualTo("WITHDRAWN");
        assertThat(opp.getApprovalRequestId()).isNull();
        verify(audit).record(eq(ORG), eq("marketer"), any(), eq("MKT_APPROVAL_WITHDRAW"), eq("MKT_APPROVAL_REQUEST"), any(), eq("500"), anyString(), any(), any(), any(), eq("LOW"));
        assertThatThrownBy(() -> service.withdraw(requester, 500L)).isInstanceOfSatisfying(OrgException.class, e -> assertThat(e.getCode()).isEqualTo("APPROVAL_NOT_PENDING"));
    }

    @Test
    void expiryClosesOnlyWhatIsPastDueAndFreesTheOpportunity() {
        MktApprovalRequest r = pending("OPPORTUNITY_ASSIGN");
        MktOpportunity opp = heldOpportunity();
        when(requests.findExpired(ORG, NOW)).thenReturn(List.of(r));
        assertThat(service.expire(ORG, NOW)).isEqualTo(1);
        assertThat(r.getStatus()).isEqualTo("EXPIRED");
        assertThat(r.getDecidedByMemberId()).as("nobody decided").isNull();
        assertThat(opp.getApprovalRequestId()).isNull();
        verify(audit).record(eq(ORG), eq("system"), any(), eq("MKT_APPROVAL_EXPIRE"), eq("MKT_APPROVAL_REQUEST"), any(), eq("500"), anyString(), any(), any(), any(), eq("LOW"));
        when(requests.findExpired(ORG, NOW)).thenReturn(List.of());
        assertThat(service.expire(ORG, NOW)).isZero();
    }
}
