package com.dossier.api.service.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.ent.OrgHostname;
import com.dossier.api.domain.enumeration.HostnameCertState;
import com.dossier.api.domain.enumeration.OrgHostnameKind;
import com.dossier.api.domain.enumeration.OrgHostnameStatus;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.OrgHostnameRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ai.FakeSettings;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** X2.10: which host a link for an organization uses, table-driven, no database. */
class TenantUrlsTest {

    private static final long ACME = 12L;
    private static final String PLATFORM = "https://kiwiply.com";

    private final OrgHostnameRepository hostnames = mock(OrgHostnameRepository.class);
    private final OrganizationRepository organizations = mock(OrganizationRepository.class);
    private final FakeSettings fake = new FakeSettings();
    private final EnterpriseFeatureFlag flag = new EnterpriseFeatureFlag(fake.settings);
    private final List<OrgHostname> rows = new ArrayList<>();
    private Organization acme;
    private TenantUrls urls;

    @BeforeEach
    void setUp() {
        fake.put(EnterpriseSettingKeys.FLAG_ENTERPRISE, "{\"on\":true}");
        fake.put(EnterpriseSettingKeys.FLAG_DOMAINS, "{\"on\":true}");
        acme = new Organization();
        acme.setId(ACME);
        acme.setSlug("acme");
        acme.setName("Acme");
        acme.setStatus(OrgStatus.ACTIVE);
        when(organizations.findByOrgId(ACME)).thenReturn(Optional.of(acme));
        when(hostnames.findByOrgIdOrderByCreatedAt(anyLong())).thenAnswer(i -> new ArrayList<>(rows));
        urls = new TenantUrls(hostnames, organizations, fake.settings, flag, PLATFORM + "/", false);
    }

    private OrgHostname row(String host, OrgHostnameKind kind, OrgHostnameStatus status, HostnameCertState cert, boolean primary) {
        OrgHostname h = new OrgHostname();
        h.setOrgId(ACME);
        h.setHostname(host);
        h.setKind(kind);
        h.setStatus(status);
        h.setCertState(cert);
        h.setPrimary(primary);
        rows.add(h);
        return h;
    }

    private void subdomain(boolean enabled) {
        acme.setSubdomain("acme");
        acme.setSubdomainEnabled(enabled);
    }

    @Test
    void anActiveCustomPrimaryWithAnIssuedCertificateWins() {
        subdomain(true);
        row("acme.kiwiply.com", OrgHostnameKind.SUBDOMAIN, OrgHostnameStatus.ACTIVE, HostnameCertState.NONE, false);
        row("careers.acme.com", OrgHostnameKind.CUSTOM, OrgHostnameStatus.ACTIVE, HostnameCertState.ISSUED, true);
        assertThat(urls.base(ACME)).isEqualTo("https://careers.acme.com");
        assertThat(urls.joinLink(ACME, "tok en/1")).isEqualTo("https://careers.acme.com/join/t/tok%20en%2F1");
    }

    @Test
    void anActiveCustomPrimaryWhoseCertificateIsNotIssuedFallsBackToTheSubdomain() {
        subdomain(true);
        row("careers.acme.com", OrgHostnameKind.CUSTOM, OrgHostnameStatus.ACTIVE, HostnameCertState.REQUESTED, true);
        assertThat(urls.base(ACME)).isEqualTo("https://acme.kiwiply.com");
        rows.get(0).setCertState(HostnameCertState.FAILED);
        assertThat(urls.base(ACME)).isEqualTo("https://acme.kiwiply.com");
    }

    @Test
    void aPendingOrSuspendedCustomPrimaryNeverAppears() {
        subdomain(true);
        row("careers.acme.com", OrgHostnameKind.CUSTOM, OrgHostnameStatus.PENDING, HostnameCertState.NONE, true);
        assertThat(urls.base(ACME)).isEqualTo("https://acme.kiwiply.com");
        rows.get(0).setStatus(OrgHostnameStatus.SUSPENDED);
        rows.get(0).setCertState(HostnameCertState.ISSUED);
        assertThat(urls.base(ACME)).isEqualTo("https://acme.kiwiply.com");
        rows.get(0).setStatus(OrgHostnameStatus.REMOVED);
        assertThat(urls.base(ACME)).isEqualTo("https://acme.kiwiply.com");
    }

    @Test
    void aSuspendedOrPendingSubdomainRowFallsBackToThePlatform() {
        subdomain(true);
        OrgHostname sub = row("acme.kiwiply.com", OrgHostnameKind.SUBDOMAIN, OrgHostnameStatus.SUSPENDED, HostnameCertState.NONE, false);
        assertThat(urls.base(ACME)).isEqualTo(PLATFORM);
        sub.setStatus(OrgHostnameStatus.PENDING);
        assertThat(urls.base(ACME)).isEqualTo(PLATFORM);
    }

    @Test
    void anActiveSubdomainRowIsUsedAndABareEnabledSubdomainToo() {
        row("acme.kiwiply.com", OrgHostnameKind.SUBDOMAIN, OrgHostnameStatus.ACTIVE, HostnameCertState.NONE, false);
        assertThat(urls.base(ACME)).isEqualTo("https://acme.kiwiply.com");
        rows.clear();
        subdomain(true);
        assertThat(urls.workspaceLink(ACME, "/w/admin?x=1")).isEqualTo("https://acme.kiwiply.com/w/admin?x=1");
    }

    @Test
    void noHostnamesOrADisabledSubdomainMeansThePlatform() {
        assertThat(urls.base(ACME)).isEqualTo(PLATFORM);
        subdomain(false);
        assertThat(urls.verifyLink(ACME, "k1")).isEqualTo(PLATFORM + "/account/activate?key=k1");
        assertThat(urls.resetLink(ACME, "k2")).isEqualTo(PLATFORM + "/reset-password?key=k2");
    }

    @Test
    void anInactiveOrganizationOrADarkFlagMeansThePlatform() {
        subdomain(true);
        acme.setStatus(OrgStatus.SUSPENDED);
        assertThat(urls.base(ACME)).isEqualTo(PLATFORM);
        acme.setStatus(OrgStatus.PAST_DUE);
        assertThat(urls.base(ACME)).isEqualTo("https://acme.kiwiply.com");
        fake.put(EnterpriseSettingKeys.FLAG_ENTERPRISE, "{\"on\":false}");
        assertThat(urls.base(ACME)).isEqualTo(PLATFORM);
    }

    @Test
    void aCustomHostNeedsTheDomainsFlag() {
        subdomain(true);
        row("careers.acme.com", OrgHostnameKind.CUSTOM, OrgHostnameStatus.ACTIVE, HostnameCertState.ISSUED, true);
        fake.put(EnterpriseSettingKeys.FLAG_DOMAINS, "{\"on\":false}");
        assertThat(urls.base(ACME)).isEqualTo("https://acme.kiwiply.com");
    }

    @Test
    void anUnknownOrNullOrganizationAndARepositoryFailureNeverLeakAnotherTenant() {
        assertThat(urls.base(999L)).isEqualTo(PLATFORM);
        assertThat(urls.base(null)).isEqualTo(PLATFORM);
        when(hostnames.findByOrgIdOrderByCreatedAt(ACME)).thenThrow(new IllegalStateException("db down"));
        assertThat(urls.base(ACME)).isEqualTo(PLATFORM);
    }

    @Test
    void localhostTenantsAreHttpOnlyWhenAllowed() {
        subdomain(true);
        fake.put(EnterpriseSettingKeys.HOSTS_TENANT_BASE_DOMAINS, "[\"localhost\"]");
        assertThat(urls.base(ACME)).isEqualTo(PLATFORM); // production: localhost is never a tenant base
        urls = new TenantUrls(hostnames, organizations, fake.settings, flag, PLATFORM, true);
        assertThat(urls.base(ACME)).isEqualTo("http://acme.localhost");
    }

    @Test
    void workspacePathsCannotBeTurnedIntoAnotherHost() {
        for (String bad : new String[] { "//evil.com", "https://evil.com", "/\\evil.com", "evil.com", "", null, "/a b", "/x\r\nSet-Cookie: a=b", "/a://b" }) {
            assertThat(urls.workspaceLink(ACME, bad)).as(String.valueOf(bad)).isEqualTo(PLATFORM + "/");
        }
    }

    @Test
    void theBuilderDoesNotKnowTheRequestHost() {
        // T12 / 04 section 6: the base comes from rows only. No field can carry a request host or tenant context.
        for (var f : TenantUrls.class.getDeclaredFields()) {
            assertThat(f.getType().getName()).as(f.getName()).doesNotContain("TenantContext");
        }
    }
}
