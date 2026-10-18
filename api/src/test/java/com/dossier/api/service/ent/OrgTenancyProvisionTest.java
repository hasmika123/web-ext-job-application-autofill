package com.dossier.api.service.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.ent.OrgHostname;
import com.dossier.api.domain.enumeration.OrgHostnameKind;
import com.dossier.api.domain.enumeration.OrgHostnameStatus;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.OrgHostnameRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgNotFoundException;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** X1.11: provisioning, suspending and resuming a hostname; each bumps config_version, evicts the tenant cache and writes no audit row of its own. */
class OrgTenancyProvisionTest {

    private final OrganizationRepository organizations = mock(OrganizationRepository.class);
    private final OrgHostnameRepository hostnames = mock(OrgHostnameRepository.class);
    private final OrgAuditService audit = mock(OrgAuditService.class);
    private final TenantResolver resolver = mock(TenantResolver.class);
    private final OrgTenancyService service = new OrgTenancyService(organizations, hostnames, audit, resolver);
    private final List<OrgHostname> rows = new ArrayList<>();
    private Organization org;
    private long nextId = 100;

    @BeforeEach
    void setUp() {
        org = new Organization();
        org.setId(7L);
        when(organizations.findByOrgId(7L)).thenReturn(Optional.of(org));
        when(organizations.saveAndFlush(any(Organization.class))).thenAnswer(i -> i.getArgument(0));
        when(hostnames.findBySubdomain(anyString())).thenReturn(Optional.empty());
        when(hostnames.findByOrgIdOrderByCreatedAt(7L)).thenAnswer(i -> List.copyOf(rows));
        when(hostnames.findPrimaryByOrgId(7L)).thenAnswer(i -> rows.stream().filter(h -> h.isPrimary() && h.getStatus() != OrgHostnameStatus.REMOVED).findFirst());
        when(hostnames.findByOrgIdAndId(any(), any())).thenAnswer(i -> rows.stream().filter(h -> h.getOrgId().equals(i.getArgument(0)) && h.getId().equals(i.getArgument(1))).findFirst());
        when(hostnames.saveAndFlush(any(OrgHostname.class))).thenAnswer(i -> {
            OrgHostname h = i.getArgument(0);
            if (h.getId() == null) {
                h.setId(nextId++);
                rows.add(h);
            }
            return h;
        });
    }

    @Test
    void provisioningCreatesAnActivePrimarySubdomainRowAndSwitchesTheSubdomainOn() {
        OrgTenancyService.Provisioned p = service.provisionSubdomain(7L, " Acme ", "acme.kiwiply.com");

        assertThat(org.getSubdomain()).isEqualTo("acme");
        assertThat(org.isSubdomainEnabled()).isTrue();
        assertThat(org.getConfigVersion()).isEqualTo(1);
        assertThat(p.hostname().getHostname()).isEqualTo("acme.kiwiply.com");
        assertThat(p.hostname().getKind()).isEqualTo(OrgHostnameKind.SUBDOMAIN);
        assertThat(p.hostname().getStatus()).isEqualTo(OrgHostnameStatus.ACTIVE);
        assertThat(p.hostname().isPrimary()).isTrue();
        assertThat(p.hostname().getActivatedAt()).isNotNull();
        verify(resolver).invalidate();
        verify(audit, never()).record(any(), any(), any(), any(), any(), any(), any());
    }

    @Test
    void provisioningTheSameLabelAgainKeepsOneRowAndReactivatesIt() {
        service.provisionSubdomain(7L, "acme", "acme.kiwiply.com");
        rows.get(0).setStatus(OrgHostnameStatus.SUSPENDED);
        service.provisionSubdomain(7L, "acme", "acme.kiwiply.com");

        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).getStatus()).isEqualTo(OrgHostnameStatus.ACTIVE);
        assertThat(rows.get(0).getSuspendedAt()).isNull();
    }

    @Test
    void aNewLabelEndsTheOldSubdomainRowAndTheNewOneBecomesPrimary() {
        service.provisionSubdomain(7L, "acme", "acme.kiwiply.com");
        service.provisionSubdomain(7L, "acme-corp", "acme-corp.kiwiply.com");

        assertThat(rows).hasSize(2);
        assertThat(rows.get(0).getStatus()).isEqualTo(OrgHostnameStatus.REMOVED);
        assertThat(rows.get(0).isPrimary()).isFalse();
        assertThat(rows.get(1).getStatus()).isEqualTo(OrgHostnameStatus.ACTIVE);
        assertThat(rows.get(1).isPrimary()).isTrue();
    }

    @Test
    void aLabelOwnedByAnotherOrganizationIsSlugTakenWithASuggestion() {
        Organization other = new Organization();
        other.setId(8L);
        when(hostnames.findBySubdomain("acme")).thenReturn(Optional.of(other));

        assertThatThrownBy(() -> service.provisionSubdomain(7L, "acme", "acme.kiwiply.com")).isInstanceOfSatisfying(OrgException.class, e -> {
            assertThat(e.getStatus()).isEqualTo(409);
            assertThat(e.getCode()).isEqualTo("SLUG_TAKEN");
            assertThat(e.getExtra()).containsEntry("suggestion", "acme-2");
        });
        assertThat(rows).isEmpty();
        assertThat(org.getConfigVersion()).isZero();
        verify(resolver, never()).invalidate();
    }

    @Test
    void aReservedLabelIs422() {
        assertThatThrownBy(() -> service.provisionSubdomain(7L, "api", "api.kiwiply.com")).isInstanceOfSatisfying(OrgException.class, e -> {
            assertThat(e.getStatus()).isEqualTo(422);
            assertThat(e.getCode()).isEqualTo("RESERVED_VALUE");
        });
    }

    @Test
    void suspendThenResumeFlipsTheStatusBumpsTheVersionAndEvictsTheCacheEachTime() {
        OrgHostname h = service.provisionSubdomain(7L, "acme", "acme.kiwiply.com").hostname();
        int afterProvision = org.getConfigVersion();

        service.suspendHostname(7L, h.getId());
        assertThat(h.getStatus()).isEqualTo(OrgHostnameStatus.SUSPENDED);
        assertThat(h.getSuspendedAt()).isNotNull();
        assertThat(org.getConfigVersion()).isEqualTo(afterProvision + 1);

        service.resumeHostname(7L, h.getId());
        assertThat(h.getStatus()).isEqualTo(OrgHostnameStatus.ACTIVE);
        assertThat(h.getSuspendedAt()).isNull();
        assertThat(org.getConfigVersion()).isEqualTo(afterProvision + 2);
        verify(resolver, times(3)).invalidate();
    }

    @Test
    void suspendNeedsActiveAndResumeNeedsSuspendedAndAForeignRowIs404() {
        OrgHostname h = service.provisionSubdomain(7L, "acme", "acme.kiwiply.com").hostname();
        assertThatThrownBy(() -> service.resumeHostname(7L, h.getId())).isInstanceOfSatisfying(OrgException.class, e -> assertThat(e.getStatus()).isEqualTo(409));
        service.suspendHostname(7L, h.getId());
        assertThatThrownBy(() -> service.suspendHostname(7L, h.getId())).isInstanceOfSatisfying(OrgException.class, e -> assertThat(e.getStatus()).isEqualTo(409));
        assertThatThrownBy(() -> service.suspendHostname(8L, h.getId())).isInstanceOf(OrgNotFoundException.class);
    }

    @Test
    void labelFreeMeansWellFormedNotReservedAndNotOwnedByAnother() {
        Organization other = new Organization();
        other.setId(8L);
        when(hostnames.findBySubdomain("taken")).thenReturn(Optional.of(other));
        assertThat(service.isLabelFree("free-one", 7L)).isTrue();
        assertThat(service.isLabelFree("taken", 7L)).isFalse();
        assertThat(service.isLabelFree("taken", 8L)).isTrue();
        assertThat(service.isLabelFree("www", 7L)).isFalse();
        assertThat(service.isLabelFree("a", 7L)).isFalse();
    }
}
