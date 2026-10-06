package com.dossier.api.service.inbox;

import static org.assertj.core.api.Assertions.assertThat;

import com.icegreen.greenmail.user.GreenMailUser;
import com.icegreen.greenmail.util.GreenMail;
import com.icegreen.greenmail.util.ServerSetupTest;
import java.net.ServerSocket;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * The IMAP sign-in check against a real (in-memory) IMAP server — GreenMail — so the Jakarta Mail
 * wiring is exercised for real and Gmail is never called (Phase 14.1).
 */
class JakartaImapGatewayTest {

    private GreenMail mail;
    private JakartaImapGateway gateway;
    private GreenMailUser user;

    @BeforeEach
    void start() {
        mail = new GreenMail(ServerSetupTest.IMAP.dynamicPort());
        mail.start();
        user = mail.setUser("jobs.hunt@gmail.com", "jobs.hunt@gmail.com", "abcdefghijklmnop");
        gateway = new JakartaImapGateway(props(mail.getImap().getPort()));
    }

    @AfterEach
    void stop() {
        mail.stop();
    }

    private static InboxProperties props(int port) {
        InboxProperties p = new InboxProperties();
        p.setImapHost("127.0.0.1");
        p.setImapPort(port);
        p.setImapSsl(false);
        p.setTimeoutMs(5000);
        return p;
    }

    @Test
    void theRightPasswordSignsIn() {
        assertThat(gateway.probe("jobs.hunt@gmail.com", "abcdefghijklmnop").outcome()).isEqualTo(ImapGateway.Outcome.OK);
    }

    @Test
    void theSentFolderIsFoundByName() throws Exception {
        mail.getManagers().getImapHostManager().createMailbox(user, "[Gmail]/Sent Mail");
        ImapGateway.Probe p = gateway.probe("jobs.hunt@gmail.com", "abcdefghijklmnop");
        assertThat(p.outcome()).isEqualTo(ImapGateway.Outcome.OK);
        assertThat(p.sentFolder()).isEqualTo("[Gmail]/Sent Mail");
    }

    @Test
    void aWrongPasswordIsBadCredentials() {
        assertThat(gateway.probe("jobs.hunt@gmail.com", "zzzzzzzzzzzzzzzz").outcome()).isEqualTo(ImapGateway.Outcome.BAD_CREDENTIALS);
    }

    @Test
    void noServerIsUnreachable() throws Exception {
        int closed;
        try (ServerSocket s = new ServerSocket(0)) {
            closed = s.getLocalPort();
        }
        assertThat(new JakartaImapGateway(props(closed)).probe("jobs.hunt@gmail.com", "abcdefghijklmnop").outcome()).isEqualTo(
            ImapGateway.Outcome.UNREACHABLE
        );
    }

    @Test
    void gmailsRefusalsAreToldApart() {
        // The texts Gmail sends back, word for word.
        assertThat(JakartaImapGateway.classifyAuth("[AUTHENTICATIONFAILED] Invalid credentials (Failure)")).isEqualTo(
            ImapGateway.Outcome.BAD_CREDENTIALS
        );
        assertThat(
            JakartaImapGateway.classifyAuth(
                "[ALERT] Application-specific password required: https://support.google.com/accounts/answer/185833 (Failure)"
            )
        ).isEqualTo(ImapGateway.Outcome.APP_PASSWORD_REQUIRED);
        assertThat(JakartaImapGateway.classifyAuth("[ALERT] Please log in via your web browser: https://support.google.com/mail/accounts/answer/78754 (Failure)")).isEqualTo(
            ImapGateway.Outcome.WEB_LOGIN_REQUIRED
        );
        assertThat(JakartaImapGateway.classifyAuth("[ALERT] Your account is not enabled for IMAP use.")).isEqualTo(ImapGateway.Outcome.IMAP_DISABLED);
    }
}
