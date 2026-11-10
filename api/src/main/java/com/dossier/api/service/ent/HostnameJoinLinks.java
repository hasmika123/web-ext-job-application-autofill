package com.dossier.api.service.ent;

import com.dossier.api.domain.ent.OrgHostname;
import com.dossier.api.domain.enumeration.HostnameCertState;
import com.dossier.api.domain.enumeration.OrgHostnameKind;
import com.dossier.api.domain.enumeration.OrgHostnameStatus;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.OrgHostnameRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Locale;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * Interim {@link JoinLinks} (X1.8) until X2.10's {@code TenantUrls} lands: the organization's ACTIVE primary hostname (a custom
 * name only once its certificate is issued), else an ACTIVE SUBDOMAIN hostname row, else the platform base
 * ({@code jhipster.mail.base-url}). Only for an ACTIVE or PAST_DUE organization with the enterprise flag on; otherwise the
 * platform. A hostname that is pending, verifying, suspended or removed never appears in a link. http only for {@code *.localhost}.
 */
@Service
public class HostnameJoinLinks implements JoinLinks {

    private final OrgHostnameRepository hostnames;
    private final OrganizationRepository organizations;
    private final EnterpriseFeatureFlag flag;
    private final String platformBase;

    public HostnameJoinLinks(
        OrgHostnameRepository hostnames,
        OrganizationRepository organizations,
        EnterpriseFeatureFlag flag,
        @Value("${jhipster.mail.base-url:http://localhost:3000}") String platformBase
    ) {
        this.hostnames = hostnames;
        this.organizations = organizations;
        this.flag = flag;
        String base = platformBase == null || platformBase.isBlank() ? "http://localhost:3000" : platformBase.trim();
        base = base.toLowerCase(Locale.ROOT).startsWith("http") ? base : "https://" + base;
        this.platformBase = base.replaceAll("/+$", "");
    }

    @Override
    public String joinLink(Long orgId, String token) {
        return base(orgId) + "/join/t/" + URLEncoder.encode(token == null ? "" : token, StandardCharsets.UTF_8).replace("+", "%20");
    }

    String base(Long orgId) {
        try {
            String host = liveHost(orgId);
            if (host == null) return platformBase;
            boolean dev = "localhost".equals(host) || host.endsWith(".localhost");
            return (dev ? "http://" : "https://") + host;
        } catch (RuntimeException e) {
            return platformBase; // a link to the platform still works; an exception here would lose the mail
        }
    }

    private String liveHost(Long orgId) {
        if (orgId == null) return null;
        Organization org = organizations.findByOrgId(orgId).orElse(null);
        if (org == null || !(org.getStatus() == OrgStatus.ACTIVE || org.getStatus() == OrgStatus.PAST_DUE)) return null;
        if (!flag.isEnabled(orgId)) return null;
        List<OrgHostname> rows = hostnames.findByOrgIdOrderByCreatedAt(orgId);
        OrgHostname primary = rows.stream().filter(h -> h.isPrimary() && usable(h)).findFirst().orElse(null);
        if (primary != null) return primary.getHostname();
        return rows.stream().filter(h -> h.getKind() == OrgHostnameKind.SUBDOMAIN && usable(h)).map(OrgHostname::getHostname).findFirst().orElse(null);
    }

    private static boolean usable(OrgHostname h) {
        if (h.getStatus() != OrgHostnameStatus.ACTIVE) return false;
        return h.getKind() != OrgHostnameKind.CUSTOM || h.getCertState() == HostnameCertState.ISSUED;
    }
}
