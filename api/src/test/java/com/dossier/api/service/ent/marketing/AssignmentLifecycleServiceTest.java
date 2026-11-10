package com.dossier.api.service.ent.marketing;

import static org.assertj.core.api.Assertions.assertThat;
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

import com.dossier.api.domain.ent.OrgAssignment;
import com.dossier.api.domain.ent.mkt.MktFollowup;
import com.dossier.api.domain.ent.mkt.MktFollowupEvent;
import com.dossier.api.domain.ent.mkt.MktOpportunity;
import com.dossier.api.domain.ent.mkt.MktOpportunityEvent;
import com.dossier.api.domain.ent.mkt.MktTask;
import com.dossier.api.domain.ent.mkt.MktTaskEvent;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.MarketerAssignmentEvent;
import com.dossier.api.domain.enumeration.AssignmentKind;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.repository.ent.MarketingBoardRepository;
import com.dossier.api.repository.ent.OrgAssignmentRepository;
import com.dossier.api.repository.ent.mkt.MktFollowupEventRepository;
import com.dossier.api.repository.ent.mkt.MktFollowupRepository;
import com.dossier.api.repository.ent.mkt.MktOpportunityEventRepository;
import com.dossier.api.repository.ent.mkt.MktOpportunityRepository;
import com.dossier.api.repository.ent.mkt.MktTaskEventRepository;
import com.dossier.api.repository.ent.mkt.MktTaskRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.MarketerAssignmentEventRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.service.ent.consultantws.ConsultantNotificationGenerator;
import com.dossier.api.service.ent.marketing.AssignmentLifecycleService.Handover;
import com.dossier.api.service.ent.marketing.AssignmentLifecycleService.Snap;
import com.dossier.api.service.ent.pipeline.PipelineGuardSettings;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.NotificationService;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/** The assignment lifecycle without a database: history, handover of open work, the org_assignment projection and the notices (Sprint 2 / B1). */
class AssignmentLifecycleServiceTest {

    static final Long ORG = 7L;
    static final Long CON = 10L;
    static final Long SEAT = 50L;
    static final Long SARAH = 5L;
    static final Long PRIYA = 6L;
    static final Long BACKUP = 9L;
    static final Instant NOW = Instant.parse("2026-10-16T12:00:00Z");

    MarketerAssignmentEventRepository history = mock(MarketerAssignmentEventRepository.class);
    OrgAssignmentRepository projection = mock(OrgAssignmentRepository.class);
    ConsultantProfileRepository consultants = mock(ConsultantProfileRepository.class);
    MktOpportunityRepository opportunities = mock(MktOpportunityRepository.class);
    MktOpportunityEventRepository opportunityEvents = mock(MktOpportunityEventRepository.class);
    MktTaskRepository tasks = mock(MktTaskRepository.class);
    MktTaskEventRepository taskEvents = mock(MktTaskEventRepository.class);
    MktFollowupRepository followups = mock(MktFollowupRepository.class);
    MktFollowupEventRepository followupEvents = mock(MktFollowupEventRepository.class);
    MarketingBoardRepository board = mock(MarketingBoardRepository.class);
    OrgMemberRepository members = mock(OrgMemberRepository.class);
    OrgAuditService audit = mock(OrgAuditService.class);
    PipelineGuardSettings settings = mock(PipelineGuardSettings.class);
    ConsultantNotificationGenerator consultantFeed = mock(ConsultantNotificationGenerator.class);
    NotificationService memberFeed = mock(NotificationService.class);
    AssignmentLifecycleService service;
    OrgMembership manager = new OrgMembership(ORG, 70L, 700L, "manager", OrgRole.MARKETER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE);

    ConsultantProfile profile = new ConsultantProfile();
    final List<OrgAssignment> openPrimary = new ArrayList<>();
    final List<OrgAssignment> openBackup = new ArrayList<>();
    final List<OrgAssignment> saved = new ArrayList<>();

    @BeforeEach
    void wire() {
        service = new AssignmentLifecycleService(
            history, projection, consultants, opportunities, opportunityEvents, tasks, taskEvents, followups, followupEvents, board, members, audit, settings, Clock.fixed(NOW, ZoneOffset.UTC)
        );
        service.setFeeds(consultantFeed, memberFeed);
        profile.setId(CON);
        profile.setOrgId(ORG);
        profile.setMemberId(SEAT);
        profile.setDisplayName("Anika Rao");
        when(consultants.findByOrgIdAndId(ORG, CON)).thenReturn(Optional.of(profile));
        when(settings.handoverOpenWork(ORG)).thenReturn(true);
        when(board.seatNames(eq(ORG), anyCollection())).thenReturn(List.of(
            new Object[] { SARAH, "Sarah", "Lee", null, null }, new Object[] { PRIYA, "Priya", "Nair", null, null }, new Object[] { BACKUP, "Ben", "Hart", null, null }
        ));
        when(projection.findOpenByConsultantAndKind(ORG, SEAT, AssignmentKind.PRIMARY)).thenReturn(openPrimary);
        when(projection.findOpenByConsultantAndKind(ORG, SEAT, AssignmentKind.BACKUP)).thenReturn(openBackup);
        when(projection.saveAndFlush(any(OrgAssignment.class))).thenAnswer(i -> {
            OrgAssignment a = i.getArgument(0);
            a.setId(900L + saved.size());
            saved.add(a);
            return a;
        });
        when(opportunities.lockOpenOwnedByForConsultant(anyLong(), anyLong(), anyLong(), anyCollection())).thenReturn(List.of());
        when(tasks.findOpenOwnedByForConsultant(anyLong(), anyLong(), anyLong())).thenReturn(List.of());
        when(followups.findOpenOwnedByForConsultant(anyLong(), anyLong(), anyLong())).thenReturn(List.of());
    }

    static Snap snap(Long marketer, Long backup, String status) {
        return new Snap(marketer, backup, status, "MEDIUM");
    }

    OrgAssignment open(Long assignee, AssignmentKind kind) {
        OrgAssignment a = new OrgAssignment();
        a.setId(100L + assignee);
        a.setOrgId(ORG);
        a.setConsultantMemberId(SEAT);
        a.setAssigneeMemberId(assignee);
        a.setKind(kind);
        return a;
    }

    MktOpportunity opportunity(long id, Long owner) {
        MktOpportunity o = new MktOpportunity();
        o.setId(id);
        o.setOrgId(ORG);
        o.setOwnerMemberId(owner);
        o.setState("ASSIGNED");
        return o;
    }

    MktTask task(long id, Long owner) {
        MktTask t = new MktTask();
        t.setId(id);
        t.setOrgId(ORG);
        t.setOwnerMemberId(owner);
        return t;
    }

    MktFollowup followup(long id, Long owner) {
        MktFollowup f = new MktFollowup();
        f.setId(id);
        f.setOrgId(ORG);
        f.setOwnerMemberId(owner);
        return f;
    }

    MarketerAssignmentEvent lastHistory() {
        ArgumentCaptor<MarketerAssignmentEvent> c = ArgumentCaptor.forClass(MarketerAssignmentEvent.class);
        verify(history).save(c.capture());
        return c.getValue();
    }

    // ---- history ----------------------------------------------------------------------------------------------------------------

    @Test
    void theFirstAssignmentWritesOneHistoryLineAndOpensThePrimaryRow() {
        Handover moved = service.record(manager, CON, null, snap(SARAH, null, "ACTIVE"), "New to the bench", null);
        assertThat(moved.total()).isZero();
        MarketerAssignmentEvent e = lastHistory();
        assertThat(e.getAction()).isEqualTo("ASSIGN");
        assertThat(e.getToMarketerMemberId()).isEqualTo(SARAH);
        assertThat(e.getFromMarketerMemberId()).isNull();
        assertThat(e.getReason()).isEqualTo("New to the bench");
        assertThat(e.getActorMemberId()).isEqualTo(70L);
        assertThat(e.getOccurredAt()).isEqualTo(NOW);
        assertThat(saved).hasSize(1);
        assertThat(saved.get(0).getKind()).isEqualTo(AssignmentKind.PRIMARY);
        assertThat(saved.get(0).getAssigneeMemberId()).isEqualTo(SARAH);
        assertThat(saved.get(0).getConsultantMemberId()).isEqualTo(SEAT);
        assertThat(saved.get(0).getCreatedByMemberId()).isEqualTo(70L);
    }

    @Test
    void anUnchangedAssignmentWritesNothing() {
        Handover moved = service.record(manager, CON, snap(SARAH, null, "ACTIVE"), snap(SARAH, null, "ACTIVE"), null, null);
        assertThat(moved).isSameAs(Handover.NONE);
        verify(history, never()).save(any());
        verify(projection, never()).saveAndFlush(any());
    }

    @Test
    void theActionIsDerivedFromWhatChanged() {
        assertThat(AssignmentLifecycleService.actionOf(null, snap(SARAH, null, "ACTIVE"))).isEqualTo("ASSIGN");
        assertThat(AssignmentLifecycleService.actionOf(snap(SARAH, null, "ACTIVE"), null)).isEqualTo("UNASSIGN");
        assertThat(AssignmentLifecycleService.actionOf(snap(SARAH, null, "ACTIVE"), snap(PRIYA, null, "ACTIVE"))).isEqualTo("REASSIGN");
        assertThat(AssignmentLifecycleService.actionOf(snap(SARAH, null, "ACTIVE"), snap(SARAH, null, "PAUSED"))).isEqualTo("PAUSE");
        assertThat(AssignmentLifecycleService.actionOf(snap(SARAH, null, "PAUSED"), snap(SARAH, null, "ACTIVE"))).isEqualTo("RESUME");
        assertThat(AssignmentLifecycleService.actionOf(snap(SARAH, null, "ACTIVE"), snap(SARAH, BACKUP, "ACTIVE"))).isEqualTo("BACKUP");
        assertThat(AssignmentLifecycleService.actionOf(snap(SARAH, null, "ACTIVE"), new Snap(SARAH, null, "ACTIVE", "HIGH"))).isEqualTo("PRIORITY");
    }

    @Test
    void anUndoIsRecordedAsARestore() {
        service.record(manager, CON, snap(PRIYA, null, "ACTIVE"), snap(SARAH, null, "ACTIVE"), "Undo", MarketerAssignmentEvent.RESTORE);
        assertThat(lastHistory().getAction()).isEqualTo("RESTORE");
    }

    // ---- handover ---------------------------------------------------------------------------------------------------------------

    @Test
    void aReassignmentMovesTheOpenWorkOfThatConsultantWithATrailOnEachRecord() {
        MktOpportunity o = opportunity(1L, SARAH);
        MktTask t = task(2L, SARAH);
        MktFollowup f = followup(3L, SARAH);
        when(opportunities.lockOpenOwnedByForConsultant(eq(ORG), eq(CON), eq(SARAH), anyCollection())).thenReturn(List.of(o));
        when(tasks.findOpenOwnedByForConsultant(ORG, CON, SARAH)).thenReturn(List.of(t));
        when(followups.findOpenOwnedByForConsultant(ORG, CON, SARAH)).thenReturn(List.of(f));

        Handover moved = service.record(manager, CON, snap(SARAH, null, "ACTIVE"), snap(PRIYA, null, "ACTIVE"), "Sarah is on leave", null);

        assertThat(moved.opportunities()).isEqualTo(1);
        assertThat(moved.tasks()).isEqualTo(1);
        assertThat(moved.followups()).isEqualTo(1);
        assertThat(o.getOwnerMemberId()).isEqualTo(PRIYA);
        assertThat(t.getOwnerMemberId()).isEqualTo(PRIYA);
        assertThat(f.getOwnerMemberId()).isEqualTo(PRIYA);
        ArgumentCaptor<MktOpportunityEvent> oe = ArgumentCaptor.forClass(MktOpportunityEvent.class);
        verify(opportunityEvents).save(oe.capture());
        assertThat(oe.getValue().getKind()).isEqualTo("OWNER_CHANGED");
        assertThat(oe.getValue().getText()).isEqualTo("is now handled by Priya Nair");
        assertThat(oe.getValue().getActorMemberId()).isEqualTo(70L);
        ArgumentCaptor<MktTaskEvent> te = ArgumentCaptor.forClass(MktTaskEvent.class);
        verify(taskEvents).save(te.capture());
        assertThat(te.getValue().getKind()).isEqualTo("REASSIGNED");
        assertThat(te.getValue().getNote()).contains("Sarah Lee").contains("Priya Nair").contains("Sarah is on leave");
        ArgumentCaptor<MktFollowupEvent> fe = ArgumentCaptor.forClass(MktFollowupEvent.class);
        verify(followupEvents).save(fe.capture());
        assertThat(fe.getValue().getKind()).isEqualTo("REASSIGNED");
        verify(audit).record(eq(manager), eq("MARKETING_HANDOVER"), eq("CONSULTANT"), any(), eq("10"), anyString());
        assertThat(lastHistory().getHandoverSummary()).isEqualTo("1 opportunities, 1 tasks, 1 follow-ups moved");
    }

    @Test
    void onlyWorkOwnedByThePreviousMarketerIsAskedFor() {
        service.record(manager, CON, snap(SARAH, null, "ACTIVE"), snap(PRIYA, null, "ACTIVE"), null, null);
        verify(opportunities).lockOpenOwnedByForConsultant(eq(ORG), eq(CON), eq(SARAH), anyCollection());
        verify(tasks).findOpenOwnedByForConsultant(ORG, CON, SARAH);
        verify(followups).findOpenOwnedByForConsultant(ORG, CON, SARAH);
        verify(audit, never()).record(any(OrgMembership.class), eq("MARKETING_HANDOVER"), anyString(), any(), any(), any()); // nothing moved, nothing audited as a handover
    }

    @Test
    void theAdminSwitchTurnsTheHandoverOff() {
        when(settings.handoverOpenWork(ORG)).thenReturn(false);
        service.record(manager, CON, snap(SARAH, null, "ACTIVE"), snap(PRIYA, null, "ACTIVE"), null, null);
        verify(opportunities, never()).lockOpenOwnedByForConsultant(anyLong(), anyLong(), anyLong(), anyCollection());
        verify(tasks, never()).findOpenOwnedByForConsultant(anyLong(), anyLong(), anyLong());
        assertThat(lastHistory().getAction()).isEqualTo("REASSIGN"); // the history is written either way
    }

    @Test
    void unassigningHandsTheWorkToTheBackupWhenThereIsOne() {
        MktTask t = task(2L, SARAH);
        when(tasks.findOpenOwnedByForConsultant(ORG, CON, SARAH)).thenReturn(List.of(t));
        service.record(manager, CON, snap(SARAH, BACKUP, "ACTIVE"), null, null, null);
        assertThat(t.getOwnerMemberId()).isEqualTo(BACKUP);
        assertThat(lastHistory().getAction()).isEqualTo("UNASSIGN");
    }

    @Test
    void unassigningWithoutABackupLeavesTheWorkWhereItIs() {
        MktTask t = task(2L, SARAH);
        when(tasks.findOpenOwnedByForConsultant(ORG, CON, SARAH)).thenReturn(List.of(t));
        service.record(manager, CON, snap(SARAH, null, "ACTIVE"), null, null, null);
        assertThat(t.getOwnerMemberId()).isEqualTo(SARAH);
        verify(tasks, never()).findOpenOwnedByForConsultant(anyLong(), anyLong(), anyLong());
    }

    @Test
    void aChangeOfBackupOrPriorityMovesNothing() {
        service.record(manager, CON, snap(SARAH, null, "ACTIVE"), snap(SARAH, BACKUP, "ACTIVE"), null, null);
        verify(tasks, never()).findOpenOwnedByForConsultant(anyLong(), anyLong(), anyLong());
    }

    // ---- the org_assignment projection --------------------------------------------------------------------------------------------

    @Test
    void aReassignmentEndsTheOldPrimaryAndChainsItToTheNewOne() {
        OrgAssignment old = open(SARAH, AssignmentKind.PRIMARY);
        openPrimary.add(old);
        service.record(manager, CON, snap(SARAH, null, "ACTIVE"), snap(PRIYA, null, "ACTIVE"), "Workload balance", null);
        assertThat(saved).hasSize(1);
        assertThat(saved.get(0).getAssigneeMemberId()).isEqualTo(PRIYA);
        assertThat(saved.get(0).getReason()).isEqualTo("Workload balance");
        assertThat(old.getEndsAt()).isEqualTo(NOW);
        assertThat(old.getEndReason()).isEqualTo("REASSIGNED");
        assertThat(old.getReplacedByAssignmentId()).isEqualTo(saved.get(0).getId());
        verify(projection).save(old);
    }

    @Test
    void anUnchangedPrimaryIsKeptNotReopened() {
        openPrimary.add(open(SARAH, AssignmentKind.PRIMARY));
        service.record(manager, CON, snap(SARAH, null, "ACTIVE"), new Snap(SARAH, null, "ACTIVE", "HIGH"), null, null);
        assertThat(saved).isEmpty();
        verify(projection, never()).save(any());
    }

    @Test
    void aBackupIsOpenedAndLaterEnded() {
        openPrimary.add(open(SARAH, AssignmentKind.PRIMARY));
        service.record(manager, CON, snap(SARAH, null, "ACTIVE"), snap(SARAH, BACKUP, "ACTIVE"), null, null);
        assertThat(saved).extracting(OrgAssignment::getKind).containsExactly(AssignmentKind.BACKUP);
        OrgAssignment b = open(BACKUP, AssignmentKind.BACKUP);
        openBackup.add(b);
        saved.clear();
        service.record(manager, CON, snap(SARAH, BACKUP, "ACTIVE"), snap(SARAH, null, "ACTIVE"), null, null);
        assertThat(b.getEndsAt()).isEqualTo(NOW);
        assertThat(b.getEndReason()).isEqualTo("REASSIGNED");
        assertThat(b.getReplacedByAssignmentId()).isNull();
    }

    @Test
    void pausingEndsTheRowsBecauseAPausedAssignmentGrantsNothing() {
        OrgAssignment p = open(SARAH, AssignmentKind.PRIMARY);
        openPrimary.add(p);
        service.record(manager, CON, snap(SARAH, null, "ACTIVE"), snap(SARAH, null, "PAUSED"), null, null);
        assertThat(p.getEndsAt()).isEqualTo(NOW);
        assertThat(p.getEndReason()).isEqualTo("PAUSED");
        assertThat(saved).isEmpty();
    }

    @Test
    void unassigningEndsTheRowsAsManual() {
        OrgAssignment p = open(SARAH, AssignmentKind.PRIMARY);
        openPrimary.add(p);
        service.record(manager, CON, snap(SARAH, null, "ACTIVE"), null, null, null);
        assertThat(p.getEndReason()).isEqualTo("MANUAL");
        assertThat(p.getReplacedByAssignmentId()).isNull();
    }

    @Test
    void aConsultantWithoutASeatHasNothingToProject() {
        profile.setMemberId(null);
        service.record(manager, CON, null, snap(SARAH, null, "ACTIVE"), null, null);
        verify(projection, never()).findOpenByConsultantAndKind(anyLong(), anyLong(), any());
        verify(projection, never()).saveAndFlush(any());
        lastHistory(); // the history is still written
    }

    @Test
    void aConsultantIsNeverTheirOwnMarketerInTheProjection() {
        service.record(manager, CON, null, snap(SEAT, null, "ACTIVE"), null, null);
        assertThat(saved).isEmpty();
    }

    // ---- notices ----------------------------------------------------------------------------------------------------------------

    @Test
    void theConsultantAndTheNewMarketerAreToldWithTheExistingKinds() {
        com.dossier.api.domain.org.OrgMember seat = new com.dossier.api.domain.org.OrgMember();
        seat.setUserId(444L);
        when(members.findByOrgIdAndId(ORG, PRIYA)).thenReturn(Optional.of(seat));
        service.record(manager, CON, snap(SARAH, null, "ACTIVE"), snap(PRIYA, null, "ACTIVE"), null, null);
        verify(consultantFeed).push(eq(ORG), eq(CON), startsWith("assignment:"), eq("MESSAGE"), anyString(), org.mockito.ArgumentMatchers.contains("Priya Nair"), anyString(), anyString(), eq("/w/consultant/marketer"), anyString(), eq(CON));
        ArgumentCaptor<NotificationService.Payload> p = ArgumentCaptor.forClass(NotificationService.Payload.class);
        verify(memberFeed).publish(eq(com.dossier.api.domain.enumeration.NotificationKind.SYSTEM), eq(444L), p.capture());
        assertThat(p.getValue().emailWorthy()).isFalse();
        assertThat(p.getValue().title()).contains("Anika Rao");
    }

    @Test
    void aBackupChangeTellsNobody() {
        service.record(manager, CON, snap(SARAH, null, "ACTIVE"), snap(SARAH, BACKUP, "ACTIVE"), null, null);
        verify(consultantFeed, never()).push(anyLong(), anyLong(), anyString(), anyString(), anyString(), anyString(), anyString(), anyString(), anyString(), anyString(), anyLong());
    }

    @Test
    void aFailingNoticeNeverUndoesTheChange() {
        doThrow(new IllegalStateException("feed is down")).when(consultantFeed).push(anyLong(), anyLong(), anyString(), anyString(), anyString(), anyString(), anyString(), anyString(), anyString(), anyString(), anyLong());
        service.record(manager, CON, snap(SARAH, null, "ACTIVE"), snap(PRIYA, null, "ACTIVE"), null, null);
        lastHistory();
    }

    static String startsWith(String prefix) {
        return org.mockito.ArgumentMatchers.startsWith(prefix);
    }
}
