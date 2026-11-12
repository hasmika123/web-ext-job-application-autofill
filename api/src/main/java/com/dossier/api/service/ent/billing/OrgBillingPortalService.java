package com.dossier.api.service.ent.billing;

import com.dossier.api.domain.ent.billing.OrgBillingAccount;
import com.dossier.api.repository.ent.OrgHostnameRepository;
import com.dossier.api.repository.ent.billing.OrgBillingAccountRepository;
import com.dossier.api.service.billing.StripeGateway;
import com.dossier.api.service.billing.StripeGatewayException;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import java.util.Optional;
import org.springframework.stereotype.Service;

/**
 * The Stripe billing portal for an organization (docs/enterprise-v2/ORG-BILLING-BUILD.md step 2, 26 s3): an Org Admin with {@code billing.manage} opens
 * the portal of the organization's own Stripe customer to see and pay invoices or change how it pays. It never opens a person's customer. 409
 * {@code BILLING_NOT_CONNECTED} until billing has been started with Stripe; the billing module and the permission gate come first (generic 404).
 */
@Service
public class OrgBillingPortalService {

    public static final String MANAGE = "billing.manage";

    public record Portal(String url) {}

    private final OrgBillingReadService read;
    private final OrgBillingAccountRepository accounts;
    private final OrgHostnameRepository hostnames;
    private final StripeGateway stripe;
    private final OrgAuditService audit;

    public OrgBillingPortalService(OrgBillingReadService read, OrgBillingAccountRepository accounts, OrgHostnameRepository hostnames, StripeGateway stripe, OrgAuditService audit) {
        this.read = read;
        this.accounts = accounts;
        this.hostnames = hostnames;
        this.stripe = stripe;
        this.audit = audit;
    }

    public Portal open(OrgMembership me) {
        read.gate(me, MANAGE);
        Optional<String> customer = accounts.findFirstByOrgId(me.orgId()).map(OrgBillingAccount::getStripeCustomerId).filter(c -> !c.isBlank());
        if (customer.isEmpty() || !stripe.isEnabled()) {
            throw new OrgException(409, "BILLING_NOT_CONNECTED", "Billing isn't connected for this organization yet.", null);
        }
        String url;
        try {
            url = stripe.createPortalSession(customer.get(), returnUrl(me.orgId()));
        } catch (StripeGatewayException e) {
            throw new OrgException(502, "BILLING_PROVIDER", "Stripe could not be reached. Try again.", null);
        }
        audit.record(me, OrgAuditService.BILLING_PORTAL, OrgAuditService.TARGET_ORG, null, String.valueOf(me.orgId()), "opened the billing portal");
        return new Portal(url);
    }

    /** Back to the organization's own Billing & Invoices page on its primary host. */
    String returnUrl(Long orgId) {
        String host = hostnames.findPrimaryByOrgId(orgId).map(h -> h.getHostname()).orElse(null);
        if (host == null || host.isBlank()) throw new OrgException(409, "BILLING_NOT_CONNECTED", "This organization has no address to come back to yet.", null);
        boolean local = host.equals("localhost") || host.endsWith(".localhost");
        return (local ? "http://" : "https://") + host + "/w/admin/billing";
    }
}
