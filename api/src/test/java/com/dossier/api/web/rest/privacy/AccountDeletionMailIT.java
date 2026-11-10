package com.dossier.api.web.rest.privacy;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.User;
import com.dossier.api.domain.privacy.AccountDeletionRequest;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.privacy.AccountDeletionRequestRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.billing.StripeGateway;
import com.dossier.api.service.privacy.AccountDeletionRequestService;
import com.dossier.api.service.settings.AdminSettingKeys;
import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * The three account-deletion e-mails (T1.3): asked for, cancelled, erased. The mail transport is stubbed; the real {@code MailService} renders the real template, so the
 * subject, the recipient and the words are what a person would get. Each mail goes to the account's own address, carries no login or name, and the "deleted" mail is sent
 * only after the erasure succeeded.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class AccountDeletionMailIT {

    private static final String EMAIL = "user@localhost";

    @Autowired private MockMvc mvc;
    @Autowired private UserRepository users;
    @Autowired private AccountDeletionRequestRepository deletionRows;
    @Autowired private AccountDeletionRequestService deletionRequests;
    @Autowired private AppSettingRepository settingRows;
    @Autowired private ResumeBuilderSettings settings;

    @MockitoBean private JavaMailSender javaMailSender;
    @MockitoBean private StripeGateway stripeGateway;

    @BeforeEach
    void stubTransport() {
        doNothing().when(javaMailSender).send(any(MimeMessage.class));
        when(javaMailSender.createMimeMessage()).thenAnswer(i -> new MimeMessage((Session) null));
        Mockito.clearInvocations(javaMailSender);
    }

    @AfterEach
    void cleanUp() {
        settings.invalidate();
    }

    private List<MimeMessage> sent(int expected) {
        ArgumentCaptor<MimeMessage> captor = ArgumentCaptor.forClass(MimeMessage.class);
        verify(javaMailSender, times(expected)).send(captor.capture());
        return captor.getAllValues();
    }

    private static String body(MimeMessage m) throws Exception {
        return String.valueOf(m.getContent());
    }

    @Test
    void askingForDeletionSendsOneMailWithTheDateAndAskingAgainSendsNone() throws Exception {
        mvc.perform(post("/api/account/deletion-request").with(user("user"))).andExpect(status().isAccepted());
        mvc.perform(post("/api/account/deletion-request").with(user("user"))).andExpect(status().isAccepted()); // the same request: no second mail

        MimeMessage m = sent(1).get(0);
        assertThat(m.getAllRecipients()[0]).hasToString(EMAIL);
        assertThat(m.getSubject()).startsWith("Your Kiwiply account will be deleted on ").contains(" UTC");
        String html = body(m);
        assertThat(html).contains("scheduled for deletion").contains("Keep my account").contains("/settings").contains("Settings &gt; Privacy");
        assertThat(html).as("only the account's own address, no login or name").doesNotContain(EMAIL).doesNotContain("Hi user");
    }

    @Test
    void cancellingSendsTheCancelledMail() throws Exception {
        mvc.perform(post("/api/account/deletion-request").with(user("user"))).andExpect(status().isAccepted());
        mvc.perform(delete("/api/account/deletion-request").with(user("user"))).andExpect(status().isOk());

        List<MimeMessage> all = sent(2);
        assertThat(all.get(1).getSubject()).isEqualTo("Your Kiwiply account will not be deleted");
        assertThat(all.get(1).getAllRecipients()[0]).hasToString(EMAIL);
        assertThat(body(all.get(1))).contains("nothing was deleted");
    }

    @Test
    void theErasureAfterTheWindowSendsTheDeletedMailToTheAddressReadBeforeIt() throws Exception {
        Long id = users.findOneByLogin("user").map(User::getId).orElseThrow();
        mvc.perform(post("/api/account/deletion-request").with(user("user"))).andExpect(status().isAccepted());
        AccountDeletionRequest row = deletionRows.findByUserId(id).orElseThrow();
        row.setPurgeAfter(Instant.now().minusSeconds(60));
        deletionRows.saveAndFlush(row);

        assertThat(deletionRequests.purgeDue(Instant.now())).isEqualTo(1);

        assertThat(users.findOneByLogin("user")).as("the account is gone").isEmpty();
        List<MimeMessage> all = sent(2);
        MimeMessage last = all.get(1);
        assertThat(last.getAllRecipients()[0]).hasToString(EMAIL);
        assertThat(last.getSubject()).isEqualTo("Your Kiwiply account has been deleted");
        assertThat(body(last)).contains("permanently deleted").doesNotContain("Keep my account");
    }

    @Test
    void aZeroHourWindowErasesAtOnceAndSendsTheDeletedMail() throws Exception {
        settingRows.saveAndFlush(new AppSetting(AdminSettingKeys.PRIVACY_DELETION_GRACE_HOURS, "0", "mail-it", Instant.now()));
        settings.invalidate();

        mvc.perform(post("/api/account/deletion-request").with(user("user"))).andExpect(status().isOk());

        assertThat(users.findOneByLogin("user")).isEmpty();
        MimeMessage m = sent(1).get(0);
        assertThat(m.getAllRecipients()[0]).hasToString(EMAIL);
        assertThat(m.getSubject()).isEqualTo("Your Kiwiply account has been deleted");
    }

    @Test
    void aMailProblemNeverStandsInTheWayOfTheDeletionRequest() throws Exception {
        Mockito.doThrow(new org.springframework.mail.MailSendException("smtp down")).when(javaMailSender).send(any(MimeMessage.class));
        mvc.perform(post("/api/account/deletion-request").with(user("user"))).andExpect(status().isAccepted());
        assertThat(deletionRows.findByUserId(users.findOneByLogin("user").map(User::getId).orElseThrow())).isPresent();
    }
}
