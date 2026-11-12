package com.dossier.api.service.ent.licenses;

import com.dossier.api.service.org.OrgMembership;
import java.util.Set;
import org.springframework.stereotype.Service;

/**
 * The licence-change applier while billing is local (ORG-BILLING-BUILD.md step 1b): it writes the licence rows, the {@code license_change} rows (with the
 * quote id), the audit row and the subscription history through {@link OrgLicenseService}. No money moves and nothing is sent to Stripe.
 */
@Service
public class LocalBillingApplier implements LicenseChangeApplier {

    private final OrgLicenseService licenses;

    public LocalBillingApplier(OrgLicenseService licenses) {
        this.licenses = licenses;
    }

    @Override
    public OrgLicenseService.Detail apply(OrgMembership me, Long consultantId, boolean hasLicence, Set<String> features, Long quoteId) {
        return hasLicence ? licenses.setFeatures(me, consultantId, features, quoteId) : licenses.give(me, consultantId, features, quoteId);
    }
}
