package com.dossier.api.service.inbox;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.InboxConnection;
import com.dossier.api.domain.User;
import com.dossier.api.repository.InboxConnectionRepository;
import com.dossier.api.repository.InboxFolderStateRepository;
import com.dossier.api.repository.InboxMessageRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.service.EntitlementService;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.Optional;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

/**
 * Connecting through an organization license (ent-inbox): the organization comes from the caller (the host), the license must grant the feature, the
 * connection remembers which organization made it possible, and an organization action can never reach a connection made on the personal plan.
 */
class InboxServiceViaOrgTest {

    static final Long USER = 7L;
    static final Long ORG = 1L;
    static final String ADDRESS = "jobs.hunt@gmail.com";
    static final String CODE = "abcdefghijklmnop";

    InboxConnectionRepository connections = mock(InboxConnectionRepository.class);
    EntitlementService personal = mock(EntitlementService.class);
    InboxEntitlement orgEntitlement = mock(InboxEntitlement.class);
    ImapGateway imap = mock(ImapGateway.class);
    InboxMessageRepository messages = mock(InboxMessageRepository.class);
    InboxFolderStateRepository states = mock(InboxFolderStateRepository.class);
    InboxService service;

    @BeforeEach
    void setUp() {
        UserRepository users = mock(UserRepository.class);
        User u = new User();
        u.setId(USER);
        u.setLogin("anika");
        when(users.findOneByLogin("anika")).thenReturn(Optional.of(u));
        when(connections.findById(USER)).thenReturn(Optional.empty());
        when(connections.save(any(InboxConnection.class))).thenAnswer(inv -> inv.getArgument(0));
        byte[] k = new byte[32];
        new SecureRandom().nextBytes(k);
        InboxProperties p = new InboxProperties();
        p.setKey(Base64.getEncoder().encodeToString(k));
        service = new InboxService(connections, users, personal, orgEntitlement, new SecretBox(p), imap, messages, states, mock(ApplicationEventPublisher.class));
        when(imap.probe(anyString(), anyString())).thenReturn(new ImapGateway.Probe(ImapGateway.Outcome.OK, "[Gmail]/Sent Mail"));
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken("anika", "x"));
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void aLicenseThatGrantsItConnectsAndRemembersTheOrganization() {
        when(orgEntitlement.orgGrants(ORG, USER)).thenReturn(true);
        var r = service.connect(ADDRESS, CODE, ORG);
        assertThat(r.refusal()).isNull();
        var saved = org.mockito.ArgumentCaptor.forClass(InboxConnection.class);
        verify(connections).save(saved.capture());
        assertThat(saved.getValue().getConnectedViaOrgId()).isEqualTo(ORG);
        assertThat(saved.getValue().getPasswordEnc()).startsWith("v1:").doesNotContain(CODE);
        verify(personal, never()).requirePro(anyString()); // the personal plan was not asked
    }

    @Test
    void aLicenseThatLacksItIsRefusedWith402AndGmailIsNeverAsked() {
        when(orgEntitlement.orgGrants(ORG, USER)).thenReturn(false);
        var r = service.connect(ADDRESS, CODE, ORG);
        assertThat(r.refusal().code()).isEqualTo("FEATURE_NOT_LICENSED");
        assertThat(r.refusal().status()).isEqualTo(HttpStatus.PAYMENT_REQUIRED);
        verify(imap, never()).probe(anyString(), anyString());
        verify(connections, never()).save(any());
    }

    @Test
    void thePersonalRouteStillNeedsPro() {
        service.connect(ADDRESS, CODE);
        verify(personal).requirePro("anika");
        verify(orgEntitlement, never()).orgGrants(any(), any());
    }

    @Test
    void theSameGmailAlreadyConnectedOnThePersonalPlanStaysPersonal() {
        InboxConnection existing = new InboxConnection(USER);
        existing.setAddress(ADDRESS);
        existing.setPasswordEnc("v1:x");
        existing.setConnectedViaOrgId(null);
        when(connections.findById(USER)).thenReturn(Optional.of(existing));
        when(orgEntitlement.orgGrants(ORG, USER)).thenReturn(true);
        service.connect(ADDRESS, CODE, ORG);
        assertThat(existing.getConnectedViaOrgId()).as("an organization action never claims a personal connection").isNull();
    }

    @Test
    void aDifferentGmailThroughTheOrganizationIsTheOrganizationsToPurge() {
        InboxConnection existing = new InboxConnection(USER);
        existing.setAddress("old.address@gmail.com");
        existing.setPasswordEnc("v1:x");
        when(connections.findById(USER)).thenReturn(Optional.of(existing));
        when(orgEntitlement.orgGrants(ORG, USER)).thenReturn(true);
        service.connect(ADDRESS, CODE, ORG);
        assertThat(existing.getConnectedViaOrgId()).isEqualTo(ORG);
        verify(messages).deleteByUser(USER); // nothing read from the old account stays
    }

    @Test
    void purgeConnectedViaForgetsOnlyAConnectionMadeThroughThatOrganization() {
        InboxConnection viaOrg = new InboxConnection(USER);
        viaOrg.setConnectedViaOrgId(ORG);
        when(connections.findById(USER)).thenReturn(Optional.of(viaOrg));
        assertThat(service.purgeConnectedVia(USER, ORG)).isTrue();
        verify(connections).delete(viaOrg);
        verify(messages).deleteByUser(USER);
        verify(states).deleteByUser(USER);
    }

    @Test
    void purgeConnectedViaLeavesAPersonalOrAnotherOrganizationsConnectionAlone() {
        InboxConnection personalOne = new InboxConnection(USER);
        when(connections.findById(USER)).thenReturn(Optional.of(personalOne));
        assertThat(service.purgeConnectedVia(USER, ORG)).isFalse();
        personalOne.setConnectedViaOrgId(99L);
        assertThat(service.purgeConnectedVia(USER, ORG)).isFalse();
        assertThat(service.purgeConnectedVia(USER, null)).isFalse();
        verify(connections, never()).delete(any());
        verify(messages, never()).deleteByUser(any());
    }
}
