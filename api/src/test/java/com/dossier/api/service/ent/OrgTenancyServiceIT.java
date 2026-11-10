package com.dossier.api.service.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.OrgAuditEvent;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.org.OrgAuditEventRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.org.OrgAuditAsserts;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.web.rest.org.OrgFixtures;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

/** X1.2: the single writer of an organization's subdomain applies the data rules, bumps config_version and audits exactly once. */
@IntegrationTest
@Transactional
class OrgTenancyServiceIT {

    @Autowired private OrgTenancyService service;
    @Autowired private OrganizationRepository orgs;
    @Autowired private OrgMemberRepository members;
    @Autowired private OrgAuditEventRepository audit;
    @Autowired private UserRepository users;
    @Autowired private EntityManager em;

    private Organization a;
    private Organization b;

    @BeforeEach
    void seed() {
        OrgFixtures fx = new OrgFixtures(users, orgs, members);
        a = fx.org("tenancy-a-" + System.nanoTime(), OrgStatus.ACTIVE);
        b = fx.org("tenancy-b-" + System.nanoTime(), OrgStatus.ACTIVE);
    }

    private Organization reload(Organization o) {
        em.flush();
        em.clear();
        return orgs.findByOrgId(o.getId()).orElseThrow();
    }

    @Test
    void settingASubdomainStoresItLowerCasedBumpsTheVersionAndAuditsOnce() {
        long before = audit.countByOrgId(a.getId());
        service.setSubdomain(a.getId(), "  AcmeCorp ", true);

        Organization read = reload(a);
        assertThat(read.getSubdomain()).isEqualTo("acmecorp");
        assertThat(read.isSubdomainEnabled()).isTrue();
        assertThat(read.getConfigVersion()).isEqualTo(1);
        OrgAuditEvent row = OrgAuditAsserts.assertOneNewRow(audit, a.getId(), before, OrgAuditService.ORG_SUBDOMAIN_SET);
        assertThat(row.getDetails()).contains("acmecorp").contains("enabled=true");

        service.setSubdomain(a.getId(), "acmecorp", false);
        assertThat(reload(a).getConfigVersion()).isEqualTo(2);
        assertThat(reload(a).isSubdomainEnabled()).isFalse();
    }

    @Test
    void aReservedLabelIs422ReservedValueAndNothingChanges() {
        long before = audit.countByOrgId(a.getId());
        assertThatThrownBy(() -> service.setSubdomain(a.getId(), "www", true)).isInstanceOfSatisfying(OrgException.class, e -> {
            assertThat(e.getStatus()).isEqualTo(422);
            assertThat(e.getCode()).isEqualTo("RESERVED_VALUE");
        });
        Organization read = reload(a);
        assertThat(read.getSubdomain()).isNull();
        assertThat(read.getConfigVersion()).isZero();
        OrgAuditAsserts.assertNoNewRow(audit, a.getId(), before);
    }

    @Test
    void aLabelOwnedByAnotherOrganizationIs409AndTheOwnerMayKeepIt() {
        service.setSubdomain(a.getId(), "shared-name", false);
        assertThatThrownBy(() -> service.setSubdomain(b.getId(), "shared-name", true)).isInstanceOfSatisfying(OrgException.class, e -> {
            assertThat(e.getStatus()).isEqualTo(409);
            assertThat(e.getCode()).isEqualTo("SUBDOMAIN_TAKEN");
        });
        assertThat(reload(b).getSubdomain()).isNull();
        service.setSubdomain(a.getId(), "shared-name", true); // idempotent for the owner
        assertThat(reload(a).isSubdomainEnabled()).isTrue();
    }

    @Test
    void enablingNeedsALabelAndClearingSwitchesTheSubdomainOff() {
        assertThatThrownBy(() -> service.setSubdomain(a.getId(), null, true)).isInstanceOfSatisfying(OrgException.class, e -> assertThat(e.getCode()).isEqualTo("ORG_INVALID"));
        service.setSubdomain(a.getId(), "clearable", true);
        service.setSubdomain(a.getId(), null, false);
        Organization read = reload(a);
        assertThat(read.getSubdomain()).isNull();
        assertThat(read.isSubdomainEnabled()).isFalse();
    }

    @Test
    void anUnknownOrganizationIsTheGeneric404() {
        assertThatThrownBy(() -> service.setSubdomain(Long.MAX_VALUE, "whoever", true)).isInstanceOf(OrgNotFoundException.class);
    }
}
