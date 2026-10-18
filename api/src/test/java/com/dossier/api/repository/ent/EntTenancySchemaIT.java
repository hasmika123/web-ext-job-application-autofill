package com.dossier.api.repository.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.ent.OrgBranding;
import com.dossier.api.domain.ent.OrgHostname;
import com.dossier.api.domain.ent.OrgSetting;
import com.dossier.api.domain.enumeration.HostnameCertState;
import com.dossier.api.domain.enumeration.OrgBrandingTheme;
import com.dossier.api.domain.enumeration.OrgHostnameKind;
import com.dossier.api.domain.enumeration.OrgHostnameStatus;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.enumeration.OrgType;
import com.dossier.api.domain.org.OrgAuditEvent;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.org.OrgAuditEventRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import jakarta.persistence.EntityManager;
import java.time.Instant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.transaction.annotation.Transactional;

/**
 * X1.2: the tenancy schema boots under Liquibase, every entity round-trips, the database itself enforces "a hostname has at
 * most one live claim" and "one live primary hostname per organization", and every {@code repository.ent} method is proven
 * unable to cross tenants (org B asks for org A's rows with A's own ids, hostnames and keys).
 */
@IntegrationTest
@Transactional
class EntTenancySchemaIT {

    @Autowired private OrganizationRepository orgs;
    @Autowired private OrgHostnameRepository hostnames;
    @Autowired private OrgBrandingRepository brandings;
    @Autowired private OrgSettingRepository settings;
    @Autowired private OrgAuditEventRepository audit;
    @Autowired private EntityManager em;

    private Organization a;
    private Organization b;

    @BeforeEach
    void seed() {
        a = org("acme-" + System.nanoTime());
        b = org("beta-" + System.nanoTime());
    }

    @Test
    void theSuiteRunsOnRealMySqlNotH2() {
        // the generated columns and their unique indexes below exist only on MySQL (MysqlTestContainer, mysql:9.2.0)
        String product = (String) em.createNativeQuery("SELECT VERSION()").getSingleResult();
        assertThat(product).as("database version string").doesNotContainIgnoringCase("h2").matches("\\d+\\.\\d+.*");
        Object generated = em.createNativeQuery("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'org_hostname' AND column_name IN ('live_hostname_key','primary_org_key') AND generation_expression <> ''").getSingleResult();
        assertThat(((Number) generated).intValue()).as("both STORED generated columns exist").isEqualTo(2);
    }

    @Test
    void everySplitOrganizationColumnExists() {
        for (String column : new String[] { "subdomain", "subdomain_enabled", "config_version", "display_name" }) {
            Object n = em.createNativeQuery("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'organization' AND column_name = ?1").setParameter(1, column).getSingleResult();
            assertThat(((Number) n).intValue()).as(column).isEqualTo(1);
        }
    }

    private Organization org(String slug) {
        Organization o = new Organization();
        o.setSlug(slug);
        o.setName("Org " + slug);
        o.setType(OrgType.CONSULTANCY);
        o.setStatus(OrgStatus.ACTIVE);
        return orgs.saveAndFlush(o);
    }

    private OrgHostname host(Organization org, String name, OrgHostnameStatus status, boolean primary) {
        OrgHostname h = new OrgHostname();
        h.setOrgId(org.getId());
        h.setHostname(name);
        h.setKind(OrgHostnameKind.CUSTOM);
        h.setStatus(status);
        h.setPrimary(primary);
        return hostnames.saveAndFlush(h);
    }

    // ---- organization columns ---------------------------------------------------------------------------------------

    @Test
    void theNewOrganizationColumnsDefaultToTheOldBehaviour() {
        em.clear();
        Organization o = orgs.findByOrgId(a.getId()).orElseThrow();
        assertThat(o.getSubdomain()).isNull();
        assertThat(o.isSubdomainEnabled()).isFalse();
        assertThat(o.getConfigVersion()).isZero();
        assertThat(o.getDisplayName()).isNull();
    }

    @Test
    void theNewOrganizationTypesAreStoredWithTheirFullLength() {
        for (OrgType type : new OrgType[] { OrgType.STAFFING, OrgType.PROFESSIONAL_SERVICES }) {
            Organization o = org("type-" + type.name().toLowerCase().replace('_', '-') + "-" + System.nanoTime());
            o.setType(type);
            orgs.saveAndFlush(o);
            em.clear();
            assertThat(orgs.findByOrgId(o.getId()).orElseThrow().getType()).isEqualTo(type);
        }
        assertThat(OrgType.PROFESSIONAL_SERVICES.name()).hasSize(21); // the reason the column was widened
    }

    @Test
    void subdomainsAreGloballyUniqueButManyOrganizationsMayHaveNone() {
        // a, b and any number of other orgs have no subdomain: NULLs never collide
        org("third-" + System.nanoTime());
        a.setSubdomain("acme");
        orgs.saveAndFlush(a);
        em.clear();
        assertThat(hostnames.findBySubdomain("acme").orElseThrow().getId()).isEqualTo(a.getId());
        b.setSubdomain("acme");
        assertThatThrownBy(() -> orgs.saveAndFlush(b)).isInstanceOf(DataIntegrityViolationException.class);
    }

    // ---- org_hostname -----------------------------------------------------------------------------------------------

    @Test
    void aHostnameIsStoredInCanonicalForm() {
        OrgHostname h = host(a, "Careers.ACME.com:443", OrgHostnameStatus.ACTIVE, true);
        em.clear();
        OrgHostname read = hostnames.findByOrgIdAndId(a.getId(), h.getId()).orElseThrow();
        assertThat(read.getHostname()).isEqualTo("careers.acme.com");
        assertThat(read.getCertState()).isEqualTo(HostnameCertState.NONE);
        assertThat(read.isPrimary()).isTrue();
        assertThat(read.getCreatedAt()).isNotNull();
        assertThat(hostnames.findActiveByHostname("careers.acme.com").orElseThrow().getOrgId()).isEqualTo(a.getId());
        assertThatThrownBy(() -> new OrgHostname().setHostname("not a host")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new OrgHostname().setHostname(null)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void aSecondLiveClaimOnTheSameNameIsRefusedWhateverItsState() {
        host(a, "careers.acme.com", OrgHostnameStatus.ACTIVE, false);
        assertThatThrownBy(() -> host(b, "careers.acme.com", OrgHostnameStatus.ACTIVE, false)).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void aPendingClaimOnAnActiveNameIsRefusedToo() {
        host(a, "careers.acme.com", OrgHostnameStatus.ACTIVE, false);
        assertThatThrownBy(() -> host(b, "careers.acme.com", OrgHostnameStatus.PENDING, false)).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void aRemovedHostnameFreesTheNameButKeepsItsHistory() {
        OrgHostname old = host(a, "careers.acme.com", OrgHostnameStatus.ACTIVE, false);
        old.setStatus(OrgHostnameStatus.REMOVED);
        old.setRemovedAt(Instant.now());
        hostnames.saveAndFlush(old);

        OrgHostname fresh = host(b, "careers.acme.com", OrgHostnameStatus.PENDING, false); // someone else may now claim it, from scratch
        em.clear();

        assertThat(hostnames.findActiveByHostname("careers.acme.com")).as("a REMOVED row never resolves, a PENDING one does not yet").isEmpty();
        assertThat(hostnames.findByOrgIdOrderByCreatedAt(a.getId())).extracting(OrgHostname::getStatus).containsExactly(OrgHostnameStatus.REMOVED);
        assertThat(hostnames.findByOrgIdOrderByCreatedAt(b.getId())).extracting(OrgHostname::getId).containsExactly(fresh.getId());
        assertThat(hostnames.findLiveByOrgIdAndHostname(a.getId(), "careers.acme.com")).isEmpty();
        assertThat(hostnames.findLiveByOrgIdAndHostname(b.getId(), "careers.acme.com")).isPresent();
    }

    @Test
    void onlyAnActiveRowIsFoundByHost() {
        for (OrgHostnameStatus status : OrgHostnameStatus.values()) {
            if (status == OrgHostnameStatus.ACTIVE) continue;
            host(a, status.name().toLowerCase() + ".acme.com", status, false);
        }
        host(a, "active.acme.com", OrgHostnameStatus.ACTIVE, false);
        em.clear();
        for (OrgHostnameStatus status : OrgHostnameStatus.values()) {
            assertThat(hostnames.findActiveByHostname(status.name().toLowerCase() + ".acme.com").isPresent()).as(status.name()).isEqualTo(status == OrgHostnameStatus.ACTIVE);
        }
        assertThat(hostnames.findActiveByHostname("active.acme.com")).isPresent();
        assertThat(hostnames.findActiveByHostname("nobody.example")).isEmpty();
    }

    @Test
    void anOrganizationHasAtMostOneLivePrimaryHostname() {
        host(a, "one.acme.com", OrgHostnameStatus.ACTIVE, true);
        host(b, "one.beta.com", OrgHostnameStatus.ACTIVE, true); // another org's primary is its own business
        assertThatThrownBy(() -> host(a, "two.acme.com", OrgHostnameStatus.ACTIVE, true)).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void aRemovedPrimaryFreesThePrimarySlot() {
        OrgHostname first = host(a, "one.acme.com", OrgHostnameStatus.ACTIVE, true);
        first.setStatus(OrgHostnameStatus.REMOVED);
        hostnames.saveAndFlush(first);
        OrgHostname second = host(a, "two.acme.com", OrgHostnameStatus.ACTIVE, true);
        em.clear();
        assertThat(hostnames.findPrimaryByOrgId(a.getId()).orElseThrow().getId()).isEqualTo(second.getId());
        host(a, "three.acme.com", OrgHostnameStatus.ACTIVE, false); // non-primary rows are unlimited
        assertThat(hostnames.countByOrgIdAndStatus(a.getId(), OrgHostnameStatus.ACTIVE)).isEqualTo(2);
    }

    // ---- org_branding / org_setting ---------------------------------------------------------------------------------

    @Test
    void brandingRoundTripsKeyedByTheOrganization() {
        OrgBranding br = new OrgBranding();
        br.setOrgId(a.getId());
        br.setPrimaryColor("#0a5fff");
        br.setWelcomeTitle("Welcome to Acme");
        br.setTerminologyJson("{\"consultant\":\"Associate\"}");
        br.setDraftJson("{\"primaryColor\":\"#ff0000\"}");
        br.setPublishedAt(Instant.now());
        brandings.saveAndFlush(br);
        em.clear();

        OrgBranding read = brandings.findByOrgId(a.getId()).orElseThrow();
        assertThat(read.getPrimaryColor()).isEqualTo("#0a5fff");
        assertThat(read.getTheme()).isEqualTo(OrgBrandingTheme.SYSTEM);
        assertThat(read.getTerminologyJson()).contains("Associate");
        assertThat(read.getDraftJson()).contains("#ff0000");
        assertThat(read.getPublishedAt()).isNotNull();
        assertThat(brandings.findByOrgId(b.getId())).isEmpty();
    }

    @Test
    void aSettingIsUniquePerOrganizationAndKey() {
        setting(a, "org.invite.require_email_match", "false");
        setting(b, "org.invite.require_email_match", "true"); // the same key in another org is fine
        em.clear();
        assertThat(settings.findByOrgIdOrderBySettingKey(a.getId())).hasSize(1);
        assertThatThrownBy(() -> setting(a, "org.invite.require_email_match", "true")).isInstanceOf(DataIntegrityViolationException.class);
    }

    private OrgSetting setting(Organization org, String key, String json) {
        OrgSetting s = new OrgSetting();
        s.setOrgId(org.getId());
        s.setSettingKey(key);
        s.setValueJson(json);
        s.setUpdatedBy("admin");
        return settings.saveAndFlush(s);
    }

    // ---- org_audit_event --------------------------------------------------------------------------------------------

    @Test
    void auditEventsGainTheirThreeColumnsWithSafeDefaults() {
        OrgHostname h = host(a, "audit.acme.com", OrgHostnameStatus.ACTIVE, false);
        OrgAuditEvent plain = event(a, null, null);
        OrgAuditEvent rich = event(a, h.getId(), "carol");
        rich.setRisk("HIGH");
        audit.save(rich);
        em.flush();
        em.clear();

        assertThat(audit.findByOrgId(a.getId(), org.springframework.data.domain.PageRequest.of(0, 10)).getContent())
            .extracting(OrgAuditEvent::getId, OrgAuditEvent::getRisk, OrgAuditEvent::getHostnameId, OrgAuditEvent::getBeneficiaryLogin)
            .containsExactlyInAnyOrder(
                org.assertj.core.groups.Tuple.tuple(plain.getId(), "LOW", null, null),
                org.assertj.core.groups.Tuple.tuple(rich.getId(), "HIGH", h.getId(), "carol")
            );
    }

    private OrgAuditEvent event(Organization org, Long hostnameId, String beneficiary) {
        OrgAuditEvent e = new OrgAuditEvent();
        e.setOrgId(org.getId());
        e.setActorLogin("admin");
        e.setAction("TEST");
        e.setTargetType("ORG");
        e.setHostnameId(hostnameId);
        e.setBeneficiaryLogin(beneficiary);
        return audit.save(e);
    }

    // ---- cross-tenant: every repository.ent method, attacked with the other tenant's identifiers -------------------------

    @Test
    void noEntRepositoryMethodCrossesTenants() {
        OrgHostname ha = host(a, "careers.acme.com", OrgHostnameStatus.ACTIVE, true);
        host(b, "careers.beta.com", OrgHostnameStatus.ACTIVE, true);
        setting(a, "org.invite.require_email_match", "false");
        OrgBranding br = new OrgBranding();
        br.setOrgId(a.getId());
        brandings.saveAndFlush(br);
        em.clear();

        // OrgHostnameRepository: org B with A's row id, A's hostname, A's counts
        assertThat(hostnames.findByOrgIdAndId(b.getId(), ha.getId())).isEmpty();
        assertThat(hostnames.findByOrgIdOrderByCreatedAt(b.getId())).extracting(OrgHostname::getHostname).containsExactly("careers.beta.com");
        assertThat(hostnames.findLiveByOrgIdAndHostname(b.getId(), "careers.acme.com")).isEmpty();
        assertThat(hostnames.findPrimaryByOrgId(b.getId()).orElseThrow().getHostname()).isEqualTo("careers.beta.com");
        assertThat(hostnames.countByOrgIdAndStatus(b.getId(), OrgHostnameStatus.ACTIVE)).isEqualTo(1);
        assertThat(hostnames.countByOrgIdAndStatus(org(Long.toString(System.nanoTime())).getId(), OrgHostnameStatus.ACTIVE)).isZero();

        // OrgBrandingRepository / OrgSettingRepository
        assertThat(brandings.findByOrgId(b.getId())).isEmpty();
        assertThat(settings.findByOrgIdAndSettingKey(b.getId(), "org.invite.require_email_match")).isEmpty();
        assertThat(settings.findByOrgIdOrderBySettingKey(b.getId())).isEmpty();

        // the two host-to-tenant lookups answer only for what a host alone may reveal, and never for a non-ACTIVE name
        assertThat(hostnames.findActiveByHostname("careers.acme.com").orElseThrow().getOrgId()).isEqualTo(a.getId());
        assertThat(hostnames.findBySubdomain("nobody")).isEmpty();
    }
}
