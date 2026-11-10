package com.dossier.api.service.billing;

/** Which Stripe world a billing operation belongs to (decision O4: personal and enterprise accounts are never connected). */
public enum BillingScope {
    /** A personal account (kiwiply.com): the personal customer and subscription path. */
    PERSONAL,
    /** An enterprise account of an organization: the organization's customer and subscription. */
    ORG,
}
