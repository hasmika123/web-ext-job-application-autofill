package com.dossier.api.service.org;

import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.billing.StripeGateway;
import com.dossier.api.service.dto.org.OrgBillingDTO;
import com.dossier.api.service.dto.org.OrgDetailDTO;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Billing-off activation (E2E-O4.0): the path by which an organization reaches {@code ACTIVE} while Stripe is not
 * connected, so every org page can be built and demoed before org billing (Wave 5) exists. In production the setup-fee
 * webhook moves {@code PENDING_SETUP_FEE -> ACTIVE} (tenant-model.md section 3); this is the dev / CI / demo stand-in.
 *
 * <p>It is available only when BOTH hold: {@code dossier.orgs.dev-activate=true} (env {@code ORGS_DEV_ACTIVATE}; the dev
 * profile and the test suite turn it on, production never sets it) AND {@link StripeGateway#isEnabled()} is false. When
 * either fails the endpoint answers the generic 404, exactly as for an org that does not exist. Only the OWNER may
 * activate. {@code DRAFT} and {@code PENDING_SETUP_FEE} become {@code ACTIVE} (one audit row {@code BILLING_DEV_ACTIVATED});
 * an already ACTIVE org is left alone (idempotent, nothing to audit); any other state is a 409 {@code ORG_NOT_EDITABLE}.
 * No setup-fee timestamp is written: no fee was paid.
 */
@Service
public class OrgActivationService {

    private final OrganizationRepository orgs;
    private final OrgAuditService audit;
    private final OrgService orgService;
    private final StripeGateway stripe;
    private final boolean devActivate;

    public OrgActivationService(
        OrganizationRepository orgs,
        OrgAuditService audit,
        OrgService orgService,
        StripeGateway stripe,
        @Value("${dossier.orgs.dev-activate:false}") boolean devActivate
    ) {
        this.orgs = orgs;
        this.audit = audit;
        this.orgService = orgService;
        this.stripe = stripe;
        this.devActivate = devActivate;
    }

    /** True when this environment lets an OWNER activate without paying. */
    public boolean available() {
        return devActivate && !stripe.isEnabled();
    }

    /** The billing skeleton for {@code GET /api/orgs/{id}/billing}. Org billing fills in the rest (O4.6). */
    @Transactional(readOnly = true)
    public OrgBillingDTO billing(OrgMembership me) {
        Organization org = orgs.findByOrgId(me.orgId()).orElseThrow(OrgNotFoundException::new);
        boolean open = available() && me.role() == OrgRole.OWNER && (org.getStatus() == OrgStatus.DRAFT || org.getStatus() == OrgStatus.PENDING_SETUP_FEE);
        return new OrgBillingDTO(org.getStatus(), stripe.isEnabled(), open, null, List.of(), List.of());
    }

    /** DRAFT (or PENDING_SETUP_FEE) -> ACTIVE for the OWNER, when the environment allows it; otherwise the generic 404. */
    @Transactional
    public OrgDetailDTO activate(OrgMembership me) {
        if (!available() || me.role() != OrgRole.OWNER) throw new OrgNotFoundException();
        Organization org = orgs.findByOrgId(me.orgId()).orElseThrow(OrgNotFoundException::new);
        OrgStatus before = org.getStatus();
        if (before == OrgStatus.ACTIVE) return orgService.get(me); // already live: nothing changed, nothing to audit
        if (before != OrgStatus.DRAFT && before != OrgStatus.PENDING_SETUP_FEE) throw OrgException.notEditable("This organization can't be activated from its current state");
        org.setStatus(OrgStatus.ACTIVE);
        orgs.saveAndFlush(org);
        audit.record(me, OrgAuditService.BILLING_DEV_ACTIVATED, OrgAuditService.TARGET_ORG, null, org.getId().toString(), "status " + before + " -> ACTIVE (billing off)");
        return orgService.get(me);
    }
}
