package com.dossier.api.service.billing;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** K8.2: the grown {@link StripeWebhookEvent} is parsed from real signed payloads; the personal fields stay exactly as they were. */
class StripeWebhookEventParseTest {

    private static final String SECRET = "whsec_parse_test";

    private static StripeWebhookEvent parse(String type, String object) {
        String body =
            "{\"id\":\"evt_1\",\"object\":\"event\",\"api_version\":\"2025-03-31.basil\",\"created\":" +
            Instant.now().getEpochSecond() +
            ",\"type\":\"" +
            type +
            "\",\"data\":{\"object\":" +
            object +
            "}}";
        StripeProperties props = new StripeProperties();
        props.setWebhookSecret(SECRET);
        return new StripeGatewayImpl(props).constructEvent(body, StripeGatewaySignatureTest.sign(body, SECRET, Instant.now()));
    }

    @Test
    @DisplayName("A subscription event carries every item, the period start, the schedule and the scope/quote metadata")
    void subscriptionItemsAndMetadata() {
        StripeWebhookEvent e = parse(
            "customer.subscription.updated",
            "{\"id\":\"sub_1\",\"object\":\"subscription\",\"customer\":\"cus_1\",\"status\":\"active\",\"cancel_at_period_end\":false,\"schedule\":\"sched_1\"," +
            "\"metadata\":{\"app\":\"kiwiply\",\"kiwiply_scope\":\"org\",\"org_id\":\"12\",\"quote_id\":\"q-9\"}," +
            "\"items\":{\"object\":\"list\",\"data\":[" +
            "{\"id\":\"si_1\",\"object\":\"subscription_item\",\"quantity\":1,\"current_period_start\":1000,\"current_period_end\":2000,\"price\":{\"id\":\"price_base\",\"object\":\"price\"}}," +
            "{\"id\":\"si_2\",\"object\":\"subscription_item\",\"quantity\":3,\"current_period_start\":1000,\"current_period_end\":2000,\"price\":{\"id\":\"price_addon\",\"object\":\"price\"}}]}}"
        );

        assertThat(e.priceId()).isEqualTo("price_base");
        assertThat(e.currentPeriodEnd()).isEqualTo(Instant.ofEpochSecond(2000));
        assertThat(e.currentPeriodStart()).isEqualTo(Instant.ofEpochSecond(1000));
        assertThat(e.items()).containsExactly(new StripeWebhookEvent.Item("si_1", "price_base", 1), new StripeWebhookEvent.Item("si_2", "price_addon", 3));
        assertThat(e.scheduleId()).isEqualTo("sched_1");
        assertThat(e.scope()).isEqualTo("org");
        assertThat(e.isOrgScoped()).isTrue();
        assertThat(e.orgId()).isEqualTo(12L);
        assertThat(e.quoteId()).isEqualTo("q-9");
        assertThat(e.taggedForAnotherApp()).isFalse();
    }

    @Test
    @DisplayName("An invoice event carries the invoice snapshot with lines and the proration flag; personal fields unchanged")
    void invoiceSnapshot() {
        StripeWebhookEvent e = parse(
            "invoice.paid",
            "{\"id\":\"in_1\",\"object\":\"invoice\",\"customer\":\"cus_1\",\"number\":\"K-1\",\"status\":\"paid\",\"currency\":\"usd\",\"amount_due\":1999,\"amount_paid\":1999," +
            "\"status_transitions\":{\"paid_at\":1500},\"parent\":{\"type\":\"subscription_details\",\"subscription_details\":{\"subscription\":\"sub_1\",\"metadata\":{\"app\":\"kiwiply\"}}}," +
            "\"lines\":{\"object\":\"list\",\"data\":[{\"id\":\"il_1\",\"amount\":1999,\"quantity\":1,\"description\":\"Pro\",\"pricing\":{\"price_details\":{\"price\":\"price_base\"}}," +
            "\"parent\":{\"subscription_item_details\":{\"proration\":true}}}]}}"
        );

        assertThat(e.objectType()).isEqualTo("invoice");
        assertThat(e.amountCents()).isEqualTo(1999L);
        assertThat(e.subscriptionId()).isEqualTo("sub_1");
        assertThat(e.invoice().number()).isEqualTo("K-1");
        assertThat(e.invoice().paidAt()).isEqualTo(Instant.ofEpochSecond(1500));
        assertThat(e.invoice().lines()).hasSize(1);
        assertThat(e.invoice().lines().get(0).priceId()).isEqualTo("price_base");
        assertThat(e.invoice().lines().get(0).proration()).isTrue();
    }

    @Test
    @DisplayName("Schedule and discount events are recognised")
    void scheduleAndDiscount() {
        StripeWebhookEvent s = parse(
            "subscription_schedule.created",
            "{\"id\":\"sched_1\",\"object\":\"subscription_schedule\",\"customer\":\"cus_1\",\"subscription\":\"sub_1\",\"status\":\"not_started\"}"
        );
        assertThat(s.objectType()).isEqualTo("subscription_schedule");
        assertThat(s.scheduleId()).isEqualTo("sched_1");
        assertThat(s.subscriptionId()).isEqualTo("sub_1");

        StripeWebhookEvent d = parse(
            "customer.discount.created",
            "{\"id\":\"di_1\",\"object\":\"discount\",\"customer\":\"cus_1\",\"subscription\":\"sub_1\",\"coupon\":{\"id\":\"promo20\",\"object\":\"coupon\",\"amount_off\":500}}"
        );
        assertThat(d.objectType()).isEqualTo("discount");
        assertThat(d.discount().couponId()).isEqualTo("promo20");
        assertThat(d.discount().amountOffMinor()).isEqualTo(500L);
    }

    @Test
    @DisplayName("The 14-argument constructor still works and leaves every new field empty")
    void legacyConstructor() {
        StripeWebhookEvent e = new StripeWebhookEvent("evt", "invoice.paid", Instant.now(), "invoice", "cus", "sub", "active", "price", null, null, null, 1L, "usd", null);
        assertThat(e.items()).isEmpty();
        assertThat(e.scope()).isNull();
        assertThat(e.invoice()).isNull();
        assertThat(e.isOrgScoped()).isFalse();
    }
}
