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
     * <p>A flag, not a constant, for two reasons: it isn't available in every sandbox, and the
     * economics change with volume — at scale the 3.5% may stop being worth it, and turning it
     * off must not require a code change. Off by default so a misconfigured server fails toward
     * the plain Stripe flow rather than toward a tax arrangement nobody chose.
     */
    private boolean managedPayments = false;

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

    public String getSecretKey() {
        return secretKey;
    }

    public void setSecretKey(String secretKey) {
        this.secretKey = secretKey;
    }

    public String getWebhookSecret() {
        return webhookSecret;
    }

    public void setWebhookSecret(String webhookSecret) {
        this.webhookSecret = webhookSecret;
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
        this.priceMonthly = priceMonthly;
    }

    public String getPrice3mo() {
        return price3mo;
    }

    public void setPrice3mo(String price3mo) {
        this.price3mo = price3mo;
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

    public boolean isManagedPayments() {
        return managedPayments;
    }

    public void setManagedPayments(boolean managedPayments) {
        this.managedPayments = managedPayments;
    }

    public boolean isAutomaticTax() {
        return automaticTax;
    }

    public void setAutomaticTax(boolean automaticTax) {
        this.automaticTax = automaticTax;
    }
}
