package com.dossier.api.service.inbox;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
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
import com.dossier.api.service.ProRequiredException;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.Optional;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

/** Connecting a Gmail (Phase 14.1): what's refused before Gmail is asked, and what's stored. */
class InboxServiceTest {

    private InboxConnectionRepository connections;
    private EntitlementService entitlement;
    private ImapGateway imap;
    private SecretBox box;
    private InboxService service;
    private InboxMessageRepository messages;
    private InboxFolderStateRepository states;
    private ApplicationEventPublisher events;

    private static SecretBox box(boolean withKey) {
        InboxProperties p = new InboxProperties();
        if (withKey) {
            byte[] k = new byte[32];
            new SecureRandom().nextBytes(k);
            p.setKey(Base64.getEncoder().encodeToString(k));
        }
        return new SecretBox(p);
    }

    @BeforeEach
    void setUp() {
        connections = mock(InboxConnectionRepository.class);
        entitlement = mock(EntitlementService.class);
        imap = mock(ImapGateway.class);
        UserRepository users = mock(UserRepository.class);
        User u = new User();
        u.setId(7L);
        u.setLogin("user");
        when(users.findOneByLogin("user")).thenReturn(Optional.of(u));
        when(connections.findById(7L)).thenReturn(Optional.empty());
        when(connections.save(any(InboxConnection.class))).thenAnswer(inv -> inv.getArgument(0));
        box = box(true);
        messages = mock(InboxMessageRepository.class);
        states = mock(InboxFolderStateRepository.class);
        events = mock(ApplicationEventPublisher.class);
        service = new InboxService(connections, users, entitlement, box, imap, messages, states, events);
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken("user", "x"));
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void aWorkingPairIsStoredEncryptedAndBoundToTheUser() {
        when(imap.probe("jobs.hunt@gmail.com", "abcdefghijklmnop")).thenReturn(new ImapGateway.Probe(ImapGateway.Outcome.OK, "[Gmail]/Sent Mail"));

        InboxService.ConnectResult r = service.connect("  Jobs.Hunt@Gmail.com ", "abcd efgh ijkl mnop");

        assertThat(r.refusal()).isNull();
        assertThat(r.view().connected()).isTrue();
        assertThat(r.view().address()).isEqualTo("jobs.hunt@gmail.com");
        ArgumentCaptor<InboxConnection> saved = ArgumentCaptor.forClass(InboxConnection.class);
        verify(connections).save(saved.capture());
        InboxConnection c = saved.getValue();
        assertThat(c.getPasswordEnc()).startsWith("v1:").doesNotContain("abcd");
        assertThat(box.decrypt(c.getPasswordEnc(), "inbox:7")).isEqualTo("abcdefghijklmnop");
        assertThat(c.getSentFolder()).isEqualTo("[Gmail]/Sent Mail");
        assertThat(c.getStatus()).isEqualTo(InboxConnection.CONNECTED);
        verify(events).publishEvent(new InboxService.Connected(7L)); // the first read starts now
    }

    @Test
    void onlyConsumerGmailIsAccepted() {
        InboxService.ConnectResult r = service.connect("me@company.com", "abcdefghijklmnop");
        assertThat(r.refusal().code()).isEqualTo("NOT_GMAIL");
        assertThat(r.refusal().status()).isEqualTo(HttpStatus.BAD_REQUEST);
        verify(imap, never()).probe(anyString(), anyString());
    }

    @Test
    void aRealPasswordIsNeverSentToGmail() {
        InboxService.ConnectResult r = service.connect("jobs.hunt@gmail.com", "MyGooglePassword!2026");
        assertThat(r.refusal().code()).isEqualTo("APP_PASSWORD_FORMAT");
        verify(imap, never()).probe(anyString(), anyString());
        verify(connections, never()).save(any());
    }

    @Test
    void gmailsRefusalIsPassedOnAndNothingIsStored() {
        when(imap.probe(anyString(), anyString())).thenReturn(new ImapGateway.Probe(ImapGateway.Outcome.APP_PASSWORD_REQUIRED, null));
        InboxService.ConnectResult r = service.connect("jobs.hunt@gmail.com", "abcdefghijklmnop");
        assertThat(r.refusal().code()).isEqualTo("APP_PASSWORD_REQUIRED");
        assertThat(r.refusal().status()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
        assertThat(r.refusal().message()).contains("2-Step Verification");
        verify(connections, never()).save(any());
    }

    @Test
    void fiveTriesAQuarterHour() {
        when(imap.probe(anyString(), anyString())).thenReturn(new ImapGateway.Probe(ImapGateway.Outcome.BAD_CREDENTIALS, null));
        for (int i = 0; i < InboxService.MAX_ATTEMPTS; i++) {
            assertThat(service.connect("jobs.hunt@gmail.com", "abcdefghijklmnop").refusal().code()).isEqualTo("BAD_CREDENTIALS");
        }
        assertThat(service.connect("jobs.hunt@gmail.com", "abcdefghijklmnop").refusal().code()).isEqualTo("TOO_MANY_ATTEMPTS");
        assertThat(service.allowAttempt(99L, Instant.now())).isTrue(); // per user
    }

    @Test
    void noUsableKeyMeansNoConnecting() {
        InboxService off = new InboxService(connections, mock(UserRepository.class, inv -> {
            if (inv.getMethod().getName().equals("findOneByLogin")) {
                User u = new User();
                u.setId(7L);
                u.setLogin("user");
                return Optional.of(u);
            }
            return null;
        }), entitlement, box(false), imap, mock(InboxMessageRepository.class), mock(InboxFolderStateRepository.class), mock(ApplicationEventPublisher.class));
        assertThat(off.connect("jobs.hunt@gmail.com", "abcdefghijklmnop").refusal().code()).isEqualTo("UNAVAILABLE");
        assertThat(off.mine().available()).isFalse();
        verify(imap, never()).probe(anyString(), anyString());
    }

    @Test
    void itIsPro() {
        doThrow(new ProRequiredException(ProRequiredException.CODE_PRO_REQUIRED, "Pro")).when(entitlement).requirePro("user");
        assertThatThrownBy(() -> service.connect("jobs.hunt@gmail.com", "abcdefghijklmnop")).isInstanceOf(ProRequiredException.class);
        verify(imap, never()).probe(anyString(), anyString());
    }

    @Test
    void disconnectForgetsTheConnection() {
        InboxConnection c = new InboxConnection(7L);
        when(connections.findById(7L)).thenReturn(Optional.of(c));
        service.disconnect();
        verify(connections).delete(c);
        verify(messages).deleteByUser(7L);
        verify(states).deleteByUser(7L);
    }

    @Test
    void connectingADifferentGmailDropsTheOldMail() {
        InboxConnection old = new InboxConnection(7L);
        old.setAddress("old.jobs@gmail.com");
        when(connections.findById(7L)).thenReturn(Optional.of(old));
        when(imap.probe(anyString(), anyString())).thenReturn(new ImapGateway.Probe(ImapGateway.Outcome.OK, null));
        service.connect("new.jobs@gmail.com", "abcdefghijklmnop");
        verify(messages).deleteByUser(7L);
        verify(states).deleteByUser(7L);
    }
}
