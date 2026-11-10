package com.dossier.api.web.rest.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.ent.OrgHostname;
import com.dossier.api.domain.enumeration.OrgHostnameKind;
import com.dossier.api.domain.enumeration.OrgHostnameStatus;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.OrgHostnameRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ent.TenantResolver;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import com.dossier.api.web.rest.org.OrgFixtures;
import java.time.Instant;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * AskEndpointIT (04-tenancy-and-security.md section 5): the certificate gate for the shared edge answers 200 only for a
 * hostname that would resolve to a tenant right now (an ACTIVE row of an ACTIVE / PAST_DUE org, or an enabled subdomain)
 * and 404 for everything else, 401 without the internal token, and never reacts to a user's bearer token.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class InternalTenantHostResourceIT {

    private static final String URL = "/api/internal/tenant-hosts/check";
    private static final String TOKEN = "test-internal-token"; // src/test/resources/config/application.yml
    private static final String WHO = "ask-it";

    @Autowired private MockMvc mockMvc;
    @Autowired private AppSettingRepository rows;
    @Autowired private ResumeBuilderSettings cache;
    @Autowired private TenantResolver resolver;
    @Autowired private UserRepository users;
    @Autowired private OrganizationRepository orgs;
    @Autowired private OrgMemberRepository members;
    @Autowired private OrgHostnameRepository hostnames;

    private Organization acme;

    @BeforeEach
    void seed() {
        acme = new OrgFixtures(users, orgs, members).org("ask-" + System.nanoTime(), OrgStatus.ACTIVE);
        acme.setSubdomain("ask-acme");
        acme.setSubdomainEnabled(true);
        orgs.saveAndFlush(acme);
        setting(EnterpriseSettingKeys.FLAG_ENTERPRISE, "{\"on\":true}");
        setting(EnterpriseSettingKeys.FLAG_DOMAINS, "{\"on\":true}");
    }

    @AfterEach
    void drop() {
        resolver.invalidate();
        cache.invalidate();
    }

    private void setting(String key, String value) {
        rows.save(new AppSetting(key, value, WHO, Instant.now()));
        cache.invalidate();
        resolver.invalidate();
    }

    private OrgHostname host(String name, OrgHostnameKind kind, OrgHostnameStatus status) {
        OrgHostname h = new OrgHostname();
        h.setOrgId(acme.getId());
        h.setHostname(name);
        h.setKind(kind);
        h.setStatus(status);
        resolver.invalidate();
        return hostnames.saveAndFlush(h);
    }

    private int ask(String domain) throws Exception {
        MvcResult r = mockMvc.perform(get(URL).param("domain", domain).header("X-Internal-Token", TOKEN)).andReturn();
        assertThat(r.getResponse().getContentAsString()).as("the gate never explains itself").isEmpty();
        return r.getResponse().getStatus();
    }

    @Test
    void withoutTheInternalTokenItIs401AndAUserTokenDoesNotHelp() throws Exception {
        host("careers.acme.example", OrgHostnameKind.CUSTOM, OrgHostnameStatus.ACTIVE);
        assertThat(mockMvc.perform(get(URL).param("domain", "careers.acme.example")).andReturn().getResponse().getStatus()).isEqualTo(401);
        assertThat(mockMvc.perform(get(URL).param("domain", "careers.acme.example").header("X-Internal-Token", "wrong")).andReturn().getResponse().getStatus()).isEqualTo(401);
        assertThat(mockMvc.perform(get(URL).param("domain", "careers.acme.example").with(user("admin").roles("ADMIN"))).andReturn().getResponse().getStatus()).isEqualTo(401);
    }

    @Test
    void only200ForAnActiveCustomHostAndAnEnabledSubdomain() throws Exception {
        host("careers.acme.example", OrgHostnameKind.CUSTOM, OrgHostnameStatus.ACTIVE);
        assertThat(ask("careers.acme.example")).isEqualTo(200);
        assertThat(ask("Careers.Acme.Example")).as("host case does not matter").isEqualTo(200);
        assertThat(ask("ask-acme.kiwiply.com")).isEqualTo(200);
    }

    @Test
    void pendingVerifyingVerifiedSuspendedRemovedAndUnknownNamesAre404() throws Exception {
        for (OrgHostnameStatus s : new OrgHostnameStatus[] { OrgHostnameStatus.PENDING, OrgHostnameStatus.VERIFYING, OrgHostnameStatus.VERIFIED, OrgHostnameStatus.SUSPENDED, OrgHostnameStatus.REMOVED }) {
            String name = "careers-" + s.name().toLowerCase() + ".acme.example";
            host(name, OrgHostnameKind.CUSTOM, s);
            assertThat(ask(name)).as(s.name()).isEqualTo(404);
        }
        for (String name : new String[] { "nobody.example", "nobody.kiwiply.com", "kiwiply.com", "www.kiwiply.com", "app.kiwiply.com", "api.kiwiply.com", "localhost", "127.0.0.1", "74.208.212.158", "a.com/x", "a.com,b.com", "" }) {
            assertThat(ask(name)).as(name).isEqualTo(404);
        }
        assertThat(mockMvc.perform(get(URL).header("X-Internal-Token", TOKEN)).andReturn().getResponse().getStatus()).as("no domain parameter").isEqualTo(404);
    }

    @Test
    void aSubdomainWithTheSwitchOffOrOfASuspendedOrgIs404() throws Exception {
        assertThat(ask("ask-acme.kiwiply.com")).isEqualTo(200);
        acme.setSubdomainEnabled(false);
        orgs.saveAndFlush(acme);
        resolver.invalidate();
        assertThat(ask("ask-acme.kiwiply.com")).isEqualTo(404);
        acme.setSubdomainEnabled(true);
        acme.setStatus(OrgStatus.SUSPENDED);
        orgs.saveAndFlush(acme);
        resolver.invalidate();
        assertThat(ask("ask-acme.kiwiply.com")).isEqualTo(404);
        acme.setStatus(OrgStatus.PAST_DUE);
        orgs.saveAndFlush(acme);
        resolver.invalidate();
        assertThat(ask("ask-acme.kiwiply.com")).as("past due is still served").isEqualTo(200);
    }

    @Test
    void aCustomHostNeedsTheDomainsFlagAndEverythingNeedsTheMasterFlag() throws Exception {
        host("careers.acme.example", OrgHostnameKind.CUSTOM, OrgHostnameStatus.ACTIVE);
        setting(EnterpriseSettingKeys.FLAG_DOMAINS, "{\"on\":false}");
        assertThat(ask("careers.acme.example")).isEqualTo(404);
        assertThat(ask("ask-acme.kiwiply.com")).as("a subdomain is not a custom domain").isEqualTo(200);
        setting(EnterpriseSettingKeys.FLAG_ENTERPRISE, "{\"on\":false}");
        assertThat(ask("ask-acme.kiwiply.com")).isEqualTo(404);
    }

    @Test
    void aSuspendedHostStops200AtOnceOnceTheCacheIsEvicted() throws Exception {
        OrgHostname h = host("careers.acme.example", OrgHostnameKind.CUSTOM, OrgHostnameStatus.ACTIVE);
        assertThat(ask("careers.acme.example")).isEqualTo(200);
        h.setStatus(OrgHostnameStatus.SUSPENDED);
        hostnames.saveAndFlush(h);
        resolver.invalidate();
        assertThat(ask("careers.acme.example")).isEqualTo(404);
    }
}
