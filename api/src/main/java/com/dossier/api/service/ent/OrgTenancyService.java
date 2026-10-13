package com.dossier.api.service.ent;

import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.OrgHostnameRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The single writer of an organization's tenancy fields (subdomain today; hostnames and branding in their stories). Every
 * write bumps {@code organization.config_version} so anything caching a tenant lookup (the resolver, X1.3) can tell it is
 * stale, and appends one audit row. It takes the organization id explicitly and never reads a tenant from the request.
 *
 * <p>Callers are platform-admin or org-admin endpoints that have already passed their own permission check; this service
 * only enforces the data rules (well-formed, not reserved, not taken).
 */
@Service
public class OrgTenancyService {

    private final OrganizationRepository organizations;
    private final OrgHostnameRepository hostnames;
    private final OrgAuditService audit;

    public OrgTenancyService(OrganizationRepository organizations, OrgHostnameRepository hostnames, OrgAuditService audit) {
        this.organizations = organizations;
        this.hostnames = hostnames;
        this.audit = audit;
    }

    /**
     * Gives the organization the {@code kiwiply.com} label {@code rawLabel} (null clears it and switches the subdomain off)
     * and turns the subdomain on or off. 422 {@code ORG_INVALID} for a malformed label, 422 {@code RESERVED_VALUE} for a
     * reserved one, 409 {@code SUBDOMAIN_TAKEN} when another organization owns it, 404 when the organization is unknown.
     * Enabling needs a label. Writes one audit row and bumps {@code config_version}.
     */
    @Transactional
    public Organization setSubdomain(Long orgId, String rawLabel, boolean enabled) {
        Organization org = organizations.findByOrgId(orgId).orElseThrow(OrgNotFoundException::new);
        String label = rawLabel == null || rawLabel.isBlank() ? null : OrgSubdomains.requireValid(rawLabel);
        if (label == null && enabled) throw OrgException.invalid("subdomain", "is required to switch the subdomain on");
        if (label != null) {
            Organization owner = hostnames.findBySubdomain(label).orElse(null);
            if (owner != null && !owner.getId().equals(orgId)) throw OrgException.subdomainTaken(label);
        }
        org.setSubdomain(label);
        org.setSubdomainEnabled(label != null && enabled);
        org.setConfigVersion(org.getConfigVersion() + 1);
        Organization saved = organizations.saveAndFlush(org);
        audit.record(orgId, null, OrgAuditService.ORG_SUBDOMAIN_SET, OrgAuditService.TARGET_ORG, null, String.valueOf(orgId), "subdomain=" + (label == null ? "-" : label) + " enabled=" + saved.isSubdomainEnabled());
        return saved;
    }
}
