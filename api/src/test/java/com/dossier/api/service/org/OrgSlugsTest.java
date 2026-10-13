package com.dossier.api.service.org;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Set;
import org.junit.jupiter.api.Test;

class OrgSlugsTest {

    @Test
    void deriveFoldsAccentsLowerCasesAndDashes() {
        assertThat(OrgSlugs.derive("Acme Bootcamp")).isEqualTo("acme-bootcamp");
        assertThat(OrgSlugs.derive("  Café  Müller & Söhne, Inc.  ")).isEqualTo("cafe-muller-sohne-inc");
        assertThat(OrgSlugs.derive("---Hello---World---")).isEqualTo("hello-world");
    }

    @Test
    void deriveAlwaysProducesAWellFormedSlug() {
        for (String name : new String[] { "A", "!!", "", "日本語", "x".repeat(200), "Mixed CASE 123", "a--b" }) {
            assertThat(OrgSlugs.isWellFormed(OrgSlugs.derive(name))).as("'" + name + "'").isTrue();
        }
        assertThat(OrgSlugs.derive("x".repeat(200))).hasSize(OrgSlugs.MAX);
        assertThat(OrgSlugs.derive("A")).isEqualTo("a-org");
    }

    @Test
    void wellFormedRules() {
        assertThat(OrgSlugs.isWellFormed("acme")).isTrue();
        assertThat(OrgSlugs.isWellFormed("acme-bootcamp-2")).isTrue();
        assertThat(OrgSlugs.isWellFormed("ab")).isFalse();
        assertThat(OrgSlugs.isWellFormed("-acme")).isFalse();
        assertThat(OrgSlugs.isWellFormed("acme-")).isFalse();
        assertThat(OrgSlugs.isWellFormed("Acme")).isFalse();
        assertThat(OrgSlugs.isWellFormed("acme_x")).isFalse();
        assertThat(OrgSlugs.isWellFormed("a--b")).isFalse();
        assertThat(OrgSlugs.isWellFormed("x".repeat(61))).isFalse();
        assertThat(OrgSlugs.isWellFormed(null)).isFalse();
    }

    @Test
    void reservedWordsAreReserved() {
        assertThat(OrgSlugs.isReserved("admin")).isTrue();
        assertThat(OrgSlugs.isReserved("join")).isTrue();
        assertThat(OrgSlugs.isReserved("acme")).isFalse();
    }

    @Test
    void suggestWalksTheSuffixesPastTakenAndReserved() {
        Set<String> taken = Set.of("acme", "acme-2");
        assertThat(OrgSlugs.suggest("acme", taken::contains)).isEqualTo("acme-3");
        assertThat(OrgSlugs.suggest("fresh", taken::contains)).isEqualTo("fresh");
        assertThat(OrgSlugs.suggest("admin", s -> false)).isEqualTo("admin-2");
    }

    @Test
    void aSuggestionNeverExceedsTheMaximumLength() {
        String longest = "x".repeat(OrgSlugs.MAX);
        String s = OrgSlugs.suggest(longest, longest::equals);
        assertThat(s).hasSize(OrgSlugs.MAX).endsWith("-2");
        assertThat(OrgSlugs.isWellFormed(s)).isTrue();
    }
}
