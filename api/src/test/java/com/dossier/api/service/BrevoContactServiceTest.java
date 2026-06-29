package com.dossier.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

import org.junit.jupiter.api.Test;

/** Unit tests for Brevo list sync gating (Phase 9.A4.4). The real HTTP call isn't exercised here. */
class BrevoContactServiceTest {

    @Test
    void notConfiguredWithoutKeyOrList() {
        assertThat(new BrevoContactService("", 0).isConfigured()).isFalse();
        assertThat(new BrevoContactService("key", 0).isConfigured()).isFalse();
        assertThat(new BrevoContactService("", 5).isConfigured()).isFalse();
    }

    @Test
    void configuredWhenKeyAndListPresent() {
        assertThat(new BrevoContactService("key", 5).isConfigured()).isTrue();
    }

    @Test
    void actionsAreNoOpWhenUnconfigured() {
        BrevoContactService s = new BrevoContactService("", 0);
        // Must not attempt any network call (or throw) when Brevo isn't configured.
        assertThatCode(() -> {
            s.addConfirmedContact("a@b.com");
            s.removeContact("a@b.com");
        }).doesNotThrowAnyException();
    }
}
