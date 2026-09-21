package com.dossier.api.service.billing;

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

    /** Where Stripe returns after a completed checkout. */
    private String successUrl = "https://kiwiply.com/billing/success?session_id={CHECKOUT_SESSION_ID}";

    /** Where Stripe returns if the user backs out of checkout. */
    private String cancelUrl = "https://kiwiply.com/pricing";

    /** Where the Billing Portal returns when the user is done. */
    private String portalReturnUrl = "https://kiwiply.com/settings#billing";

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
}
