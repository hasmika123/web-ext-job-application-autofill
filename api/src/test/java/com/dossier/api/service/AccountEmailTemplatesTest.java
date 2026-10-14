package com.dossier.api.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.context.support.ResourceBundleMessageSource;
import org.thymeleaf.context.Context;
import org.thymeleaf.spring6.SpringTemplateEngine;
import org.thymeleaf.templateresolver.ClassLoaderTemplateResolver;

/**
 * The two account e-mails (account created for an owner or an employee; password reset by an administrator) render complete in
 * every combination of branding, carry the alt text the layout promises and NEVER contain the temporary password. Previews are
 * written to {@code build/email-preview/*.html} so they can be looked at in a browser.
 */
class AccountEmailTemplatesTest {

    /** What the creator sees once in the UI; it is deliberately never given to the template, and no output may contain it. */
    private static final String SECRET = "Zq7!hTn4-Wm2+Rp9";

    private static SpringTemplateEngine engine;
    private static ResourceBundleMessageSource messages;
    private static final Path OUT = Path.of("build", "email-preview");

    @BeforeAll
    static void setUp() throws IOException {
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
        Files.createDirectories(OUT);
    }

    private String render(String template, Context c, String file) throws IOException {
        String html = engine.process(template, c);
        Files.writeString(OUT.resolve(file + ".html"), html, StandardCharsets.UTF_8);
        return html;
    }

    private Context created(boolean owner, TenantMailBrand brand, String name) {
        Context c = new Context(Locale.ENGLISH);
        c.setVariable("subject", "Your Acme Staffing account is ready");
        c.setVariable("name", name);
        c.setVariable("orgName", "Acme Staffing");
        c.setVariable("creatorName", owner ? "The Kiwiply team" : "Priya Nair");
        c.setVariable("roleLabel", "Recruiter");
        c.setVariable("owner", owner);
        c.setVariable("signInUrl", "https://acme.kiwiply.com/login");
        c.setVariable("expires", "21 Oct 2026");
        c.setVariable("brand", brand.brandHex());
        c.setVariable("bannerUrl", brand.bannerUrl());
        c.setVariable("logoUrl", brand.logoUrl());
        return c;
    }

    private Context reset(TenantMailBrand brand, String name) {
        Context c = new Context(Locale.ENGLISH);
        c.setVariable("subject", "Your password was reset");
        c.setVariable("name", name);
        c.setVariable("orgName", "Acme Staffing");
        c.setVariable("actorName", "Priya Nair");
        c.setVariable("signInUrl", "https://acme.kiwiply.com/login");
        c.setVariable("expires", "21 Oct 2026");
        c.setVariable("brand", brand.brandHex());
        c.setVariable("bannerUrl", brand.bannerUrl());
        c.setVariable("logoUrl", brand.logoUrl());
        return c;
    }

    private static void assertClean(String rendered) {
        String html = rendered.replaceAll("(?s)<!--.*?-->", ""); // the developer notes at the top of a template are not part of the mail
        assertThat(html).doesNotContainPattern("\\bth:[a-z]+=").doesNotContain("${").doesNotContain("#{").doesNotContain("??");
        assertThat(html).doesNotContain(SECRET).doesNotContain("password:").doesNotContainIgnoringCase("temporary password is");
        assertThat(html).contains("https://acme.kiwiply.com/login");
    }

    @Test
    void theOwnerEmailRendersWithTheKiwiplyDefaults() throws IOException {
        String html = render("mail/accountCreatedEmail", created(true, TenantMailBrand.KIWIPLY, "Olivia"), "account-created-owner-kiwiply");
        assertClean(html);
        assertThat(html).contains("Hi Olivia,").contains("made you its owner").contains("#4c7a1f").contains("Acme Staffing account is ready");
    }

    @Test
    void theEmployeeEmailNamesTheRoleAndTheCreator() throws IOException {
        String html = render("mail/accountCreatedEmail", created(false, new TenantMailBrand("#0b5fff", null, "https://acme.kiwiply.com/tenant-assets/logo"), "Sam"), "account-created-employee-branded");
        assertClean(html);
        assertThat(html).contains("Priya Nair added you to Acme Staffing as Recruiter.").contains("#0b5fff").contains("https://acme.kiwiply.com/tenant-assets/logo");
        assertThat(html).containsIgnoringCase("alt=");
    }

    @Test
    void aBannerImageAndAnAnonymousGreetingRender() throws IOException {
        String html = render("mail/accountCreatedEmail", created(false, new TenantMailBrand(null, "https://kiwiply.com/email/banner.png", null), null), "account-created-employee-banner");
        assertClean(html);
        assertThat(html).contains("Hi there,").contains("https://kiwiply.com/email/banner.png").containsIgnoringCase("alt=");
    }

    @Test
    void thePasswordResetEmailRendersBrandedAndPlain() throws IOException {
        String plain = render("mail/passwordResetByAdminEmail", reset(TenantMailBrand.KIWIPLY, "Sam"), "password-reset-kiwiply");
        assertClean(plain);
        assertThat(plain).contains("Priya Nair reset your Acme Staffing password.").contains("Your password was reset");
        String branded = render("mail/passwordResetByAdminEmail", reset(new TenantMailBrand("#7a1f4c", "https://kiwiply.com/email/banner.png", "https://acme.kiwiply.com/tenant-assets/logo"), null), "password-reset-branded");
        assertClean(branded);
        assertThat(branded).contains("#7a1f4c").containsIgnoringCase("alt=");
    }

    @Test
    void theMailServiceNeverPassesASecretToTheTemplates() {
        // The send methods take no password parameter at all: there is nothing to leak. Guard that signature.
        for (var m : MailService.class.getDeclaredMethods()) {
            if (m.getName().equals("sendAccountCreatedEmail") || m.getName().equals("sendAdminPasswordResetEmail")) {
                for (var p : m.getParameters()) assertThat(p.getName().toLowerCase(Locale.ROOT)).doesNotContain("password");
            }
        }
    }
}
