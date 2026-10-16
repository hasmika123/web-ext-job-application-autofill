package com.dossier.api.service.billing;

/**
 * The one seam between this codebase and Stripe (Phase 12).
 *
 * <p>Every call that touches Stripe goes through here, and {@code StripeGatewayImpl} is the only
 * class allowed to import {@code com.stripe.*}. Two reasons: tests stub this interface instead
 * of talking to a network or fighting Stripe's final model classes, and swapping or upgrading
 * the SDK stays a one-file change — the same seam rule the {@code AiProvider} and the
 * extension's {@code TrackingProvider} follow.
 *
 * <p>Implementations throw {@link StripeGatewayException} for anything Stripe rejects.
 */
public interface StripeGateway {
    /** True when a secret key is configured. False ⇒ every other method here will refuse. */
    boolean isEnabled();

    /**
     * Create a Stripe customer for a user. Called once, on their first checkout; the id is then
     * stored on the subscription row and reused.
     *
     * @return the new customer id (`cus_…`)
     */
    String createCustomer(String email, String login, Long userId);

    /**
     * Start a hosted Checkout Session for a subscription.
     *
     * <p>{@code userId} becomes the session's {@code client_reference_id}, which is how the
     * webhook binds the resulting Stripe customer back to our user — the return URL is never
     * trusted for that.
     *
     * @return the URL to send the browser to
     */
    String createCheckoutSession(String customerId, String priceId, Long userId, String successUrl, String cancelUrl);

    /**
     * Whether this Stripe customer already has a subscription Stripe considers live.
     *
     * <p>Asked before starting a second checkout. Our {@code subscription} mirror cannot answer
     * this: it is only as current as the last webhook, and the whole failure mode this guards
     * against is a checkout that happens while the mirror is behind.
     *
     * @return false when billing is off, so a keyless server never blocks on this
     */
    boolean hasLiveSubscription(String customerId);

    /**
     * Cancel a subscription in Stripe, immediately.
     *
     * <p>Used when an account is deleted: a subscription that outlives its account keeps
     * charging someone who has no login left to cancel from. Immediate rather than at period
     * end, because there will be no account to enjoy the remainder of the period — and the
     * refund policy the user agreed to already covers the unused part.
     *
     * <p>Tolerant of a subscription that is already cancelled or gone: the goal is "not
     * billing", and both of those states satisfy it.
     */
    void cancelSubscription(String subscriptionId);

    /**
     * Start a Billing Portal session — where the user updates their card or cancels.
     * This is the click-to-cancel path (FTC rule / California ARL), not a page we build.
     *
     * @return the URL to send the browser to
     */
    String createPortalSession(String customerId, String returnUrl);

    /**
     * Verify a webhook delivery's signature against the raw request body and return the parsed
     * event. Throws {@link StripeGatewayException} if the signature doesn't match — which is the
     * only thing standing between this endpoint and anyone on the internet posting fake billing
     * events at it, so the caller must treat a throw as "reject, record nothing".
     */
    StripeWebhookEvent constructEvent(String payload, String signatureHeader);

    // ------------------------------------------------------------------------------------------------------------------
    // K8.2 growth for the unified Subscription module (docs/subscriptions/07-stripe-mapping.md s2, 26 s3).
    // Every method below: refuses with StripeGatewayException(Kind.NOT_ENABLED) when !isEnabled(); every WRITE takes a
    // mandatory IdempotencyKey; failures are mapped to StripeGatewayException.Kind; the SDK retries network errors and
    // 429s (max 2), which is safe because of the key.
    // ------------------------------------------------------------------------------------------------------------------

    /** A price and a quantity: a checkout line, a subscription item, a schedule-phase item. */
    record ItemQuantity(String priceId, long quantity) {
        public ItemQuantity {
            if (priceId == null || priceId.isBlank()) throw new IllegalArgumentException("priceId is required");
            if (quantity < 0) throw new IllegalArgumentException("quantity must not be negative");
        }
    }

    /** A billing period, used to label proration invoice items. */
    record Period(java.time.Instant start, java.time.Instant end) {}

    /** Billing interval of a Stripe price. YEAR and QUARTER are month-based prices (07 s1: interval=month, interval_count 12 / 3). */
    enum PriceInterval {
        MONTH(1),
        QUARTER(3),
        YEAR(12),
        ONE_TIME(0);

        private final int intervalCount;

        PriceInterval(int intervalCount) {
            this.intervalCount = intervalCount;
        }

        public int intervalCount() {
            return intervalCount;
        }

        public boolean isRecurring() {
            return this != ONE_TIME;
        }
    }

    /**
     * A Checkout Session from a quote (07 s2.1): {@code lines} become {@code line_items}; {@code metadata} (quote_id, plan_version_id, app) goes on the
     * session AND the subscription. {@code customerId} is required, {@code userId} becomes the client_reference_id, {@code consentText} (nullable) is
     * shown as the terms-of-service custom text above the pay button.
     */
    record CheckoutSpec(
        String customerId,
        Long userId,
        java.util.List<ItemQuantity> lines,
        java.util.Map<String, String> metadata,
        String successUrl,
        String cancelUrl,
        boolean allowPromotionCodes,
        String consentText
    ) {
        public CheckoutSpec {
            if (lines == null || lines.isEmpty()) throw new IllegalArgumentException("a checkout needs at least one line");
            lines = java.util.List.copyOf(lines);
            metadata = metadata == null ? java.util.Map.of() : java.util.Map.copyOf(metadata);
        }
    }

    /** One Product per catalog product row; {@code code} is the idempotency anchor ({@code prod-{code}}) and goes in metadata. */
    record ProductSpec(String code, String name, String description, java.util.Map<String, String> metadata) {
        public ProductSpec {
            metadata = metadata == null ? java.util.Map.of() : java.util.Map.copyOf(metadata);
        }
    }

    /** One Price per catalog price row. Amount in minor units. Never edited once created; retire with {@link #deactivatePrice}. */
    record PriceSpec(
        String productId,
        String currency,
        long unitAmountMinor,
        PriceInterval interval,
        String nickname,
        java.util.Map<String, String> metadata
    ) {
        public PriceSpec {
            if (unitAmountMinor < 0) throw new IllegalArgumentException("amount must not be negative");
            if (interval == null) throw new IllegalArgumentException("interval is required");
            metadata = metadata == null ? java.util.Map.of() : java.util.Map.copyOf(metadata);
        }
    }

    /** A read-only preview of the next invoice (tax is an estimate only, C3). */
    record UpcomingInvoicePreview(long subtotalMinor, long taxMinor, long totalMinor, String currency, java.util.List<InvoiceLine> lines) {}

    /** One invoice line: what the invoice mirror stores per line (03 s10). */
    record InvoiceLine(
        String priceId,
        long quantity,
        long amountMinor,
        String description,
        java.time.Instant periodStart,
        java.time.Instant periodEnd,
        boolean proration
    ) {}

    /** An invoice as the mirror needs it. */
    record InvoiceSummary(
        String id,
        String number,
        String status,
        String currency,
        long amountDueMinor,
        long amountPaidMinor,
        java.time.Instant periodStart,
        java.time.Instant periodEnd,
        java.time.Instant dueAt,
        java.time.Instant paidAt,
        String hostedUrl,
        String pdfUrl,
        String subscriptionId,
        java.util.List<InvoiceLine> lines
    ) {}

    /** Checkout from a quote: line items, metadata, consent text. Returns the hosted URL. Key convention {@code co-{quoteId}}. */
    String createCheckoutSession(CheckoutSpec spec, IdempotencyKey key);

    /**
     * Make the subscription's items equal {@code items} (price to quantity) in ONE update: prices missing from the subscription are added, present ones get
     * the new quantity, present ones absent from the list or at quantity 0 are deleted. Always {@code proration_behavior=none} (Kiwiply prorates, 03 s6.1).
     */
    void setSubscriptionItems(String subscriptionId, java.util.List<ItemQuantity> items, IdempotencyKey key);

    void setCancelAtPeriodEnd(String subscriptionId, boolean cancel, IdempotencyKey key);

    /** A Kiwiply-computed proration as a pending invoice item on the customer. Returns the invoice item id. */
    String createInvoiceItem(
        String customerId,
        long amountMinor,
        String currency,
        String description,
        Period period,
        java.util.Map<String, String> metadata,
        IdempotencyKey key
    );

    /**
     * Interval or plan change at period end (lifecycle L3): create a schedule from the subscription whose first phase is the current items until
     * {@code at} and whose second phase is {@code phaseItems} from {@code at}, ending with release. Returns the schedule id. Uses {@code key} and
     * {@code key.child("phases")}.
     */
    String createSchedule(String subscriptionId, java.util.List<ItemQuantity> phaseItems, java.time.Instant at, IdempotencyKey key);

    void releaseSchedule(String scheduleId, IdempotencyKey key);

    /**
     * A new subscription for the customer's saved payment method whose billing starts at {@code startBillingAt}
     * ({@code billing_cycle_anchor} and {@code trial_end} = that instant; NOT a free trial, 07 s2.3).
     */
    String createSubscription(
        String customerId,
        java.util.List<ItemQuantity> items,
        java.time.Instant startBillingAt,
        java.util.Map<String, String> metadata,
        IdempotencyKey key
    );

    /** Read-only. {@code proposed} null previews the subscription as it is; {@code couponId} may be null. */
    UpcomingInvoicePreview previewUpcomingInvoice(String customerId, String subscriptionId, java.util.List<ItemQuantity> proposed, String couponId);

    /** Read-only; newest first, {@code startingAfter} is an invoice id or null. */
    java.util.List<InvoiceSummary> listInvoices(String customerId, int limit, String startingAfter);

    /** Read-only: one invoice with its lines, for the mirror. */
    InvoiceSummary retrieveInvoice(String invoiceId);

    String createProduct(ProductSpec spec, IdempotencyKey key);

    String createPrice(PriceSpec spec, IdempotencyKey key);

    void deactivatePrice(String priceId, IdempotencyKey key);

    /** Test mode only: refuses with {@code Kind.NOT_ENABLED} when the configured key is a live key. Returns the clock id. */
    String createTestClock(java.time.Instant frozenAt, IdempotencyKey key);

    /** Test mode only (same guard as {@link #createTestClock}). */
    void advanceTestClock(String clockId, java.time.Instant to, IdempotencyKey key);
}
