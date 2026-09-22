package com.dossier.api.service.billing;

import java.math.BigDecimal;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Stripe configuration (Phase 12). Bound under {@code dossier.stripe.*} — NOT
 * {@code application.*}, which JHipster owns with {@code ignoreUnknownFields=false}.
 *
 * <p><b>A blank secret key disables billing.</b> That is the whole reason this class has an
 * {@link #isEnabled()}: {@code develop}, CI and any local checkout run without Stripe secrets,
 * and must still start, serve {@code /api/billing/me} (reporting Free + billing disabled) and
 * pass their tests. Checkout and portal return 503 {@code BILLING_DISABLED} instead of throwing.
 *
 * <p>Keys live in the server env only and never reach a client bundle.
 *
 * <p><b>Every id and secret here is trimmed on the way in.</b> These values are pasted into a
 * {@code .env} file or a shell by a human, and a trailing space or newline survives that trip
 * intact. Stripe rejects such a key with <i>"Your API key is invalid, as it contains
 * whitespace"</i> — but only when a call is actually made, so the server starts fine, reports
 * billing as enabled, and then fails at checkout with a message that points nowhere near the
 * cause. Cost an hour to diagnose once (2026-09-21); trimming here costs nothing.
 */
@ConfigurationProperties(prefix = "dossier.stripe")
public class StripeProperties {

    /** Secret API key (`sk_test_…` / `sk_live_…`). Blank ⇒ billing disabled. */
    private String secretKey = "";

    /** Webhook signing secret (`whsec_…`) — verifies that a delivery really came from Stripe. */
    private String webhookSecret = "";

    /** Price id for the $19.99/month plan. */
    private String priceMonthly = "";

    /** Price id for the $44.99/3-months plan. */
    private String price3mo = "";

    /**
     * What the monthly plan charges, for the admin MRR figure only (Phase 12.5) — never for
     * charging anyone. Stripe owns the real price; we don't mirror the amount on the
     * {@code subscription} row, so revenue has to be reconstructed from {@code price_id} plus
     * these. Config rather than constants so the Launch-2 price rise ($24.99 / $54.99) is a
     * deployment change, not a code change. Keep them in step with the Stripe prices — if they
     * drift, the only thing that lies is this one admin card.
     */
    private BigDecimal amountMonthly = new BigDecimal("19.99");

    /** What the 3-month plan charges, for the admin MRR figure only. See {@link #amountMonthly}. */
    private BigDecimal amount3mo = new BigDecimal("44.99");

    /** Where Stripe returns after a completed checkout. */
    private String successUrl = "https://kiwiply.com/billing/success?session_id={CHECKOUT_SESSION_ID}";

    /** Where Stripe returns if the user backs out of checkout. */
    private String cancelUrl = "https://kiwiply.com/pricing";

    /** Where the Billing Portal returns when the user is done. */
    private String portalReturnUrl = "https://kiwiply.com/settings#billing";

    /**
     * Stripe Managed Payments — Stripe becomes merchant of record and owns global sales tax/VAT,
     * fraud and disputes, for an extra 3.5% per transaction (user decision 2026-09-21).
     *
     * <p><b>Three states, and the default is "unset" on purpose.</b> Stripe now enables Managed
     * Payments <b>by default on new accounts</b>, so a boolean here could only ever turn it on —
     * the one thing it already was. {@code null} leaves the account's own setting alone,
     * {@code true} forces it on for each session, {@code false} forces it off. That last one is
     * the case that matters: the economics change with volume, and at scale the 3.5% may stop
     * being worth it. Opting out must be a config change, not a code change.
     *
     * <p>Unset rather than {@code false} by default because forcing it off would silently
     * discard the merchant-of-record arrangement on an account that had chosen it.
     */
    private Boolean managedPayments = null;

    /**
     * Stripe Tax on checkout. Redundant while {@link #managedPayments} is on (Stripe is then
     * liable for tax), and it errors outright if Stripe Tax isn't configured on the account —
     * which is exactly why it is a flag and defaults off.
     */
    private boolean automaticTax = false;

    /** True only when a secret key is configured. The single gate every billing path checks. */
    public boolean isEnabled() {
        return secretKey != null && !secretKey.isBlank();
    }

    /** Null-safe trim. A value that is nothing but whitespace becomes empty, i.e. "not set". */
    private static String trim(String value) {
        return value == null ? null : value.trim();
    }

    public String getSecretKey() {
        return secretKey;
    }

    public void setSecretKey(String secretKey) {
        this.secretKey = trim(secretKey);
    }

    public String getWebhookSecret() {
        return webhookSecret;
    }

    public void setWebhookSecret(String webhookSecret) {
        this.webhookSecret = trim(webhookSecret);
    }

    public BigDecimal getAmountMonthly() {
        return amountMonthly;
    }

    public void setAmountMonthly(BigDecimal amountMonthly) {
        this.amountMonthly = amountMonthly;
    }

    public BigDecimal getAmount3mo() {
        return amount3mo;
    }

    public void setAmount3mo(BigDecimal amount3mo) {
        this.amount3mo = amount3mo;
    }

    public String getPriceMonthly() {
        return priceMonthly;
    }

    public void setPriceMonthly(String priceMonthly) {
        this.priceMonthly = trim(priceMonthly);
    }

    public String getPrice3mo() {
        return price3mo;
    }

    public void setPrice3mo(String price3mo) {
        this.price3mo = trim(price3mo);
    }

    public String getSuccessUrl() {
        return successUrl;
    }

    public void setSuccessUrl(String successUrl) {
        this.successUrl = successUrl;
    }

    public String getCancelUrl() {
        return cancelUrl;
    }

    public void setCancelUrl(String cancelUrl) {
        this.cancelUrl = cancelUrl;
    }

    public String getPortalReturnUrl() {
        return portalReturnUrl;
    }

    public void setPortalReturnUrl(String portalReturnUrl) {
        this.portalReturnUrl = portalReturnUrl;
    }

    /** {@code null} = leave the Stripe account's own setting alone. See the field docs. */
    public Boolean getManagedPayments() {
        return managedPayments;
    }

    public void setManagedPayments(Boolean managedPayments) {
        this.managedPayments = managedPayments;
    }

    public boolean isAutomaticTax() {
        return automaticTax;
    }

    public void setAutomaticTax(boolean automaticTax) {
        this.automaticTax = automaticTax;
    }
}
