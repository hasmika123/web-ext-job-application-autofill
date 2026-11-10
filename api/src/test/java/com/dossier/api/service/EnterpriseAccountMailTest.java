package com.dossier.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.User;
import com.dossier.api.service.ent.EnterpriseMailContext;
import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.context.support.ResourceBundleMessageSource;
import org.springframework.mail.javamail.JavaMailSender;
import org.thymeleaf.spring6.SpringTemplateEngine;
import org.thymeleaf.templateresolver.ClassLoaderTemplateResolver;
import tech.jhipster.config.JHipsterProperties;

/**
 * X2.10: the password-reset and notification / status e-mails of an ENTERPRISE account (a user row with an organization) wear the organization's
 * theme: its name or logo in the header, its colour, "this workspace" wording, a footer that links only to the organization's own policy pages and
 * never anything on kiwiply.com. A personal account's mail is byte-for-byte the one it always was.
 */
class EnterpriseAccountMailTest {

    private static SpringTemplateEngine engine;
    private static ResourceBundleMessageSource messages;

    private JavaMailSender sender;
    private MailService mail;
    private EnterpriseMailContext context;

    @BeforeAll
    static void setUp() {
        messages = new ResourceBundleMessageSource();
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
    }

    @BeforeEach
    void each() {
        sender = mock(JavaMailSender.class);
        when(sender.createMimeMessage()).thenAnswer(i -> new MimeMessage((Session) null));
        doNothing().when(sender).send(any(MimeMessage.class));
        JHipsterProperties props = new JHipsterProperties();
        props.getMail().setBaseUrl("https://kiwiply.com");
        props.getMail().setFrom("no-reply@kiwiply.com");
        mail = new MailService(props, sender, messages, engine);
        context = mock(EnterpriseMailContext.class);
        mail.setEnterpriseMail(context);
    }

    private static User user(Long orgId) {
        User u = new User();
        u.setLogin("ent#7:sam");
        u.setEmail("sam@acme.example");
        u.setFirstName("Sam");
        u.setLangKey("en");
        u.setResetKey("RESETKEY123");
        u.setOrgId(orgId);
        return u;
    }

    private static EnterpriseMailContext.Ctx acme(String policyBase, String logo) {
        return new EnterpriseMailContext.Ctx(7L, "Acme Staffing", new TenantMailBrand("#0a7d5a", logo), "https://acme.kiwiply.com", policyBase);
    }

    private String lastHtml() throws Exception {
        ArgumentCaptor<MimeMessage> captor = ArgumentCaptor.forClass(MimeMessage.class);
        verify(sender, times(1)).send(captor.capture());
        return flatten(captor.getValue().getContent());
    }

    private static String flatten(Object content) throws Exception {
        if (content instanceof String s) return s;
        if (content instanceof jakarta.mail.Multipart mp) {
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < mp.getCount(); i++) sb.append(flatten(mp.getBodyPart(i).getContent()));
            return sb.toString();
        }
        return String.valueOf(content);
    }

    private static List<String> hrefs(String html) {
        return java.util.regex.Pattern.compile("href=\"([^\"]*)\"").matcher(html.replaceAll("(?s)<!--.*?-->", "")).results().map(m -> m.group(1)).toList();
    }

    @Test
    void anEnterpriseAccountsResetMailIsTheOrganizationsOwnWithItsHostLinksOnly() throws Exception {
        when(context.forUser(any())).thenReturn(Optional.of(acme("https://acme.kiwiply.com", "https://acme.kiwiply.com/tenant-assets/logo")));
        mail.sendPasswordResetMail(user(7L), "https://acme.kiwiply.com");
        String html = lastHtml();
        assertThat(html).contains("Reset your Acme Staffing password").contains("workspace account").contains("https://acme.kiwiply.com/tenant-assets/logo");
        assertThat(hrefs(html)).contains("https://acme.kiwiply.com/reset-password?key=RESETKEY123", "https://acme.kiwiply.com/privacy", "https://acme.kiwiply.com/terms", "https://acme.kiwiply.com/support");
        assertThat(hrefs(html)).noneMatch(h -> h.contains("kiwiply.com") && !h.contains("acme.kiwiply.com"));
        assertThat(html).doesNotContain("Kiwiply account").doesNotContain("Find Jobs").doesNotContain("Security Tips");
        assertThat(html).contains("#0a7d5a");
    }

    @Test
    void withNoLogoTheHeaderIsTheOrganizationsNameAndWithNoHostThereAreNoPolicyLinksAtAll() throws Exception {
        when(context.forUser(any())).thenReturn(Optional.of(acme(null, null)));
        mail.sendPasswordResetMail(user(7L));
        String html = lastHtml();
        assertThat(html).contains(">Acme Staffing<");
        assertThat(hrefs(html)).noneMatch(h -> h.contains("/privacy") || h.contains("/terms") || h.contains("/support") || h.contains("/help"));
    }

    @Test
    void aPersonalAccountsResetMailIsUnchanged() throws Exception {
        when(context.forUser(any())).thenReturn(Optional.empty());
        mail.sendPasswordResetMail(user(null), "https://kiwiply.com");
        String html = lastHtml();
        // The personal reset mail is the legacy green template: its only link is the reset link (it never had a Help/Privacy/Terms footer).
        // "Unchanged" means exactly that: no organization theme, no tenant policy links, and the Kiwiply reset link.
        assertThat(hrefs(html)).containsExactly("https://kiwiply.com/reset-password?key=RESETKEY123");
        assertThat(html).contains("Kiwiply").doesNotContain("Acme Staffing").doesNotContain("this workspace");
    }

    @Test
    void anEnterpriseNotificationUsesTheOrganizationThemeAndItsWorkspaceLink() throws Exception {
        when(context.forUser(any())).thenReturn(Optional.of(acme("https://acme.kiwiply.com", null)));
        mail.sendNotificationEmail(user(7L), "Interview", "Interview scheduled", "Tuesday at 10:00", "https://acme.kiwiply.com/w/consultant");
        String html = lastHtml();
        assertThat(html).contains("Interview scheduled").contains("Open this workspace").contains("in this workspace");
        assertThat(hrefs(html)).contains("https://acme.kiwiply.com/w/consultant", "https://acme.kiwiply.com/privacy");
        assertThat(hrefs(html)).noneMatch(h -> h.startsWith("https://kiwiply.com"));
        assertThat(html).doesNotContain("Open Kiwiply");
    }

    @Test
    void anEnterpriseStatusMailUsesTheOrganizationTheme() throws Exception {
        when(context.forUser(any())).thenReturn(Optional.of(acme("https://acme.kiwiply.com", null)));
        mail.sendStatusChangeEmail(user(7L), "Globex", "Java Developer", "INTERVIEW", "https://acme.kiwiply.com/w/consultant");
        String html = lastHtml();
        assertThat(html).contains("Globex").contains("Java Developer").contains("Open this workspace");
        assertThat(hrefs(html)).noneMatch(h -> h.startsWith("https://kiwiply.com"));
        assertThat(html).doesNotContain("connected to Kiwiply");
    }

    @Test
    void aPersonalNotificationKeepsTheGreenKiwiplyTemplate() throws Exception {
        when(context.forUser(any())).thenReturn(Optional.empty());
        mail.sendNotificationEmail(user(null), "Interview", "Interview scheduled", "x", "https://kiwiply.com/board");
        String html = lastHtml();
        assertThat(html).contains("Open Kiwiply");
        assertThat(hrefs(html)).contains("https://kiwiply.com/privacy");
    }
}
