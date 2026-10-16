package com.dossier.api.service.billing;

/**
 * Applies organization-scoped Stripe events to the {@code org_*} mirrors (docs/enterprise-v2/26 s7). The seam exists since K8.1; until the real
 * implementation lands (X6.14) the router uses {@link #NOOP}, so organization events are recorded and acknowledged but never touch the personal
 * {@code subscription} mirror. A real implementation is a Spring bean; it is picked up automatically.
 */
public interface OrgBillingWebhookHandler {
    /** Called inside the webhook apply transaction, once per non-duplicate organization event. */
    void apply(StripeWebhookEvent event);

    OrgBillingWebhookHandler NOOP = event -> {};
}
