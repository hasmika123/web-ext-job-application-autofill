package com.dossier.api.service.billing;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/**
 * Whitespace handling on the Stripe config values.
 *
 * <p>This test exists because of a real failure (2026-09-21): a secret key pasted into a shell
 * carried one trailing character. The server started, reported billing as <b>enabled</b>, and
 * then failed every checkout with a 502 whose message said nothing useful — the real reason,
 * <i>"Your API key is invalid, as it contains whitespace"</i>, was buried in a Stripe exception
 * that only appears at call time. Trimming here turns a silent hour of debugging into nothing.
 */
class StripePropertiesTest {

    @Test
    void secretKeyIsTrimmed() {
        StripeProperties props = new StripeProperties();
        props.setSecretKey("  sk_test_abc123\n");
        assertThat(props.getSecretKey()).isEqualTo("sk_test_abc123");
        assertThat(props.isEnabled()).isTrue();
    }

    @Test
    void theOtherPastedValuesAreTrimmedToo() {
        StripeProperties props = new StripeProperties();
        props.setWebhookSecret(" whsec_abc ");
        props.setPriceMonthly("price_monthly\t");
        props.setPrice3mo("\nprice_3mo");

        assertThat(props.getWebhookSecret()).isEqualTo("whsec_abc");
        assertThat(props.getPriceMonthly()).isEqualTo("price_monthly");
        assertThat(props.getPrice3mo()).isEqualTo("price_3mo");
    }

    /**
     * A key of nothing but whitespace means "not set", not "set to something unusable" — it has
     * to land on the keyless path (billing disabled, 503) rather than fail at call time.
     */
    @Test
    void aWhitespaceOnlyKeyIsTreatedAsUnset() {
        StripeProperties props = new StripeProperties();
        props.setSecretKey("   ");
        assertThat(props.getSecretKey()).isEmpty();
        assertThat(props.isEnabled()).isFalse();
    }

    /**
     * Managed Payments is tri-state: Stripe turns it on by default for new accounts, so "unset"
     * has to mean "leave the account alone" rather than "off" — otherwise the only thing the
     * setting could express is the state it was already in.
     */
    @Test
    void managedPaymentsDefaultsToUnset() {
        StripeProperties props = new StripeProperties();
        assertThat(props.getManagedPayments()).isNull();

        props.setManagedPayments(false);
        assertThat(props.getManagedPayments()).isFalse();

        props.setManagedPayments(true);
        assertThat(props.getManagedPayments()).isTrue();
    }

    @Test
    void nullIsLeftAlone() {
        StripeProperties props = new StripeProperties();
        props.setSecretKey(null);
        assertThat(props.getSecretKey()).isNull();
        assertThat(props.isEnabled()).isFalse();
    }
}
