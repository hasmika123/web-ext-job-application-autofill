package com.dossier.api.service;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/**
 * The suggestion rules on their own (Phase 10.3c) — no Spring, no database, so they run in the
 * fast unit suite. The integration test covers the same rules end to end.
 */
class ProfileSuggestionServiceTest {

    @Test
    void aBlankFieldIsSuggestedOnFirstSight() {
        assertThat(ProfileSuggestionService.isVisible("", "Hybrid", 1)).isTrue();
        assertThat(ProfileSuggestionService.isVisible(null, "Hybrid", 1)).isTrue();
        assertThat(ProfileSuggestionService.isVisible("   ", "Hybrid", 1)).isTrue();
    }

    @Test
    void aChangeNeedsTheThreshold() {
        assertThat(ProfileSuggestionService.isVisible("Remote", "Hybrid", 1)).isFalse();
        assertThat(ProfileSuggestionService.isVisible("Remote", "Hybrid", ProfileSuggestionService.CHANGE_THRESHOLD)).isTrue();
    }

    @Test
    void whatTheProfileAlreadySaysIsNeverSuggested() {
        assertThat(ProfileSuggestionService.isVisible("Hybrid", "hybrid ", 9)).isFalse();
    }

    @Test
    void sameIgnoresCaseAndWhitespace() {
        assertThat(ProfileSuggestionService.same("  New   York ", "new york")).isTrue();
        assertThat(ProfileSuggestionService.same("New York", "New Jersey")).isFalse();
        assertThat(ProfileSuggestionService.same(null, "")).isTrue();
    }

    @Test
    void cleanCollapsesWhitespace() {
        assertThat(ProfileSuggestionService.clean("  2   weeks\n")).isEqualTo("2 weeks");
        assertThat(ProfileSuggestionService.clean(null)).isEmpty();
    }

    @Test
    void anAnswerHoldingASensitiveValueIsNeverLearned() {
        assertThat(ProfileSuggestionService.carriesSensitive("desiredSalary", "SSN 123-45-6789")).isTrue();
        assertThat(ProfileSuggestionService.carriesSensitive("noticePeriod", "account number 123456789012")).isTrue();
        assertThat(ProfileSuggestionService.carriesSensitive("noticePeriod", "2 weeks")).isFalse();
    }

    @Test
    void eeoAndResumeTextAreNeverSuggestible() {
        for (String k : new String[] { "gender", "race", "ethnicity", "veteranStatus", "disabilityStatus", "summary", "skills", "coverLetter" }) {
            assertThat(ProfileSuggestionService.SUGGESTIBLE).doesNotContain(k);
        }
        assertThat(ProfileSuggestionService.SUGGESTIBLE).contains("desiredSalary", "noticePeriod", "workPreference", "authorizedToWork");
    }
}
