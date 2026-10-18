package com.dossier.api.service.ent;

import com.dossier.api.domain.User;
import com.dossier.api.domain.ent.OrgBranding;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.OrgBrandingRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.TenantMailBrand;
import java.util.Optional;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;

/**
 * Who an e-mail is for, in the organization sense (X2.10): an ENTERPRISE account (a user row with an {@code org_id}, decision O4) gets mail in its
 * organization's look and links; a personal account (no {@code org_id}) never does. Built from stored data only: the organization's name, its
 * published primary colour and logo, and the origin of its own host (policy-page footer links and every action link point there, never at kiwiply.com).
 */
@Service
public class EnterpriseMailContext {

    private static final Pattern HEX = Pattern.compile("#[0-9a-fA-F]{6}");

    /** {@code origin}: where action links go (the organization host, else the platform when it has no host yet). {@code policyBase}: its own host for the policy footer, null when it has none (the footer then shows no links rather than Kiwiply links). */
    public record Ctx(Long orgId, String orgName, TenantMailBrand brand, String origin, String policyBase) {}

    private final OrganizationRepository organizations;
    private final OrgBrandingRepository brandings;
    private final TenantUrls tenantUrls;

    public EnterpriseMailContext(OrganizationRepository organizations, OrgBrandingRepository brandings, TenantUrls tenantUrls) {
        this.organizations = organizations;
        this.brandings = brandings;
        this.tenantUrls = tenantUrls;
    }

    /** The organization look for this recipient, or empty for a personal account (the personal template then stays exactly as it was). Never throws. */
    public Optional<Ctx> forUser(User user) {
        if (user == null || user.getOrgId() == null) return Optional.empty();
        try {
            Organization org = organizations.findByOrgId(user.getOrgId()).orElse(null);
            if (org == null) return Optional.empty();
            String origin = tenantUrls.base(org.getId());
            OrgBranding b = brandings.findByOrgId(org.getId()).filter(x -> x.getPublishedAt() != null).orElse(null);
            String hex = b != null && b.getPrimaryColor() != null && HEX.matcher(b.getPrimaryColor()).matches() ? b.getPrimaryColor() : null;
            String policyBase = tenantUrls.liveHost(org.getId()) == null ? null : origin;
            String logo = b != null && b.getLogoKey() != null && policyBase != null ? policyBase + "/tenant-assets/logo" : null; // the logo is served by the org's own host
            String name = org.getDisplayName() != null && !org.getDisplayName().isBlank() ? org.getDisplayName() : org.getName();
            return Optional.of(new Ctx(org.getId(), name, new TenantMailBrand(hex, logo), origin, policyBase));
        } catch (RuntimeException e) {
            return Optional.empty();
        }
    }
}
