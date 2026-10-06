package com.dossier.api.service;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/** "Same job" across boards (Phase 14.5). */
class ApplicationKeysTest {

    @Test
    void companiesIgnoreLegalSuffixesCaseAndDomains() {
        assertThat(ApplicationKeys.company("Acme, Inc.")).isEqualTo(ApplicationKeys.company("ACME"));
        assertThat(ApplicationKeys.company("Calm.com")).isEqualTo(ApplicationKeys.company("Calm"));
        assertThat(ApplicationKeys.company("Johnson & Johnson")).isEqualTo(ApplicationKeys.company("Johnson and Johnson"));
        assertThat(ApplicationKeys.company("Acme Corp")).isEqualTo(ApplicationKeys.company("Acme"));
        assertThat(ApplicationKeys.company("Acme")).isNotEqualTo(ApplicationKeys.company("Acme Labs"));
    }

    @Test
    void titlesIgnoreBracketsAbbreviationsAndNumerals() {
        assertThat(ApplicationKeys.title("Sr. Backend Engineer II (Remote)")).isEqualTo(ApplicationKeys.title("Senior Backend Engineer 2"));
        assertThat(ApplicationKeys.title("Backend Engineer - Payments")).isEqualTo(ApplicationKeys.title("Backend Engineer, Payments"));
        assertThat(ApplicationKeys.title("Backend Engineer")).isNotEqualTo(ApplicationKeys.title("Senior Backend Engineer"));
    }

    @Test
    void locationsClashOnlyWhenBothNameDifferentPlaces() {
        assertThat(ApplicationKeys.locationsCompatible("New York, NY", "New York City")).isTrue();
        assertThat(ApplicationKeys.locationsCompatible("Remote (US)", "San Francisco, CA")).isTrue();
        assertThat(ApplicationKeys.locationsCompatible(null, "Berlin")).isTrue();
        assertThat(ApplicationKeys.locationsCompatible("New York, NY", "San Francisco, CA")).isFalse();
        assertThat(ApplicationKeys.locationsCompatible("New York", "New Delhi")).isFalse();
    }

    @Test
    void linksIgnoreTrackingNoise() {
        assertThat(ApplicationKeys.url("https://www.boards.greenhouse.io/acme/jobs/123/?gh_src=abc&utm_source=li"))
            .isEqualTo(ApplicationKeys.url("https://boards.greenhouse.io/acme/jobs/123"));
        assertThat(ApplicationKeys.url("https://stripe.com/jobs/search?gh_jid=81")).isNotEqualTo(ApplicationKeys.url("https://stripe.com/jobs/search?gh_jid=82"));
    }

    @Test
    void sameJobNeedsCompanyAndTitle() {
        assertThat(ApplicationKeys.sameJob("Acme, Inc.", "Sr. Backend Engineer", "Remote", "ACME", "Senior Backend Engineer", "New York")).isTrue();
        assertThat(ApplicationKeys.sameJob("Acme", "Backend Engineer", "New York, NY", "Acme", "Backend Engineer", "Austin, TX")).isFalse();
        assertThat(ApplicationKeys.sameJob("", "", null, "", "", null)).isFalse();
    }
}
