package com.dossier.api.service.billing;

/**
 * Whether a Stripe customer id belongs to an organization's billing account (26 s7: {@code customerId in org_billing_account}). A seam so the router
 * does not depend on the org mirror before it carries Stripe ids (X6.12); the default answer is "no".
 */
@FunctionalInterface
public interface OrgBillingCustomerLookup {
    boolean isOrgCustomer(String customerId);

    OrgBillingCustomerLookup NONE = id -> false;
}
