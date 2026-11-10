package com.dossier.api.service.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.junit.jupiter.api.Test;

/** The pure parts of the tenant policy pages (docs/enterprise-v2/62): the sanitizer, the templates, the kind list and its admin setting. */
class PolicyPagesUnitTest {

    @Test
    void sanitizerKeepsPlainMarkdownAndNormalisesLineEndings() {
        String out = PolicyBodySanitizer.sanitize("# Title\r\n\r\nSome **bold** text with a [link](https://example.org/a?b=1) and [mail](mailto:a@b.example).\r\n- one\r\n- two\u0007\r\n", 5000);
        assertThat(out).doesNotContain("\r").doesNotContain("\u0007").startsWith("# Title").contains("- two");
    }

    @Test
    void sanitizerRefusesAnythingThatCouldRunOrFetch() {
        for (String bad : List.of(
            "<script>alert(1)</script>", "text <img src=x onerror=1>", "<!-- c -->", "<?xml?>", "![x](https://e.example/p.png)",
            "[x](javascript:alert(1))", "[x](JavaScript:alert(1))", "[x](data:text/html,hi)", "[x](//e.example)", "[x](ftp://e.example)", "[x](vbscript:x)",
            "[ref]: https://e.example", "[x]( )()"
        )) {
            assertThatThrownBy(() -> PolicyBodySanitizer.sanitize("Intro\n\n" + bad, 5000)).as(bad).isInstanceOf(OrgException.class).hasMessageNotContaining("null");
        }
    }

    @Test
    void sanitizerAllowsHttpsMailtoSamePathAndAnchorLinks() {
        assertThat(PolicyBodySanitizer.sanitize("[a](https://a.example) [b](mailto:b@a.example) [c](/support) [d](#top)", 500)).isNotBlank();
    }

    @Test
    void sanitizerEnforcesTheCapAndRequiresText() {
        assertThatThrownBy(() -> PolicyBodySanitizer.sanitize("x".repeat(501), 500)).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> PolicyBodySanitizer.sanitize("   ", 500)).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> PolicyBodySanitizer.sanitize(null, 500)).isInstanceOf(OrgException.class);
        assertThat(PolicyBodySanitizer.sanitize("x".repeat(500), 500)).hasSize(500);
    }

    @Test
    void everyTemplateNamesTheOrganizationAndNeverTheOperator() {
        for (String kind : List.of("PRIVACY", "TERMS", "ACCEPTABLE_USE", "SUPPORT_CONTACT", "COOKIES")) {
            String t = PolicyTemplates.render(kind, "Acme Staffing", "help@acme.example");
            assertThat(t).as(kind).contains("Acme Staffing").contains("help@acme.example").doesNotContainIgnoringCase("kiwiply");
            // a template must itself pass the sanitizer, or "Start from template" could produce an unsavable draft
            assertThat(PolicyBodySanitizer.sanitize(t, 40000)).as(kind).isNotBlank();
        }
        assertThat(PolicyTemplates.render("PRIVACY", "Acme", null)).contains("your organization administrator");
    }

    @Test
    void templatesPromiseNoSensitiveIdentifiers() {
        assertThat(PolicyTemplates.render("PRIVACY", "Acme", null)).containsIgnoringCase("do not ask for").containsIgnoringCase("dates of birth");
    }

    @Test
    void kindsGetTitlesAndPaths() {
        assertThat(PolicyKinds.path("PRIVACY")).isEqualTo("/privacy");
        assertThat(PolicyKinds.path("SUPPORT_CONTACT")).isEqualTo("/support");
        assertThat(PolicyKinds.path("DATA_RETENTION")).isEqualTo("/policies/data-retention");
        assertThat(PolicyKinds.title("DATA_RETENTION")).isEqualTo("Data Retention");
        List<String> configured = List.of("PRIVACY", "ACCEPTABLE_USE", "SUPPORT_CONTACT");
        assertThat(PolicyKinds.resolve("acceptable-use", configured)).contains("ACCEPTABLE_USE");
        assertThat(PolicyKinds.resolve("support", configured)).contains("SUPPORT_CONTACT");
        assertThat(PolicyKinds.resolve("terms", configured)).isEmpty();
        assertThat(PolicyKinds.resolve("../etc", configured)).isEmpty();
        assertThat(PolicyKinds.resolve(null, configured)).isEmpty();
    }

    @Test
    void theSettingsRegistryDeclaresTheThreePolicyKeysWithSafeDefaults() throws Exception {
        assertThat(EnterpriseSettingKeys.find(EnterpriseSettingKeys.POLICIES_REQUIRE_REVIEW).defaultValue()).isEqualTo("true");
        assertThat(EnterpriseSettingKeys.find(EnterpriseSettingKeys.POLICIES_MAX_CHARS).defaultValue()).isEqualTo("40000");
        ObjectMapper m = new ObjectMapper();
        assertThat(EnterpriseSettingKeys.policyKinds(m.readTree(EnterpriseSettingKeys.DEFAULT_POLICY_KINDS))).isTrue();
        assertThat(EnterpriseSettingKeys.policyKinds(m.readTree("[\"PRIVACY\",\"COOKIES\"]"))).isTrue();
        assertThat(EnterpriseSettingKeys.policyKinds(m.readTree("[]"))).isFalse();
        assertThat(EnterpriseSettingKeys.policyKinds(m.readTree("[\"privacy\"]"))).isFalse();
        assertThat(EnterpriseSettingKeys.policyKinds(m.readTree("[\"A\"]"))).isFalse();
        assertThat(EnterpriseSettingKeys.policyKinds(m.readTree("[\"PRIVACY\",\"PRIVACY\"]"))).isFalse();
        assertThat(EnterpriseSettingKeys.policyKinds(m.readTree("{\"a\":1}"))).isFalse();
    }
}
