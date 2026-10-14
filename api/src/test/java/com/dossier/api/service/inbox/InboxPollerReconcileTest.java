package com.dossier.api.service.inbox;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.InboxConnection;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.InboxConnectionRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * The poller never reads silently (ent-inbox): a connection is read only while the personal plan or a live organization license grants inbox
 * tracking; when neither does it is marked NO_ENTITLEMENT and left alone; it comes back by itself if the grant returns; and a connection made through
 * an organization is purged when that seat has ended, while a personal one never is.
 */
class InboxPollerReconcileTest {

    static final Long USER = 7L;
    static final Long ORG = 1L;

    InboxConnectionRepository connections = mock(InboxConnectionRepository.class);
    UserRepository users = mock(UserRepository.class);
    InboxEntitlement entitlement = mock(InboxEntitlement.class);
    OrgMemberRepository members = mock(OrgMemberRepository.class);
    InboxService service = mock(InboxService.class);
    InboxSyncService sync = mock(InboxSyncService.class);
    InboxPoller poller;
    InboxConnection c;

    @BeforeEach
    void setUp() {
        User u = new User();
        u.setId(USER);
        u.setLogin("anika");
        when(users.findById(USER)).thenReturn(Optional.of(u));
        poller = new InboxPoller(connections, users, entitlement, members, service, sync, mock(SecretBox.class));
        c = new InboxConnection(USER);
        c.setStatus(InboxConnection.CONNECTED);
        c.setConnectedViaOrgId(ORG);
        when(members.findMine(USER)).thenReturn(List.of(seat(OrgMemberStatus.ACTIVE)));
    }

    static OrgMember seat(OrgMemberStatus s) {
        OrgMember m = new OrgMember();
        m.setId(11L);
        m.setOrgId(ORG);
        m.setStatus(s);
        return m;
    }

    @Test
    void aGrantedConnectionIsRead() {
        when(entitlement.decide(USER, "anika")).thenReturn(new InboxEntitlement.Decision(InboxEntitlement.Ground.ORGANIZATION, ORG));
        assertThat(poller.reconcile(c)).isTrue();
        assertThat(c.getStatus()).isEqualTo(InboxConnection.CONNECTED);
    }

    @Test
    void whenNothingGrantsItAnymoreItStopsAndSaysWhy() {
        when(entitlement.decide(USER, "anika")).thenReturn(new InboxEntitlement.Decision(InboxEntitlement.Ground.NONE, null));
        assertThat(poller.reconcile(c)).as("must never keep reading silently").isFalse();
        assertThat(c.getStatus()).isEqualTo(InboxConnection.NO_ENTITLEMENT);
        assertThat(c.getLastError()).isEqualTo("Your organization no longer includes inbox tracking.");
        verify(connections).save(c);
        verify(service, never()).purgeConnectedVia(anyLong(), anyLong());
    }

    @Test
    void aStoppedConnectionComesBackWhenTheGrantReturns() {
        c.setStatus(InboxConnection.NO_ENTITLEMENT);
        c.setLastError("Your organization no longer includes inbox tracking.");
        c.setConsecutiveFailures(3);
        when(entitlement.decide(USER, "anika")).thenReturn(new InboxEntitlement.Decision(InboxEntitlement.Ground.ORGANIZATION, ORG));
        assertThat(poller.reconcile(c)).isTrue();
        assertThat(c.getStatus()).isEqualTo(InboxConnection.CONNECTED);
        assertThat(c.getLastError()).isNull();
        assertThat(c.getConsecutiveFailures()).isZero();
    }

    @Test
    void aPersonalConnectionThatLostProIsStoppedWithTheProSentence() {
        c.setConnectedViaOrgId(null);
        when(entitlement.decide(USER, "anika")).thenReturn(new InboxEntitlement.Decision(InboxEntitlement.Ground.NONE, null));
        assertThat(poller.reconcile(c)).isFalse();
        assertThat(c.getStatus()).isEqualTo(InboxConnection.NO_ENTITLEMENT);
        assertThat(c.getLastError()).isEqualTo("Inbox tracking is part of Pro.");
    }

    @Test
    void aPasswordGoogleRefusedStaysWaitingForTheUserNotRelabelled() {
        c.setStatus(InboxConnection.NEEDS_RECONNECT);
        when(entitlement.decide(USER, "anika")).thenReturn(new InboxEntitlement.Decision(InboxEntitlement.Ground.NONE, null));
        assertThat(poller.reconcile(c)).isFalse();
        assertThat(c.getStatus()).isEqualTo(InboxConnection.NEEDS_RECONNECT);
    }

    @Test
    void aConnectionMadeThroughAnOrganizationIsPurgedWhenTheSeatHasEnded() {
        for (OrgMemberStatus ended : List.of(OrgMemberStatus.REMOVED, OrgMemberStatus.LEFT, OrgMemberStatus.ERASED)) {
            when(members.findMine(USER)).thenReturn(List.of(seat(ended)));
            assertThat(poller.reconcile(c)).as(ended.name()).isFalse();
        }
        verify(service, org.mockito.Mockito.times(3)).purgeConnectedVia(USER, ORG);
        when(members.findMine(USER)).thenReturn(List.of());
        assertThat(poller.reconcile(c)).isFalse();
    }

    @Test
    void aSuspendedSeatIsStoppedButNotPurged() {
        when(members.findMine(USER)).thenReturn(List.of(seat(OrgMemberStatus.SUSPENDED)));
        when(entitlement.decide(USER, "anika")).thenReturn(new InboxEntitlement.Decision(InboxEntitlement.Ground.NONE, null));
        assertThat(poller.reconcile(c)).isFalse();
        assertThat(c.getStatus()).isEqualTo(InboxConnection.NO_ENTITLEMENT);
        verify(service, never()).purgeConnectedVia(anyLong(), anyLong());
    }

    @Test
    void aPersonalConnectionIsNeverPurgedByAnOrganizationAction() {
        c.setConnectedViaOrgId(null);
        when(members.findMine(USER)).thenReturn(List.of(seat(OrgMemberStatus.REMOVED)));
        when(entitlement.decide(USER, "anika")).thenReturn(new InboxEntitlement.Decision(InboxEntitlement.Ground.PERSONAL, null));
        assertThat(poller.reconcile(c)).isTrue();
        verify(service, never()).purgeConnectedVia(anyLong(), any());
    }
}
