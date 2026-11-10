package com.dossier.api.service.ent.mkt.escalations;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.ent.mgmt.MktApprovalRequest;
import com.dossier.api.domain.ent.mgmt.MktEscalation;
import com.dossier.api.domain.ent.mkt.MktFollowup;
import com.dossier.api.domain.ent.talent.MarketerAssignment;
import com.dossier.api.domain.ent.talent.MarketerCapacity;
import com.dossier.api.repository.ent.mgmt.MgmtRulesRepository;
import com.dossier.api.repository.ent.mgmt.MktApprovalRequestRepository;
import com.dossier.api.repository.ent.talent.MarketerAssignmentRepository;
import com.dossier.api.repository.ent.talent.MarketerCapacityRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ent.TenantModule;
import com.dossier.api.service.ent.TenantModules;
import com.dossier.api.service.ent.marketing.MarketingSettings;
import com.dossier.api.service.ent.mkt.followups.MktFollowupService;
import com.dossier.api.service.privacy.JobLeaseService;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * Every escalation rule without a database (MM-04): it raises what needs a manager exactly once (the open key), raises the severity of a row that got worse,
 * resolves its own row with "Cleared: ..." when the condition goes away, leaves a snoozed row alone, and a failing rule never stops the others. The thresholds
 * come from settings, not from the code.
 */
class EscalationRulesJobTest {

    static final Long ORG = EscalationWorld.ORG;
    static final Instant NOW = Instant.parse("2026-10-17T12:00:00Z");

    EscalationWorld world;
    EscalationSettings settings = mock(EscalationSettings.class);
    MgmtRulesRepository facts = mock(MgmtRulesRepository.class);
    MktFollowupService followups = mock(MktFollowupService.class);
    MktApprovalRequestRepository approvals = mock(MktApprovalRequestRepository.class);
    MarketerCapacityRepository capacities = mock(MarketerCapacityRepository.class);
    MarketerAssignmentRepository assignments = mock(MarketerAssignmentRepository.class);
    MarketingSettings marketing = mock(MarketingSettings.class);
    EscalationRules rules;

    @BeforeEach
    void wire() {
        world = new EscalationWorld(Clock.fixed(NOW, ZoneOffset.UTC));
        rules = new EscalationRules(world.escalations, world.service(), settings, facts, followups, approvals, capacities, assignments, marketing, world.names, Clock.fixed(NOW, ZoneOffset.UTC));
        when(settings.stalledDays(ORG)).thenReturn(7);
        when(settings.followupOverdueDays(ORG)).thenReturn(3);
        when(settings.questionSlaHours(ORG)).thenReturn(48);
        when(settings.approvalSlaHours(ORG)).thenReturn(24);
        when(marketing.overloadPct(ORG)).thenReturn(90);
    }

    static Object[] opportunity(long id, Instant last, Instant created) {
        return new Object[] { id, 10L, 70L, last, created, "SWE II", "Anika Rao" };
    }

    // ---- stalled opportunity --------------------------------------------------------------------------------------------------------

    @Test
    void anOpportunityWithNoActivityForTheLimitIsRaisedOnceAsMediumAndNeverDuplicated() {
        when(facts.openOpportunityActivity(eq(ORG), anyCollection())).thenReturn(List.of(
            opportunity(1, NOW.minus(Duration.ofDays(9)), NOW.minus(Duration.ofDays(30))), // idle 9 days: stalled
            opportunity(2, NOW.minus(Duration.ofDays(3)), NOW.minus(Duration.ofDays(30))), // idle 3 days: fine
            opportunity(3, null, NOW.minus(Duration.ofDays(8))) // no line at all: counted from its creation
        ));
        EscalationRules.Outcome first = rules.stalledOpportunities(ORG, NOW);
        assertThat(first.raised()).hasSize(2);
        assertThat(world.live("STALLED_OPPORTUNITY")).extracting(MktEscalation::getSubjectId).containsExactlyInAnyOrder(1L, 3L);
        MktEscalation one = world.live("STALLED_OPPORTUNITY").stream().filter(e -> e.getSubjectId() == 1L).findFirst().orElseThrow();
        assertThat(one.getSeverity()).isEqualTo("MEDIUM");
        assertThat(one.getKind()).isEqualTo("STALLED_OPPORTUNITY");
        assertThat(one.getSubjectType()).isEqualTo("MKT_OPPORTUNITY");
        assertThat(one.getConsultantId()).isEqualTo(10L);
        assertThat(one.getMarketerMemberId()).isEqualTo(70L);
        assertThat(one.getTitle()).isEqualTo("Anika Rao: SWE II has had no activity for 9 days");
        assertThat(one.getDetail()).contains("9 days").contains("limit is 7");
        assertThat(world.kinds(one)).containsExactly("RAISED");

        EscalationRules.Outcome second = rules.stalledOpportunities(ORG, NOW);
        assertThat(second.raised()).as("the open key: the same thing is never raised twice").isEmpty();
        assertThat(world.rows).hasSize(2);
    }

    @Test
    void aRowThatGotWorseGoesToHighAndANeverLowers() {
        when(facts.openOpportunityActivity(eq(ORG), anyCollection())).thenReturn(List.<Object[]>of(opportunity(1, NOW.minus(Duration.ofDays(9)), NOW.minus(Duration.ofDays(30)))));
        rules.stalledOpportunities(ORG, NOW);
        MktEscalation row = world.rows.get(0);
        assertThat(row.getSeverity()).isEqualTo("MEDIUM");

        when(facts.openOpportunityActivity(eq(ORG), anyCollection())).thenReturn(List.<Object[]>of(opportunity(1, NOW.minus(Duration.ofDays(15)), NOW.minus(Duration.ofDays(30)))));
        EscalationRules.Outcome worse = rules.stalledOpportunities(ORG, NOW);
        assertThat(worse.bumped()).isEqualTo(1);
        assertThat(row.getSeverity()).as("twice the limit is HIGH").isEqualTo("HIGH");
        assertThat(world.rows).hasSize(1);

        when(facts.openOpportunityActivity(eq(ORG), anyCollection())).thenReturn(List.<Object[]>of(opportunity(1, NOW.minus(Duration.ofDays(8)), NOW.minus(Duration.ofDays(30)))));
        assertThat(rules.stalledOpportunities(ORG, NOW).bumped()).isZero();
        assertThat(row.getSeverity()).isEqualTo("HIGH");
    }

    @Test
    void whenTheConditionClearsTheSystemResolvesItsOwnRowWithClearedAndNoPerson() {
        when(facts.openOpportunityActivity(eq(ORG), anyCollection())).thenReturn(List.<Object[]>of(opportunity(1, NOW.minus(Duration.ofDays(9)), NOW.minus(Duration.ofDays(30)))));
        rules.stalledOpportunities(ORG, NOW);
        MktEscalation row = world.rows.get(0);

        when(facts.openOpportunityActivity(eq(ORG), anyCollection())).thenReturn(List.<Object[]>of(opportunity(1, NOW.minus(Duration.ofDays(1)), NOW.minus(Duration.ofDays(30)))));
        EscalationRules.Outcome out = rules.stalledOpportunities(ORG, NOW);
        assertThat(out.resolved()).isEqualTo(1);
        assertThat(row.getStatus()).isEqualTo("RESOLVED");
        assertThat(row.getResolution()).startsWith("Cleared: ");
        assertThat(row.getResolvedByMemberId()).isNull();
        assertThat(row.getResolvedAt()).isEqualTo(NOW);
        assertThat(world.kinds(row)).containsExactly("RAISED", "RESOLVED");
        assertThat(world.trail.get(1).getActorMemberId()).as("the system, not a person").isNull();

        // and when it stalls again later, it is a NEW row (the closed one freed the key)
        when(facts.openOpportunityActivity(eq(ORG), anyCollection())).thenReturn(List.<Object[]>of(opportunity(1, NOW.minus(Duration.ofDays(9)), NOW.minus(Duration.ofDays(30)))));
        assertThat(rules.stalledOpportunities(ORG, NOW).raised()).hasSize(1);
        assertThat(world.rows).hasSize(2);
    }

    @Test
    void aSnoozedRowIsLeftAloneWhileTheConditionHolds() {
        when(facts.openOpportunityActivity(eq(ORG), anyCollection())).thenReturn(List.<Object[]>of(opportunity(1, NOW.minus(Duration.ofDays(9)), NOW.minus(Duration.ofDays(30)))));
        rules.stalledOpportunities(ORG, NOW);
        MktEscalation row = world.rows.get(0);
        row.setStatus("SNOOZED");
        row.setSnoozedUntil(NOW.plus(Duration.ofDays(2)));
        EscalationRules.Outcome out = rules.stalledOpportunities(ORG, NOW);
        assertThat(out.raised()).isEmpty();
        assertThat(out.resolved()).isZero();
        assertThat(row.getStatus()).isEqualTo("SNOOZED");
        assertThat(world.rows).hasSize(1);
    }

    @Test
    void theStalledLimitIsTheSettingNotACodeConstant() {
        when(settings.stalledDays(ORG)).thenReturn(14);
        when(facts.openOpportunityActivity(eq(ORG), anyCollection())).thenReturn(List.<Object[]>of(opportunity(1, NOW.minus(Duration.ofDays(9)), NOW.minus(Duration.ofDays(30)))));
        assertThat(rules.stalledOpportunities(ORG, NOW).raised()).isEmpty();
        when(settings.stalledDays(ORG)).thenReturn(4);
        assertThat(rules.stalledOpportunities(ORG, NOW).raised()).hasSize(1);
        assertThat(world.rows.get(0).getSeverity()).as("9 days is more than twice 4").isEqualTo("HIGH");
    }

    // ---- overdue follow-up ----------------------------------------------------------------------------------------------------------

    private MktFollowup followup(long id, long overdueDays) {
        MktFollowup f = new MktFollowup();
        f.setId(id);
        f.setOrgId(ORG);
        f.setConsultantId(10L);
        f.setOwnerMemberId(70L);
        f.setTitle("Call the recruiter");
        f.setDueAt(NOW.minus(Duration.ofDays(overdueDays)));
        return f;
    }

    @Test
    void anOverdueFollowUpIsLowAndMediumOnceItIsSevenDaysOverdueAndClearsWhenDone() {
        when(followups.overdue(ORG, 3)).thenReturn(List.of(followup(1, 4), followup(2, 8)));
        EscalationRules.Outcome out = rules.overdueFollowups(ORG, NOW);
        assertThat(out.raised()).hasSize(2);
        assertThat(world.live("OVERDUE_FOLLOWUP")).extracting(MktEscalation::getSeverity).containsExactlyInAnyOrder("LOW", "MEDIUM");
        MktEscalation low = world.rows.stream().filter(e -> e.getSubjectId() == 1L).findFirst().orElseThrow();
        assertThat(low.getSubjectType()).isEqualTo("MKT_FOLLOWUP");
        assertThat(low.getTitle()).isEqualTo("Overdue follow-up: Call the recruiter");
        assertThat(rules.overdueFollowups(ORG, NOW).raised()).isEmpty();

        when(followups.overdue(ORG, 3)).thenReturn(List.of(followup(2, 8)));
        EscalationRules.Outcome cleared = rules.overdueFollowups(ORG, NOW);
        assertThat(cleared.resolved()).isEqualTo(1);
        assertThat(low.getStatus()).isEqualTo("RESOLVED");
        assertThat(world.live("OVERDUE_FOLLOWUP")).hasSize(1);
    }

    @Test
    void aLowFollowUpBumpsToMediumWhenItAgesPastSevenDays() {
        when(followups.overdue(ORG, 3)).thenReturn(List.of(followup(1, 4)));
        rules.overdueFollowups(ORG, NOW);
        when(followups.overdue(ORG, 3)).thenReturn(List.of(followup(1, 9)));
        assertThat(rules.overdueFollowups(ORG, NOW).bumped()).isEqualTo(1);
        assertThat(world.rows.get(0).getSeverity()).isEqualTo("MEDIUM");
    }

    // ---- unanswered question --------------------------------------------------------------------------------------------------------

    @Test
    void aQuestionThatWaitedPastTheSlaIsHighAndClearsWhenAnswered() {
        Object[] waiting = { 5L, 10L, 70L, NOW.minus(Duration.ofHours(50)), NOW.minus(Duration.ofHours(40)), "SWE II", "Anika Rao" };
        Object[] fresh = { 6L, 11L, 71L, NOW.minus(Duration.ofHours(5)), NOW, "PM", "Omar Aziz" };
        Object[] noLine = { 7L, 11L, 71L, null, NOW.minus(Duration.ofHours(60)), "PM", "Omar Aziz" }; // no INFO_REQUESTED line: counted from the row's last change
        when(facts.unansweredQuestions(ORG)).thenReturn(List.of(waiting, fresh, noLine));
        EscalationRules.Outcome out = rules.unansweredQuestions(ORG, NOW);
        assertThat(out.raised()).hasSize(2);
        assertThat(world.live("UNANSWERED_QUESTION")).extracting(MktEscalation::getSubjectId).containsExactlyInAnyOrder(5L, 7L);
        MktEscalation row = world.live("UNANSWERED_QUESTION").stream().filter(e -> e.getSubjectId() == 5L).findFirst().orElseThrow();
        assertThat(row.getSeverity()).isEqualTo("HIGH");
        assertThat(row.getSubjectType()).isEqualTo("CWS_QUESTION");
        assertThat(row.getTitle()).isEqualTo("Anika Rao asked about SWE II and is still waiting");
        assertThat(rules.unansweredQuestions(ORG, NOW).raised()).isEmpty();

        when(facts.unansweredQuestions(ORG)).thenReturn(List.<Object[]>of(noLine));
        assertThat(rules.unansweredQuestions(ORG, NOW).resolved()).isEqualTo(1);
        assertThat(row.getResolution()).isEqualTo("Cleared: the question was answered");
    }

    // ---- overloaded marketer --------------------------------------------------------------------------------------------------------

    private void load(long member, int capacity, int assigned) {
        MarketerCapacity c = new MarketerCapacity();
        c.setOrgId(ORG);
        c.setMemberId(member);
        c.setCapacity(capacity);
        c.setStatus("ACTIVE");
        when(capacities.findByOrgIdAndStatus(ORG, "ACTIVE")).thenReturn(List.of(c));
        List<MarketerAssignment> rows = new ArrayList<>();
        for (int i = 0; i < assigned; i++) {
            MarketerAssignment a = new MarketerAssignment();
            a.setMarketerMemberId(member);
            rows.add(a);
        }
        when(assignments.findByOrgId(ORG)).thenReturn(rows);
    }

    @Test
    void aMarketerIsRaisedOnlyAfterThreeRunsInARowOverTheLineAndTheCountResetsWhenTheyDrop() {
        load(70L, 10, 9);
        assertThat(rules.overloadedMarketers(ORG, NOW).raised()).as("run 1").isEmpty();
        assertThat(rules.overloadedMarketers(ORG, NOW).raised()).as("run 2").isEmpty();
        load(70L, 10, 5); // dropped below the line: the run count starts again
        assertThat(rules.overloadedMarketers(ORG, NOW).raised()).isEmpty();
        load(70L, 10, 9);
        assertThat(rules.overloadedMarketers(ORG, NOW).raised()).as("run 1 again").isEmpty();
        assertThat(rules.overloadedMarketers(ORG, NOW).raised()).as("run 2 again").isEmpty();
        EscalationRules.Outcome third = rules.overloadedMarketers(ORG, NOW);
        assertThat(third.raised()).hasSize(1);
        MktEscalation row = world.rows.get(0);
        assertThat(row.getKind()).isEqualTo("OVERLOADED_MARKETER");
        assertThat(row.getSeverity()).isEqualTo("MEDIUM");
        assertThat(row.getSubjectType()).isEqualTo("MARKETER");
        assertThat(row.getSubjectId()).isEqualTo(70L);
        assertThat(row.getMarketerMemberId()).isEqualTo(70L);
        assertThat(row.getTitle()).isEqualTo("Sam Spec is at 90% of capacity");
        assertThat(rules.overloadedMarketers(ORG, NOW).raised()).as("still over: not raised twice").isEmpty();

        load(70L, 10, 4);
        EscalationRules.Outcome cleared = rules.overloadedMarketers(ORG, NOW);
        assertThat(cleared.resolved()).isEqualTo(1);
        assertThat(row.getResolution()).isEqualTo("Cleared: the load is back under 90% of capacity");
    }

    // ---- approval aging -------------------------------------------------------------------------------------------------------------

    @Test
    void anApprovalThatWaitedPastTheSlaIsMediumAndClearsWhenDecided() {
        MktApprovalRequest r = new MktApprovalRequest();
        r.setId(500L);
        r.setOrgId(ORG);
        r.setConsultantId(10L);
        r.setRequestedByMemberId(70L);
        r.setTitle("Anika Rao to Stripe, SWE II");
        r.setRequestedAt(NOW.minus(Duration.ofHours(30)));
        when(approvals.findPendingOlderThan(ORG, NOW.minus(Duration.ofHours(24)))).thenReturn(List.of(r));
        assertThat(rules.agingApprovals(ORG, NOW).raised()).hasSize(1);
        MktEscalation row = world.rows.get(0);
        assertThat(row.getKind()).isEqualTo("APPROVAL_AGING");
        assertThat(row.getSeverity()).isEqualTo("MEDIUM");
        assertThat(row.getSubjectType()).isEqualTo("MKT_APPROVAL_REQUEST");
        assertThat(row.getMarketerMemberId()).isEqualTo(70L);
        assertThat(row.getDetail()).contains("30 hours").contains("24 hours");
        assertThat(rules.agingApprovals(ORG, NOW).raised()).isEmpty();
        when(approvals.findPendingOlderThan(ORG, NOW.minus(Duration.ofHours(24)))).thenReturn(List.of());
        assertThat(rules.agingApprovals(ORG, NOW).resolved()).isEqualTo(1);
    }

    // ---- snoozes and the job --------------------------------------------------------------------------------------------------------

    @Test
    void aSnoozeThatRanOutBringsTheRowBackAsOpen() {
        when(facts.openOpportunityActivity(eq(ORG), anyCollection())).thenReturn(List.<Object[]>of(opportunity(1, NOW.minus(Duration.ofDays(9)), NOW.minus(Duration.ofDays(30)))));
        rules.stalledOpportunities(ORG, NOW);
        MktEscalation row = world.rows.get(0);
        row.setStatus("SNOOZED");
        row.setSnoozedUntil(NOW.minusSeconds(1));
        assertThat(rules.wakeSnoozes(ORG, NOW)).isEqualTo(1);
        assertThat(row.getStatus()).isEqualTo("OPEN");
        assertThat(row.getSnoozedUntil()).isNull();
        assertThat(world.kinds(row)).containsExactly("RAISED", "REOPENED");
        row.setStatus("SNOOZED");
        row.setSnoozedUntil(NOW.plusSeconds(60));
        assertThat(rules.wakeSnoozes(ORG, NOW)).isZero();
    }

    @Test
    void theJobVisitsOnlyOrganizationsWithTheModuleRunsEveryRuleAndOneFailingRuleNeverStopsTheOthers() {
        OrganizationRepository organizations = mock(OrganizationRepository.class);
        TenantModules modules = mock(TenantModules.class);
        EscalationRules fake = mock(EscalationRules.class);
        EscalationNotices notices = mock(EscalationNotices.class);
        JobLeaseService leases = mock(JobLeaseService.class);
        EscalationRulesJob job = new EscalationRulesJob(organizations, modules, fake, notices, leases);
        when(organizations.findAllOrgIds()).thenReturn(List.of(1L, 2L, 3L));
        when(modules.isOn(TenantModule.MARKETING, 1L)).thenReturn(true);
        when(modules.isOn(TenantModule.MARKETING, 2L)).thenReturn(false);
        when(modules.isOn(TenantModule.MARKETING, 3L)).thenReturn(true);
        EscalationRules.Raised high = new EscalationRules.Raised(9L, "HIGH", 70L, 10L, "t");
        when(fake.stalledOpportunities(eq(1L), any())).thenThrow(new IllegalStateException("db down"));
        when(fake.overdueFollowups(eq(1L), any())).thenReturn(new EscalationRules.Outcome("OVERDUE_FOLLOWUP", List.of(high), 2, 1));
        when(fake.unansweredQuestions(anyLong(), any())).thenReturn(EscalationRules.Outcome.none("UNANSWERED_QUESTION"));
        when(fake.overloadedMarketers(anyLong(), any())).thenReturn(EscalationRules.Outcome.none("OVERLOADED_MARKETER"));
        when(fake.agingApprovals(anyLong(), any())).thenReturn(EscalationRules.Outcome.none("APPROVAL_AGING"));
        when(fake.stalledOpportunities(eq(3L), any())).thenReturn(EscalationRules.Outcome.none("STALLED_OPPORTUNITY"));
        when(fake.overdueFollowups(eq(3L), any())).thenReturn(EscalationRules.Outcome.none("OVERDUE_FOLLOWUP"));
        when(fake.wakeSnoozes(eq(1L), any())).thenReturn(2);
        when(notices.notifyNewHigh(eq(1L), any())).thenReturn(1);

        EscalationRulesJob.Result r = job.runOnce(NOW);

        assertThat(r.organizations()).isEqualTo(2);
        assertThat(r.raised()).isEqualTo(1);
        assertThat(r.resolved()).isEqualTo(2);
        assertThat(r.bumped()).isEqualTo(1);
        assertThat(r.woken()).isEqualTo(2);
        assertThat(r.notices()).isEqualTo(1);
        verify(fake, never()).stalledOpportunities(eq(2L), any());
        verify(fake).agingApprovals(eq(1L), any()); // the rules after the failed one still ran
        verify(notices).notifyNewHigh(eq(1L), org.mockito.ArgumentMatchers.argThat(list -> list.size() == 1 && list.get(0).id().equals(9L)));
    }

    @Test
    void theScheduledRunTakesTheLeaseFirst() {
        JobLeaseService leases = mock(JobLeaseService.class);
        new EscalationRulesJob(mock(OrganizationRepository.class), mock(TenantModules.class), mock(EscalationRules.class), mock(EscalationNotices.class), leases).scheduled();
        verify(leases).withLease(eq("mkt-escalations"), any(), any(), any(), any());
    }
}
