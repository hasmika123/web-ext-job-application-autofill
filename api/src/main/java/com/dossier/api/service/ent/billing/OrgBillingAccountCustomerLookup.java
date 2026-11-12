package com.dossier.api.service.ent.billing;

import com.dossier.api.service.billing.OrgBillingCustomerLookup;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Whether a Stripe customer is an organization's (docs/enterprise-v2/26 s7, ORG-BILLING-BUILD.md step 3a): the webhook router sends its events to the
 * organization handler even when an event carries no {@code kiwiply_scope} metadata. Also answers which organization it is.
 */
@Component
public class OrgBillingAccountCustomerLookup implements OrgBillingCustomerLookup {

    private final JdbcTemplate jdbc;

    public OrgBillingAccountCustomerLookup(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public boolean isOrgCustomer(String customerId) {
        return orgOf(customerId) != null;
    }

    /** The organization whose billing account holds this Stripe customer, or null. */
    public Long orgOf(String customerId) {
        if (customerId == null || customerId.isBlank()) return null;
        List<Long> ids = jdbc.queryForList("select org_id from org_billing_account where stripe_customer_id = ?", Long.class, customerId);
        return ids.isEmpty() ? null : ids.get(0);
    }
}
