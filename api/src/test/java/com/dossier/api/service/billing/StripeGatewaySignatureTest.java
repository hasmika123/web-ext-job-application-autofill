package com.dossier.api.service.billing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * The webhook signature check, in isolation (Phase 12.2).
 *
 * <p>This is the only thing standing between the webhook endpoint and anyone on the internet, so
 * it gets a test of its own rather than being exercised only through the resource — and it
 * doubles as the reference for how the integration test signs its fixtures.
 */
class StripeGatewaySignatureTest {

    private static final String SECRET = "whsec_unit_test_secret";

    private static StripeGateway gateway(String webhookSecret) {
        StripeProperties props = new StripeProperties();
        props.setWebhookSecret(webhookSecret);
        // No secret key: billing is "disabled", yet signature verification must still work —
        // a server can receive webhooks while its outbound Stripe client is unconfigured.
        return new StripeGatewayImpl(props);
    }

    /** Signs exactly as Stripe does: HMAC-SHA256 over "<timestamp>.<payload>". */
    static String sign(String payload, String secret, Instant at) {
        long t = at.getEpochSecond();
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] raw = mac.doFinal((t + "." + payload).getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder();
            for (byte b : raw) hex.append(String.format("%02x", b));
            return "t=" + t + ",v1=" + hex;
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static String payload(String id, String type) {
        return (
            "{\"id\":\"" +
            id +
            "\",\"object\":\"event\",\"api_version\":\"2025-03-31.basil\",\"created\":" +
            Instant.now().getEpochSecond() +
            ",\"type\":\"" +
            type +
            "\",\"data\":{\"object\":{\"id\":\"sub_1\",\"object\":\"subscription\"," +
            "\"customer\":\"cus_1\",\"status\":\"active\",\"cancel_at_period_end\":false," +
            "\"items\":{\"object\":\"list\",\"data\":[{\"id\":\"si_1\",\"object\":\"subscription_item\"," +
            "\"current_period_end\":" +
            Instant.now().plusSeconds(86400).getEpochSecond() +
            ",\"price\":{\"id\":\"price_1\",\"object\":\"price\"}}]}}}}"
        );
    }

    @Test
    @DisplayName("A correctly signed payload verifies and flattens into our event record")
    void validSignatureIsAccepted() {
        String body = payload("evt_ok_1", "customer.subscription.updated");
        StripeWebhookEvent event = gateway(SECRET).constructEvent(body, sign(body, SECRET, Instant.now()));

        assertThat(event.id()).isEqualTo("evt_ok_1");
        assertThat(event.type()).isEqualTo("customer.subscription.updated");
        assertThat(event.customerId()).isEqualTo("cus_1");
        assertThat(event.subscriptionId()).isEqualTo("sub_1");
        assertThat(event.status()).isEqualTo("active");
        assertThat(event.priceId()).isEqualTo("price_1");
        assertThat(event.currentPeriodEnd()).isNotNull();
        assertThat(event.cancelAtPeriodEnd()).isFalse();
    }

    @Test
    @DisplayName("A payload signed with the wrong secret is rejected")
    void wrongSecretIsRejected() {
        String body = payload("evt_bad_1", "customer.subscription.updated");
        assertThatThrownBy(() -> gateway(SECRET).constructEvent(body, sign(body, "whsec_some_other_secret", Instant.now())))
            .isInstanceOf(StripeGatewayException.class)
            .hasMessageContaining("Invalid Stripe signature");
    }

    @Test
    @DisplayName("A payload altered after signing is rejected")
    void tamperedPayloadIsRejected() {
        String body = payload("evt_tamper_1", "customer.subscription.updated");
        String header = sign(body, SECRET, Instant.now());
        String tampered = body.replace("\"status\":\"active\"", "\"status\":\"canceled\"");
        assertThatThrownBy(() -> gateway(SECRET).constructEvent(tampered, header)).isInstanceOf(StripeGatewayException.class);
    }

    @Test
    @DisplayName("No configured webhook secret means nothing can be verified, so nothing is accepted")
    void missingSecretRejectsEverything() {
        String body = payload("evt_nosecret_1", "customer.subscription.updated");
        assertThatThrownBy(() -> gateway("").constructEvent(body, sign(body, SECRET, Instant.now())))
            .isInstanceOf(StripeGatewayException.class)
            .hasMessageContaining("No webhook secret");
    }
}
