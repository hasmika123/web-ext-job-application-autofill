package com.dossier.api.service.inbox;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import jakarta.mail.AuthenticationFailedException;
import jakarta.mail.Folder;
import jakarta.mail.Message;
import jakarta.mail.Store;
import jakarta.mail.UIDFolder;
import jakarta.mail.search.ComparisonTerm;
import jakarta.mail.search.ReceivedDateTerm;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.mock.env.MockEnvironment;

/**
 * The demo sandbox mailbox (ent-inbox): it stands in for Google's server on the demo stack and can never be live. Its address and codes are the test
 * values of {@code demo/inbox-demo.json}; its mail goes through the real sync, so it must look like a real IMAP folder to Jakarta Mail.
 */
class DemoImapGatewayTest {

    static final String CODE = "abcdefghijklmnop";

    private DemoImapGateway gateway() {
        return new DemoImapGateway(new MockEnvironment());
    }

    @Test
    void itIsInertUnlessTheDemoIsOnAndTheProdProfileIsOff() {
        assertThat(DemoImapGateway.class.getAnnotation(ConditionalOnProperty.class).prefix()).isEqualTo("dossier.demo");
        assertThat(DemoImapGateway.class.getAnnotation(ConditionalOnProperty.class).name()).containsExactly("enabled");
        assertThat(DemoImapGateway.class.getAnnotation(ConditionalOnProperty.class).havingValue()).isEqualTo("true");
        assertThat(DemoImapGateway.class.getAnnotation(Profile.class).value()).containsExactly("!prod");
        MockEnvironment prod = new MockEnvironment();
        prod.setActiveProfiles("prod");
        assertThatThrownBy(() -> new DemoImapGateway(prod)).as("even if a bean were forced, prod refuses").isInstanceOf(IllegalStateException.class);
    }

    @Test
    void theRealGatewayIsNeverASandbox() {
        assertThat(new JakartaImapGateway(new InboxProperties()).isDemoSandbox()).isFalse();
        assertThat(gateway().isDemoSandbox()).isTrue();
    }

    @Test
    void onlyTheDemoAddressConnectsWithAnySixteenLetters() {
        DemoImapGateway g = gateway();
        String address = g.demoAddress();
        assertThat(g.probe(address, CODE)).isEqualTo(new ImapGateway.Probe(ImapGateway.Outcome.OK, "[Gmail]/Sent Mail"));
        assertThat(g.probe(address.toUpperCase(), "wxyzwxyzwxyzwxyz").outcome()).isEqualTo(ImapGateway.Outcome.OK);
        assertThat(g.probe("someone.else@gmail.com", CODE).outcome()).as("no other mailbox exists").isEqualTo(ImapGateway.Outcome.BAD_CREDENTIALS);
    }

    @Test
    void theWrongCodePrefixesGiveTheCalmRefusals() {
        DemoImapGateway g = gateway();
        assertThat(g.probe(g.demoAddress(), "zzzzzzzzzzzzzzzz").outcome()).isEqualTo(ImapGateway.Outcome.BAD_CREDENTIALS);
        assertThat(g.probe(g.demoAddress(), "yyyyyyyyyyyyyyyy").outcome()).isEqualTo(ImapGateway.Outcome.APP_PASSWORD_REQUIRED);
        assertThatThrownBy(() -> g.open(g.demoAddress(), "zzzzzzzzzzzzzzzz")).isInstanceOf(AuthenticationFailedException.class);
    }

    @Test
    void theMailboxLooksLikeARealOneToTheSync() throws Exception {
        DemoImapGateway g = gateway();
        Store store = g.open(g.demoAddress(), CODE);
        Folder inbox = store.getFolder("INBOX");
        assertThat(inbox.exists()).isTrue();
        inbox.open(Folder.READ_ONLY);
        UIDFolder uf = (UIDFolder) inbox;

        // the first read searches by received date
        Message[] recent = inbox.search(new ReceivedDateTerm(ComparisonTerm.GE, Date.from(Instant.now().minus(Duration.ofDays(60)))));
        assertThat(recent).hasSize(inbox.getMessageCount()).isNotEmpty();
        Message first = recent[0];
        assertThat(first.getHeader("Message-ID")).isNotNull();
        assertThat(uf.getUID(first)).isPositive();
        assertThat(uf.getUIDValidity()).isEqualTo(1L);
        assertThat(MailText.of(first)).isNotBlank();

        // an ordinary read asks "after the highest UID I have"
        long last = uf.getUID(recent[recent.length - 1]);
        assertThat(uf.getMessagesByUID(last + 1, UIDFolder.LASTUID)).isEmpty();
        assertThat(uf.getMessagesByUID(last, UIDFolder.LASTUID)).hasSize(1);

        // the Sent folder is found by name; the mailbox is read-only
        String sent = g.sentFolder(store);
        assertThat(store.getFolder(sent).exists()).isTrue();
        assertThat(store.getFolder("Nope").exists()).isFalse();
        assertThatThrownBy(() -> store.getFolder("INBOX").open(Folder.READ_WRITE)).isInstanceOf(jakarta.mail.MessagingException.class);
        inbox.close(false);
        JakartaImapGateway.closeQuietly(store);
    }

    @Test
    void theSampleHasTheThreeKindsOfMailAndOneThatIsNotJobMail() throws Exception {
        DemoImapGateway g = gateway();
        Store store = g.open(g.demoAddress(), CODE);
        Folder inbox = store.getFolder("INBOX");
        inbox.open(Folder.READ_ONLY);
        StringBuilder subjects = new StringBuilder();
        for (int i = 1; i <= inbox.getMessageCount(); i++) subjects.append(inbox.getMessage(i).getSubject()).append('\n');
        assertThat(subjects.toString())
            .contains("Thank you for applying to Orbit Freight")
            .contains("Interview invitation: Platform Engineer at Orbit Freight")
            .contains("Update on your application to Cedar Analytics")
            .contains("Ten long articles for the weekend");
        // none of it can be read as a real person's mail: every address is on a reserved .example domain or the demo address
        for (int i = 1; i <= inbox.getMessageCount(); i++) {
            String from = ((jakarta.mail.internet.InternetAddress) inbox.getMessage(i).getFrom()[0]).getAddress();
            assertThat(from).endsWith(".example");
        }
    }
}
