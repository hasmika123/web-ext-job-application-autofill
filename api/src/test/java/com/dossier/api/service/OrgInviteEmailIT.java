package com.dossier.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.IntegrationTest;
import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

/**
 * O2.2 InviteEmailTest: the invite email says who invited you, to what, as what, what the org pays for, when the link stops
 * working, carries one button with the one-time link, and ends with the "Not you?" line (onboarding-invites.md section 3.2).
 */
@IntegrationTest
class OrgInviteEmailIT {

    @MockitoBean private JavaMailSender javaMailSender;
    @Autowired private MailService mailService;

    @BeforeEach
    void setup() {
        doNothing().when(javaMailSender).send(any(MimeMessage.class));
        when(javaMailSender.createMimeMessage()).thenReturn(new MimeMessage((Session) null));
    }

    private MimeMessage send(String name, String inviter, List<String> pays) throws Exception {
        mailService.sendOrgInviteEmail("aarav@example.org", name, "Acme Bootcamp", inviter, "a member", pays, "https://kiwiply.com/join/t/AbC123", "28 Oct 2026");
        ArgumentCaptor<MimeMessage> captor = ArgumentCaptor.forClass(MimeMessage.class);
        verify(javaMailSender).send(captor.capture());
        return captor.getValue();
    }

    @Test
    void theEmailNamesTheInviterTheOrgTheRoleTheLinkTheExpiryAndHasTheNotYouLine() throws Exception {
        MimeMessage m = send("Aarav", "Priya Nair", List.of());
        assertThat(m.getSubject()).isEqualTo("Priya Nair invited you to join Acme Bootcamp on Kiwiply");
        assertThat(m.getAllRecipients()[0]).hasToString("aarav@example.org");
        String html = (String) m.getContent();
        assertThat(html)
            .contains("Hi Aarav,")
            .contains("Priya Nair invited you to join Acme Bootcamp on Kiwiply as a member.")
            .contains("You keep your own account, resumes and applications.")
            .contains("a progress summary, or only that you joined")
            .contains("href=\"https://kiwiply.com/join/t/AbC123\"")
            .contains("Join Acme Bootcamp")
            .contains("This link works until 28 Oct 2026.")
            .contains("Not you? Ignore this email. We will not email you again about this invite.")
            .doesNotContain("pays for");
    }

    @Test
    void withoutAnInviterNameTheTeamIsNamedAndWithoutAGreetingNameItIsHiThere() throws Exception {
        MimeMessage m = send(null, null, List.of());
        assertThat(m.getSubject()).isEqualTo("You are invited to join Acme Bootcamp on Kiwiply");
        assertThat((String) m.getContent()).contains("Hi there,").contains("The Acme Bootcamp team invited you to join Acme Bootcamp");
    }

    @Test
    void whenTheOrgPaysForSomethingTheEmailSaysSo() throws Exception {
        MimeMessage m = send("Aarav", "Priya Nair", List.of("Pro", "AI Interview Practice"));
        assertThat((String) m.getContent()).contains("Acme Bootcamp pays for: Pro, AI Interview Practice.");
    }

    @Test
    void markupInANameIsEscapedNotRendered() throws Exception {
        MimeMessage m = send("<script>alert(1)</script>", "<b>x</b>", List.of());
        assertThat((String) m.getContent()).doesNotContain("<script>alert(1)</script>").doesNotContain("<b>x</b>");
    }
}
