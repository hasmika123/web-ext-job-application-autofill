package com.dossier.api.service.ent.licenses;

import com.dossier.api.service.org.OrgMembership;
import java.util.Set;

/**
 * Carries out a confirmed licence quote (docs/enterprise-v2/deferred/org-billing-pages.md DD-14). {@link LocalBillingApplier} is the only implementation
 * until Stripe is connected (ORG-BILLING-BUILD.md step 3): it changes the licence rows and moves no money. A Stripe applier will replace it behind this
 * interface; what a change grants stays the same.
 */
public interface LicenseChangeApplier {
    /** Give the consultant a licence ({@code hasLicence} false) or set its add-ons to exactly {@code features}, recording {@code quoteId}. */
    OrgLicenseService.Detail apply(OrgMembership me, Long consultantId, boolean hasLicence, Set<String> features, Long quoteId);
}
