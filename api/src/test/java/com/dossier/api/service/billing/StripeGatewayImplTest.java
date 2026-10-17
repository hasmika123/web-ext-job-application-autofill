package com.dossier.api.service.billing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dossier.api.service.billing.StripeGateway.CheckoutSpec;
import com.dossier.api.service.billing.StripeGateway.ItemQuantity;
import com.dossier.api.service.billing.StripeGateway.Period;
import com.dossier.api.service.billing.StripeGateway.PriceInterval;
import com.dossier.api.service.billing.StripeGateway.PriceSpec;
import com.dossier.api.service.billing.StripeGateway.ProductSpec;
import com.stripe.StripeClient;
import com.stripe.exception.ApiConnectionException;
import com.stripe.exception.InvalidRequestException;
import com.stripe.exception.RateLimitException;
import com.stripe.exception.StripeException;
import com.stripe.model.StripeObjectInterface;
import com.stripe.net.ApiMode;
import com.stripe.net.ApiResource;
import com.stripe.net.BaseAddress;
import com.stripe.net.RequestOptions;
import com.stripe.net.StripeResponseGetter;
import java.io.InputStream;
import java.lang.reflect.Type;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * K8.2 gateway tests against recorded fixtures: a stub {@link StripeResponseGetter} captures every request (method, path, flattened form
 * parameters, request options) and answers canned JSON, so no network and no Stripe account is involved. What is asserted is what we SEND:
 * the idempotency key on every write, the retry policy, proration_behavior=none, one line item per quote line.
 */
class StripeGatewayImplTest {

    /** One captured request. */
    record Call(String method, String path, Map<String, String> form, RequestOptions options) {}

    /** Records requests and answers from a path-to-JSON table; may be told to throw. */
    static class Recorder implements StripeResponseGetter {

        final List<Call> calls = new ArrayList<>();
        final Map<String, String> responses = new java.util.HashMap<>();
        StripeException failure;

        @Override
        @SuppressWarnings("unchecked")
        public <T extends StripeObjectInterface> T request(
            BaseAddress base,
            ApiResource.RequestMethod method,
            String path,
            Map<String, Object> params,
            Type type,
            RequestOptions options,
            ApiMode apiMode
        ) throws StripeException {
            calls.add(new Call(method.name(), path, flatten(params), options));
            if (failure != null) throw failure;
            String json = responses.get(method.name() + " " + path);
            if (json == null) json = responses.getOrDefault(path, "{\"id\":\"obj_default\"}");
            return (T) parse(json, type);
        }

        @Override
        public InputStream requestStream(BaseAddress b, ApiResource.RequestMethod m, String p, Map<String, Object> params, RequestOptions o, ApiMode a) {
            throw new UnsupportedOperationException();
        }

        List<Call> writes() {
            return calls.stream().filter(c -> !c.method().equals("GET")).toList();
        }
    }

    /** Stripe's own Gson is not on the test compile classpath, so reach it by reflection. */
    static Object parse(String json, Type type) {
        try {
            Object gson = ApiResource.class.getField("GSON").get(null);
            return gson.getClass().getMethod("fromJson", String.class, Type.class).invoke(gson, json, type);
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException(e);
        }
    }

    static Map<String, String> flatten(Map<String, Object> params) {
        Map<String, String> out = new TreeMap<>();
        if (params != null) flattenInto("", params, out);
        return out;
    }

    private static void flattenInto(String prefix, Object value, Map<String, String> out) {
        if (value instanceof Map<?, ?> m) {
            m.forEach((k, v) -> flattenInto(prefix.isEmpty() ? String.valueOf(k) : prefix + "[" + k + "]", v, out));
        } else if (value instanceof List<?> l) {
            for (int i = 0; i < l.size(); i++) flattenInto(prefix + "[" + i + "]", l.get(i), out);
        } else if (value != null) {
            out.put(prefix, String.valueOf(value));
        }
    }

    private Recorder rec;
    private StripeGatewayImpl gateway;

    private static StripeProperties props(String key) {
        StripeProperties p = new StripeProperties();
        p.setSecretKey(key);
        return p;
    }

    @BeforeEach
    void setUp() {
        rec = new Recorder();
        gateway = new StripeGatewayImpl(props("sk_test_unit"), new StripeClient(rec));
    }

    private static final String SUB =
        "{\"id\":\"sub_1\",\"object\":\"subscription\",\"items\":{\"object\":\"list\",\"data\":[" +
        "{\"id\":\"si_a\",\"object\":\"subscription_item\",\"quantity\":1,\"price\":{\"id\":\"price_a\",\"object\":\"price\"}}," +
        "{\"id\":\"si_b\",\"object\":\"subscription_item\",\"quantity\":2,\"price\":{\"id\":\"price_b\",\"object\":\"price\"}}]}}";

    @Test
    @DisplayName("Checkout from a two-line spec sends two line items, the quote metadata on session and subscription, and the idempotency key")
    void checkoutFromSpec() {
        rec.responses.put("/v1/checkout/sessions", "{\"id\":\"cs_1\",\"object\":\"checkout.session\",\"url\":\"https://checkout.example/cs_1\"}");
        String url = gateway.createCheckoutSession(
            new CheckoutSpec(
                "cus_1",
                7L,
                List.of(new ItemQuantity("price_base", 1), new ItemQuantity("price_addon", 3)),
                Map.of("quote_id", "42", "plan_version_id", "9"),
                "https://ok",
                "https://no",
                true,
                "By paying you agree to the terms."
            ),
            IdempotencyKey.of("co", 42)
        );

        assertThat(url).isEqualTo("https://checkout.example/cs_1");
        Call c = rec.writes().get(0);
        assertThat(c.form()).containsEntry("line_items[0][price]", "price_base").containsEntry("line_items[0][quantity]", "1");
        assertThat(c.form()).containsEntry("line_items[1][price]", "price_addon").containsEntry("line_items[1][quantity]", "3");
        assertThat(c.form()).containsEntry("metadata[quote_id]", "42").containsEntry("metadata[app]", "kiwiply");
        assertThat(c.form()).containsEntry("subscription_data[metadata][quote_id]", "42");
        assertThat(c.form()).containsEntry("client_reference_id", "7").containsEntry("mode", "subscription").containsEntry("allow_promotion_codes", "true");
        assertThat(c.form()).containsKey("custom_text[submit][message]");
        assertThat(c.options().getIdempotencyKey()).isEqualTo("co-42");
        assertThat(c.options().getMaxNetworkRetries()).isEqualTo(StripeGatewayImpl.MAX_NETWORK_RETRIES);
    }

    @Test
    @DisplayName("setSubscriptionItems is one update: quantity change, removal as deleted, addition by price, proration_behavior=none")
    void setItemsOneUpdateNoProration() {
        rec.responses.put("GET /v1/subscriptions/sub_1", SUB);
        rec.responses.put("POST /v1/subscriptions/sub_1", "{\"id\":\"sub_1\",\"object\":\"subscription\"}");

        gateway.setSubscriptionItems("sub_1", List.of(new ItemQuantity("price_a", 3), new ItemQuantity("price_c", 2)), IdempotencyKey.of("sc", 5, "items"));

        assertThat(rec.writes()).hasSize(1);
        Call u = rec.writes().get(0);
        assertThat(u.form()).containsEntry("proration_behavior", "none");
        assertThat(u.form()).containsEntry("items[0][id]", "si_a").containsEntry("items[0][quantity]", "3");
        assertThat(u.form()).containsEntry("items[1][id]", "si_b").containsEntry("items[1][deleted]", "true");
        assertThat(u.form()).containsEntry("items[2][price]", "price_c").containsEntry("items[2][quantity]", "2");
        assertThat(u.options().getIdempotencyKey()).isEqualTo("sc-5-items");
    }

    @Test
    @DisplayName("A schedule is created from the subscription and given two phases, each call with its own derived key")
    void scheduleTwoPhases() {
        rec.responses.put(
            "POST /v1/subscription_schedules",
            "{\"id\":\"sched_1\",\"object\":\"subscription_schedule\",\"phases\":[{\"start_date\":1700000000,\"items\":[{\"price\":\"price_a\",\"quantity\":1}]}]}"
        );
        Instant at = Instant.ofEpochSecond(1800000000L);

        String id = gateway.createSchedule("sub_1", List.of(new ItemQuantity("price_year", 1)), at, IdempotencyKey.of("sch", 9));

        assertThat(id).isEqualTo("sched_1");
        assertThat(rec.writes()).hasSize(2);
        assertThat(rec.writes().get(0).form()).containsEntry("from_subscription", "sub_1");
        assertThat(rec.writes().get(0).options().getIdempotencyKey()).isEqualTo("sch-9");
        Call upd = rec.writes().get(1);
        assertThat(upd.path()).isEqualTo("/v1/subscription_schedules/sched_1");
        assertThat(upd.options().getIdempotencyKey()).isEqualTo("sch-9-phases");
        assertThat(upd.form()).containsEntry("phases[0][items][0][price]", "price_a").containsEntry("phases[0][end_date]", "1800000000");
        assertThat(upd.form()).containsEntry("phases[1][items][0][price]", "price_year").containsEntry("phases[1][start_date]", "1800000000");
        assertThat(upd.form()).containsEntry("end_behavior", "release");
    }

    @Test
    @DisplayName("Release, deactivate and cancel-at-period-end each carry their key")
    void smallWritesCarryKeys() {
        gateway.releaseSchedule("sched_1", IdempotencyKey.of("rel", 1));
        gateway.deactivatePrice("price_1", IdempotencyKey.of("deact", 1));
        gateway.setCancelAtPeriodEnd("sub_1", true, IdempotencyKey.of("cape", 1));

        assertThat(rec.writes()).extracting(c -> c.options().getIdempotencyKey()).containsExactly("rel-1", "deact-1", "cape-1");
        assertThat(rec.writes().get(1).form()).containsEntry("active", "false");
        assertThat(rec.writes().get(2).form()).containsEntry("cancel_at_period_end", "true");
    }

    @Test
    @DisplayName("Product and price creation: YEAR is month x 12, QUARTER month x 3, one-time has no recurring block, minor units, metadata tagged")
    void productAndPrices() {
        rec.responses.put("/v1/products", "{\"id\":\"prod_1\",\"object\":\"product\"}");
        rec.responses.put("/v1/prices", "{\"id\":\"price_1\",\"object\":\"price\"}");

        assertThat(gateway.createProduct(new ProductSpec("PRO", "Kiwiply Pro", null, Map.of("feature_key", "x")), IdempotencyKey.of("prod", "PRO"))).isEqualTo("prod_1");
        gateway.createPrice(new PriceSpec("prod_1", "USD", 4999, PriceInterval.YEAR, "Pro yearly", Map.of("price_row_id", "11")), IdempotencyKey.of("price", 11));
        gateway.createPrice(new PriceSpec("prod_1", "usd", 1999, PriceInterval.QUARTER, null, null), IdempotencyKey.of("price", 12));
        gateway.createPrice(new PriceSpec("prod_1", "usd", 500, PriceInterval.ONE_TIME, null, null), IdempotencyKey.of("price", 13));

        List<Call> w = rec.writes();
        assertThat(w.get(0).form()).containsEntry("metadata[product_code]", "PRO").containsEntry("metadata[app]", "kiwiply").containsEntry("name", "Kiwiply Pro");
        assertThat(w.get(0).options().getIdempotencyKey()).isEqualTo("prod-PRO");
        assertThat(w.get(1).form())
            .containsEntry("unit_amount", "4999")
            .containsEntry("currency", "usd")
            .containsEntry("recurring[interval]", "month")
            .containsEntry("recurring[interval_count]", "12")
            .containsEntry("metadata[price_row_id]", "11");
        assertThat(w.get(2).form()).containsEntry("recurring[interval_count]", "3");
        assertThat(w.get(3).form()).doesNotContainKey("recurring[interval]");
        assertThat(w.get(1).options().getIdempotencyKey()).isEqualTo("price-11");
    }

    @Test
    @DisplayName("A proration invoice item carries amount, period, the change metadata and its key; a new subscription anchors billing")
    void invoiceItemAndSubscription() {
        rec.responses.put("/v1/invoiceitems", "{\"id\":\"ii_1\",\"object\":\"invoiceitem\"}");
        rec.responses.put("/v1/subscriptions", "{\"id\":\"sub_new\",\"object\":\"subscription\"}");

        String ii = gateway.createInvoiceItem(
            "cus_1",
            1234,
            "USD",
            "Prorated: Extra AI credits x1",
            new Period(Instant.ofEpochSecond(1000), Instant.ofEpochSecond(2000)),
            Map.of("subscription_change_id", "77"),
            IdempotencyKey.of("sc", 77, "pro")
        );
        String sub = gateway.createSubscription("cus_1", List.of(new ItemQuantity("price_a", 1)), Instant.ofEpochSecond(3000), Map.of(), IdempotencyKey.of("subnew", 1));

        assertThat(ii).isEqualTo("ii_1");
        assertThat(sub).isEqualTo("sub_new");
        Call i = rec.writes().get(0);
        assertThat(i.form()).containsEntry("amount", "1234").containsEntry("currency", "usd").containsEntry("period[start]", "1000").containsEntry("period[end]", "2000");
        assertThat(i.form()).containsEntry("metadata[subscription_change_id]", "77");
        assertThat(i.options().getIdempotencyKey()).isEqualTo("sc-77-pro");
        Call s = rec.writes().get(1);
        assertThat(s.form()).containsEntry("billing_cycle_anchor", "3000").containsEntry("trial_end", "3000").containsEntry("proration_behavior", "none");
    }

    @Test
    @DisplayName("Invoice retrieval maps the mirror fields and lines, including the proration flag and the price of each line")
    void invoiceRetrievalForMirror() {
        rec.responses.put(
            "/v1/invoices/in_1",
            "{\"id\":\"in_1\",\"object\":\"invoice\",\"number\":\"K-0001\",\"status\":\"paid\",\"currency\":\"usd\",\"amount_due\":2500,\"amount_paid\":2500," +
            "\"period_start\":100,\"period_end\":200,\"status_transitions\":{\"paid_at\":150},\"hosted_invoice_url\":\"https://h\",\"invoice_pdf\":\"https://p\"," +
            "\"parent\":{\"type\":\"subscription_details\",\"subscription_details\":{\"subscription\":\"sub_1\"}}," +
            "\"lines\":{\"object\":\"list\",\"data\":[" +
            "{\"id\":\"il_1\",\"amount\":2000,\"quantity\":1,\"description\":\"Pro\",\"period\":{\"start\":100,\"end\":200}," +
            "\"pricing\":{\"price_details\":{\"price\":\"price_base\"}},\"parent\":{\"subscription_item_details\":{\"proration\":false}}}," +
            "{\"id\":\"il_2\",\"amount\":500,\"quantity\":2,\"description\":\"Prorated\"," +
            "\"pricing\":{\"price_details\":{\"price\":\"price_addon\"}},\"parent\":{\"subscription_item_details\":{\"proration\":true}}}]}}"
        );

        var inv = gateway.retrieveInvoice("in_1");

        assertThat(inv.number()).isEqualTo("K-0001");
        assertThat(inv.amountPaidMinor()).isEqualTo(2500);
        assertThat(inv.subscriptionId()).isEqualTo("sub_1");
        assertThat(inv.paidAt()).isEqualTo(Instant.ofEpochSecond(150));
        assertThat(inv.lines()).hasSize(2);
        assertThat(inv.lines().get(0).priceId()).isEqualTo("price_base");
        assertThat(inv.lines().get(0).proration()).isFalse();
        assertThat(inv.lines().get(1).proration()).isTrue();
        assertThat(inv.lines().get(1).quantity()).isEqualTo(2);
        assertThat(rec.writes()).isEmpty();
    }

    @Test
    @DisplayName("Stripe failures map to kinds: 429 retryable, connection retryable, invalid request not, idempotency key in use is a conflict")
    void errorMapping() {
        rec.failure = new RateLimitException("slow down", null, "req_1", "rate_limit", 429, null);
        assertThatThrownBy(() -> gateway.releaseSchedule("s", IdempotencyKey.of("k", 1)))
            .isInstanceOfSatisfying(StripeGatewayException.class, e -> {
                assertThat(e.getKind()).isEqualTo(StripeGatewayException.Kind.RATE_LIMITED);
                assertThat(e.isRetryable()).isTrue();
            });

        rec.failure = new ApiConnectionException("reset");
        assertThatThrownBy(() -> gateway.releaseSchedule("s", IdempotencyKey.of("k", 2)))
            .isInstanceOfSatisfying(StripeGatewayException.class, e -> assertThat(e.getKind()).isEqualTo(StripeGatewayException.Kind.CONNECTION));

        rec.failure = new InvalidRequestException("no such price", "price", "req_2", "resource_missing", 400, null);
        assertThatThrownBy(() -> gateway.deactivatePrice("p", IdempotencyKey.of("k", 3)))
            .isInstanceOfSatisfying(StripeGatewayException.class, e -> {
                assertThat(e.getKind()).isEqualTo(StripeGatewayException.Kind.INVALID_REQUEST);
                assertThat(e.getStripeCode()).isEqualTo("resource_missing");
                assertThat(e.isRetryable()).isFalse();
            });

        rec.failure = new InvalidRequestException("in use", null, "req_3", "idempotency_key_in_use", 409, null);
        assertThatThrownBy(() -> gateway.deactivatePrice("p", IdempotencyKey.of("k", 4)))
            .isInstanceOfSatisfying(StripeGatewayException.class, e -> assertThat(e.getKind()).isEqualTo(StripeGatewayException.Kind.IDEMPOTENCY_CONFLICT));
    }

    @Test
    @DisplayName("A write without an idempotency key is refused before anything is sent")
    void keyIsMandatory() {
        assertThatThrownBy(() -> gateway.releaseSchedule("s", null)).isInstanceOf(IllegalArgumentException.class);
        assertThat(rec.calls).isEmpty();
    }

    @Test
    @DisplayName("Blank key: every new method refuses with NOT_ENABLED and nothing is called")
    void disabledRefusesEverything() {
        StripeGatewayImpl off = new StripeGatewayImpl(props(""));
        IdempotencyKey k = IdempotencyKey.of("k", 1);
        List<ItemQuantity> items = List.of(new ItemQuantity("p", 1));
        List<Runnable> calls = List.of(
            () -> off.createCheckoutSession(new CheckoutSpec("c", 1L, items, null, "s", "c", false, null), k),
            () -> off.setSubscriptionItems("s", items, k),
            () -> off.setCancelAtPeriodEnd("s", true, k),
            () -> off.createInvoiceItem("c", 1, "usd", "d", null, null, k),
            () -> off.createSchedule("s", items, Instant.now(), k),
            () -> off.releaseSchedule("s", k),
            () -> off.createSubscription("c", items, Instant.now(), null, k),
            () -> off.previewUpcomingInvoice("c", "s", items, null),
            () -> off.listInvoices("c", 5, null),
            () -> off.retrieveInvoice("in"),
            () -> off.createProduct(new ProductSpec("X", "X", null, null), k),
            () -> off.createPrice(new PriceSpec("p", "usd", 1, PriceInterval.MONTH, null, null), k),
            () -> off.deactivatePrice("p", k),
            () -> off.createTestClock(Instant.now(), k),
            () -> off.advanceTestClock("c", Instant.now(), k)
        );
        assertThat(off.isEnabled()).isFalse();
        for (Runnable r : calls) {
            assertThatThrownBy(r::run)
                .isInstanceOfSatisfying(StripeGatewayException.class, e -> assertThat(e.getKind()).isEqualTo(StripeGatewayException.Kind.NOT_ENABLED));
        }
    }

    @Test
    @DisplayName("A live key refuses test clocks without calling Stripe; a test key accepts them")
    void liveKeyRefusesTestClocks() {
        StripeGatewayImpl live = new StripeGatewayImpl(props("sk_live_unit"), new StripeClient(rec));
        assertThatThrownBy(() -> live.createTestClock(Instant.now(), IdempotencyKey.of("tc", 1)))
            .isInstanceOfSatisfying(StripeGatewayException.class, e -> assertThat(e.getKind()).isEqualTo(StripeGatewayException.Kind.NOT_ENABLED));
        assertThatThrownBy(() -> live.advanceTestClock("clock_1", Instant.now(), IdempotencyKey.of("tc", 2))).isInstanceOf(StripeGatewayException.class);
        assertThat(rec.calls).isEmpty();

        rec.responses.put("/v1/test_helpers/test_clocks", "{\"id\":\"clock_1\",\"object\":\"test_helpers.test_clock\"}");
        assertThat(gateway.createTestClock(Instant.ofEpochSecond(1000), IdempotencyKey.of("tc", 3))).isEqualTo("clock_1");
        assertThat(rec.writes().get(0).form()).containsEntry("frozen_time", "1000");
    }

    @Test
    @DisplayName("IdempotencyKey: parts joined, derived child, length and character rules")
    void idempotencyKeyRules() {
        assertThat(IdempotencyKey.of("sc", 17, "items").value()).isEqualTo("sc-17-items");
        assertThat(IdempotencyKey.of("sc", 17).child("phases").value()).isEqualTo("sc-17-phases");
        assertThatThrownBy(() -> new IdempotencyKey("x".repeat(256))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new IdempotencyKey(" ")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new IdempotencyKey("has space")).isInstanceOf(IllegalArgumentException.class);
        assertThat(new IdempotencyKey("x".repeat(255)).value()).hasSize(255);
    }
}
