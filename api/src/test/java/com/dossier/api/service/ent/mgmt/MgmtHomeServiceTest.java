package com.dossier.api.service.ent.mgmt;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.ent.mkt.MktActivity;
import com.dossier.api.domain.ent.talent.MarketerAssignment;
import com.dossier.api.domain.ent.talent.MarketerCapacity;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.repository.ent.mgmt.MgmtLookupRepository;
import com.dossier.api.repository.ent.mgmt.MgmtTeamRepository;
import com.dossier.api.repository.ent.talent.MarketerAssignmentRepository;
import com.dossier.api.repository.ent.talent.MarketerCapacityRepository;
import com.dossier.api.service.ent.applications.ApplicationNames;
import com.dossier.api.service.ent.authz.AuthzOperation;
import com.dossier.api.service.ent.marketing.MarketingSettings;
import com.dossier.api.service.ent.mkt.approvals.ApprovalRequestDTO;
import com.dossier.api.service.ent.mkt.approvals.ApprovalService;
import com.dossier.api.service.ent.mkt.escalations.EscalationDTO;
import com.dossier.api.service.ent.mkt.escalations.EscalationService;
import com.dossier.api.service.org.OrgMembership;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * The Marketing Manager's Home without a database (MM-06): an empty team is an honest empty state (never a 404), the tiles and the pipeline are the team's own counts
 * with an honest delta, the load list is the three most loaded marketers, "needs you" is the oldest approvals and the most severe escalations.
 */
class MgmtHomeServiceTest {

    static final Long ORG = 7L;
    static final Instant NOW = Instant.parse("2026-10-17T12:00:00Z");

    TeamScope teamScope = mock(TeamScope.class);
    MarketerCapacityRepository capacities = mock(MarketerCapacityRepository.class);
    MarketerAssignmentRepository assignments = mock(MarketerAssignmentRepository.class);
    MgmtTeamRepository facts = mock(MgmtTeamRepository.class);
    MgmtLookupRepository lookup = mock(MgmtLookupRepository.class);
    ApplicationNames names = mock(ApplicationNames.class);
    MarketingSettings marketing = mock(MarketingSettings.class);
    ApprovalService approvals = mock(ApprovalService.class);
    EscalationService escalations = mock(EscalationService.class);
    MgmtHomeService home;
    OrgMembership me = new OrgMembership(ORG, 90L, 900L, "manager", OrgRole.MARKETER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE);

    @BeforeEach
    void wire() {
        home = new MgmtHomeService(teamScope, capacities, assignments, facts, lookup, names, marketing, approvals, escalations, Clock.fixed(NOW, ZoneOffset.UTC));
        when(marketing.overloadPct(ORG)).thenReturn(90);
    }

    static MarketerCapacity capacity(long member, int cap, String status) {
        MarketerCapacity c = new MarketerCapacity();
        c.setOrgId(ORG);
        c.setMemberId(member);
        c.setCapacity(cap);
        c.setStatus(status);
        return c;
    }

    static List<MarketerAssignment> carrying(long member, int n) {
        List<MarketerAssignment> out = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            MarketerAssignment a = new MarketerAssignment();
            a.setMarketerMemberId(member);
            out.add(a);
        }
        return out;
    }

    @Test
    void aManagerWithNoMarketersGetsTheEmptyStateAndNothingIsRead() {
        when(teamScope.resolve(me, AuthzOperation.READ)).thenReturn(new TeamScope.View(ORG, 90L, false, Set.of(), Set.of()));
        MgmtHomeDTO dto = home.home(me);
        assertThat(dto.empty()).isTrue();
        assertThat(dto.tiles().marketersActive()).isZero();
        assertThat(dto.tiles().escalations().open()).isZero();
        assertThat(dto.workload()).isEmpty();
        assertThat(dto.needsYou()).isEmpty();
        assertThat(dto.activity()).isEmpty();
        verify(facts, never()).countOpen(any(), org.mockito.ArgumentMatchers.anyBoolean(), anyCollection(), anyCollection());
        verify(approvals, never()).countPending(any());
    }

    @Test
    void theTilesThePipelineAndTheLoadAreTheTeamsOwnCounts() {
        TeamScope.View team = new TeamScope.View(ORG, 90L, false, Set.of(70L, 71L, 72L, 73L), Set.of(10L, 11L, 12L));
        when(teamScope.resolve(me, AuthzOperation.READ)).thenReturn(team);
        when(capacities.findByOrgId(ORG)).thenReturn(List.of(capacity(70L, 10, "ACTIVE"), capacity(71L, 4, "ACTIVE"), capacity(72L, 8, "PAUSED"), capacity(73L, 20, "ACTIVE"), capacity(99L, 5, "ACTIVE")));
        List<MarketerAssignment> rows = new ArrayList<>();
        rows.addAll(carrying(70L, 9)); // 90 percent: overloaded
        rows.addAll(carrying(71L, 1)); // 25 percent
        rows.addAll(carrying(72L, 4)); // 50 percent, paused
        rows.addAll(carrying(73L, 10)); // 50 percent
        rows.addAll(carrying(99L, 5)); // not in the team: ignored
        when(assignments.findByOrgId(ORG)).thenReturn(rows);
        when(names.memberNames(eq(ORG), anyCollection())).thenReturn(Map.of(70L, "Sam Spec", 71L, "Mia Ng", 72L, "Omar Aziz", 73L, "Zoe Park"));
        when(facts.countOpen(eq(ORG), eq(false), anyCollection(), anyCollection())).thenReturn(42L);
        when(facts.countOpportunityEvents(eq(ORG), eq(false), anyCollection(), eq(List.of("ASSIGNED", "REASSIGNED")), eq(NOW.minusSeconds(7 * 86400L)), any())).thenReturn(12L);
        when(facts.countOpportunityEvents(eq(ORG), eq(false), anyCollection(), eq(List.of("ASSIGNED", "REASSIGNED")), eq(NOW.minusSeconds(14 * 86400L)), eq(NOW.minusSeconds(7 * 86400L)))).thenReturn(8L);
        when(facts.countOpportunityEvents(eq(ORG), eq(false), anyCollection(), eq(List.of("INTERESTED")), any(), any())).thenReturn(0L);
        when(facts.countSubmitted(eq(ORG), eq(false), anyCollection(), any(), any())).thenReturn(3L);
        when(facts.countInterviews(eq(ORG), eq(false), anyCollection(), any(), any())).thenReturn(0L);
        when(approvals.countPending(team)).thenReturn(4L);
        when(escalations.counts(team)).thenReturn(new EscalationDTO.Counts(6, 2, 3, 1, 1));

        MgmtHomeDTO dto = home.home(me);

        assertThat(dto.empty()).isFalse();
        assertThat(dto.generatedAt()).isEqualTo(NOW);
        assertThat(dto.tiles().marketersActive()).as("the team's active marketers only").isEqualTo(3);
        assertThat(dto.tiles().marketersPaused()).isEqualTo(1);
        assertThat(dto.tiles().consultantsCovered()).isEqualTo(3);
        assertThat(dto.tiles().openOpportunities()).isEqualTo(42);
        assertThat(dto.tiles().approvalsWaiting()).isEqualTo(4);
        assertThat(dto.tiles().escalations().high()).isEqualTo(2);
        assertThat(dto.pipeline().assigned().thisWeek()).isEqualTo(12);
        assertThat(dto.pipeline().assigned().lastWeek()).isEqualTo(8);
        assertThat(dto.pipeline().assigned().deltaPct()).as("(12 - 8) / 8").isEqualTo(50.0);
        assertThat(dto.pipeline().interested().deltaPct()).as("no delta against a week of nothing").isNull();
        assertThat(dto.pipeline().submitted().thisWeek()).isEqualTo(3);
        assertThat(dto.workload()).extracting(MgmtHomeDTO.LoadRow::name).containsExactly("Sam Spec", "Omar Aziz", "Zoe Park");
        assertThat(dto.workload().get(0).percent()).isEqualTo(90);
        assertThat(dto.workload().get(0).overloaded()).isTrue();
        assertThat(dto.workload().get(1).overloaded()).isFalse();
    }

    @Test
    void needsYouListsTheOldestApprovalsThenTheMostSevereEscalationsAndTheActivityNamesPeople() {
        TeamScope.View team = new TeamScope.View(ORG, 90L, false, Set.of(70L), Set.of(10L));
        when(teamScope.resolve(me, AuthzOperation.READ)).thenReturn(team);
        when(capacities.findByOrgId(ORG)).thenReturn(List.of(capacity(70L, 10, "ACTIVE")));
        when(names.memberNames(eq(ORG), anyCollection())).thenReturn(Map.of(70L, "Sam Spec"));
        ApprovalRequestDTO approval = new ApprovalRequestDTO(
            500L, "OPPORTUNITY_ASSIGN", "MKT_OPPORTUNITY", 55L, new ApprovalRequestDTO.Person(10L, "Anika Rao"), new ApprovalRequestDTO.Person(70L, "Sam Spec"), NOW.minusSeconds(7200), "Anika Rao to Stripe, SWE II", null,
            "PENDING", null, null, null, NOW, Map.of()
        );
        when(approvals.oldestPending(team, 5)).thenReturn(List.of(approval));
        EscalationDTO escalation = new EscalationDTO(
            9L, "UNANSWERED_QUESTION", "HIGH", "CWS_QUESTION", 3L, null, new EscalationDTO.Person(70L, "Sam Spec"), "Anika Rao asked about SWE II and is still waiting", null, "UNANSWERED_QUESTION", null, NOW.minusSeconds(3600),
            "OPEN", null, null, null, null, null, 1, null
        );
        when(escalations.topHigh(team, 5)).thenReturn(List.of(escalation));
        when(escalations.counts(team)).thenReturn(new EscalationDTO.Counts(1, 1, 0, 0, 0));
        MktActivity line = new MktActivity();
        line.setId(1L);
        line.setConsultantId(10L);
        line.setActivityType("RESUME_UPDATED");
        line.setTitle("Updated the resume");
        line.setActorMemberId(70L);
        line.setOccurredAt(NOW.minusSeconds(60));
        when(facts.latestActivity(eq(ORG), eq(false), anyCollection(), any())).thenReturn(List.of(line));
        when(lookup.consultantNames(eq(ORG), anyCollection())).thenReturn(List.<Object[]>of(new Object[] { 10L, "Anika Rao" }));

        MgmtHomeDTO dto = home.home(me);

        assertThat(dto.needsYou()).extracting(MgmtHomeDTO.NeedsYou::type).containsExactly("APPROVAL", "ESCALATION");
        assertThat(dto.needsYou().get(0).who()).isEqualTo("Sam Spec");
        assertThat(dto.needsYou().get(0).link()).isEqualTo("/w/marketing-mgmt/approvals?id=500");
        assertThat(dto.needsYou().get(1).severity()).isEqualTo("HIGH");
        assertThat(dto.needsYou().get(1).link()).isEqualTo("/w/marketing-mgmt/escalations?id=9");
        assertThat(dto.activity()).hasSize(1);
        assertThat(dto.activity().get(0).actor()).isEqualTo("Sam Spec");
        assertThat(dto.activity().get(0).consultant()).isEqualTo("Anika Rao");
        assertThat(dto.activity().get(0).text()).isEqualTo("Updated the resume");
        verify(approvals).oldestPending(team, 5);
        verify(escalations).topHigh(eq(team), anyInt());
    }
}
