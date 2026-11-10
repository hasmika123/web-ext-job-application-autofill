package com.dossier.api.service.ent.mkt.opportunities;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.ent.mkt.MktOpportunity;
import com.dossier.api.domain.ent.mkt.MktOpportunityEvent;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.mkt.MktOpportunityEventRepository;
import com.dossier.api.repository.ent.mkt.MktOpportunityRepository;
import com.dossier.api.repository.ent.mkt.MktOpportunityRow;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.ConsultantSkillRepository;
import com.dossier.api.repository.ent.talent.RequirementMatchRepository;
import com.dossier.api.repository.ent.talent.RequirementSkillRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.service.ent.consultantws.ConsultantNotificationGenerator;
import com.dossier.api.service.ent.jobs.OpportunityAssignmentService;
import com.dossier.api.service.ent.mkt.MktScope;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.privacy.SensitiveContentException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.Pageable;

/** MKT-44: {@code withdraw} (a reason is required, the consultant is told) and {@code reassign} (a declined or withdrawn opportunity goes to another consultant of the scope). */
class MktOpportunitiesWithdrawTest {

    static final Long ORG = 7L;
    static final Long ME = 70L;
    static final Instant NOW = Instant.parse("2026-10-14T12:00:00Z");

    MktScope scope = mock(MktScope.class);
    MktOpportunityRepository repo = mock(MktOpportunityRepository.class);
    MktOpportunityEventRepository events = mock(MktOpportunityEventRepository.class);
    OpportunityAssignmentService assignment = mock(OpportunityAssignmentService.class);
    ConsultantProfileRepository consultants = mock(ConsultantProfileRepository.class);
    ConsultantNotificationGenerator notifier = mock(ConsultantNotificationGenerator.class);
    OrgAuditService audit = mock(OrgAuditService.class);
    MktOpportunitiesService service;
    OrgMembership me = new OrgMembership(ORG, ME, 700L, "marketer", OrgRole.MARKETER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE);
    MktOpportunity opp;
    MktOpportunityRow row;
    List<MktOpportunityEvent> saved = new ArrayList<>();
    MktScope.View view = new MktScope.View(ORG, ME, false, Set.of(10L, 11L));

    @BeforeEach
    void wire() {
        service = new MktOpportunitiesService(
            scope, assignment, repo, events, mock(RequirementMatchRepository.class), consultants, mock(ClientRequirementRepository.class), mock(ClientAccountRepository.class),
            mock(ConsultantSkillRepository.class), mock(RequirementSkillRepository.class), mock(OrgMemberRepository.class), mock(UserRepository.class), audit, Clock.fixed(NOW, ZoneOffset.UTC)
        );
        service.setNotifier(notifier);
        lenient().when(scope.resolve(any(), eq(MktOpportunitiesService.PERMISSION))).thenAnswer(i -> view);
        org.mockito.Mockito.doAnswer(i -> {
            MktScope.View v = i.getArgument(0);
            if (!v.sees(i.getArgument(1))) throw new OrgNotFoundException();
            return null;
        }).when(scope).require(any(), any());
        opp = new MktOpportunity();
        opp.setId(901L);
        opp.setOrgId(ORG);
        opp.setMatchId(5L);
        opp.setState("ASSIGNED");
        row = row("ASSIGNED", "OPEN");
        lenient().when(repo.findRow(eq(ORG), eq(5L))).thenAnswer(i -> Optional.ofNullable(row));
        lenient().when(repo.findByOrgIdAndId(eq(ORG), eq(901L))).thenAnswer(i -> Optional.of(opp));
        lenient().when(repo.findResumeFacts(ORG)).thenReturn(List.of());
        lenient().when(events.save(any(MktOpportunityEvent.class))).thenAnswer(i -> {
            saved.add(i.getArgument(0));
            return i.getArgument(0);
        });
        lenient().when(events.recent(eq(ORG), any(Pageable.class))).thenReturn(List.of());
    }

    private static MktOpportunityRow row(String matchStatus, String jobStatus) {
        return new MktOpportunityRow(
            5L, 10L, "Alex Kim", 500L, "Java Engineer", "Austin, TX", "HYBRID", jobStatus, 3L, "Acme", 80, "fits", matchStatus, NOW.minus(Duration.ofDays(1)), NOW.minus(Duration.ofDays(2)),
            901L, "NO_RESPONSE", 9L, NOW.plus(Duration.ofDays(1)), null, null, NOW, 9L, "ASSIGNED"
        );
    }

    @Test
    void aReasonIsRequiredAndBounded() {
        for (String bad : new String[] { null, "", "   ", "r".repeat(201) }) {
            assertThatThrownBy(() -> service.withdraw(me, 5L, bad)).isInstanceOfSatisfying(OrgException.class, e -> {
                assertThat(e.getStatus()).isEqualTo(400);
                assertThat(e.getCode()).isEqualTo("VALIDATION");
            });
        }
        verify(assignment, never()).withdraw(any(), any(), anyLong(), anyString());
    }

    @Test
    void sensitiveTextInTheReasonIs422() {
        assertThatThrownBy(() -> service.withdraw(me, 5L, "His SSN is 123-45-6789")).isInstanceOf(SensitiveContentException.class);
        verify(assignment, never()).withdraw(any(), any(), anyLong(), anyString());
    }

    @Test
    void withdrawingClosesTheOpportunityWithTheReasonAndTellsTheConsultant() {
        var result = service.withdraw(me, 5L, "  The client paused hiring.  ");
        verify(assignment).withdraw(view, me, 901L, "The client paused hiring.");
        verify(notifier).push(eq(ORG), eq(10L), org.mockito.ArgumentMatchers.startsWith("withdrawn:901:"), eq("JOB_MATCH"), eq("Opportunity Withdrawn"), org.mockito.ArgumentMatchers.contains("The client paused hiring."),
            any(), any(), eq("/w/consultant/opportunities"), eq("OPPORTUNITY"), eq(5L));
        assertThat(result.changed()).isTrue();
        assertThat(result.message()).contains("Alex Kim");
    }

    @Test
    void aSuggestedOrStrangerRowCannotBeWithdrawn() {
        row = row("SUGGESTED", "OPEN");
        assertThatThrownBy(() -> service.withdraw(me, 5L, "why")).isInstanceOfSatisfying(OrgException.class, e -> assertThat(e.getCode()).isEqualTo("NOT_ASSIGNED"));
        row = new MktOpportunityRow(5L, 99L, "Stranger", 500L, "J", "L", "HYBRID", "OPEN", 3L, "Acme", 80, "fits", "ASSIGNED", NOW, NOW, 901L, "NO_RESPONSE", 9L, null, null, null, NOW, 9L, "ASSIGNED");
        assertThatThrownBy(() -> service.withdraw(me, 5L, "why")).isInstanceOf(OrgNotFoundException.class);
        verify(assignment, never()).withdraw(any(), any(), anyLong(), anyString());
    }

    @Test
    void onlyADeclinedOrWithdrawnOpportunityCanBeOfferedElsewhere() {
        assertThatThrownBy(() -> service.reassign(me, 5L, 11L)).isInstanceOfSatisfying(OrgException.class, e -> assertThat(e.getCode()).isEqualTo("NOT_REASSIGNABLE"));
        assertThatThrownBy(() -> service.reassign(me, 5L, 10L)).isInstanceOfSatisfying(OrgException.class, e -> assertThat(e.getStatus()).isEqualTo(400));
        assertThatThrownBy(() -> service.reassign(me, 5L, null)).isInstanceOfSatisfying(OrgException.class, e -> assertThat(e.getStatus()).isEqualTo(400));
        assertThatThrownBy(() -> service.reassign(me, 5L, 99L)).as("outside the caller's scope").isInstanceOf(OrgNotFoundException.class);
        verify(assignment, never()).assign(any(), any(), anyLong(), anyLong(), any());
    }

    @Test
    void aDeclinedOpportunityIsOfferedToAnotherConsultantOfTheScope() {
        opp.setState("DECLINED");
        ConsultantProfile other = new ConsultantProfile();
        other.setId(11L);
        other.setOrgId(ORG);
        other.setDisplayName("Priya Nair");
        when(consultants.findByOrgIdAndId(ORG, 11L)).thenReturn(Optional.of(other));
        when(assignment.assign(any(), any(), eq(500L), eq(11L), any())).thenReturn(new OpportunityAssignmentService.Result(6L, 902L, 500L, 11L, 70, true, false, false, null));
        MktOpportunityRow fresh = new MktOpportunityRow(6L, 11L, "Priya Nair", 500L, "Java Engineer", "Austin, TX", "HYBRID", "OPEN", 3L, "Acme", 70, "fits", "ASSIGNED", NOW, NOW, 902L, "NO_RESPONSE", 9L, null, null, null, NOW, 9L, "ASSIGNED");
        when(repo.findRow(ORG, 6L)).thenReturn(Optional.of(fresh));

        var result = service.reassign(me, 5L, 11L);

        assertThat(result.item().id()).isEqualTo(6L);
        assertThat(result.item().consultant().name()).isEqualTo("Priya Nair");
        assertThat(saved).singleElement().satisfies(e -> {
            assertThat(e.getKind()).isEqualTo("OFFERED_ELSEWHERE");
            assertThat(e.getText()).contains("Priya Nair");
        });
        verify(notifier, never()).push(any(), any(), anyString(), anyString(), anyString(), anyString(), any(), any(), any(), any(), any()); // a fresh pair is announced by the consultant's own feed
    }
}
