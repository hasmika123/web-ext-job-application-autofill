package com.dossier.api.service.billing;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/**
 * When a Checkout Session asks for automatic tax.
 *
 * <p>The rule that matters is the one this cannot assert directly: when this returns false the
 * caller <b>omits</b> {@code automatic_tax[enabled]} rather than sending {@code false}. Stripe
 * enables Managed Payments by default on new accounts, and such an account rejects an explicit
 * {@code false} outright — which made our default configuration invalid against a default Stripe
 * account until this was fixed (2026-09-21, during the 12.7 sandbox run).
 */
class StripeAutomaticTaxTest {

    @Test
    void neitherFlagMeansLetTheAccountDecide() {
        assertThat(StripeGatewayImpl.wantsAutomaticTax(false, false)).isFalse();
    }

    @Test
    void askingForStripeTaxAsksForIt() {
        assertThat(StripeGatewayImpl.wantsAutomaticTax(true, false)).isTrue();
    }

    /** Managed Payments requires automatic tax, so choosing one chooses both. */
    @Test
    void managedPaymentsImpliesAutomaticTax() {
        assertThat(StripeGatewayImpl.wantsAutomaticTax(false, true)).isTrue();
    }

    @Test
    void bothTogetherIsNotAConflict() {
        assertThat(StripeGatewayImpl.wantsAutomaticTax(true, true)).isTrue();
    }
}
