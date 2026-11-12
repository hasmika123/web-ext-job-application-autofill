package com.dossier.api.service.ent.domains;

import com.dossier.api.domain.ent.HostNames;
import com.dossier.api.domain.ent.OrgHostname;
import com.dossier.api.domain.enumeration.HostnameVerificationMethod;
import com.dossier.api.domain.enumeration.OrgHostnameKind;
import com.dossier.api.domain.enumeration.OrgHostnameStatus;
import com.dossier.api.repository.ent.OrgHostnameRepository;
import com.dossier.api.service.ent.OrgTenancyService;
import com.dossier.api.service.ent.TenantModule;
import com.dossier.api.service.ent.TenantModules;
import com.dossier.api.service.ent.consultants.ConsultantAccess;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import com.dossier.api.service.settings.SettingsService;
import com.fasterxml.jackson.databind.JsonNode;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * An organization's own domains (docs/enterprise-v2/CUSTOM-DOMAINS-BUILD.md, gap A4; design 10-domain-routing.md s1-s4). An Org Admin with
 * {@code domains.manage} adds a domain (e.g. {@code careers.acme.com}), copies two DNS records, and verifies:
 * <ul>
 *   <li>when the ownership TXT and the routing CNAME (or A, for an apex) both pass, it is VERIFIED, and goes live (ACTIVE) at once when
 *       {@code enterprise.domains.auto_activate} is on;</li>
 *   <li>from then on the resolver serves the organization there, and the edge's ask endpoint allows its certificate;</li>
 *   <li>it can be suspended (reason) and resumed (which re-checks DNS now), or removed (typing the name);</li>
 *   <li>the organization's Kiwiply subdomain is listed, read-only, and only the platform admin changes it.</li>
 * </ul>
 * Rules: the module {@code domains} is on and the caller holds {@code domains.manage} (otherwise the generic 404). A domain is never a platform host, a
 * Kiwiply name, localhost, an IP or a bare suffix (422 {@code HOSTNAME_INVALID}). It is not taken by any organization (409 {@code HOSTNAME_TAKEN}), and an
 * organization has at most {@code enterprise.domains.max_custom}. "Verify now" is limited to once a minute per domain. Every write is audited (DOMAIN_*),
 * and a change that affects routing bumps {@code config_version} and evicts the tenant cache.
 */
@Service
@Transactional
public class OrgDomainService {

    public static final String MANAGE = "domains.manage";
    static final Duration VERIFY_EVERY = Duration.ofMinutes(1);
    private static final String ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    private static final SecureRandom RANDOM = new SecureRandom();

    public record Domain(
        Long id,
        String hostname,
        String kind,
        String status,
        boolean primary,
        boolean apex,
        String lastCheckResult,
        Instant lastCheckAt,
        Instant verifiedAt,
        Instant activatedAt,
        String certState,
        Instant failingSince
    ) {}

    public record DnsRecord(String type, String name, String value, String purpose) {}

    public record Instructions(String hostname, boolean apex, List<DnsRecord> records, String proxyWarning, String ttlHint) {}

    public record Overview(List<Domain> domains, int maxCustom, int customCount, String edgeName, String edgeIp, boolean autoActivate) {}

    public record AddRequest(String hostname) {}

    public record ReasonRequest(String reason) {}

    public record RemoveRequest(String confirm) {}

    private final OrgHostnameRepository hostnames;
    private final OrgTenancyService tenancy;
    private final HostnameVerifier verifier;
    private final TenantModules modules;
    private final ConsultantAccess access;
    private final SettingsService settings;
    private final OrgAuditService audit;
    private Clock clock = Clock.systemUTC();

    public OrgDomainService(
        OrgHostnameRepository hostnames,
        OrgTenancyService tenancy,
        HostnameVerifier verifier,
        TenantModules modules,
        ConsultantAccess access,
        SettingsService settings,
        OrgAuditService audit
    ) {
        this.hostnames = hostnames;
        this.tenancy = tenancy;
        this.verifier = verifier;
        this.modules = modules;
        this.access = access;
        this.settings = settings;
        this.audit = audit;
    }

    void setClock(Clock clock) {
        this.clock = clock;
    }

    private Instant now() {
        return Instant.now(clock).truncatedTo(java.time.temporal.ChronoUnit.MICROS);
    }

    // ------------------------------------------------------------------------------------------ reads

    @Transactional(readOnly = true)
    public Overview list(OrgMembership me) {
        gate(me);
        List<Domain> out = new ArrayList<>();
        int custom = 0;
        for (OrgHostname h : hostnames.findByOrgIdOrderByCreatedAt(me.orgId())) {
            if (h.getStatus() == OrgHostnameStatus.REMOVED) continue;
            if (h.getKind() == OrgHostnameKind.CUSTOM) custom++;
            out.add(dto(h));
        }
        return new Overview(out, maxCustom(), custom, edgeName(), edgeIp(), settings.getBool(EnterpriseSettingKeys.DOMAINS_AUTO_ACTIVATE));
    }

    /** The two DNS records the customer adds; built here so the page never composes DNS values itself. */
    @Transactional(readOnly = true)
    public Instructions instructions(OrgMembership me, Long id) {
        gate(me);
        OrgHostname h = custom(me, id);
        boolean apex = HostnameVerifier.isApex(h.getHostname());
        List<DnsRecord> records = new ArrayList<>();
        records.add(new DnsRecord("TXT", HostnameVerifier.TXT_PREFIX + h.getHostname(), HostnameVerifier.TXT_VALUE_PREFIX + h.getVerificationToken(), "OWNERSHIP"));
        records.add(apex ? new DnsRecord("A", h.getHostname(), edgeIp(), "TRAFFIC") : new DnsRecord("CNAME", h.getHostname(), edgeName(), "TRAFFIC"));
        return new Instructions(
            h.getHostname(),
            apex,
            records,
            "Keep the records DNS-only (no proxy, the grey cloud on Cloudflare): a proxied record stops the certificate from being issued.",
            "Changes usually show within minutes; some providers take up to 24 hours."
        );
    }

    // ------------------------------------------------------------------------------------------ writes

    public Domain add(OrgMembership me, AddRequest req) {
        write(me);
        String host = validate(req == null ? null : req.hostname());
        long custom = hostnames.findByOrgIdOrderByCreatedAt(me.orgId()).stream().filter(h -> h.getKind() == OrgHostnameKind.CUSTOM && h.getStatus() != OrgHostnameStatus.REMOVED).count();
        if (custom >= maxCustom()) throw new OrgException(422, OrgException.CODE_ORG_LIMIT_REACHED, "This organization already has " + custom + " domains.", Map.of("limit", "enterprise.domains.max_custom", "max", maxCustom()));
        if (hostnames.countLiveByHostname(host) > 0) throw new OrgException(409, "HOSTNAME_TAKEN", "That domain is already in use.", null);
        Instant now = now();
        OrgHostname h = new OrgHostname();
        h.setOrgId(me.orgId());
        h.setHostname(host);
        h.setKind(OrgHostnameKind.CUSTOM);
        h.setStatus(OrgHostnameStatus.PENDING);
        h.setPrimary(false);
        h.setVerificationMethod(HostnameVerificationMethod.DNS_TXT);
        h.setVerificationToken(token());
        h.setCreatedByMemberId(me.memberId());
        h.setCreatedAt(now);
        h.setUpdatedAt(now);
        h = hostnames.saveAndFlush(h);
        audit.record(me, OrgAuditService.DOMAIN_ADD, OrgAuditService.TARGET_HOSTNAME, null, String.valueOf(h.getId()), "added " + host);
        return dto(h);
    }

    /** Check DNS now. PENDING / VERIFIED / VERIFYING rows; passing makes it VERIFIED, and ACTIVE when auto-activate is on. 429 within a minute of the last check. */
    public Domain verify(OrgMembership me, Long id) {
        write(me);
        OrgHostname h = custom(me, id);
        if (h.getStatus() == OrgHostnameStatus.ACTIVE || h.getStatus() == OrgHostnameStatus.SUSPENDED) {
            throw OrgException.notEditable(h.getStatus() == OrgHostnameStatus.ACTIVE ? "This domain is already live." : "Resume the domain to check it again.");
        }
        Instant now = now();
        if (h.getLastCheckAt() != null && h.getLastCheckAt().plus(VERIFY_EVERY).isAfter(now)) {
            throw new OrgException(429, "CHECK_TOO_SOON", "This domain was checked a moment ago. Try again in a minute.", null);
        }
        return dto(check(me, h, now, settings.getBool(EnterpriseSettingKeys.DOMAINS_AUTO_ACTIVATE)));
    }

    /** VERIFIED → ACTIVE (when auto-activate is off), if it still passes now. */
    public Domain activate(OrgMembership me, Long id) {
        write(me);
        OrgHostname h = custom(me, id);
        if (h.getStatus() != OrgHostnameStatus.VERIFIED) throw OrgException.notEditable("Only a verified domain can be activated.");
        OrgHostname checked = check(me, h, now(), true);
        if (checked.getStatus() != OrgHostnameStatus.ACTIVE) throw new OrgException(409, "CHECK_FAILED", "The DNS records no longer pass: " + checked.getLastCheckResult(), Map.of("code", String.valueOf(checked.getLastCheckResult())));
        return dto(checked);
    }

    /** ACTIVE → SUSPENDED with a reason: the domain stops answering at once. */
    public Domain suspend(OrgMembership me, Long id, ReasonRequest req) {
        write(me);
        String reason = reason(req == null ? null : req.reason());
        OrgHostname h = custom(me, id);
        if (h.getStatus() != OrgHostnameStatus.ACTIVE) throw OrgException.notEditable("Only a live domain can be suspended.");
        if (h.isPrimary()) throw new OrgException(409, "PRIMARY_REQUIRED", "This is the organization's main address. Make another address the main one first.", null);
        h.setStatus(OrgHostnameStatus.SUSPENDED);
        h.setSuspendedAt(now());
        h = tenancy.saveAndRefresh(me.orgId(), h);
        audit.record(me, OrgAuditService.DOMAIN_SUSPENDED, OrgAuditService.TARGET_HOSTNAME, null, String.valueOf(h.getId()), "suspended " + h.getHostname() + ": " + reason);
        return dto(h);
    }

    /** SUSPENDED → ACTIVE, only when DNS passes now (a resume always re-checks). */
    public Domain resume(OrgMembership me, Long id) {
        write(me);
        OrgHostname h = custom(me, id);
        if (h.getStatus() != OrgHostnameStatus.SUSPENDED) throw OrgException.notEditable("Only a suspended domain can be resumed.");
        HostnameVerifier.Result r = verifier.verify(h.getHostname(), h.getVerificationToken(), edgeName(), edgeIp());
        Instant now = now();
        h.setLastCheckAt(now);
        h.setLastCheckResult(r.code());
        if (!r.ok()) {
            hostnames.saveAndFlush(h);
            throw new OrgException(409, "CHECK_FAILED", "The DNS records don't pass yet: " + r.code(), Map.of("code", r.code()));
        }
        h.setStatus(OrgHostnameStatus.ACTIVE);
        h.setSuspendedAt(null);
        h.setFailingSince(null);
        h = tenancy.saveAndRefresh(me.orgId(), h);
        audit.record(me, OrgAuditService.DOMAIN_RESUMED, OrgAuditService.TARGET_HOSTNAME, null, String.valueOf(h.getId()), "resumed " + h.getHostname());
        return dto(h);
    }

    /** Any → REMOVED, typing the domain to confirm. The name can be added again later (ownership is proven from scratch). */
    public Domain remove(OrgMembership me, Long id, RemoveRequest req) {
        write(me);
        OrgHostname h = hostnames.findByOrgIdAndId(me.orgId(), id).orElseThrow(OrgNotFoundException::new);
        if (h.getStatus() == OrgHostnameStatus.REMOVED) throw new OrgNotFoundException();
        if (h.getKind() != OrgHostnameKind.CUSTOM) throw new OrgException(409, "SUBDOMAIN_MANAGED", "Kiwiply manages this address. Ask Kiwiply support to change it.", null);
        if (h.isPrimary()) throw new OrgException(409, "PRIMARY_REQUIRED", "This is the organization's main address. Make another address the main one first.", null);
        String typed = req == null || req.confirm() == null ? "" : req.confirm().trim().toLowerCase(java.util.Locale.ROOT);
        if (!typed.equals(h.getHostname())) throw OrgException.invalid("confirm", "type the domain exactly to remove it");
        boolean wasLive = h.getStatus() == OrgHostnameStatus.ACTIVE;
        h.setStatus(OrgHostnameStatus.REMOVED);
        h.setRemovedAt(now());
        h = wasLive ? tenancy.saveAndRefresh(me.orgId(), h) : hostnames.saveAndFlush(h);
        audit.record(me, OrgAuditService.DOMAIN_REMOVED, OrgAuditService.TARGET_HOSTNAME, null, String.valueOf(h.getId()), "removed " + h.getHostname());
        return dto(h);
    }

    // ------------------------------------------------------------------------------------------ the check (also used by the job)

    /** Run the verifier on a non-live row and apply the result (PENDING/VERIFYING/VERIFIED → VERIFIED → ACTIVE when {@code activate}). */
    OrgHostname check(OrgMembership me, OrgHostname h, Instant now, boolean activate) {
        HostnameVerifier.Result r = verifier.verify(h.getHostname(), h.getVerificationToken(), edgeName(), edgeIp());
        h.setLastCheckAt(now);
        h.setLastCheckResult(r.code());
        if (!r.ok()) return hostnames.saveAndFlush(h);
        boolean newlyVerified = h.getStatus() != OrgHostnameStatus.VERIFIED;
        h.setStatus(OrgHostnameStatus.VERIFIED);
        if (h.getVerifiedAt() == null || newlyVerified) h.setVerifiedAt(now);
        if (newlyVerified) record(me, h, OrgAuditService.DOMAIN_VERIFIED, "verified " + h.getHostname());
        if (!activate) return hostnames.saveAndFlush(h);
        h.setStatus(OrgHostnameStatus.ACTIVE);
        h.setActivatedAt(now);
        h.setFailingSince(null);
        OrgHostname saved = tenancy.saveAndRefresh(h.getOrgId(), h);
        record(me, saved, OrgAuditService.DOMAIN_ACTIVATED, "activated " + saved.getHostname());
        return saved;
    }

    /**
     * The re-check job's step for one row (10-domain-routing.md s4.3), in its own transaction. A waiting domain (PENDING / VERIFYING / VERIFIED) is
     * checked and goes live when it passes, as "Verify now" does. A live domain is re-checked: a pass clears {@code failing_since}, and a failure
     * starts it. When it has failed for longer than {@code enterprise.domains.grace_hours_before_suspend}, it is SUSPENDED (audited by "system"). Returns
     * the row's status after the check.
     */
    public String recheck(Long orgId, Long id, Instant now) {
        OrgHostname h = hostnames.findByOrgIdAndId(orgId, id).orElse(null);
        if (h == null || h.getKind() != OrgHostnameKind.CUSTOM) return null;
        switch (h.getStatus()) {
            case PENDING, VERIFYING, VERIFIED -> {
                return check(null, h, now, settings.getBool(EnterpriseSettingKeys.DOMAINS_AUTO_ACTIVATE)).getStatus().name();
            }
            case ACTIVE -> {
                HostnameVerifier.Result r = verifier.verify(h.getHostname(), h.getVerificationToken(), edgeName(), edgeIp());
                h.setLastCheckAt(now);
                h.setLastCheckResult(r.code());
                if (r.ok()) {
                    h.setFailingSince(null);
                    return hostnames.saveAndFlush(h).getStatus().name();
                }
                if (h.getFailingSince() == null) h.setFailingSince(now);
                Duration grace = Duration.ofHours(settings.getInt(EnterpriseSettingKeys.DOMAINS_GRACE_HOURS_BEFORE_SUSPEND));
                if (h.getFailingSince().plus(grace).isAfter(now) || h.isPrimary()) return hostnames.saveAndFlush(h).getStatus().name();
                h.setStatus(OrgHostnameStatus.SUSPENDED);
                h.setSuspendedAt(now);
                OrgHostname saved = tenancy.saveAndRefresh(orgId, h);
                record(null, saved, OrgAuditService.DOMAIN_SUSPENDED, "suspended " + saved.getHostname() + ": DNS checks failing since " + saved.getFailingSince() + " (" + r.code() + ")");
                return saved.getStatus().name();
            }
            default -> {
                return h.getStatus().name();
            }
        }
    }

    private void record(OrgMembership me, OrgHostname h, String action, String details) {
        if (me != null) audit.record(me, action, OrgAuditService.TARGET_HOSTNAME, null, String.valueOf(h.getId()), details);
        else audit.record(h.getOrgId(), OrgAuditService.SYSTEM_ACTOR, null, action, OrgAuditService.TARGET_HOSTNAME, null, String.valueOf(h.getId()), details, null);
    }

    // ------------------------------------------------------------------------------------------ helpers

    private void gate(OrgMembership me) {
        if (me == null || !modules.isOn(TenantModule.DOMAINS, me.orgId())) throw new OrgNotFoundException();
        access.require(me, MANAGE);
    }

    private void write(OrgMembership me) {
        gate(me);
        access.requireWritable(me, MANAGE);
    }

    private OrgHostname custom(OrgMembership me, Long id) {
        if (id == null) throw new OrgNotFoundException();
        OrgHostname h = hostnames.findByOrgIdAndId(me.orgId(), id).orElseThrow(OrgNotFoundException::new);
        if (h.getStatus() == OrgHostnameStatus.REMOVED) throw new OrgNotFoundException();
        if (h.getKind() != OrgHostnameKind.CUSTOM) throw new OrgException(409, "SUBDOMAIN_MANAGED", "Kiwiply manages this address. Ask Kiwiply support to change it.", null);
        return h;
    }

    /** Canonical, and never a platform name, a Kiwiply name, localhost, an IP or a bare suffix. */
    String validate(String raw) {
        String host = HostNames.normalise(raw);
        if (host == null || HostNames.isIpLiteral(host) || HostNames.isLoopback(host) || host.endsWith(".localhost")) throw invalid("not a valid domain name");
        String[] labels = host.split("\\.");
        if (labels.length < 2) throw invalid("use a full domain, such as careers.acme.com");
        if (labels.length == 2 && HostnameVerifier.SECOND_LEVEL.contains(host)) throw invalid("that is a public suffix, not a domain");
        for (String base : hostList(EnterpriseSettingKeys.HOSTS_TENANT_BASE_DOMAINS)) {
            if (host.equals(base) || host.endsWith("." + base)) throw invalid("Kiwiply addresses are set up by Kiwiply; add your own domain here");
        }
        if (hostList(EnterpriseSettingKeys.HOSTS_PLATFORM).contains(host)) throw invalid("that is a Kiwiply address");
        if (host.equals(edgeName())) throw invalid("that is a Kiwiply address");
        return host;
    }

    private List<String> hostList(String key) {
        List<String> out = new ArrayList<>();
        JsonNode n = settings.getJson(key, JsonNode.class);
        if (n != null && n.isArray()) for (JsonNode e : n) if (e.isTextual() && HostNames.normalise(e.textValue()) != null) out.add(HostNames.normalise(e.textValue()));
        return out;
    }

    private static OrgException invalid(String why) {
        return new OrgException(422, "HOSTNAME_INVALID", "That domain can't be used: " + why + ".", Map.of("field", "hostname"));
    }

    private static String reason(String raw) {
        String r = raw == null ? "" : raw.trim();
        if (r.length() < 3) throw OrgException.invalid("reason", "say why (at least 3 characters)");
        com.dossier.api.service.privacy.SensitiveContent.check("reason", "reason", r);
        return r.length() > 200 ? r.substring(0, 200) : r;
    }

    String edgeName() {
        return DnsjavaLookup.clean(settings.getString(EnterpriseSettingKeys.DOMAINS_EDGE_CNAME));
    }

    String edgeIp() {
        return settings.getString(EnterpriseSettingKeys.DOMAINS_EDGE_IPV4).trim();
    }

    private int maxCustom() {
        return settings.getInt(EnterpriseSettingKeys.DOMAINS_MAX_CUSTOM);
    }

    static String token() {
        StringBuilder b = new StringBuilder(32);
        for (int i = 0; i < 32; i++) b.append(ALPHABET.charAt(RANDOM.nextInt(ALPHABET.length())));
        return b.toString();
    }

    static Domain dto(OrgHostname h) {
        return new Domain(
            h.getId(),
            h.getHostname(),
            h.getKind().name(),
            h.getStatus().name(),
            h.isPrimary(),
            HostnameVerifier.isApex(h.getHostname()),
            h.getLastCheckResult(),
            h.getLastCheckAt(),
            h.getVerifiedAt(),
            h.getActivatedAt(),
            h.getCertState() == null ? "NONE" : h.getCertState().name(),
            h.getFailingSince()
        );
    }
}
