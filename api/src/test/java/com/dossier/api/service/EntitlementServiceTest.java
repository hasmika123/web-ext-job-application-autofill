package com.dossier.api.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * The entitlement rule as a status × period matrix (Phase 12.1).
 *
 * <p>This is the decision that makes someone Pro, so it's tested as a pure function rather than
 * through a database: {@code isProFor(status, currentPeriodEnd, now)}. The cases that matter are
 * the grace ones — a failed charge or a cancellation must not cut off someone who has paid for
 * the period they're in.
 */
class EntitlementServiceTest {

    private static final Instant NOW = Instant.parse("2026-09-21T12:00:00Z");
    private static final Instant FUTURE = NOW.plus(10, ChronoUnit.DAYS);
    private static final Instant PAST = NOW.minus(1, ChronoUnit.DAYS);

    @ParameterizedTest(name = "{0} is Pro regardless of the period end")
    @ValueSource(strings = { "active", "trialing" })
    @DisplayName("Stripe says the subscription is in good standing → Pro, even if our mirrored period end looks stale")
    void activeStatusesArePro(String status) {
        // A delayed renewal webhook must never downgrade someone who is actually paying, so a
        // past period end does NOT override Stripe's own assertion here.
        assertThat(EntitlementService.isProFor(status, FUTURE, NOW)).isTrue();
        assertThat(EntitlementService.isProFor(status, PAST, NOW)).isTrue();
        assertThat(EntitlementService.isProFor(status, null, NOW)).isTrue();
    }

    @ParameterizedTest(name = "{0} keeps Pro until the period ends, then lapses")
    @ValueSource(strings = { "past_due", "canceled" })
    @DisplayName("Grace statuses: they paid for this period, so they keep it")
    void graceStatusesAreProUntilPeriodEnd(String status) {
        // past_due: Stripe's Smart Retries are still running — an expired card is not a non-payer.
        // canceled: cancelling means "don't renew", not "refund me and cut me off now".
        assertThat(EntitlementService.isProFor(status, FUTURE, NOW)).isTrue();
        assertThat(EntitlementService.isProFor(status, PAST, NOW)).isFalse();
        // No period end means we don't know what was paid for — treat it as lapsed.
        assertThat(EntitlementService.isProFor(status, null, NOW)).isFalse();
    }

    @ParameterizedTest(name = "{0} is Free immediately")
    @ValueSource(strings = { "unpaid", "incomplete", "incomplete_expired", "none" })
    @DisplayName("Never-paid and written-off statuses are Free at once, period end or not")
    void deadStatusesAreFree(String status) {
        assertThat(EntitlementService.isProFor(status, FUTURE, NOW)).isFalse();
        assertThat(EntitlementService.isProFor(status, PAST, NOW)).isFalse();
        assertThat(EntitlementService.isProFor(status, null, NOW)).isFalse();
    }

    @Test
    @DisplayName("An unknown or missing status is Free — a status Stripe adds later must not grant Pro by accident")
    void unknownStatusIsFree() {
        assertThat(EntitlementService.isProFor("something_new", FUTURE, NOW)).isFalse();
        assertThat(EntitlementService.isProFor(null, FUTURE, NOW)).isFalse();
        assertThat(EntitlementService.isProFor("", FUTURE, NOW)).isFalse();
    }

    @ParameterizedTest(name = "\"{0}\" is normalised")
    @CsvSource({ "ACTIVE,true", "' active ',true", "Past_Due,true", "TRIALING,true" })
    @DisplayName("Status matching is case- and whitespace-insensitive")
    void statusIsNormalised(String status, boolean expected) {
        assertThat(EntitlementService.isProFor(status, FUTURE, NOW)).isEqualTo(expected);
    }

    @Test
    @DisplayName("The boundary is exclusive: Pro through the last instant, Free once the period end arrives")
    void periodEndBoundaryIsExclusive() {
        assertThat(EntitlementService.isProFor("past_due", NOW.plusMillis(1), NOW)).isTrue();
        assertThat(EntitlementService.isProFor("past_due", NOW, NOW)).isFalse();
    }
}
