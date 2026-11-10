package com.dossier.api.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Locale;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.context.support.ResourceBundleMessageSource;
import org.thymeleaf.context.Context;
import org.thymeleaf.spring6.SpringTemplateEngine;
import org.thymeleaf.templateresolver.ClassLoaderTemplateResolver;

/**
 * Link audit (docs/enterprise-v2/62 section 5): the footer of every ENTERPRISE-theme e-mail links to the organization's own policy pages
 * on its host, never to kiwiply.com. With no host known it shows no policy links at all rather than Kiwiply's. The personal (green)
 * theme keeps its Kiwiply links.
 */
class EnterpriseMailFooterTest {

    private static SpringTemplateEngine engine;

    @BeforeAll
    static void setUp() {
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
    }

    private static Context accountContext(String policyBase) {
        Context c = new Context(Locale.ENGLISH);
        c.setVariable("name", "Sam");
        c.setVariable("orgName", "Acme Staffing");
        c.setVariable("email", "sam@example.test");
        c.setVariable("signInUrl", "https://acme.kiwiply.com/login");
        c.setVariable("expires", "21 Oct 2026");
        c.setVariable("theme", "enterprise");
        c.setVariable("assetBase", "https://kiwiply.com/email");
        c.setVariable("subject", "Your account");
        c.setVariable("creatorName", "Priya");
        c.setVariable("roleLabel", "Recruiter");
        c.setVariable("owner", false);
        c.setVariable("actorName", "Priya");
        if (policyBase != null) c.setVariable("policyBase", policyBase);
        return c;
    }

    private static List<String> hrefs(String html) {
        return java.util.regex.Pattern.compile("href=\"([^\"]*)\"").matcher(html.replaceAll("(?s)<!--.*?-->", "")).results().map(m -> m.group(1)).toList();
    }

    @Test
    void organizationMailFooterLinksToTheTenantHostsPolicyPages() {
        for (String template : List.of("mail/accountCreatedEmail", "mail/passwordResetByAdminEmail")) {
            String html = engine.process(template, accountContext("https://acme.kiwiply.com"));
            assertThat(hrefs(html)).as(template).contains("https://acme.kiwiply.com/privacy", "https://acme.kiwiply.com/terms", "https://acme.kiwiply.com/support");
            assertThat(hrefs(html)).as(template).noneMatch(h -> h.startsWith("https://kiwiply.com"));
            assertThat(html).as(template).doesNotContain("Kiwiply - kiwiply.com").doesNotContain("activity on your Kiwiply account");
        }
    }

    @Test
    void withNoTenantHostThereAreNoKiwiplyPolicyLinksEither() {
        String html = engine.process("mail/accountCreatedEmail", accountContext(null));
        assertThat(hrefs(html)).noneMatch(h -> h.contains("/privacy") || h.contains("/terms") || h.contains("/help"));
    }

    @Test
    void thePersonalThemeKeepsItsKiwiplyLinks() {
        Context c = new Context(Locale.ENGLISH);
        c.setVariable("user", new com.dossier.api.domain.User());
        c.setVariable("baseUrl", "https://kiwiply.com");
        c.setVariable("subject", "x");
        c.setVariable("kind", "APP_STATUS");
        c.setVariable("name", "Sam");
        c.setVariable("body", "b");
        c.setVariable("link", "https://kiwiply.com/board");
        String html = engine.process("mail/notificationEmail", c);
        assertThat(hrefs(html)).contains("https://kiwiply.com/privacy", "https://kiwiply.com/terms");
    }
}
