package com.dossier.api.service.ent;

import com.dossier.api.domain.ent.HostNames;
import com.dossier.api.domain.ent.OrgHostname;
import com.dossier.api.domain.enumeration.HostnameCertState;
import com.dossier.api.domain.enumeration.OrgHostnameKind;
import com.dossier.api.domain.enumeration.OrgHostnameStatus;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.OrgHostnameRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.org.OrgSlugs;
import java.time.Instant;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

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
    private final TenantResolver resolver;

    public OrgTenancyService(OrganizationRepository organizations, OrgHostnameRepository hostnames, OrgAuditService audit, TenantResolver resolver) {
        this.organizations = organizations;
        this.hostnames = hostnames;
        this.audit = audit;
        this.resolver = resolver;
    }

    /**
     * Forgets every cached host-to-tenant answer once the surrounding transaction has committed (at once when there is
     * none), so the very next request sees the change. Every tenancy write calls this; a rolled-back write evicts nothing.
     */
    void evictTenantCacheAfterCommit() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    resolver.invalidate();
                }
            });
        } else {
            resolver.invalidate();
        }
    }

    /**
     * Gives the organization the {@code kiwiply.com} label {@code rawLabel} (null clears it and switches the subdomain off)
     * and turns the subdomain on or off. 422 {@code ORG_INVALID} for a malformed label, 422 {@code RESERVED_VALUE} for a
     * reserved one, 409 {@code SUBDOMAIN_TAKEN} when another organization owns it, 404 when the organization is unknown.
     * Enabling needs a label. Writes one audit row, bumps {@code config_version} and evicts the tenant cache after commit.
     */
    @Transactional
    public Organization setSubdomain(Long orgId, String rawLabel, boolean enabled) {
        Organization saved = applySubdomain(orgId, rawLabel, enabled);
        audit.record(orgId, null, OrgAuditService.ORG_SUBDOMAIN_SET, OrgAuditService.TARGET_ORG, null, String.valueOf(orgId), "subdomain=" + (saved.getSubdomain() == null ? "-" : saved.getSubdomain()) + " enabled=" + saved.isSubdomainEnabled());
        return saved;
    }

    /** The data rules and the write of {@link #setSubdomain}, without its audit row (the platform-admin paths write their own). */
    private Organization applySubdomain(Long orgId, String rawLabel, boolean enabled) {
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
        evictTenantCacheAfterCommit();
        return saved;
    }

    /** What a provisioning produced: the organization and the hostname row that now serves it. */
    public record Provisioned(Organization org, OrgHostname hostname) {}

    /**
     * Platform-admin provisioning (X1.11): gives the organization {@code rawLabel}.kiwiply.com. Sets the organization's subdomain
     * and switches it on, and makes sure one {@code SUBDOMAIN} hostname row {@code hostname} is {@code ACTIVE} (the primary one when
     * the organization has no primary yet). A different SUBDOMAIN row the organization held is ended ({@code REMOVED}). Rules and
     * errors as {@link #setSubdomain}, except that a label owned by another organization is 409 {@code SLUG_TAKEN} with a
     * suggestion, because the admin page offers it. Bumps {@code config_version} and evicts the tenant cache after commit; writes NO
     * audit row (the caller writes the admin row and the organization row, once).
     */
    @Transactional
    public Provisioned provisionSubdomain(Long orgId, String rawLabel, String hostname) {
        String label = OrgSubdomains.requireValid(rawLabel);
        Organization owner = hostnames.findBySubdomain(label).orElse(null);
        if (owner != null && !owner.getId().equals(orgId)) throw OrgException.slugTaken(label, suggestFree(label));
        String canonical = HostNames.normalise(hostname);
        if (canonical == null) throw OrgException.invalid("subdomain", "does not make a valid hostname");
        Organization saved = applySubdomain(orgId, label, true);
        Instant now = Instant.now();
        OrgHostname row = null;
        for (OrgHostname h : hostnames.findByOrgIdOrderByCreatedAt(orgId)) {
            if (h.getKind() != OrgHostnameKind.SUBDOMAIN || h.getStatus() == OrgHostnameStatus.REMOVED) continue;
            if (h.getHostname().equals(canonical)) {
                row = h;
            } else {
                h.setStatus(OrgHostnameStatus.REMOVED);
                h.setRemovedAt(now);
                h.setPrimary(false);
                hostnames.saveAndFlush(h);
            }
        }
        if (row == null) {
            row = new OrgHostname();
            row.setOrgId(orgId);
            row.setHostname(canonical);
            row.setKind(OrgHostnameKind.SUBDOMAIN);
            row.setCertState(HostnameCertState.NONE);
            row.setPrimary(hostnames.findPrimaryByOrgId(orgId).isEmpty());
        }
        row.setStatus(OrgHostnameStatus.ACTIVE);
        if (row.getVerifiedAt() == null) row.setVerifiedAt(now);
        if (row.getActivatedAt() == null) row.setActivatedAt(now);
        row.setSuspendedAt(null);
        row = hostnames.saveAndFlush(row);
        return new Provisioned(saved, row);
    }

    /** Takes a hostname out of service now: ACTIVE becomes SUSPENDED and the host answers as unknown on the next request. 404 for another organization's row, 409 when it is not ACTIVE. */
    @Transactional
    public OrgHostname suspendHostname(Long orgId, Long hostnameId) {
        OrgHostname row = hostnames.findByOrgIdAndId(orgId, hostnameId).orElseThrow(OrgNotFoundException::new);
        if (row.getStatus() != OrgHostnameStatus.ACTIVE) throw OrgException.notEditable("Only an active hostname can be suspended");
        row.setStatus(OrgHostnameStatus.SUSPENDED);
        row.setSuspendedAt(Instant.now());
        return touch(orgId, row);
    }

    /** Puts a suspended hostname back in service. 404 for another organization's row, 409 when it is not SUSPENDED. */
    @Transactional
    public OrgHostname resumeHostname(Long orgId, Long hostnameId) {
        OrgHostname row = hostnames.findByOrgIdAndId(orgId, hostnameId).orElseThrow(OrgNotFoundException::new);
        if (row.getStatus() != OrgHostnameStatus.SUSPENDED) throw OrgException.notEditable("Only a suspended hostname can be resumed");
        row.setStatus(OrgHostnameStatus.ACTIVE);
        row.setSuspendedAt(null);
        return touch(orgId, row);
    }

    private OrgHostname touch(Long orgId, OrgHostname row) {
        OrgHostname saved = hostnames.saveAndFlush(row);
        Organization org = organizations.findByOrgId(orgId).orElseThrow(OrgNotFoundException::new);
        org.setConfigVersion(org.getConfigVersion() + 1);
        organizations.saveAndFlush(org);
        evictTenantCacheAfterCommit();
        return saved;
    }

    /** The first free label at or near {@code label} ({@code acme}, {@code acme-2}, ...): not reserved and not owned by an organization. */
    public String suggestFree(String label) {
        return OrgSlugs.suggest(label, l -> OrgSubdomains.isReserved(l) || hostnames.findBySubdomain(l).isPresent());
    }

    /** True when {@code label} is well-formed, not reserved and not owned by another organization ({@code exceptOrgId}, may be null). */
    public boolean isLabelFree(String label, Long exceptOrgId) {
        if (!OrgSubdomains.isWellFormed(label) || OrgSubdomains.isReserved(label)) return false;
        Organization owner = hostnames.findBySubdomain(label).orElse(null);
        return owner == null || owner.getId().equals(exceptOrgId);
    }
}
