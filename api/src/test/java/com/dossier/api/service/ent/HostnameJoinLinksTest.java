package com.dossier.api.service.ent;

import static org.assertj.core.api.Assertions.assertThat;
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
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** X1.8: the invite link uses the organization's live host, else the platform; never anything the request supplied. */
class HostnameJoinLinksTest {

    private final OrgHostnameRepository hostnames = mock(OrgHostnameRepository.class);
    private final OrganizationRepository orgs = mock(OrganizationRepository.class);
    private final EnterpriseFeatureFlag flag = mock(EnterpriseFeatureFlag.class);
    private final HostnameJoinLinks links = new HostnameJoinLinks(hostnames, orgs, flag, "https://kiwiply.com/");
    private final Organization acme = new Organization();

    @BeforeEach
    void setUp() {
        acme.setId(7L);
        acme.setStatus(OrgStatus.ACTIVE);
        when(orgs.findByOrgId(7L)).thenReturn(Optional.of(acme));
        when(flag.isEnabled(7L)).thenReturn(true);
    }

    private static OrgHostname host(String name, OrgHostnameKind kind, OrgHostnameStatus status, boolean primary, HostnameCertState cert) {
        OrgHostname h = new OrgHostname();
        h.setHostname(name);
        h.setKind(kind);
        h.setStatus(status);
        h.setPrimary(primary);
        h.setCertState(cert);
        return h;
    }

    @Test
    void anActivePrimaryHostnameLeads() {
        when(hostnames.findByOrgIdOrderByCreatedAt(7L)).thenReturn(List.of(host("careers.acme.com", OrgHostnameKind.CUSTOM, OrgHostnameStatus.ACTIVE, true, HostnameCertState.ISSUED)));
        assertThat(links.joinLink(7L, "tok")).isEqualTo("https://careers.acme.com/join/t/tok");
    }

    @Test
    void aCustomNameWithoutACertificateNeverLeads() {
        when(hostnames.findByOrgIdOrderByCreatedAt(7L)).thenReturn(List.of(host("careers.acme.com", OrgHostnameKind.CUSTOM, OrgHostnameStatus.ACTIVE, true, HostnameCertState.REQUESTED)));
        assertThat(links.joinLink(7L, "tok")).isEqualTo("https://kiwiply.com/join/t/tok");
    }

    @Test
    void aPendingOrSuspendedHostnameNeverAppears() {
        when(hostnames.findByOrgIdOrderByCreatedAt(7L))
            .thenReturn(
                List.of(
                    host("a.acme.com", OrgHostnameKind.CUSTOM, OrgHostnameStatus.PENDING, true, HostnameCertState.ISSUED),
                    host("b.acme.com", OrgHostnameKind.CUSTOM, OrgHostnameStatus.SUSPENDED, false, HostnameCertState.ISSUED)
                )
            );
        assertThat(links.joinLink(7L, "tok")).isEqualTo("https://kiwiply.com/join/t/tok");
    }

    @Test
    void aSubdomainRowIsUsedWhenThereIsNoPrimary() {
        when(hostnames.findByOrgIdOrderByCreatedAt(7L)).thenReturn(List.of(host("acme.kiwiply.com", OrgHostnameKind.SUBDOMAIN, OrgHostnameStatus.ACTIVE, false, null)));
        assertThat(links.joinLink(7L, "tok")).isEqualTo("https://acme.kiwiply.com/join/t/tok");
    }

    @Test
    void developmentHostsUseHttp() {
        when(hostnames.findByOrgIdOrderByCreatedAt(7L)).thenReturn(List.of(host("acme.localhost", OrgHostnameKind.SUBDOMAIN, OrgHostnameStatus.ACTIVE, true, null)));
        assertThat(links.joinLink(7L, "tok")).isEqualTo("http://acme.localhost/join/t/tok");
    }

    @Test
    void aNonActiveOrganizationOrAFlagOffFallsBackToThePlatform() {
        when(hostnames.findByOrgIdOrderByCreatedAt(7L)).thenReturn(List.of(host("careers.acme.com", OrgHostnameKind.CUSTOM, OrgHostnameStatus.ACTIVE, true, HostnameCertState.ISSUED)));
        acme.setStatus(OrgStatus.SUSPENDED);
        assertThat(links.joinLink(7L, "tok")).isEqualTo("https://kiwiply.com/join/t/tok");
        acme.setStatus(OrgStatus.ACTIVE);
        when(flag.isEnabled(7L)).thenReturn(false);
        assertThat(links.joinLink(7L, "tok")).isEqualTo("https://kiwiply.com/join/t/tok");
    }

    @Test
    void anUnknownOrganizationOrALookupFailureFallsBackAndATokenIsEncoded() {
        assertThat(links.joinLink(null, "tok")).isEqualTo("https://kiwiply.com/join/t/tok");
        when(orgs.findByOrgId(7L)).thenThrow(new IllegalStateException("db down"));
        assertThat(links.joinLink(7L, "a b/c")).isEqualTo("https://kiwiply.com/join/t/a%20b%2Fc");
    }
}
