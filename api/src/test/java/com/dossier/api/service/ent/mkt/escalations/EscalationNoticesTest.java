package com.dossier.api.service.ent.mkt.escalations;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.enumeration.NotificationKind;
import com.dossier.api.domain.ent.talent.MarketerAssignment;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.ent.mgmt.TeamScopeRepository;
import com.dossier.api.repository.ent.talent.MarketerAssignmentRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.service.NotificationService;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * Telling the managers about NEW high-severity escalations (MM-04): only HIGH rows, only the managers of the marketer (line manager, same team or same department),
 * one digest notice per manager per run by default and one per escalation when the digest is off, never an e-mail, and a failure never undoes anything.
 */
class EscalationNoticesTest {

    static final Long ORG = 7L;

    OrgMemberRepository members = mock(OrgMemberRepository.class);
    TeamScopeRepository team = mock(TeamScopeRepository.class);
    MarketerAssignmentRepository assignments = mock(MarketerAssignmentRepository.class);
    EscalationSettings settings = mock(EscalationSettings.class);
    NotificationService feed = mock(NotificationService.class);
    EscalationNotices notices = new EscalationNotices(members, team, assignments, settings);

    OrgMember sam; // the marketer: team 5, department 3, line manager 90
    OrgMember priya; // manager 90: the line manager, another team
    OrgMember omar; // manager 91: same team 5
    OrgMember lee; // manager 92: another team and department

    static OrgMember seat(long id, long userId, Long teamId, Long departmentId, Long managerId) {
        OrgMember m = new OrgMember();
        m.setId(id);
        m.setOrgId(ORG);
        m.setUserId(userId);
        m.setTeamGroupId(teamId);
        m.setDepartmentGroupId(departmentId);
        m.setManagerMemberId(managerId);
        return m;
    }

    @BeforeEach
    void wire() {
        notices.setFeed(feed);
        sam = seat(70L, 700L, 5L, 3L, 90L);
        priya = seat(90L, 900L, 6L, 4L, null);
        omar = seat(91L, 910L, 5L, 4L, null);
        lee = seat(92L, 920L, 8L, 9L, null);
        when(team.findActiveMemberIdsWithRoleKeys(eq(ORG), anyCollection())).thenReturn(List.of(90L, 91L, 92L));
        when(members.findByOrgIdAndIdIn(eq(ORG), anyCollection())).thenReturn(List.of(priya, omar, lee));
        when(members.findByOrgIdAndId(ORG, 70L)).thenReturn(Optional.of(sam));
        when(settings.digest(ORG)).thenReturn(true);
        when(feed.publish(any(NotificationKind.class), any(), any())).thenReturn(Optional.of(new com.dossier.api.domain.Notification()));
    }

    static EscalationRules.Raised row(long id, String severity, Long marketer, Long consultant) {
        return new EscalationRules.Raised(id, severity, marketer, consultant, "Anika Rao asked about SWE II and is still waiting");
    }

    @Test
    void theManagersOfAMarketerAreTheLineManagerAndWhoSharesTheirTeamOrDepartment() {
        assertThat(EscalationNotices.manages(priya, sam)).as("line manager").isTrue();
        assertThat(EscalationNotices.manages(omar, sam)).as("same team").isTrue();
        assertThat(EscalationNotices.manages(lee, sam)).isFalse();
        OrgMember sameDepartment = seat(93L, 930L, 7L, 3L, null);
        assertThat(EscalationNotices.manages(sameDepartment, sam)).as("same department").isTrue();
        assertThat(EscalationNotices.manages(sam, sam)).as("nobody manages themselves").isFalse();
        assertThat(EscalationNotices.manages(lee, seat(71L, 710L, null, null, null))).as("a marketer with no team and no line manager has none").isFalse();
    }

    @Test
    void withTheDigestOnEachManagerGetsOneNoticeForTheRunAndOnlyHighRowsCount() {
        int sent = notices.notifyNewHigh(ORG, List.of(row(1, "HIGH", 70L, 10L), row(2, "HIGH", 70L, 11L), row(3, "MEDIUM", 70L, 10L), row(4, "LOW", 70L, 10L)));
        assertThat(sent).as("priya and omar, once each").isEqualTo(2);
        ArgumentCaptor<NotificationService.Payload> payload = ArgumentCaptor.forClass(NotificationService.Payload.class);
        verify(feed).publish(eq(NotificationKind.SYSTEM), eq(900L), payload.capture());
        verify(feed).publish(eq(NotificationKind.SYSTEM), eq(910L), any());
        verify(feed, never()).publish(any(NotificationKind.class), eq(920L), any());
        NotificationService.Payload p = payload.getValue();
        assertThat(p.title()).isEqualTo("2 new high-severity escalations in your team");
        assertThat(p.link()).isEqualTo("/w/marketing-mgmt/escalations");
        assertThat(p.dedupeKey()).isEqualTo("escalation-digest:7:90:1-2");
        assertThat(p.emailWorthy()).as("in-app only, never an e-mail").isFalse();
    }

    @Test
    void withTheDigestOffThereIsOneNoticeForEachEscalation() {
        when(settings.digest(ORG)).thenReturn(false);
        assertThat(notices.notifyNewHigh(ORG, List.of(row(1, "HIGH", 70L, 10L), row(2, "HIGH", 70L, 11L)))).isEqualTo(4);
        ArgumentCaptor<NotificationService.Payload> payload = ArgumentCaptor.forClass(NotificationService.Payload.class);
        verify(feed, times(4)).publish(any(NotificationKind.class), any(), payload.capture());
        assertThat(payload.getAllValues()).extracting(NotificationService.Payload::dedupeKey).containsExactlyInAnyOrder("escalation:1", "escalation:2", "escalation:1", "escalation:2");
    }

    @Test
    void aRowWithoutAMarketerUsesTheConsultantsMarketerAndOneWithNeitherIsNotSent() {
        MarketerAssignment a = new MarketerAssignment();
        a.setMarketerMemberId(70L);
        when(assignments.findByOrgIdAndConsultantId(ORG, 10L)).thenReturn(Optional.of(a));
        assertThat(notices.notifyNewHigh(ORG, List.of(row(1, "HIGH", null, 10L)))).isEqualTo(2);
        assertThat(notices.notifyNewHigh(ORG, List.of(row(2, "HIGH", null, 99L)))).isZero();
        assertThat(notices.notifyNewHigh(ORG, List.of(row(3, "HIGH", null, null)))).isZero();
    }

    @Test
    void nothingIsSentWithoutHighRowsWithoutManagersOrWithoutAFeedAndAFailureIsSwallowed() {
        assertThat(notices.notifyNewHigh(ORG, List.of(row(1, "MEDIUM", 70L, 10L)))).isZero();
        assertThat(notices.notifyNewHigh(ORG, List.of())).isZero();
        assertThat(notices.notifyNewHigh(ORG, null)).isZero();
        when(team.findActiveMemberIdsWithRoleKeys(eq(ORG), anyCollection())).thenReturn(List.of());
        assertThat(notices.notifyNewHigh(ORG, List.of(row(1, "HIGH", 70L, 10L)))).isZero();
        when(team.findActiveMemberIdsWithRoleKeys(eq(ORG), anyCollection())).thenThrow(new IllegalStateException("db down"));
        assertThat(notices.notifyNewHigh(ORG, List.of(row(1, "HIGH", 70L, 10L)))).isZero();
        EscalationNotices noFeed = new EscalationNotices(members, team, assignments, settings);
        assertThat(noFeed.notifyNewHigh(ORG, List.of(row(1, "HIGH", 70L, 10L)))).isZero();
    }
}
