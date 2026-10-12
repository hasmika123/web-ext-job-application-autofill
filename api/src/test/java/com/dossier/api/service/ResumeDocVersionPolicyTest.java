package com.dossier.api.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import org.junit.jupiter.api.Test;

/** The autosave coalescing rule, the row kinds and the derived visibility (DESIGN 8.2, 9.11); the rows themselves are covered by ResumeMetaResourceIT. */
class ResumeDocVersionPolicyTest {

    private static final Instant NOW = Instant.parse("2026-10-12T12:00:00Z");

    @Test
    void writesWhenContentChangedAndNoRowExistsYet() {
        assertThat(ResumeDocVersionService.shouldWriteAutosave("a", "b", null, null, NOW, 10)).isTrue();
    }

    @Test
    void skipsWhenContentDidNotChange() {
        assertThat(ResumeDocVersionService.shouldWriteAutosave("a", "a", null, null, NOW, 10)).isFalse();
    }

    @Test
    void skipsInsideTheCoalescingWindowAndWritesOnceItHasPassed() {
        assertThat(ResumeDocVersionService.shouldWriteAutosave("a", "b", "z", NOW.minusSeconds(9 * 60), NOW, 10)).isFalse();
        assertThat(ResumeDocVersionService.shouldWriteAutosave("a", "b", "z", NOW.minusSeconds(10 * 60), NOW, 10)).isTrue();
    }

    @Test
    void skipsWhenTheLastRowAlreadyHoldsThisContent() {
        assertThat(ResumeDocVersionService.shouldWriteAutosave("a", "b", "b", NOW.minusSeconds(3600), NOW, 10)).isFalse();
    }

    @Test
    void kindMapsTheReason() {
        assertThat(ResumeDocVersionService.kindOf("AUTOSAVE")).isEqualTo("auto");
        assertThat(ResumeDocVersionService.kindOf("NAMED")).isEqualTo("named");
        assertThat(ResumeDocVersionService.kindOf("MANUAL")).isEqualTo("checkpoint");
        assertThat(ResumeDocVersionService.kindOf("TEMPLATE_SWITCH")).isEqualTo("system");
        assertThat(ResumeDocVersionService.kindOf("DETACH")).isEqualTo("system");
        assertThat(ResumeDocVersionService.kindOf(null)).isEqualTo("system");
    }

    @Test
    void visibilityModeIsDerived() {
        assertThat(ResumeMetaService.visibilityMode(0, true, null)).isEqualTo("PRIVATE");
        assertThat(ResumeMetaService.visibilityMode(0, true, "SUMMARY")).isEqualTo("PRIVATE");
        assertThat(ResumeMetaService.visibilityMode(0, false, "FULL")).isEqualTo("PRIVATE");
        assertThat(ResumeMetaService.visibilityMode(0, true, "FULL")).isEqualTo("ORG");
        assertThat(ResumeMetaService.visibilityMode(2, false, null)).isEqualTo("PEOPLE");
        assertThat(ResumeMetaService.visibilityMode(1, true, "FULL")).isEqualTo("PEOPLE");
    }
}
