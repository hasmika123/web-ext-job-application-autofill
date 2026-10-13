package com.dossier.api.service.ent;

import com.dossier.api.domain.ent.HostNames;
import com.dossier.api.domain.ent.OrgHostname;
import com.dossier.api.domain.enumeration.OrgHostnameKind;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.OrgHostnameRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ent.TenantContext.Reason;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Clock;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Host to tenant (ADR-003, 04-tenancy-and-security.md section 2.2). The API alone decides: the BFF only forwards the raw
 * host, and this class never reads a tenant id from anywhere. Resolution, in order, and the first rule that applies wins:
 *
 * <ol>
 *   <li>missing / blank host: UNKNOWN (reason NO_HOST, a legacy caller); a host that is not one valid hostname: UNKNOWN;</li>
 *   <li>the enterprise master flag is off: UNKNOWN (nothing is a tenant while the programme is dark);</li>
 *   <li>a reserved platform host ({@code enterprise.hosts.platform}) or a loopback IP: PLATFORM. This comes BEFORE any
 *       database lookup so no row, however it got there, can make a platform host a tenant;</li>
 *   <li>an exact {@code org_hostname} row that is ACTIVE: TENANT, if its organization is ACTIVE / PAST_DUE and the flags allow
 *       it (a CUSTOM hostname also needs {@code flag.enterprise.domains}); otherwise UNKNOWN;</li>
 *   <li>{@code {label}.<base>} for a base in {@code enterprise.hosts.tenant_base_domains} whose organization owns that
 *       subdomain, has it enabled and is ACTIVE / PAST_DUE: TENANT. A live but non-ACTIVE hostname row for the exact name
 *       (a suspended or still-pending subdomain) overrides the label rule and makes it UNKNOWN;</li>
 *   <li>anything else: UNKNOWN. There is no fallback, ever: not the first org, not the caller's last org, not the platform.</li>
 * </ol>
 *
 * <p>Results, including UNKNOWN, are cached in-process per canonical host for {@code enterprise.tenant.cache_seconds}
 * (default 60) in a size-bounded map, so random hostnames cannot grow memory. Every tenancy write
 * ({@link OrgTenancyService}) calls {@link #invalidate()} after it commits, so a suspension or a flag/hostname change takes
 * effect on the next request on this instance; a second instance converges within the TTL.
 */
@Service
public class TenantResolver {

    private static final Logger LOG = LoggerFactory.getLogger(TenantResolver.class);

    /** Entries kept at most; the oldest-accessed go first. */
    static final int MAX_CACHE_ENTRIES = 5_000;

    private final OrgHostnameRepository hostnames;
    private final OrganizationRepository organizations;
    private final ResumeBuilderSettings settings;
    private final EnterpriseFeatureFlag flag;
    private final Clock clock;
    private final Cache cache = new Cache();

    public TenantResolver(OrgHostnameRepository hostnames, OrganizationRepository organizations, ResumeBuilderSettings settings, EnterpriseFeatureFlag flag) {
        this(hostnames, organizations, settings, flag, Clock.systemUTC());
    }

    TenantResolver(OrgHostnameRepository hostnames, OrganizationRepository organizations, ResumeBuilderSettings settings, EnterpriseFeatureFlag flag, Clock clock) {
        this.hostnames = hostnames;
        this.organizations = organizations;
        this.settings = settings;
        this.flag = flag;
        this.clock = clock;
    }

    /** The tenant context for the forwarded host {@code rawHost} (as received: any case, optional port). Never null, never throws. */
    public TenantContext resolve(String rawHost) {
        if (rawHost == null || rawHost.isBlank()) return TenantContext.unknown(null, Reason.NO_HOST);
        String host = HostNames.normalise(rawHost);
        if (host == null) return TenantContext.unknown(null, Reason.INVALID_HOST);
        long now = clock.millis();
        int ttlSeconds = cacheSeconds();
        if (ttlSeconds > 0) {
            TenantContext hit = cache.get(host, now);
            if (hit != null) return hit;
        }
        TenantContext resolved;
        try {
            resolved = compute(host);
        } catch (RuntimeException e) {
            // fail closed and do not cache a failure: a database blip must not pin a host to UNKNOWN for a minute
            LOG.warn("Tenant resolution for a host failed ({}); treating it as unknown for this request", e.getClass().getSimpleName());
            return TenantContext.unknown(host, Reason.UNKNOWN_HOST);
        }
        if (ttlSeconds > 0) cache.put(host, resolved, now + ttlSeconds * 1000L);
        return resolved;
    }

    /** True when the certificate "ask" endpoint may answer 200 for {@code rawDomain}: exactly the hosts that resolve to a tenant. */
    public boolean certificateAllowed(String rawDomain) {
        return resolve(rawDomain).isTenant();
    }

    /** Forget every cached host. Called after each tenancy write commits, so the next request sees the new state. */
    public void invalidate() {
        cache.clear();
    }

    int cachedHosts() {
        return cache.size();
    }

    // ---- the algorithm --------------------------------------------------------------------------------------------------

    private TenantContext compute(String host) {
        if (!flag.isEnabled()) return TenantContext.unknown(host, Reason.FLAG_OFF);
        if (HostNames.isLoopback(host) || platformHosts().contains(host)) return TenantContext.platform(host);
        if (HostNames.isIpLiteral(host)) return TenantContext.unknown(host, Reason.UNKNOWN_HOST); // a tenant is never an IP address

        OrgHostname row = hostnames.findActiveByHostname(host).orElse(null);
        if (row != null) return fromActiveRow(host, row);

        String label = subdomainLabel(host);
        if (label == null) return TenantContext.unknown(host, Reason.UNKNOWN_HOST);
        Organization org = hostnames.findBySubdomain(label).orElse(null);
        if (org == null || !org.isSubdomainEnabled()) return TenantContext.unknown(host, Reason.UNKNOWN_HOST);
        if (!isLive(org)) return TenantContext.unknown(host, Reason.ORG_INACTIVE);
        if (!flag.isEnabled(org.getId())) return TenantContext.unknown(host, Reason.FLAG_OFF);
        if (hostnames.findLiveByOrgIdAndHostname(org.getId(), host).isPresent()) return TenantContext.unknown(host, Reason.UNKNOWN_HOST); // suspended / pending subdomain row
        return TenantContext.tenant(org.getId(), null, host);
    }

    private TenantContext fromActiveRow(String host, OrgHostname row) {
        Organization org = organizations.findByOrgId(row.getOrgId()).orElse(null);
        if (org == null || !isLive(org)) return TenantContext.unknown(host, Reason.ORG_INACTIVE);
        if (!flag.isEnabled(org.getId())) return TenantContext.unknown(host, Reason.FLAG_OFF);
        if (row.getKind() == OrgHostnameKind.CUSTOM && !flag.isEnabled(EnterpriseSettingKeys.FLAG_DOMAINS, org.getId())) return TenantContext.unknown(host, Reason.FLAG_OFF);
        return TenantContext.tenant(org.getId(), row.getId(), host);
    }

    /** ACTIVE and PAST_DUE organizations are served (04 section 2.2); everything else, including SUSPENDED and CLOSED, is not. */
    private static boolean isLive(Organization org) {
        return org.getStatus() == OrgStatus.ACTIVE || org.getStatus() == OrgStatus.PAST_DUE;
    }

    /** The single label in front of a configured base domain ({@code acme} for {@code acme.kiwiply.com}), or null. */
    private String subdomainLabel(String host) {
        for (String base : baseDomains()) {
            String suffix = "." + base;
            if (host.length() > suffix.length() && host.endsWith(suffix)) {
                String label = host.substring(0, host.length() - suffix.length());
                if (!label.contains(".") && OrgSubdomains.isWellFormed(label)) return label;
            }
        }
        return null;
    }

    private List<String> platformHosts() {
        return hostList(EnterpriseSettingKeys.HOSTS_PLATFORM);
    }

    private List<String> baseDomains() {
        return hostList(EnterpriseSettingKeys.HOSTS_TENANT_BASE_DOMAINS);
    }

    private List<String> hostList(String key) {
        JsonNode n = settings.getJson(key, JsonNode.class);
        List<String> out = new ArrayList<>();
        if (n != null && n.isArray()) {
            for (JsonNode e : n) {
                String h = e.isTextual() ? HostNames.normalise(e.textValue()) : null;
                if (h != null) out.add(h);
            }
        }
        return out;
    }

    private int cacheSeconds() {
        try {
            return settings.getInt(EnterpriseSettingKeys.TENANT_CACHE_SECONDS);
        } catch (RuntimeException e) {
            return 0; // no caching rather than a stale tenant
        }
    }

    /** A small size-bounded, access-ordered map with per-entry expiry. */
    private static final class Cache {

        private record Entry(TenantContext context, long expiresAtMillis) {}

        private final Map<String, Entry> map = new LinkedHashMap<>(256, 0.75f, true) {
            @Override
            protected boolean removeEldestEntry(Map.Entry<String, Entry> eldest) {
                return size() > MAX_CACHE_ENTRIES;
            }
        };

        synchronized TenantContext get(String host, long now) {
            Entry e = map.get(host);
            if (e == null) return null;
            if (e.expiresAtMillis() <= now) {
                map.remove(host);
                return null;
            }
            return e.context();
        }

        synchronized void put(String host, TenantContext context, long expiresAtMillis) {
            map.put(host, new Entry(context, expiresAtMillis));
        }

        synchronized void clear() {
            map.clear();
        }

        synchronized int size() {
            return map.size();
        }
    }
}
