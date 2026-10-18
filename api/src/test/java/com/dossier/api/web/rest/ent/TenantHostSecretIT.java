package com.dossier.api.web.rest.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ent.TenantResolver;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import com.dossier.api.web.rest.org.OrgFixtures;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.Base64;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

/**
 * Review finding 3 through the real filter chain: the API is reachable directly, so {@code X-Kiwiply-Host} is only
 * believed together with the shared secret the web server holds. A forged host without it selects no tenant: the public
 * endpoint is the generic 404, a login is not tenant-bound, and org routes keep their path-based behaviour (the host never
 * produces a mismatch 404 that a believed host would).
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
@TestPropertySource(properties = "dossier.tenant-host.secret=it-secret-value-123")
class TenantHostSecretIT {

    private static final String HOST = "X-Kiwiply-Host";
    private static final String SECRET = "X-Kiwiply-Host-Secret";
    private static final String GOOD = "it-secret-value-123";

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper mapper;
    @Autowired private AppSettingRepository rows;
    @Autowired private ResumeBuilderSettings cache;
    @Autowired private TenantResolver resolver;
    @Autowired private UserRepository users;
    @Autowired private OrganizationRepository orgs;
    @Autowired private OrgMemberRepository members;
    @Autowired private PasswordEncoder encoder;

    private Organization acme;
    private Organization beta;
    private String acmeEmp;

    @BeforeEach
    void seed() {
        OrgFixtures fx = new OrgFixtures(users, orgs, members);
        String n = Long.toString(System.nanoTime(), 36);
        acmeEmp = "sacme" + n;
        acme = fx.org("acme-s-" + System.nanoTime(), OrgStatus.ACTIVE);
        beta = fx.org("beta-s-" + System.nanoTime(), OrgStatus.ACTIVE);
        acme.setSubdomain("acme-secret");
        acme.setSubdomainEnabled(true);
        beta.setSubdomain("beta-secret");
        beta.setSubdomainEnabled(true);
        orgs.saveAndFlush(acme);
        orgs.saveAndFlush(beta);
        User u = fx.user(acmeEmp);
        u.setPassword(encoder.encode("test"));
        users.saveAndFlush(u);
        fx.seat(acme, acmeEmp, OrgRole.OWNER, OrgMemberStatus.ACTIVE);
        rows.save(new AppSetting(EnterpriseSettingKeys.FLAG_ENTERPRISE, "{\"on\":true}", "secret-it", Instant.now()));
        cache.invalidate();
        resolver.invalidate();
    }

    @AfterEach
    void drop() {
        resolver.invalidate();
        cache.invalidate();
    }

    private MockHttpServletRequestBuilder withHost(MockHttpServletRequestBuilder req, String host, String secret) {
        if (host != null) req = req.header(HOST, host);
        if (secret != null) req = req.header(SECRET, secret);
        return req;
    }

    @Test
    void theHostIsOnlyBelievedWithTheSecret() throws Exception {
        assertThat(mockMvc.perform(withHost(get("/api/public/tenant"), "acme-secret.kiwiply.com", GOOD)).andReturn().getResponse().getStatus()).isEqualTo(200);
        for (String secret : new String[] { null, "", "wrong", GOOD + "x", GOOD.toUpperCase() }) {
            MvcResult r = mockMvc.perform(withHost(get("/api/public/tenant"), "acme-secret.kiwiply.com", secret)).andReturn();
            assertThat(r.getResponse().getStatus()).as("secret=" + secret).isEqualTo(404);
            assertThat(r.getResponse().getContentAsString()).doesNotContain("Acme").doesNotContain("TENANT");
        }
        MvcResult twice = mockMvc.perform(withHost(get("/api/public/tenant"), "acme-secret.kiwiply.com", GOOD).header(SECRET, GOOD)).andReturn();
        assertThat(twice.getResponse().getStatus()).as("a repeated secret header is a miss").isEqualTo(404);
    }

    @Test
    void aForgedPlatformHostWithoutTheSecretIsNotEvenPlatform() throws Exception {
        assertThat(mockMvc.perform(withHost(get("/api/public/tenant"), "kiwiply.com", GOOD)).andReturn().getResponse().getStatus()).isEqualTo(200);
        assertThat(mockMvc.perform(withHost(get("/api/public/tenant"), "kiwiply.com", null)).andReturn().getResponse().getStatus()).isEqualTo(404);
    }

    @Test
    void aSessionMintedOnAForgedHostIsNotTenantBound() throws Exception {
        assertThat(claims(login("acme-secret.kiwiply.com", null)).has("tid")).as("no secret: a personal session").isFalse();
        assertThat(claims(login("acme-secret.kiwiply.com", GOOD)).has("tid")).as("with the secret: bound to the tenant").isTrue();
    }

    @Test
    void noAuthorizationDecisionReadsAForgedHost() throws Exception {
        // beta's host would make acme's org a mismatch (404) if it were believed
        int believed = mockMvc.perform(withHost(get("/api/orgs/" + acme.getId()).with(org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user(acmeEmp)), "beta-secret.kiwiply.com", GOOD)).andReturn().getResponse().getStatus();
        int forged = mockMvc.perform(withHost(get("/api/orgs/" + acme.getId()).with(org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user(acmeEmp)), "beta-secret.kiwiply.com", null)).andReturn().getResponse().getStatus();
        assertThat(believed).isEqualTo(404);
        assertThat(forged).as("the forged host changed nothing: today's path-based behaviour").isEqualTo(200);
    }

    private JsonNode claims(MvcResult r) throws Exception {
        assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(200);
        String access = mapper.readTree(r.getResponse().getContentAsString()).get("accessToken").asText();
        return mapper.readTree(Base64.getUrlDecoder().decode(access.split("\\.")[1]));
    }

    private MvcResult login(String host, String secret) throws Exception {
        MockHttpServletRequestBuilder req = post("/api/authenticate").contentType(MediaType.APPLICATION_JSON).content("{\"username\":\"" + acmeEmp + "\",\"password\":\"test\"}");
        return mockMvc.perform(withHost(req, host, secret)).andReturn();
    }
}
