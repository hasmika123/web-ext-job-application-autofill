package com.dossier.api.web.rest.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.ent.OrgBranding;
import com.dossier.api.domain.ent.OrgHostname;
import com.dossier.api.domain.enumeration.OrgHostnameKind;
import com.dossier.api.domain.enumeration.OrgHostnameStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.OrgBrandingRepository;
import com.dossier.api.repository.ent.OrgHostnameRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ent.TenantResolver;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import com.dossier.api.web.rest.org.OrgFixtures;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import java.time.Instant;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

/**
 * X1.3 through the real filter chain (HostUnknownIT / ForgedHostHeaderIT of 04-tenancy-and-security.md section 5): the API
 * resolves the forwarded host, the client never names a tenant, an unserved host is a generic 404 with no cookie, a forged
 * host grants nothing, and with enterprise off the header is ignored entirely.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class TenantResolutionIT {

    private static final String HOST = "X-Kiwiply-Host";
    private static final String WHO = "tenant-it";

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper mapper;
    @Autowired private AppSettingRepository rows;
    @Autowired private ResumeBuilderSettings cache;
    @Autowired private TenantResolver resolver;
    @Autowired private UserRepository users;
    @Autowired private OrganizationRepository orgs;
    @Autowired private OrgMemberRepository members;
    @Autowired private OrgHostnameRepository hostnames;
    @Autowired private OrgBrandingRepository brandings;
    @Autowired private EntityManager em;

    private Organization acme;
    private Organization beta;

    @BeforeEach
    void seed() {
        OrgFixtures fx = new OrgFixtures(users, orgs, members);
        acme = fx.org("acme-" + System.nanoTime(), OrgStatus.ACTIVE);
        beta = fx.org("beta-" + System.nanoTime(), OrgStatus.ACTIVE);
        fx.active(acme, "acme-owner", OrgRole.OWNER);
        fx.active(beta, "beta-owner", OrgRole.OWNER);
        acme.setSubdomain("acme-it");
        acme.setSubdomainEnabled(true);
        beta.setSubdomain("beta-it");
        beta.setSubdomainEnabled(true);
        orgs.saveAndFlush(acme);
        orgs.saveAndFlush(beta);
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

    private OrgHostname custom(Organization org, String host, OrgHostnameStatus status) {
        OrgHostname h = new OrgHostname();
        h.setOrgId(org.getId());
        h.setHostname(host);
        h.setKind(OrgHostnameKind.CUSTOM);
        h.setStatus(status);
        resolver.invalidate();
        return hostnames.saveAndFlush(h);
    }

    private MockHttpServletRequestBuilder on(String host, MockHttpServletRequestBuilder req) {
        return host == null ? req : req.header(HOST, host);
    }

    private MvcResult call(String host, String login, String uri) throws Exception {
        MockHttpServletRequestBuilder req = on(host, get(uri));
        if (login != null) req = req.with(user(login));
        return mockMvc.perform(req).andReturn();
    }

    private static void assertGeneric404(MvcResult r, String what) throws Exception {
        String body = r.getResponse().getContentAsString();
        assertThat(r.getResponse().getStatus()).as(what + " -> " + body).isEqualTo(404);
        assertThat(body.toLowerCase()).as(what).contains("\"code\":\"not_found\"").doesNotContain("forbidden").doesNotContain("permission").doesNotContain("disabled").doesNotContain("flag");
        assertThat(r.getResponse().getHeaders("Set-Cookie")).as(what + ": no cookie").isEmpty();
    }

    private JsonNode json(MvcResult r) throws Exception {
        return mapper.readTree(r.getResponse().getContentAsString());
    }

    // ---- GET /api/public/tenant ----------------------------------------------------------------------------------------------

    @Test
    void aTenantHostGetsItsPublicViewAndNothingElse() throws Exception {
        MvcResult r = call("ACME-IT.kiwiply.com:443", null, "/api/public/tenant");
        assertThat(r.getResponse().getStatus()).isEqualTo(200);
        JsonNode body = json(r);
        assertThat(body.get("kind").asText()).isEqualTo("TENANT");
        assertThat(body.get("displayName").asText()).isEqualTo(acme.getName());
        assertThat(body.get("status").asText()).isEqualTo("ACTIVE");
        assertThat(body.get("login").get("password").asBoolean()).isTrue();
        assertThat(body.get("login").get("google").asBoolean()).isFalse();
        assertThat(body.get("branding").get("theme").asText()).isEqualTo("SYSTEM");
        // no ids, counts, settings or members
        assertThat(r.getResponse().getContentAsString()).doesNotContain(String.valueOf(acme.getId()) + ",").doesNotContain("\"orgId\"").doesNotContain("\"id\"").doesNotContain("slug").doesNotContain("member");
        assertThat(r.getResponse().getHeader("Cache-Control")).contains("public").contains("max-age=60");
        assertThat(r.getResponse().getHeaders("Vary")).anyMatch(v -> v.contains(HOST));
        assertThat(r.getResponse().getHeaders("Set-Cookie")).isEmpty();
    }

    @Test
    void onlyPublishedBrandingIsShownAndTheDraftNeverLeaks() throws Exception {
        OrgBranding br = new OrgBranding();
        br.setOrgId(acme.getId());
        br.setPrimaryColor("#0a5fff");
        br.setWelcomeTitle("Hello Acme");
        br.setTerminologyJson("{\"consultant\":\"Associate\"}");
        br.setDraftJson("{\"primaryColor\":\"#ff0000\",\"secret\":\"draft-only\"}");
        brandings.saveAndFlush(br);

        JsonNode unpublished = json(call("acme-it.kiwiply.com", null, "/api/public/tenant")).get("branding");
        assertThat(unpublished.get("primary")).as("unpublished: safe defaults").isNull();
        assertThat(unpublished.get("welcomeTitle")).isNull();

        br.setPublishedAt(Instant.now());
        brandings.saveAndFlush(br);
        MvcResult r = call("acme-it.kiwiply.com", null, "/api/public/tenant");
        JsonNode published = json(r).get("branding");
        assertThat(published.get("primary").asText()).isEqualTo("#0a5fff");
        assertThat(published.get("welcomeTitle").asText()).isEqualTo("Hello Acme");
        assertThat(published.get("terminology").get("consultant").asText()).isEqualTo("Associate");
        assertThat(r.getResponse().getContentAsString()).doesNotContain("draft-only").doesNotContain("#ff0000");
    }

    @Test
    void aPlatformHostAnswersOnlyItsKind() throws Exception {
        MvcResult r = call("kiwiply.com", null, "/api/public/tenant");
        assertThat(r.getResponse().getStatus()).isEqualTo(200);
        assertThat(json(r).toString()).isEqualTo("{\"kind\":\"PLATFORM\"}");
    }

    @Test
    void anUnknownHostAMissingHeaderAndAGarbageHostAreAllTheSameGeneric404() throws Exception {
        for (String host : new String[] { "nobody.example", "nobody.kiwiply.com", null, "a.com,b.com", "http://acme-it.kiwiply.com", "74.208.212.158" }) {
            assertGeneric404(call(host, null, "/api/public/tenant"), String.valueOf(host));
        }
    }

    @Test
    void aRepeatedHostHeaderIsAnUnknownHost() throws Exception {
        MvcResult r = mockMvc.perform(get("/api/public/tenant").header(HOST, "acme-it.kiwiply.com").header(HOST, "acme-it.kiwiply.com")).andReturn();
        assertGeneric404(r, "repeated header");
    }

    @Test
    void aCustomDomainResolvesOnlyWhileActiveAndOnlyWithTheDomainsFlag() throws Exception {
        for (OrgHostnameStatus s : new OrgHostnameStatus[] { OrgHostnameStatus.PENDING, OrgHostnameStatus.VERIFYING, OrgHostnameStatus.VERIFIED, OrgHostnameStatus.SUSPENDED, OrgHostnameStatus.REMOVED }) {
            OrgHostname h = custom(acme, "careers-" + s.name().toLowerCase() + ".acme.example", s);
            assertGeneric404(call(h.getHostname(), null, "/api/public/tenant"), s.name());
        }
        custom(acme, "careers.acme.example", OrgHostnameStatus.ACTIVE);
        assertThat(call("careers.acme.example", null, "/api/public/tenant").getResponse().getStatus()).isEqualTo(200);
        setting(EnterpriseSettingKeys.FLAG_DOMAINS, "{\"on\":false}");
        assertGeneric404(call("careers.acme.example", null, "/api/public/tenant"), "domains flag off");
        assertThat(call("acme-it.kiwiply.com", null, "/api/public/tenant").getResponse().getStatus()).as("the subdomain keeps working").isEqualTo(200);
    }

    @Test
    void aSuspendedOrgsHostIsUnknownAtOnceOnceTheCacheIsEvicted() throws Exception {
        assertThat(call("acme-it.kiwiply.com", null, "/api/public/tenant").getResponse().getStatus()).isEqualTo(200);
        acme.setStatus(OrgStatus.SUSPENDED);
        orgs.saveAndFlush(acme);
        resolver.invalidate(); // what OrgTenancyService does after a tenancy write commits
        assertGeneric404(call("acme-it.kiwiply.com", null, "/api/public/tenant"), "suspended org");
    }

    @Test
    void thePublicEndpointIsRateLimitedPerHostAndVisitor() throws Exception {
        setting(EnterpriseSettingKeys.TENANT_RATE_PER_MIN, "10");
        String ip = "203.0.113." + (System.nanoTime() % 200);
        int ok = 0;
        MvcResult last = null;
        for (int i = 0; i < 12; i++) {
            last = mockMvc.perform(get("/api/public/tenant").header(HOST, "acme-it.kiwiply.com").header("X-Forwarded-For", ip)).andReturn();
            if (last.getResponse().getStatus() == 200) ok++;
        }
        assertThat(ok).isEqualTo(10);
        assertThat(last.getResponse().getStatus()).isEqualTo(429);
        assertThat(last.getResponse().getHeader("Retry-After")).isNotBlank();
        // another visitor is not affected
        assertThat(mockMvc.perform(get("/api/public/tenant").header(HOST, "acme-it.kiwiply.com").header("X-Forwarded-For", "198.51.100.7")).andReturn().getResponse().getStatus()).isEqualTo(200);
    }

    // ---- org routes: forged hosts, mismatches, unknown hosts -------------------------------------------------------------------

    @Test
    void aMemberOfBetaForgingAcmesHostSeesAcmesBrandingButNothingOfAcme() throws Exception {
        assertThat(call("acme-it.kiwiply.com", "beta-owner", "/api/public/tenant").getResponse().getStatus()).isEqualTo(200);
        assertGeneric404(call("acme-it.kiwiply.com", "beta-owner", "/api/orgs/" + acme.getId()), "beta owner on acme's host, acme's org");
        assertGeneric404(call("acme-it.kiwiply.com", "beta-owner", "/api/orgs/" + beta.getId()), "beta owner on acme's host, own org: the host and the path disagree");
        assertGeneric404(call("acme-it.kiwiply.com", "beta-owner", "/api/orgs/" + acme.getId() + "/groups"), "acme's groups");
    }

    @Test
    void anOwnerOnHisOwnTenantHostWorksButOnAnotherTenantsHostIsAMismatch() throws Exception {
        assertThat(call("acme-it.kiwiply.com", "acme-owner", "/api/orgs/" + acme.getId()).getResponse().getStatus()).isEqualTo(200);
        assertGeneric404(call("beta-it.kiwiply.com", "acme-owner", "/api/orgs/" + acme.getId()), "acme owner on beta's host");
    }

    @Test
    void thePlatformHostAndNoHostKeepToday_sPathBasedBehaviour() throws Exception {
        for (String host : new String[] { "kiwiply.com", "localhost:3000", null }) {
            assertThat(call(host, "acme-owner", "/api/orgs/" + acme.getId()).getResponse().getStatus()).as(String.valueOf(host)).isEqualTo(200);
            assertGeneric404(call(host, "beta-owner", "/api/orgs/" + acme.getId()), "beta owner, " + host);
            assertThat(call(host, "acme-owner", "/api/orgs/mine").getResponse().getStatus()).isEqualTo(200);
        }
        assertThat(call(null, null, "/api/orgs/" + acme.getId()).getResponse().getStatus()).as("anonymous: security answers").isEqualTo(401);
    }

    @Test
    void anUnknownHostMakesEveryOrgRouteAGeneric404BeforeAuthentication() throws Exception {
        for (String uri : new String[] { "/api/orgs/" + acme.getId(), "/api/orgs/mine", "/api/orgs", "/api/me/orgs", "/api/me/orgs/" + acme.getId() + "/share", "/api/join/abc", "/api/join/code/KIWI7F3A" }) {
            assertGeneric404(call("nobody.example", null, uri), "anonymous " + uri);
            assertGeneric404(call("nobody.example", "acme-owner", uri), "owner " + uri);
        }
    }

    @Test
    void anUnknownHostLeavesNonOrgRoutesAlone() throws Exception {
        assertThat(call("nobody.example", null, "/api/config/public").getResponse().getStatus()).isEqualTo(200);
    }

    // ---- flags off: nothing changes ----------------------------------------------------------------------------------------------

    @Test
    void withEnterpriseOffTheHostHeaderIsIgnoredAndEverythingBehavesAsBefore() throws Exception {
        setting(EnterpriseSettingKeys.FLAG_ENTERPRISE, "{\"on\":false}");
        for (String host : new String[] { "nobody.example", "beta-it.kiwiply.com", "a.com,b.com", null }) {
            assertThat(call(host, "acme-owner", "/api/orgs/" + acme.getId()).getResponse().getStatus()).as(String.valueOf(host)).isEqualTo(200);
            assertThat(call(host, "acme-owner", "/api/orgs/mine").getResponse().getStatus()).isEqualTo(200);
            assertThat(call(host, null, "/api/config/public").getResponse().getStatus()).isEqualTo(200);
        }
        assertGeneric404(call("acme-it.kiwiply.com", null, "/api/public/tenant"), "the public endpoint does not exist while enterprise is off");
    }

    @Test
    void anOrgOutsideTheAllowListIsDarkEvenThoughEnterpriseIsOnForAnother() throws Exception {
        setting(EnterpriseSettingKeys.FLAG_ENTERPRISE, "{\"on\":true,\"allow\":[" + acme.getId() + "]}");
        assertThat(call("acme-it.kiwiply.com", null, "/api/public/tenant").getResponse().getStatus()).isEqualTo(200);
        assertGeneric404(call("beta-it.kiwiply.com", null, "/api/public/tenant"), "beta is not in the allow list");
        assertGeneric404(call("beta-it.kiwiply.com", "beta-owner", "/api/orgs/" + beta.getId()), "beta's own host and org");
        assertThat(call(null, "beta-owner", "/api/orgs/" + beta.getId()).getResponse().getStatus()).as("path-based console unaffected").isEqualTo(200);
    }
}
