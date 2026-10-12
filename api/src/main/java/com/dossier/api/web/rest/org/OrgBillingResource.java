package com.dossier.api.web.rest.org;

import com.dossier.api.domain.enumeration.OrgPermission;
import com.dossier.api.service.DemoGuard;
import com.dossier.api.service.dto.org.OrgBillingDTO;
import com.dossier.api.service.dto.org.OrgDetailDTO;
import com.dossier.api.service.org.OrgActivationService;
import com.dossier.api.service.org.OrgMembership;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * An org's money, as far as it exists today (E2E-O4.0): a read-only skeleton of the billing state and the billing-off
 * activation path. Org billing proper (setup fee, seats, invoices) is Wave 5 (O4.x) and replaces the skeleton's content, not
 * its URLs. Reading needs {@code billing.view}; activating needs {@code billing.manage} and, inside the service, the OWNER role.
 */
@RestController
@RequestMapping("/api/orgs/{orgId}")
public class OrgBillingResource {

    private final OrgActivationService activation;
    private final DemoGuard demoGuard;

    public OrgBillingResource(OrgActivationService activation, DemoGuard demoGuard) {
        this.activation = activation;
        this.demoGuard = demoGuard;
    }

    /** {@code {status, billingEnabled, devActivation, subscription: null, items: [], invoices: []}}. */
    @GetMapping("/billing")
    @OrgPermissionRequired(OrgPermission.BILLING_VIEW)
    public OrgBillingDTO billing(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return activation.billing(me);
    }

    /**
     * DRAFT to ACTIVE without paying: only the OWNER, only when {@code dossier.orgs.dev-activate} is on and Stripe is not
     * connected; any other environment answers the generic 404 (production never sets the flag).
     */
    @PostMapping("/activate")
    @OrgPermissionRequired(OrgPermission.BILLING_MANAGE)
    public OrgDetailDTO activate(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        demoGuard.assertNotDemo();
        return activation.activate(me);
    }
}
