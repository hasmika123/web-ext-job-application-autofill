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
 * every combination of branding, carry the alt text the layout promises, show the person's login details and NEVER contain the
 * temporary password. Previews are written to {@code build/email-preview/*.html} so they can be looked at in a browser.
 */
class AccountEmailTemplatesTest {

    /** What the creator sees once in the UI; it is deliberately never given to the template, and no output may contain it. */
    private static final String SECRET = "Zq7!hTn4-Wm2+Rp9";
    private static final String ASSETS = "https://kiwiply.com/email";
    private static final String SIGN_IN = "https://acme.kiwiply.com/login";

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

    private String render(String template, Context c, String file) throws IOException {
        String html = engine.process(template, c);
        Files.writeString(OUT.resolve(file + ".html"), html, StandardCharsets.UTF_8);
        return html;
    }

    private static void common(Context c, String email, String name, TenantMailBrand brand) {
        c.setVariable("name", name);
        c.setVariable("orgName", "Acme Staffing");
        c.setVariable("email", email);
        c.setVariable("signInUrl", SIGN_IN);
        c.setVariable("expires", "21 Oct 2026");
        c.setVariable("theme", "enterprise");
        c.setVariable("assetBase", ASSETS);
        c.setVariable("brand", brand.brandHex());
        c.setVariable("logoUrl", brand.logoUrl());
    }

    private Context created(boolean owner, TenantMailBrand brand, String name, String workspace) {
        Context c = new Context(Locale.ENGLISH);
        common(c, "sam@example.test", name, brand);
        c.setVariable("subject", "Your Acme Staffing account is ready");
        c.setVariable("creatorName", owner ? "The Kiwiply team" : "Priya Nair");
        c.setVariable("roleLabel", owner ? "Owner" : "Recruiter");
        c.setVariable("workspaceLabel", workspace);
        c.setVariable("owner", owner);
        return c;
    }

    private Context reset(TenantMailBrand brand, String name) {
        Context c = new Context(Locale.ENGLISH);
        common(c, "sam@example.test", name, brand);
        c.setVariable("subject", "Your password was reset");
        c.setVariable("actorName", "Priya Nair");
        return c;
    }

    private static String body(String rendered) {
        return rendered.replaceAll("(?s)<!--.*?-->", ""); // the developer notes at the top of a template are not part of the mail
    }

    private static void assertClean(String rendered) {
        String html = body(rendered);
        assertThat(html).doesNotContainPattern("\\bth:[a-z]+=").doesNotContain("${").doesNotContain("#{").doesNotContain("??").doesNotContain("null/");
        assertThat(html).doesNotContain(SECRET).doesNotContain("password:").doesNotContainIgnoringCase("temporary password is");
        assertThat(html).contains(SIGN_IN).contains("alt=");
        assertThat(html).contains(ASSETS + "/"); // every art URL starts with the asset base
        assertThat(html).doesNotContainPattern("src=\"(?!https://)[^\"]+\"");
    }

    @Test
    void theOwnerEmailShowsTheLoginDetailsAndTheThreeSetupRows() throws IOException {
        String html = body(render("mail/accountCreatedEmail", created(true, new TenantMailBrand("#7a1f4c", null), "Olivia", "Organization Admin"), "account-created-owner"));
        assertClean(html);
        assertThat(html).contains("made you its owner").contains("Your login details").contains("sam@example.test").contains("Owner").contains("Organization Admin");
        assertThat(html).contains("Make it yours").contains("Add your people").contains("Set up your structure");
        assertThat(html).contains("#7a1f4c"); // the brand colour is on the buttons
        assertThat(html).contains(ASSETS + "/ent-hero-welcome.png").contains(ASSETS + "/ent-row1.png");
    }

    @Test
    void theEmployeeEmailHasTheDetailsCardAndNoSetupRows() throws IOException {
        String html = body(render("mail/accountCreatedEmail", created(false, new TenantMailBrand("#0b5fff", "https://acme.kiwiply.com/tenant-assets/logo"), "Sam", "Marketing"), "account-created-employee"));
        assertClean(html);
        assertThat(html).contains("Priya Nair added you to Acme Staffing as Recruiter.").contains("Your login details").contains("sam@example.test").contains("Recruiter").contains("Marketing");
        assertThat(html).doesNotContain("Make it yours").doesNotContain("Add your people").doesNotContain("Set up your structure");
        assertThat(html).contains("#0b5fff").contains("https://acme.kiwiply.com/tenant-assets/logo");
    }

    @Test
    void withoutAWorkspaceLabelOrANameTheRowHidesAndTheMailStillRenders() throws IOException {
        String html = body(render("mail/accountCreatedEmail", created(false, TenantMailBrand.KIWIPLY, null, null), "account-created-employee-plain"));
        assertClean(html);
        assertThat(html).doesNotContain(">Workspace<");
    }

    @Test
    void thePasswordResetEmailRendersBrandedAndPlain() throws IOException {
        String plain = body(render("mail/passwordResetByAdminEmail", reset(TenantMailBrand.KIWIPLY, "Sam"), "password-reset-plain"));
        assertClean(plain);
        assertThat(plain).contains("Priya Nair reset your Acme Staffing password.").contains("Your password was reset");
        String branded = body(render("mail/passwordResetByAdminEmail", reset(new TenantMailBrand("#7a1f4c", "https://acme.kiwiply.com/tenant-assets/logo"), null), "password-reset-branded"));
        assertClean(branded);
        assertThat(branded).contains("#7a1f4c");
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
