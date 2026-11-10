package com.dossier.api.service.privacy;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.User;
import com.dossier.api.domain.privacy.AccountDeletionRequest;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.privacy.AccountDeletionRequestRepository;
import com.dossier.api.service.AccountDeletionService;
import com.dossier.api.service.MailService;
import com.dossier.api.service.ResumeBuilderSettings;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import org.springframework.context.support.ResourceBundleMessageSource;
import org.springframework.transaction.PlatformTransactionManager;
import org.thymeleaf.context.Context;
import org.thymeleaf.spring6.SpringTemplateEngine;
import org.thymeleaf.templateresolver.ClassLoaderTemplateResolver;

/**
 * The account-deletion e-mails (T1.3), without a database: the order of the erasure and the "deleted" mail (never before, never after a failure), the mailer's tolerance of
 * a mail problem, and the template rendering for the three stages (previews are written to {@code build/email-preview}).
 */
class AccountDeletionMailTest {

    private static SpringTemplateEngine engine;
    private static final Path OUT = Path.of("build", "email-preview");

    @BeforeAll
    static void setUp() throws IOException {
        ResourceBundleMessageSource messages = new ResourceBundleMessageSource();
        messages.setBasename("i18n/messages");
        messages.setDefaultEncoding("UTF-8");
        ClassLoaderTemplateResolver resolver = new ClassLoaderTemplateResolver();
        resolver.setPrefix("templates/");
        resolver.setSuffix(".html");
        resolver.setCharacterEncoding("UTF-8");
        resolver.setTemplateMode("HTML");
        engine = new SpringTemplateEngine();
        engine.setTemplateResolver(resolver);
        engine.setTemplateEngineMessageSource(messages);
        Files.createDirectories(OUT);
    }

    // ---- ordering and failure ---------------------------------------------------------------------------------------------------------------

    private final AccountDeletionRequestRepository requests = mock(AccountDeletionRequestRepository.class);
    private final UserRepository users = mock(UserRepository.class);
    private final AccountDeletionService deletion = mock(AccountDeletionService.class);
    private final AccountDeletionMailer mailer = mock(AccountDeletionMailer.class);
    private final AccountDeletionRequestService service =
        new AccountDeletionRequestService(requests, users, deletion, mock(ResumeBuilderSettings.class), mock(PlatformTransactionManager.class), mailer);

    private User account() {
        User u = new User();
        u.setId(7L);
        u.setLogin("jo");
        u.setEmail("jo@example.com");
        return u;
    }

    private AccountDeletionRequest due() {
        AccountDeletionRequest r = new AccountDeletionRequest();
        r.setUserId(7L);
        r.setSource("SELF");
        r.setRequestedAt(Instant.now().minusSeconds(90_000));
        return r;
    }

    @Test
    void theDeletedMailIsSentAfterTheErasureToTheAddressReadBeforeIt() {
        when(requests.lockDue(any(), org.mockito.ArgumentMatchers.anyInt())).thenReturn(List.of(5L));
        when(requests.findById(5L)).thenReturn(Optional.of(due()));
        when(users.findById(7L)).thenReturn(Optional.of(account()));

        assertThat(service.purgeDue(Instant.now())).isEqualTo(1);

        InOrder order = inOrder(deletion, mailer);
        order.verify(deletion).deleteUserAccountByLogin(eq("jo"), eq("SELF"), any());
        order.verify(mailer).completed("jo@example.com");
    }

    @Test
    void aFailedErasureSendsNoDeletedMail() {
        when(requests.lockDue(any(), org.mockito.ArgumentMatchers.anyInt())).thenReturn(List.of(5L));
        when(requests.findById(5L)).thenReturn(Optional.of(due()));
        when(users.findById(7L)).thenReturn(Optional.of(account()));
        doThrow(new IllegalStateException("storage down")).when(deletion).deleteUserAccountByLogin(eq("jo"), any(), any());

        assertThat(service.purgeDue(Instant.now())).isZero();

        verify(mailer, never()).completed(any());
    }

    @Test
    void theImmediateErasureSendsTheDeletedMailOnlyWhenItSucceeded() {
        when(users.findById(7L)).thenReturn(Optional.of(account()));
        service.eraseNow(7L);
        InOrder order = inOrder(deletion, mailer);
        order.verify(deletion).deleteCurrentUserAccount();
        order.verify(mailer).completed("jo@example.com");

        AccountDeletionMailer other = mock(AccountDeletionMailer.class);
        AccountDeletionService failing = mock(AccountDeletionService.class);
        doThrow(new IllegalStateException("nope")).when(failing).deleteCurrentUserAccount();
        AccountDeletionRequestService s2 = new AccountDeletionRequestService(requests, users, failing, mock(ResumeBuilderSettings.class), mock(PlatformTransactionManager.class), other);
        try {
            s2.eraseNow(7L);
        } catch (IllegalStateException expected) {
            // the erasure failed, so nothing was said about it
        }
        verify(other, never()).completed(any());
    }

    @Test
    void theMailerNeverThrowsAndIgnoresAMissingAddress() {
        MailService mail = mock(MailService.class);
        AccountDeletionMailer real = new AccountDeletionMailer(mail);
        real.completed(null);
        real.cancelled("  ");
        verify(mail, never()).sendAccountDeletionEmail(any(), any(), any());

        doThrow(new IllegalStateException("template broke")).when(mail).sendAccountDeletionEmail(any(), any(), any());
        real.scheduled("jo@example.com", Instant.parse("2026-10-18T10:05:00Z")); // must not throw
        verify(mail).sendAccountDeletionEmail("jo@example.com", "SCHEDULED", "18 Oct 2026, 10:05 UTC");
    }

    // ---- the template ------------------------------------------------------------------------------------------------------------------------

    private String render(String stage, boolean scheduled) throws IOException {
        Context c = new Context(Locale.ENGLISH);
        String key = "email.deletion." + stage + ".";
        // the words come from the message bundle exactly as MailService resolves them
        ResourceBundleMessageSource m = new ResourceBundleMessageSource();
        m.setBasename("i18n/messages");
        m.setDefaultEncoding("UTF-8");
        Object[] args = scheduled ? new Object[] { "18 Oct 2026, 10:05 UTC" } : null;
        c.setVariable("subject", m.getMessage(key + "title", args, Locale.ENGLISH));
        c.setVariable("pre", m.getMessage(key + "pre", args, Locale.ENGLISH));
        c.setVariable("kicker", m.getMessage(key + "kicker", null, Locale.ENGLISH));
        c.setVariable("line1", m.getMessage(key + "l1", null, Locale.ENGLISH));
        c.setVariable("line2", m.getMessage(key + "l2", null, Locale.ENGLISH));
        c.setVariable("intro", m.getMessage(key + "intro", args, Locale.ENGLISH));
        c.setVariable("button", m.getMessage(key + "button", null, Locale.ENGLISH));
        c.setVariable("stripTitle", m.getMessage(key + "strip.title", null, Locale.ENGLISH));
        c.setVariable("stripText", m.getMessage(key + "strip.text", args, Locale.ENGLISH));
        c.setVariable("footer", m.getMessage(key + "notyou", null, Locale.ENGLISH));
        c.setVariable("link", "https://kiwiply.com/settings");
        c.setVariable("assetBase", "https://kiwiply.com/email");
        String html = engine.process("mail/accountDeletionEmail", c);
        Files.writeString(OUT.resolve("account-deletion-" + stage + ".html"), html, StandardCharsets.UTF_8);
        return html;
    }

    @Test
    void allThreeStagesRenderCompleteWithTheirOwnWordsAndNoPersonalData() throws IOException {
        String scheduled = render("scheduled", true);
        assertThat(scheduled).contains("scheduled for deletion").contains("18 Oct 2026, 10:05 UTC").contains("Keep my account").contains("https://kiwiply.com/settings");
        String cancelled = render("cancelled", false);
        assertThat(cancelled).contains("staying put").contains("nothing was deleted");
        String completed = render("completed", false);
        assertThat(completed).contains("permanently deleted").contains("Visit Kiwiply");
        for (String html : List.of(scheduled, cancelled, completed)) {
            assertThat(html).contains("Kiwiply").doesNotContain("th:text").doesNotContain("th:href").doesNotContain("${").doesNotContain("??").doesNotContain("@");
        }
    }
}
