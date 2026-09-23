package com.dossier.api.service.inbox;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.Application;
import com.dossier.api.domain.InboxConnection;
import com.dossier.api.domain.InboxFolderState;
import com.dossier.api.domain.InboxMessage;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.InboxConnectionRepository;
import com.dossier.api.repository.InboxFolderStateRepository;
import com.dossier.api.repository.InboxMessageRepository;
import com.icegreen.greenmail.store.MailFolder;
import com.icegreen.greenmail.user.GreenMailUser;
import com.icegreen.greenmail.util.GreenMail;
import com.icegreen.greenmail.util.ServerSetupTest;
import jakarta.mail.Flags;
import jakarta.mail.Message;
import jakarta.mail.Session;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeBodyPart;
import jakarta.mail.internet.MimeMessage;
import jakarta.mail.internet.MimeMultipart;
import java.net.ServerSocket;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Properties;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * Reading an inbox (Phase 14.3) against a real in-memory IMAP server (GreenMail): backfill, UID
 * increments, UIDVALIDITY, what's kept of each message, and how failures are recorded. The
 * repositories are in-memory fakes; the mail protocol is real.
 */
class InboxSyncServiceTest {

    private static final String ADDRESS = "jobs.hunt@gmail.com";
    private static final String PASSWORD = "abcdefghijklmnop";
    private static final Long USER = 7L;

    private GreenMail mail;
    private GreenMailUser user;
    private MailFolder inbox;
    private MailFolder sent;
    private SecretBox box;
    private InboxConnection connection;
    private boolean connected = true;
    private final List<InboxMessage> stored = new ArrayList<>();
    private final Map<String, InboxFolderState> folderStates = new HashMap<>();
    private InboxSyncService service;
    private InboxProperties props;

    @BeforeEach
    void setUp() throws Exception {
        mail = new GreenMail(ServerSetupTest.IMAP.dynamicPort());
        mail.start();
        user = mail.setUser(ADDRESS, ADDRESS, PASSWORD);
        inbox = mail.getManagers().getImapHostManager().getInbox(user);
        sent = mail.getManagers().getImapHostManager().createMailbox(user, "[Gmail]/Sent Mail");

        props = new InboxProperties();
        byte[] k = new byte[32];
        new SecureRandom().nextBytes(k);
        props.setKey(Base64.getEncoder().encodeToString(k));
        props.setImapHost("127.0.0.1");
        props.setImapPort(mail.getImap().getPort());
        props.setImapSsl(false);
        props.setTimeoutMs(5000);
        box = new SecretBox(props);

        connection = new InboxConnection(USER);
        connection.setAddress(ADDRESS);
        connection.setPasswordEnc(box.encrypt(PASSWORD, InboxService.context(USER)));

        InboxConnectionRepository connections = mock(InboxConnectionRepository.class);
        when(connections.findById(USER)).thenAnswer(inv -> connected ? Optional.of(connection) : Optional.empty());
        when(connections.existsById(USER)).thenAnswer(inv -> connected);
        when(connections.save(any(InboxConnection.class))).thenAnswer(inv -> inv.getArgument(0));

        InboxMessageRepository messages = mock(InboxMessageRepository.class);
        when(messages.existsByUserIdAndDedupKey(anyLong(), anyString())).thenAnswer(inv ->
            stored.stream().anyMatch(m -> m.getDedupKey().equals(inv.getArgument(1)))
        );
        when(messages.save(any(InboxMessage.class))).thenAnswer(inv -> {
            stored.add(inv.getArgument(0));
            return inv.getArgument(0);
        });
        when(messages.deleteByUser(USER)).thenAnswer(inv -> {
            int n = stored.size();
            stored.clear();
            return n;
        });

        InboxFolderStateRepository states = mock(InboxFolderStateRepository.class);
        when(states.findOneByUserIdAndFolder(anyLong(), anyString())).thenAnswer(inv -> Optional.ofNullable(folderStates.get((String) inv.getArgument(1))));
        when(states.save(any(InboxFolderState.class))).thenAnswer(inv -> {
            InboxFolderState s = inv.getArgument(0);
            folderStates.put(s.getFolder(), s);
            return s;
        });

        ApplicationRepository applications = mock(ApplicationRepository.class);
        Application acme = new Application().company("Acme Corp").roleTitle("Backend Engineer");
        when(applications.findByUserId(USER)).thenReturn(List.of(acme));

        service = new InboxSyncService(connections, states, messages, applications, new JakartaImapGateway(props), box, props);
    }

    @AfterEach
    void stop() {
        mail.stop();
    }

    private static MimeMessage message(String from, String to, String subject, String body) throws Exception {
        MimeMessage m = new MimeMessage(Session.getInstance(new Properties()));
        m.setFrom(new InternetAddress(from));
        m.setRecipient(Message.RecipientType.TO, new InternetAddress(to));
        m.setSubject(subject);
        m.setText(body);
        m.setSentDate(new Date());
        m.saveChanges();
        return m;
    }

    private static MimeMessage withAttachment(String from, String to, String subject, String body) throws Exception {
        MimeMessage m = new MimeMessage(Session.getInstance(new Properties()));
        m.setFrom(new InternetAddress(from));
        m.setRecipient(Message.RecipientType.TO, new InternetAddress(to));
        m.setSubject(subject);
        MimeBodyPart text = new MimeBodyPart();
        text.setText(body);
        MimeBodyPart file = new MimeBodyPart();
        file.setText("SECRET-ATTACHMENT-CONTENT");
        file.setFileName("offer-letter.txt");
        file.setDisposition(MimeBodyPart.ATTACHMENT);
        MimeMultipart mp = new MimeMultipart();
        mp.addBodyPart(text);
        mp.addBodyPart(file);
        m.setContent(mp);
        m.saveChanges();
        return m;
    }

    private void seed() throws Exception {
        inbox.appendMessage(
            withAttachment(
                "no-reply@us.greenhouse-mail.io",
                ADDRESS,
                "Thank you for applying to Acme",
                "Hi Sam,\n\nWe received your application for Backend Engineer.\n\nOn Mon, Sep 21, 2026 at 9:00 AM Sam wrote:\n> old stuff"
            ),
            new Flags(),
            new Date()
        );
        inbox.appendMessage(message("friend@example.com", ADDRESS, "Dinner Friday?", "See you at 7"), new Flags(), new Date());
        inbox.appendMessage(
            message("old@greenhouse-mail.io", ADDRESS, "Your application", "Too old"),
            new Flags(),
            Date.from(Instant.now().minus(Duration.ofDays(70)))
        );
        sent.appendMessage(message(ADDRESS, "jane@acmecorp.com", "Following up", "Hi Jane, following up on my application."), new Flags(), new Date());
    }

    private InboxMessage bySubject(String subject) {
        return stored.stream().filter(m -> subject.equals(m.getSubject())).findFirst().orElseThrow();
    }

    @Test
    void theFirstReadBackfillsAndKeepsBodiesOnlyForJobMail() throws Exception {
        seed();
        assertThat(service.sync(USER)).isEqualTo(InboxSyncService.Result.OK);

        assertThat(stored).extracting(InboxMessage::getSubject).containsExactlyInAnyOrder("Thank you for applying to Acme", "Dinner Friday?", "Following up");

        InboxMessage ats = bySubject("Thank you for applying to Acme");
        assertThat(ats.isJobMail()).isTrue();
        assertThat(ats.getDirection()).isEqualTo(InboxMessage.IN);
        assertThat(ats.getFromAddress()).isEqualTo("no-reply@us.greenhouse-mail.io");
        assertThat(ats.getBodyText()).contains("We received your application").doesNotContain("old stuff").doesNotContain("SECRET-ATTACHMENT");
        assertThat(ats.getMessageId()).isNotBlank();

        InboxMessage personal = bySubject("Dinner Friday?");
        assertThat(personal.isJobMail()).isFalse();
        assertThat(personal.getBodyText()).isNull(); // headers only

        InboxMessage mine = bySubject("Following up");
        assertThat(mine.getDirection()).isEqualTo(InboxMessage.OUT);
        assertThat(mine.isJobMail()).isTrue(); // to a tracked company's domain
        assertThat(mine.getToAddresses()).isEqualTo("jane@acmecorp.com");

        assertThat(connection.getStatus()).isEqualTo(InboxConnection.CONNECTED);
        assertThat(connection.getLastCheckedAt()).isNotNull();
        assertThat(connection.getSentFolder()).isEqualTo("[Gmail]/Sent Mail");
    }

    @Test
    void laterReadsTakeOnlyWhatsNew() throws Exception {
        seed();
        service.sync(USER);
        int before = stored.size();

        inbox.appendMessage(message("recruiter@acmecorp.com", ADDRESS, "Interview availability", "Are you free Tuesday?"), new Flags(), new Date());
        assertThat(service.sync(USER)).isEqualTo(InboxSyncService.Result.OK);
        assertThat(stored).hasSize(before + 1);
        assertThat(bySubject("Interview availability").isJobMail()).isTrue();

        assertThat(service.sync(USER)).isEqualTo(InboxSyncService.Result.OK);
        assertThat(stored).hasSize(before + 1); // nothing new, nothing doubled
    }

    @Test
    void aRenumberedFolderIsReadAgainWithoutDuplicates() throws Exception {
        seed();
        service.sync(USER);
        int before = stored.size();
        folderStates.get("INBOX").setUidValidity(-1); // as if the server had renumbered it
        assertThat(service.sync(USER)).isEqualTo(InboxSyncService.Result.OK);
        assertThat(stored).hasSize(before);
        assertThat(folderStates.get("INBOX").getUidValidity()).isNotEqualTo(-1);
    }

    @Test
    void aRejectedPasswordStopsReadingUntilReconnect() throws Exception {
        user.setPassword("somethingelseentirely");
        assertThat(service.sync(USER)).isEqualTo(InboxSyncService.Result.NEEDS_RECONNECT);
        assertThat(connection.getStatus()).isEqualTo(InboxConnection.NEEDS_RECONNECT);
        assertThat(service.sync(USER)).isEqualTo(InboxSyncService.Result.SKIPPED);
    }

    @Test
    void otherFailuresCountUpToError() throws Exception {
        try (ServerSocket s = new ServerSocket(0)) {
            props.setImapPort(s.getLocalPort());
        }
        for (int i = 1; i <= InboxSyncService.ERROR_AFTER; i++) {
            assertThat(service.sync(USER)).isEqualTo(InboxSyncService.Result.FAILED);
            assertThat(connection.getConsecutiveFailures()).isEqualTo(i);
        }
        assertThat(connection.getStatus()).isEqualTo(InboxConnection.ERROR);
        assertThat(connection.getLastError()).isEqualTo("Couldn't reach Gmail.");
    }

    @Test
    void aDisconnectDuringAReadLeavesNothingBehind() throws Exception {
        seed();
        connected = true;
        // Disconnect lands while the read is in flight: the final check sees it and cleans up.
        InboxConnectionRepository gone = mock(InboxConnectionRepository.class);
        when(gone.findById(USER)).thenReturn(Optional.of(connection));
        when(gone.existsById(USER)).thenReturn(false);
        InboxSyncService racing = new InboxSyncService(
            gone,
            mock(InboxFolderStateRepository.class, inv -> inv.getMethod().getName().startsWith("find") ? Optional.empty() : null),
            messagesRepoBackedBy(stored),
            mock(ApplicationRepository.class),
            new JakartaImapGateway(props),
            box,
            props
        );
        assertThat(racing.sync(USER)).isEqualTo(InboxSyncService.Result.SKIPPED);
        assertThat(stored).isEmpty();
    }

    private static InboxMessageRepository messagesRepoBackedBy(List<InboxMessage> list) {
        InboxMessageRepository r = mock(InboxMessageRepository.class);
        when(r.existsByUserIdAndDedupKey(anyLong(), anyString())).thenReturn(false);
        when(r.save(any(InboxMessage.class))).thenAnswer(inv -> {
            list.add(inv.getArgument(0));
            return inv.getArgument(0);
        });
        when(r.deleteByUser(USER)).thenAnswer(inv -> {
            int n = list.size();
            list.clear();
            return n;
        });
        return r;
    }

    @Test
    void theJobMailRules() {
        assertThat(JobMailRules.isJobMail(List.of("no-reply@myworkday.com"), null, "Hello", List.of())).isTrue();
        assertThat(JobMailRules.isJobMail(List.of("jane@acmecorp.com"), "Jane", "Quick question", List.of("Acme Corp"))).isTrue();
        assertThat(JobMailRules.isJobMail(List.of("hi@newsletter.io"), "Weekly", "Your application to Globex", List.of())).isTrue();
        assertThat(JobMailRules.isJobMail(List.of("mom@example.com"), "Mom", "Sunday lunch", List.of("Acme Corp"))).isFalse();
    }

    @Test
    void theTextCutsQuotedHistory() {
        assertThat(MailText.tidy("Thanks!\n\nOn Tue, Sep 22, 2026, Jane wrote:\n> earlier")).isEqualTo("Thanks!");
        assertThat(MailText.tidy("Line one\n> quoted\nLine two")).isEqualTo("Line one\nLine two");
    }
}
