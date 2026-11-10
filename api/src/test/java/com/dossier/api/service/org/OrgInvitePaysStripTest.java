package com.dossier.api.service.org;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.domain.enumeration.OrgAccountMode;
import com.dossier.api.domain.org.Organization;
import java.util.List;
import java.util.Locale;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.context.support.ResourceBundleMessageSource;
import org.thymeleaf.context.Context;
import org.thymeleaf.spring6.SpringTemplateEngine;
import org.thymeleaf.templateresolver.ClassLoaderTemplateResolver;

/**
 * X2.10 follow-up: the "pays for: Pro ..." strip of an invitation. An organization with SEPARATE accounts never shows it (its members get enterprise
 * accounts, and an enterprise account never has a personal plan, decision O4); today the invite caller passes no lines at all, and this pins both the
 * guard and what the template does with the list.
 */
class OrgInvitePaysStripTest {

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

    private static Organization org(OrgAccountMode mode) {
        Organization o = new Organization();
        o.setName("Acme Staffing");
        o.setAccountMode(mode);
        return o;
    }

    private static String render(List<String> pays) {
        Context c = new Context(Locale.ENGLISH);
        c.setVariable("name", "Sam");
        c.setVariable("org", "Acme Staffing");
        c.setVariable("inviter", "Priya");
        c.setVariable("role", "a member");
        c.setVariable("pays", pays);
        c.setVariable("paysList", String.join(", ", pays));
        c.setVariable("link", "https://acme.kiwiply.com/join/t/abc");
        c.setVariable("policyBase", "https://acme.kiwiply.com");
        c.setVariable("expires", "28 Oct 2026");
        c.setVariable("subject", "Priya invited you");
        return engine.process("mail/orgInviteEmail", c);
    }

    @Test
    void aSeparateAccountOrganizationNeverShowsWhatItPaysFor() {
        List<String> lines = List.of("Pro plan");
        assertThat(OrgInviteService.paysFor(org(OrgAccountMode.SEPARATE), lines)).isEmpty();
        assertThat(render(OrgInviteService.paysFor(org(OrgAccountMode.SEPARATE), lines))).doesNotContain("Pro plan").doesNotContain("pays for");
    }

    @Test
    void aLegacySharedOrganizationKeepsTheLinesItWasGiven() {
        List<String> lines = List.of("Pro plan");
        assertThat(OrgInviteService.paysFor(org(OrgAccountMode.SHARED), lines)).containsExactly("Pro plan");
        assertThat(render(OrgInviteService.paysFor(org(OrgAccountMode.SHARED), lines))).contains("Pro plan");
    }

    @Test
    void noLinesNoStripEither() {
        assertThat(OrgInviteService.paysFor(org(OrgAccountMode.SHARED), null)).isEmpty();
        assertThat(OrgInviteService.paysFor(null, List.of("Pro plan"))).isEmpty();
        assertThat(render(List.of())).doesNotContain("pays for");
    }
}
