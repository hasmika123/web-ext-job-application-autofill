package com.dossier.api.service.ent;

import com.dossier.api.domain.ent.HostNames;
import com.dossier.api.domain.ent.OrgHostname;
import com.dossier.api.domain.enumeration.HostnameCertState;
import com.dossier.api.domain.enumeration.OrgHostnameKind;
import com.dossier.api.domain.enumeration.OrgHostnameStatus;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.OrgHostnameRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import com.fasterxml.jackson.databind.JsonNode;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Locale;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * The one place that builds an absolute link for an organization (X2.10, 10-domain-routing.md section 6, T12): the join, verify,
 * reset and workspace links in mail and notifications. The base is chosen ONLY from the organization's stored hostname rows
 * and settings, never from the request that triggered the mail, so a forged {@code Host} / {@code X-Kiwiply-Host} can neither
 * redirect a link to another tenant or to an attacker nor leak the platform host into a tenant mail. This class therefore must
 * not depend on {@link TenantContext} or its holder (a unit test and an ArchUnit rule enforce it).
 *
 * <p>Base for an organization, first rule that applies wins (and only for an ACTIVE / PAST_DUE organization with the enterprise
 * flags on; otherwise the platform):
 * <ol>
 *   <li>its primary hostname, if ACTIVE and (for a CUSTOM name) its certificate is {@code ISSUED};</li>
 *   <li>an ACTIVE SUBDOMAIN hostname row (a CUSTOM name never leads without a certificate);</li>
 *   <li>its enabled bare subdomain {@code label.<first tenant base domain>}, unless a live non-ACTIVE row (suspended, pending)
 *       claims that exact name, which the resolver treats as unknown;</li>
 *   <li>the platform base URL ({@code MAIL_BASE_URL}).</li>
 * </ol>
 * A hostname that is PENDING, VERIFYING, VERIFIED, SUSPENDED or REMOVED never appears in a link. Schemes: https, except
 * {@code localhost} and {@code *.localhost} (development), which are http. No port is added.
 */
@Service
public class TenantUrls {

    private final OrgHostnameRepository hostnames;
    private final OrganizationRepository organizations;
    private final ResumeBuilderSettings settings;
    private final EnterpriseFeatureFlag flag;
    private final String platformBase;
    private final boolean allowLocalhostTenants;

    public TenantUrls(
        OrgHostnameRepository hostnames,
        OrganizationRepository organizations,
        ResumeBuilderSettings settings,
        EnterpriseFeatureFlag flag,
        @Value("${jhipster.mail.base-url:http://localhost:3000}") String platformBase,
        @Value("${dossier.tenant-host.allow-localhost-tenants:false}") boolean allowLocalhostTenants
    ) {
        this.hostnames = hostnames;
        this.organizations = organizations;
        this.settings = settings;
        this.flag = flag;
        this.platformBase = normaliseBase(platformBase == null || platformBase.isBlank() ? "http://localhost:3000" : platformBase.trim());
        this.allowLocalhostTenants = allowLocalhostTenants;
    }

    /** The origin (no trailing slash) every link for {@code orgId} starts with: the org's live host, else the platform. Never throws. */
    public String base(Long orgId) {
        if (orgId == null) return platformBase;
        try {
            String host = liveHost(orgId);
            return host == null ? platformBase : originOf(host);
        } catch (RuntimeException e) {
            return platformBase; // a link that points at the platform still works; an exception here would lose the mail
        }
    }

    /** The host (no scheme) of {@link #base}, or null when the organization has no live host of its own. */
    public String liveHost(Long orgId) {
        Organization org = organizations.findByOrgId(orgId).orElse(null);
        if (org == null || !(org.getStatus() == OrgStatus.ACTIVE || org.getStatus() == OrgStatus.PAST_DUE)) return null;
        if (!flag.isEnabled(orgId)) return null;
        List<OrgHostname> rows = hostnames.findByOrgIdOrderByCreatedAt(orgId);
        boolean domains = flag.isEnabled(EnterpriseSettingKeys.FLAG_DOMAINS, orgId);

        OrgHostname primary = rows.stream().filter(h -> h.isPrimary() && usable(h, domains)).findFirst().orElse(null);
        if (primary != null) return primary.getHostname();
        OrgHostname sub = rows.stream().filter(h -> h.getKind() == OrgHostnameKind.SUBDOMAIN && usable(h, domains)).findFirst().orElse(null);
        if (sub != null) return sub.getHostname();

        String label = org.getSubdomain();
        if (label != null && org.isSubdomainEnabled() && OrgSubdomains.isWellFormed(label)) {
            String base = firstBaseDomain();
            String host = base == null ? null : HostNames.normalise(label + "." + base);
            if (host != null && rows.stream().noneMatch(h -> h.getStatus() != OrgHostnameStatus.REMOVED && host.equals(h.getHostname()))) return host;
        }
        return null;
    }

    private static boolean usable(OrgHostname h, boolean domainsOn) {
        if (h.getStatus() != OrgHostnameStatus.ACTIVE) return false;
        if (h.getKind() == OrgHostnameKind.CUSTOM) return domainsOn && h.getCertState() == HostnameCertState.ISSUED;
        return true;
    }

    /**
     * The base domain a platform admin provisions new addresses under: {@code localhost} when development hosts are allowed AND
     * configured (so a new organization is reachable at {@code label.localhost} and its hostname row is the one the dev host uses),
     * otherwise the first configured base domain. Production (localhost never allowed) is always {@link #firstBaseDomain}.
     */
    public String provisioningBaseDomain() {
        if (allowLocalhostTenants) {
            JsonNode n = settings.getJson(EnterpriseSettingKeys.HOSTS_TENANT_BASE_DOMAINS, JsonNode.class);
            if (n != null && n.isArray()) {
                for (JsonNode e : n) if (e.isTextual() && "localhost".equals(HostNames.normalise(e.textValue()))) return "localhost";
            }
        }
        return firstBaseDomain();
    }

    /** The first configured tenant base domain (such as kiwiply.com), or null when none is usable; localhost only where development hosts are allowed. */
    public String firstBaseDomain() {
        JsonNode n = settings.getJson(EnterpriseSettingKeys.HOSTS_TENANT_BASE_DOMAINS, JsonNode.class);
        if (n != null && n.isArray()) {
            for (JsonNode e : n) {
                String h = e.isTextual() ? HostNames.normalise(e.textValue()) : null;
                if (h == null) continue;
                if ("localhost".equals(h) && !allowLocalhostTenants) continue;
                return h;
            }
        }
        return null;
    }

    /** The origin to sign in at for a host (built from stored data only): https for a real host; http for a development host, carrying the platform base URL's port so acme.localhost:3200 works. */
    public String originForHost(String host) {
        boolean dev = "localhost".equals(host) || host.endsWith(".localhost");
        if (!dev) return "https://" + host;
        java.net.URI u = java.net.URI.create(platformBase);
        return "http://" + host + (u.getPort() > 0 ? ":" + u.getPort() : "");
    }

    private static String originOf(String host) {
        boolean dev = "localhost".equals(host) || host.endsWith(".localhost");
        return (dev ? "http://" : "https://") + host;
    }

    // ---- the links ---------------------------------------------------------------------------------------------------------

    /** {@code <base>/join/t/<token>}: the invite page on the org's own host (the token is URL-encoded). */
    public String joinLink(Long orgId, String token) {
        return base(orgId) + "/join/t/" + enc(token);
    }

    /** {@code <base>/account/activate?key=<key>}. */
    public String verifyLink(Long orgId, String key) {
        return base(orgId) + "/account/activate?key=" + enc(key);
    }

    /** {@code <base>/reset-password?key=<key>}. */
    public String resetLink(Long orgId, String key) {
        return base(orgId) + "/reset-password?key=" + enc(key);
    }

    /** {@code <base><path>}; a path that is not a plain absolute path on the host (scheme, {@code //}, backslash, control characters) becomes {@code /}. */
    public String workspaceLink(Long orgId, String path) {
        return base(orgId) + safePath(path);
    }

    /** The path itself when it is a same-host absolute path: starts with one {@code /}, no {@code //}, no backslash, no scheme, no spaces or control characters; else {@code /}. */
    static String safePath(String path) {
        if (path == null || path.isEmpty() || path.charAt(0) != '/') return "/";
        if (path.startsWith("//") || path.contains("\\") || path.contains("://")) return "/";
        for (int i = 0; i < path.length(); i++) {
            char c = path.charAt(i);
            if (c < 0x20 || c == 0x7f || c == ' ') return "/";
        }
        return path;
    }

    private static String enc(String s) {
        return URLEncoder.encode(s == null ? "" : s, StandardCharsets.UTF_8).replace("+", "%20");
    }

    private static String normaliseBase(String s) {
        String out = s.toLowerCase(Locale.ROOT).startsWith("http") ? s : "https://" + s;
        while (out.endsWith("/")) out = out.substring(0, out.length() - 1);
        return out;
    }
}
