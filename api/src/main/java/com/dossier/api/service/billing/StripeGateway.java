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
}
