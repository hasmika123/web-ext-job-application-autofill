package com.dossier.api.service.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.ent.OrgHostname;
import com.dossier.api.domain.enumeration.OrgHostnameKind;
import com.dossier.api.domain.enumeration.OrgHostnameStatus;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.OrgHostnameRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ai.FakeSettings;
import com.dossier.api.service.ent.TenantContext.Kind;
import com.dossier.api.service.ent.TenantContext.Reason;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** X1.3: host to tenant, table-driven, with no database: the order of the rules, "no fallback", the cache and its eviction. */
class TenantResolverTest {

    private static final long ACME = 12L;
    private static final long BETA = 13L;

    private final OrgHostnameRepository hostnames = mock(OrgHostnameRepository.class);
    private final OrganizationRepository organizations = mock(OrganizationRepository.class);
    private final FakeSettings fake = new FakeSettings();
    private final EnterpriseFeatureFlag flag = new EnterpriseFeatureFlag(fake.settings);
    private final AtomicLong now = new AtomicLong(1_000_000L);
    private final Clock clock = new Clock() {
        @Override public java.time.ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(java.time.ZoneId zone) { return this; }
        @Override public Instant instant() { return Instant.ofEpochMilli(now.get()); }
        @Override public long millis() { return now.get(); }
    };
    private TenantResolver resolver;

    private Organization acme;
    private Organization beta;

    @BeforeEach
    void setUp() {
        fake.put(EnterpriseSettingKeys.FLAG_ENTERPRISE, "{\"on\":true}");
        fake.put(EnterpriseSettingKeys.FLAG_DOMAINS, "{\"on\":true}");
        acme = org(ACME, "acme", OrgStatus.ACTIVE);
        beta = org(BETA, "beta", OrgStatus.ACTIVE);
        resolver = new TenantResolver(hostnames, organizations, fake.settings, flag, clock);
        when(hostnames.findActiveByHostname(anyString())).thenReturn(Optional.empty());
        when(hostnames.findBySubdomain(anyString())).thenReturn(Optional.empty());
        when(hostnames.findLiveByOrgIdAndHostname(anyLong(), anyString())).thenReturn(Optional.empty());
    }

    private Organization org(long id, String slug, OrgStatus status) {
        Organization o = new Organization();
        o.setId(id);
        o.setSlug(slug);
        o.setName(slug);
        o.setStatus(status);
        when(organizations.findByOrgId(id)).thenReturn(Optional.of(o));
        return o;
    }

    private OrgHostname row(long id, Organization org, String host, OrgHostnameKind kind, OrgHostnameStatus status) {
        OrgHostname h = new OrgHostname();
        h.setId(id);
        h.setOrgId(org.getId());
        h.setHostname(host);
        h.setKind(kind);
        h.setStatus(status);
        if (status == OrgHostnameStatus.ACTIVE) when(hostnames.findActiveByHostname(h.getHostname())).thenReturn(Optional.of(h));
        when(hostnames.findLiveByOrgIdAndHostname(org.getId(), h.getHostname())).thenReturn(Optional.of(h));
        return h;
    }

    private void subdomain(Organization org, String label, boolean enabled) {
        org.setSubdomain(label);
        org.setSubdomainEnabled(enabled);
        when(hostnames.findBySubdomain(label)).thenReturn(Optional.of(org));
    }

    private void assertUnknown(String host, Reason reason) {
        TenantContext c = resolver.resolve(host);
        assertThat(c.kind()).as(host).isEqualTo(Kind.UNKNOWN);
        assertThat(c.reason()).as(host).isEqualTo(reason);
        assertThat(c.orgId()).isNull();
    }

    // ---- the acceptance table -----------------------------------------------------------------------------------------------

    @Test
    void anEnabledSubdomainOfAnActiveOrgIsThatTenant() {
        subdomain(acme, "acme", true);
        TenantContext c = resolver.resolve("acme.kiwiply.com");
        assertThat(c.kind()).isEqualTo(Kind.TENANT);
        assertThat(c.orgId()).isEqualTo(ACME);
        assertThat(c.hostnameId()).isNull();
        assertThat(c.host()).isEqualTo("acme.kiwiply.com");
    }

    @Test
    void theSameSubdomainWithTheSwitchOffIsUnknown() {
        subdomain(acme, "acme", false);
        assertUnknown("acme.kiwiply.com", Reason.UNKNOWN_HOST);
    }

    @Test
    void aPastDueOrgStillResolvesButASuspendedOrClosedOrDraftOneDoesNot() {
        subdomain(acme, "acme", true);
        acme.setStatus(OrgStatus.PAST_DUE);
        assertThat(resolver.resolve("acme.kiwiply.com").kind()).isEqualTo(Kind.TENANT);
        for (OrgStatus s : List.of(OrgStatus.SUSPENDED, OrgStatus.CLOSED, OrgStatus.DRAFT, OrgStatus.PENDING_SETUP_FEE)) {
            acme.setStatus(s);
            resolver.invalidate();
            assertUnknown("acme.kiwiply.com", Reason.ORG_INACTIVE);
        }
    }

    @Test
    void anActiveCustomHostnameIsTheTenantAndCarriesTheHostnameId() {
        row(77L, acme, "careers.acme.com", OrgHostnameKind.CUSTOM, OrgHostnameStatus.ACTIVE);
        TenantContext c = resolver.resolve("Careers.ACME.com:443");
        assertThat(c.kind()).isEqualTo(Kind.TENANT);
        assertThat(c.orgId()).isEqualTo(ACME);
        assertThat(c.hostnameId()).isEqualTo(77L);
        assertThat(c.host()).isEqualTo("careers.acme.com");
    }

    @Test
    void aCustomHostnameThatIsNotActiveIsUnknownWhateverItsState() {
        for (OrgHostnameStatus s : List.of(OrgHostnameStatus.PENDING, OrgHostnameStatus.VERIFYING, OrgHostnameStatus.VERIFIED, OrgHostnameStatus.SUSPENDED, OrgHostnameStatus.REMOVED)) {
            row(1L, acme, "careers.acme.com", OrgHostnameKind.CUSTOM, s);
            resolver.invalidate();
            assertUnknown("careers.acme.com", Reason.UNKNOWN_HOST);
        }
    }

    @Test
    void anActiveHostnameOfASuspendedOrgIsUnknown() {
        row(77L, acme, "careers.acme.com", OrgHostnameKind.CUSTOM, OrgHostnameStatus.ACTIVE);
        acme.setStatus(OrgStatus.SUSPENDED);
        assertUnknown("careers.acme.com", Reason.ORG_INACTIVE);
    }

    @Test
    void aCustomHostnameNeedsTheDomainsFlagButASubdomainRowDoesNot() {
        row(77L, acme, "careers.acme.com", OrgHostnameKind.CUSTOM, OrgHostnameStatus.ACTIVE);
        row(78L, acme, "acme.kiwiply.com", OrgHostnameKind.SUBDOMAIN, OrgHostnameStatus.ACTIVE);
        fake.put(EnterpriseSettingKeys.FLAG_DOMAINS, "{\"on\":false}");
        resolver.invalidate();
        assertUnknown("careers.acme.com", Reason.FLAG_OFF);
        assertThat(resolver.resolve("acme.kiwiply.com").kind()).isEqualTo(Kind.TENANT);
    }

    @Test
    void reservedPlatformHostsAndLoopbackArePlatform() {
        for (String h : List.of("kiwiply.com", "www.kiwiply.com", "app.kiwiply.com", "api.kiwiply.com", "localhost", "localhost:3000", "127.0.0.1", "[::1]", "WWW.Kiwiply.Com")) {
            TenantContext c = resolver.resolve(h);
            assertThat(c.kind()).as(h).isEqualTo(Kind.PLATFORM);
            assertThat(c.orgId()).as(h).isNull();
        }
    }

    @Test
    void aPlatformHostCanNeverBecomeATenantEvenIfARowOrSubdomainClaimsIt() {
        subdomain(acme, "www", true); // inserted behind the service layer's back
        row(5L, acme, "app.kiwiply.com", OrgHostnameKind.SUBDOMAIN, OrgHostnameStatus.ACTIVE);
        assertThat(resolver.resolve("www.kiwiply.com").kind()).isEqualTo(Kind.PLATFORM);
        assertThat(resolver.resolve("app.kiwiply.com").kind()).isEqualTo(Kind.PLATFORM);
        verify(hostnames, never()).findActiveByHostname("app.kiwiply.com");
    }

    @Test
    void anUnknownHostIsUnknownWithNoFallback() {
        subdomain(acme, "acme", true);
        assertUnknown("nobody.example", Reason.UNKNOWN_HOST);
        assertUnknown("nobody.kiwiply.com", Reason.UNKNOWN_HOST);
        assertUnknown("a.b.acme.kiwiply.com", Reason.UNKNOWN_HOST); // exactly one label
        assertUnknown("evilkiwiply.com", Reason.UNKNOWN_HOST);
        assertUnknown("acme.kiwiply.com.evil.example", Reason.UNKNOWN_HOST);
        assertUnknown("74.208.212.158", Reason.UNKNOWN_HOST); // a tenant is never an IP address
    }

    @Test
    void aMissingHostIsLegacyAndAnInvalidOneIsInvalid() {
        assertUnknown(null, Reason.NO_HOST);
        assertUnknown("", Reason.NO_HOST);
        assertUnknown("   ", Reason.NO_HOST);
        assertThat(resolver.resolve(null).isExplicitlyUnknown()).as("a legacy caller keeps today's behaviour").isFalse();
        for (String bad : List.of("a.com,b.com", "a.com/x", "user@a.com", "a b.com", "-a.com", "http://a.com")) {
            assertUnknown(bad, Reason.INVALID_HOST);
            assertThat(resolver.resolve(bad).isExplicitlyUnknown()).isTrue();
        }
    }

    @Test
    void aSuspendedOrPendingSubdomainRowOverridesTheLabelRule() {
        subdomain(acme, "acme", true);
        row(9L, acme, "acme.kiwiply.com", OrgHostnameKind.SUBDOMAIN, OrgHostnameStatus.SUSPENDED);
        assertUnknown("acme.kiwiply.com", Reason.UNKNOWN_HOST);
        row(9L, acme, "acme.kiwiply.com", OrgHostnameKind.SUBDOMAIN, OrgHostnameStatus.PENDING);
        resolver.invalidate();
        assertUnknown("acme.kiwiply.com", Reason.UNKNOWN_HOST);
    }

    @Test
    void theDevelopmentBaseDomainResolvesAcmeLocalhostButNotPlainLocalhost() {
        subdomain(acme, "acme", true);
        assertThat(resolver.resolve("acme.localhost:3000").orgId()).isEqualTo(ACME);
        assertThat(resolver.resolve("localhost").kind()).isEqualTo(Kind.PLATFORM);
        fake.put(EnterpriseSettingKeys.HOSTS_TENANT_BASE_DOMAINS, "[\"kiwiply.com\"]");
        resolver.invalidate();
        assertUnknown("acme.localhost", Reason.UNKNOWN_HOST);
    }

    // ---- flags --------------------------------------------------------------------------------------------------------------

    @Test
    void withTheMasterFlagOffNothingIsATenant() {
        subdomain(acme, "acme", true);
        fake.put(EnterpriseSettingKeys.FLAG_ENTERPRISE, "{\"on\":false}");
        resolver.invalidate();
        assertUnknown("acme.kiwiply.com", Reason.FLAG_OFF);
        assertUnknown("kiwiply.com", Reason.FLAG_OFF);
    }

    @Test
    void anOrgOutsideTheAllowListBehavesAsIfTheFlagWereOff() {
        subdomain(acme, "acme", true);
        subdomain(beta, "beta", true);
        fake.put(EnterpriseSettingKeys.FLAG_ENTERPRISE, "{\"on\":true,\"allow\":[" + ACME + "]}");
        resolver.invalidate();
        assertThat(resolver.resolve("acme.kiwiply.com").orgId()).isEqualTo(ACME);
        assertUnknown("beta.kiwiply.com", Reason.FLAG_OFF);
    }

    // ---- cache --------------------------------------------------------------------------------------------------------------

    @Test
    void aResultIsCachedForTheConfiguredSecondsAndThenRefreshed() {
        subdomain(acme, "acme", true);
        resolver.resolve("acme.kiwiply.com");
        resolver.resolve("ACME.kiwiply.com:443");
        verify(hostnames, times(1)).findBySubdomain("acme");

        now.addAndGet(59_000);
        resolver.resolve("acme.kiwiply.com");
        verify(hostnames, times(1)).findBySubdomain("acme");

        now.addAndGet(2_000); // past 60 s
        resolver.resolve("acme.kiwiply.com");
        verify(hostnames, times(2)).findBySubdomain("acme");
    }

    @Test
    void invalidateMakesTheNextRequestSeeTheNewState() {
        subdomain(acme, "acme", true);
        assertThat(resolver.resolve("acme.kiwiply.com").kind()).isEqualTo(Kind.TENANT);
        acme.setStatus(OrgStatus.SUSPENDED);
        assertThat(resolver.resolve("acme.kiwiply.com").kind()).as("still cached").isEqualTo(Kind.TENANT);
        resolver.invalidate();
        assertUnknown("acme.kiwiply.com", Reason.ORG_INACTIVE);
    }

    @Test
    void unknownHostsAreCachedToo_butTheCacheIsBounded() {
        for (int i = 0; i < TenantResolver.MAX_CACHE_ENTRIES + 500; i++) resolver.resolve("h" + i + ".example");
        assertThat(resolver.cachedHosts()).isEqualTo(TenantResolver.MAX_CACHE_ENTRIES);
    }

    @Test
    void zeroSecondsMeansNoCaching() {
        subdomain(acme, "acme", true);
        fake.put(EnterpriseSettingKeys.TENANT_CACHE_SECONDS, "0");
        resolver.resolve("acme.kiwiply.com");
        resolver.resolve("acme.kiwiply.com");
        verify(hostnames, times(2)).findBySubdomain("acme");
        assertThat(resolver.cachedHosts()).isZero();
    }

    @Test
    void aFailingLookupFailsClosedAndIsNotCached() {
        when(hostnames.findActiveByHostname(anyString())).thenThrow(new IllegalStateException("db down"));
        assertUnknown("careers.acme.com", Reason.UNKNOWN_HOST);
        assertThat(resolver.cachedHosts()).isZero();
        when(hostnames.findActiveByHostname(anyString())).thenReturn(Optional.empty());
        assertUnknown("careers.acme.com", Reason.UNKNOWN_HOST);
        assertThat(resolver.cachedHosts()).isEqualTo(1);
    }

    // ---- the certificate gate -----------------------------------------------------------------------------------------------

    @Test
    void theCertificateGateAnswersYesOnlyForHostsThatResolveToATenant() {
        row(77L, acme, "careers.acme.com", OrgHostnameKind.CUSTOM, OrgHostnameStatus.ACTIVE);
        row(78L, acme, "pending.acme.com", OrgHostnameKind.CUSTOM, OrgHostnameStatus.PENDING);
        row(79L, acme, "verified.acme.com", OrgHostnameKind.CUSTOM, OrgHostnameStatus.VERIFIED);
        row(80L, acme, "suspended.acme.com", OrgHostnameKind.CUSTOM, OrgHostnameStatus.SUSPENDED);
        row(81L, acme, "removed.acme.com", OrgHostnameKind.CUSTOM, OrgHostnameStatus.REMOVED);
        subdomain(beta, "beta", true);

        assertThat(resolver.certificateAllowed("careers.acme.com")).isTrue();
        assertThat(resolver.certificateAllowed("beta.kiwiply.com")).isTrue();
        for (String no : List.of("pending.acme.com", "verified.acme.com", "suspended.acme.com", "removed.acme.com", "nobody.example", "kiwiply.com", "www.kiwiply.com", "localhost", "", "a.com/x")) {
            assertThat(resolver.certificateAllowed(no)).as(no).isFalse();
        }
        assertThat(resolver.certificateAllowed(null)).isFalse();
        verify(organizations, never()).findByOrgId(eq(999L));
        verify(hostnames, never()).findByOrgIdAndId(any(), any());
    }
}
