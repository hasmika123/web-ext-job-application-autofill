package com.dossier.api.service.billing.personal;

import com.dossier.api.service.billing.IdempotencyKey;
import com.dossier.api.service.billing.StripeGateway;
import com.dossier.api.service.billing.StripeGatewayException;
import com.dossier.api.service.billing.StripeWebhookEvent;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * A scripted Stripe for the personal billing tests (the {@code FakeStripeGateway} of docs/subscriptions/07 section 7). It records every write, replays a
 * repeated idempotency key without counting it as a new effect (like Stripe), and can be told to fail the next writes. Switch it with {@link #enabled}.
 */
public class FakeStripeGateway implements StripeGateway {

    public record ItemsCall(String subscriptionId, List<ItemQuantity> items, String key) {}

    public record InvoiceItemCall(String customerId, long amountMinor, String currency, String description, Map<String, String> metadata, String key) {}

    public boolean enabled = true;
    public boolean liveSubscription = false;
    /** The next N writes throw a retryable failure (before any effect). */
    public int failNextWrites = 0;
    public StripeGatewayException.Kind failKind = StripeGatewayException.Kind.CONNECTION;

    public final List<ItemsCall> itemCalls = new ArrayList<>();
    public final List<InvoiceItemCall> invoiceItemCalls = new ArrayList<>();
    public final List<CheckoutSpec> checkoutSpecs = new ArrayList<>();
    public final List<String> checkoutKeys = new ArrayList<>();
    public List<InvoiceSummary> invoices = new ArrayList<>();
    private final Set<String> seenKeys = new HashSet<>();
    private final Map<String, String> results = new HashMap<>();
    private int counter = 0;

    public void reset() {
        enabled = true;
        liveSubscription = false;
        failNextWrites = 0;
        failKind = StripeGatewayException.Kind.CONNECTION;
        itemCalls.clear();
        invoiceItemCalls.clear();
        checkoutSpecs.clear();
        checkoutKeys.clear();
        invoices = new ArrayList<>();
        seenKeys.clear();
        results.clear();
        okItemKeys.clear();
        okInvoiceKeys.clear();
    }

    /** Effects Stripe would have recorded: calls whose key it had not seen before. */
    public long effectiveItemCalls() {
        return okItemKeys.size();
    }

    public long effectiveInvoiceItems() {
        return okInvoiceKeys.size();
    }

    private final Set<String> okItemKeys = new HashSet<>();
    private final Set<String> okInvoiceKeys = new HashSet<>();

    private void maybeFail() {
        if (failNextWrites > 0) {
            failNextWrites--;
            throw new StripeGatewayException("scripted failure", failKind, null, null);
        }
    }

    private String replayOr(IdempotencyKey key, String fresh) {
        if (!seenKeys.add(key.value())) return results.get(key.value());
        results.put(key.value(), fresh);
        return fresh;
    }

    @Override
    public boolean isEnabled() {
        return enabled;
    }

    @Override
    public String createCustomer(String email, String login, Long userId) {
        return "cus_fake_" + (++counter);
    }

    @Override
    public String createCheckoutSession(String customerId, String priceId, Long userId, String successUrl, String cancelUrl) {
        return "https://checkout.test/legacy";
    }

    @Override
    public boolean hasLiveSubscription(String customerId) {
        return liveSubscription;
    }

    @Override
    public void cancelSubscription(String subscriptionId) {}

    @Override
    public String createPortalSession(String customerId, String returnUrl) {
        return "https://portal.test/session";
    }

    @Override
    public StripeWebhookEvent constructEvent(String payload, String signatureHeader) {
        throw new UnsupportedOperationException("not scripted");
    }

    @Override
    public String createCheckoutSession(CheckoutSpec spec, IdempotencyKey key) {
        checkoutSpecs.add(spec);
        checkoutKeys.add(key.value());
        maybeFail();
        return replayOr(key, "https://checkout.test/" + key.value());
    }

    @Override
    public void setSubscriptionItems(String subscriptionId, List<ItemQuantity> items, IdempotencyKey key) {
        itemCalls.add(new ItemsCall(subscriptionId, List.copyOf(items), key.value()));
        maybeFail();
        okItemKeys.add(key.value());
    }

    @Override
    public void setCancelAtPeriodEnd(String subscriptionId, boolean cancel, IdempotencyKey key) {}

    @Override
    public String createInvoiceItem(String customerId, long amountMinor, String currency, String description, Period period, Map<String, String> metadata, IdempotencyKey key) {
        invoiceItemCalls.add(new InvoiceItemCall(customerId, amountMinor, currency, description, metadata, key.value()));
        maybeFail();
        okInvoiceKeys.add(key.value());
        return replayOr(key, "ii_fake_" + (++counter));
    }

    @Override
    public String createSchedule(String subscriptionId, List<ItemQuantity> phaseItems, Instant at, IdempotencyKey key) {
        return "sub_sched_fake";
    }

    @Override
    public void releaseSchedule(String scheduleId, IdempotencyKey key) {}

    @Override
    public String createSubscription(String customerId, List<ItemQuantity> items, Instant startBillingAt, Map<String, String> metadata, IdempotencyKey key) {
        return "sub_fake_new";
    }

    @Override
    public UpcomingInvoicePreview previewUpcomingInvoice(String customerId, String subscriptionId, List<ItemQuantity> proposed, String couponId) {
        return new UpcomingInvoicePreview(0, 0, 0, "usd", List.of());
    }

    @Override
    public List<InvoiceSummary> listInvoices(String customerId, int limit, String startingAfter) {
        return invoices;
    }

    @Override
    public InvoiceSummary retrieveInvoice(String invoiceId) {
        return null;
    }

    @Override
    public String createProduct(ProductSpec spec, IdempotencyKey key) {
        return "prod_fake";
    }

    @Override
    public String createPrice(PriceSpec spec, IdempotencyKey key) {
        return "price_fake";
    }

    @Override
    public void deactivatePrice(String priceId, IdempotencyKey key) {}

    @Override
    public String createTestClock(Instant frozenAt, IdempotencyKey key) {
        return "clock_fake";
    }

    @Override
    public void advanceTestClock(String clockId, Instant to, IdempotencyKey key) {}

    /** The catalog reconciler's read of Stripe (merge of the catalog and add-ons streams): this fake has no Stripe prices. */
    @Override
    public List<StripePriceInfo> listPrices(int max) {
        return List.of();
    }
}
