package com.dossier.api.web.rest.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.User;
import com.dossier.api.domain.ent.OrgHostname;
import com.dossier.api.domain.enumeration.OrgHostnameKind;
import com.dossier.api.domain.enumeration.OrgHostnameStatus;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.OrgAuditEvent;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.OrgHostnameRepository;
import com.dossier.api.repository.org.OrgAuditEventRepository;
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
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * X1.5 through the real filter chain (HostMismatchIT of 04-tenancy-and-security.md section 5, SEC-15): a session minted on a
 * tenant host carries tid/hid, is useless on another tenant or on the platform's org console, a personal token is
 * unauthenticated on tenant org routes, refresh keeps the binding, and a non-member is refused with NOT_A_MEMBER.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class TenantBoundSessionIT {

    private static final String HOST = "X-Kiwiply-Host";
    private static final String ACME_HOST = "acme-bound.kiwiply.com";
    private static final String BETA_HOST = "beta-bound.kiwiply.com";
    private static final String PLATFORM_HOST = "kiwiply.com";

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper mapper;
    @Autowired private AppSettingRepository rows;
    @Autowired private ResumeBuilderSettings cache;
    @Autowired private TenantResolver resolver;
    @Autowired private UserRepository users;
    @Autowired private OrganizationRepository orgs;
    @Autowired private OrgMemberRepository members;
    @Autowired private OrgHostnameRepository hostnames;
    @Autowired private OrgAuditEventRepository audits;
    @Autowired private PasswordEncoder encoder;

    private OrgFixtures fx;
    private Organization acme;
    private Organization beta;
    // JHipster caches users by login across tests (usersByLogin), so every test needs logins no other test used.
    private String acmeEmp;
    private String betaEmp;
    private String suspendedEmp;
    private String coachEmp;

    @BeforeEach
    void seed() {
        fx = new OrgFixtures(users, orgs, members);
        String n = Long.toString(System.nanoTime(), 36);
        acmeEmp = "bacme" + n;
        betaEmp = "bbeta" + n;
        suspendedEmp = "bsusp" + n;
        coachEmp = "bcoach" + n;
        acme = fx.org("acme-b-" + System.nanoTime(), OrgStatus.ACTIVE);
        beta = fx.org("beta-b-" + System.nanoTime(), OrgStatus.ACTIVE);
        acme.setSubdomain("acme-bound");
        acme.setSubdomainEnabled(true);
        beta.setSubdomain("beta-bound");
        beta.setSubdomainEnabled(true);
        orgs.saveAndFlush(acme);
        orgs.saveAndFlush(beta);
        member(acme, acmeEmp, OrgRole.MEMBER, OrgMemberStatus.ACTIVE);
        member(beta, betaEmp, OrgRole.MEMBER, OrgMemberStatus.ACTIVE);
        setting(EnterpriseSettingKeys.FLAG_ENTERPRISE, "{\"on\":true}");
        setting(EnterpriseSettingKeys.FLAG_DOMAINS, "{\"on\":true}");
    }

    @AfterEach
    void drop() {
        resolver.invalidate();
        cache.invalidate();
    }

    private void setting(String key, String value) {
        rows.save(new AppSetting(key, value, "bound-it", Instant.now()));
        cache.invalidate();
        resolver.invalidate();
    }

    private void member(Organization org, String login, OrgRole role, OrgMemberStatus status) {
        User u = fx.user(login);
        u.setPassword(encoder.encode("test"));
        users.saveAndFlush(u);
        fx.seat(org, login, role, status);
    }

    private MvcResult login(String host, String login) throws Exception {
        var req = post("/api/authenticate").contentType(MediaType.APPLICATION_JSON).content("{\"username\":\"" + login + "\",\"password\":\"test\"}");
        if (host != null) req = req.header(HOST, host);
        return mockMvc.perform(req).andReturn();
    }

    private JsonNode tokens(String host, String login) throws Exception {
        MvcResult r = login(host, login);
        assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(200);
        return mapper.readTree(r.getResponse().getContentAsString());
    }

    private JsonNode claims(String jwt) throws Exception {
        return mapper.readTree(Base64.getUrlDecoder().decode(jwt.split("\\.")[1]));
    }

    private int status(String host, String token, String uri) throws Exception {
        var req = get(uri);
        if (host != null) req = req.header(HOST, host);
        if (token != null) req = req.header("Authorization", "Bearer " + token);
        return mockMvc.perform(req).andReturn().getResponse().getStatus();
    }

    private MvcResult refresh(String host, String refreshToken) throws Exception {
        var req = post("/api/refresh").contentType(MediaType.APPLICATION_JSON).content("{\"refreshToken\":\"" + refreshToken + "\"}");
        if (host != null) req = req.header(HOST, host);
        return mockMvc.perform(req).andReturn();
    }

    @Test
    void aTenantHostLoginBindsBothTokensToTheOrganization() throws Exception {
        JsonNode t = tokens(ACME_HOST, acmeEmp);
        for (String key : List.of("accessToken", "refreshToken")) {
            JsonNode c = claims(t.get(key).asText());
            assertThat(c.get("tid").asLong()).as(key).isEqualTo(acme.getId());
            assertThat(c.has("hid")).as("a subdomain has no hostname row, so no hid").isFalse();
        }
    }

    @Test
    void aCustomHostnameAlsoBindsTheHostnameId() throws Exception {
        OrgHostname h = new OrgHostname();
        h.setOrgId(acme.getId());
        h.setHostname("careers.acme-bound.example");
        h.setKind(OrgHostnameKind.CUSTOM);
        h.setStatus(OrgHostnameStatus.ACTIVE);
        h = hostnames.saveAndFlush(h);
        resolver.invalidate();
        JsonNode c = claims(tokens("careers.acme-bound.example", acmeEmp).get("accessToken").asText());
        assertThat(c.get("tid").asLong()).isEqualTo(acme.getId());
        assertThat(c.get("hid").asLong()).isEqualTo(h.getId());
    }

    @Test
    void platformAndHostlessLoginsAreNotBound() throws Exception {
        assertThat(claims(tokens(PLATFORM_HOST, acmeEmp).get("accessToken").asText()).has("tid")).isFalse();
        assertThat(claims(tokens(null, acmeEmp).get("accessToken").asText()).has("tid")).isFalse();
    }

    @Test
    void aTokenFromOneTenantIsUselessOnAnother() throws Exception {
        String token = tokens(ACME_HOST, acmeEmp).get("accessToken").asText();
        assertThat(status(ACME_HOST, token, "/api/orgs/" + acme.getId())).as("own tenant").isEqualTo(200);
        assertThat(status(BETA_HOST, token, "/api/orgs/" + acme.getId())).as("other tenant host, even naming its own org").isEqualTo(401);
        assertThat(status(BETA_HOST, token, "/api/account")).as("401 on every route, not only org routes").isEqualTo(401);
        assertThat(status("nobody.kiwiply.com", token, "/api/account")).as("unserved host fails closed").isEqualTo(401);
    }

    @Test
    void aTenantTokenCannotReachTheOrgConsoleOnThePlatformButKeepsUserRoutes() throws Exception {
        String token = tokens(ACME_HOST, acmeEmp).get("accessToken").asText();
        assertThat(status(PLATFORM_HOST, token, "/api/orgs/" + acme.getId())).isEqualTo(404);
        assertThat(status(null, token, "/api/orgs/" + acme.getId())).as("no host at all behaves as the platform").isEqualTo(404);
        assertThat(status(PLATFORM_HOST, token, "/api/account")).isEqualTo(200);
    }

    @Test
    void aPersonalTokenIsUnauthenticatedOnTenantOrgRoutesButOpensAccount() throws Exception {
        String personal = tokens(PLATFORM_HOST, acmeEmp).get("accessToken").asText();
        assertThat(status(ACME_HOST, personal, "/api/orgs/" + acme.getId())).as("401 not 404, so the web redirects to the tenant login").isEqualTo(401);
        assertThat(status(ACME_HOST, personal, "/api/me/orgs")).isEqualTo(401);
        assertThat(status(ACME_HOST, personal, "/api/account")).as("login-first hand-off").isEqualTo(200);
        assertThat(status(PLATFORM_HOST, personal, "/api/orgs/" + acme.getId())).as("unchanged on the platform").isEqualTo(200);
    }

    @Test
    void refreshKeepsTheBindingAndOnlyWorksOnItsOwnTenant() throws Exception {
        JsonNode t = tokens(ACME_HOST, acmeEmp);
        String refreshToken = t.get("refreshToken").asText();

        assertThat(refresh(BETA_HOST, refreshToken).getResponse().getStatus()).isEqualTo(401);

        MvcResult ok = refresh(ACME_HOST, refreshToken);
        assertThat(ok.getResponse().getStatus()).isEqualTo(200);
        JsonNode next = mapper.readTree(ok.getResponse().getContentAsString());
        assertThat(claims(next.get("accessToken").asText()).get("tid").asLong()).isEqualTo(acme.getId());
        assertThat(claims(next.get("refreshToken").asText()).get("tid").asLong()).isEqualTo(acme.getId());

        // the old family revocation still applies: replaying the spent token is refused
        assertThat(refresh(ACME_HOST, refreshToken).getResponse().getStatus()).isEqualTo(401);
    }

    @Test
    void aRemovedSeatLosesTheSessionAtTheNextRefresh() throws Exception {
        String refreshToken = tokens(ACME_HOST, acmeEmp).get("refreshToken").asText();
        var seat = members
            .findByOrgIdAndUserIdAndStatusIn(acme.getId(), users.findOneByLogin(acmeEmp).orElseThrow().getId(), List.of(OrgMemberStatus.ACTIVE))
            .get(0);
        seat.setStatus(OrgMemberStatus.SUSPENDED);
        members.saveAndFlush(seat);
        assertThat(refresh(ACME_HOST, refreshToken).getResponse().getStatus()).isEqualTo(401);
    }

    @Test
    void aNonMemberIsRefusedWithNotAMemberAndAnAuditRow() throws Exception {
        MvcResult r = login(ACME_HOST, betaEmp);
        assertThat(r.getResponse().getStatus()).isEqualTo(403);
        String body = r.getResponse().getContentAsString();
        assertThat(mapper.readTree(body).get("code").asText()).isEqualTo("NOT_A_MEMBER");
        assertThat(body).doesNotContain("accessToken").doesNotContain(acme.getName()).doesNotContain(acme.getSlug());
        assertThat(r.getResponse().getHeaders("Set-Cookie")).isEmpty();
        List<OrgAuditEvent> trail = audits.findByOrgIdAndAction(acme.getId(), "LOGIN_DENIED_NOT_MEMBER", PageRequest.of(0, 10)).getContent();
        assertThat(trail).hasSize(1);
        assertThat(trail.get(0).getActorLogin()).isEqualTo(betaEmp);
        assertThat(audits.findByOrgIdAndAction(beta.getId(), "LOGIN_DENIED_NOT_MEMBER", PageRequest.of(0, 10)).getContent()).isEmpty();
    }

    @Test
    void aNonActiveOrReservedSeatIsNotAMemberEither() throws Exception {
        member(acme, suspendedEmp, OrgRole.MEMBER, OrgMemberStatus.SUSPENDED);
        member(acme, coachEmp, OrgRole.COACH, OrgMemberStatus.ACTIVE);
        assertThat(login(ACME_HOST, suspendedEmp).getResponse().getStatus()).isEqualTo(403);
        assertThat(login(ACME_HOST, coachEmp).getResponse().getStatus()).isEqualTo(403);
        assertThat(login(PLATFORM_HOST, suspendedEmp).getResponse().getStatus()).as("platform sign-in unaffected").isEqualTo(200);
    }

    @Test
    void aBadPasswordOnATenantHostStaysAnOrdinary401() throws Exception {
        var req = post("/api/authenticate")
            .header(HOST, ACME_HOST)
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"username\":\"bound-acme-emp\",\"password\":\"nope\"}");
        assertThat(mockMvc.perform(req).andReturn().getResponse().getStatus()).isEqualTo(401);
    }

    @Test
    void loginOnAnUnservedHostIsA404() throws Exception {
        assertThat(login("nobody.kiwiply.com", acmeEmp).getResponse().getStatus()).isEqualTo(404);
    }

    @Test
    void extensionSessionsNeverCarryTid() throws Exception {
        String token = tokens(ACME_HOST, acmeEmp).get("accessToken").asText();
        MvcResult r = mockMvc.perform(post("/api/extension/session").header(HOST, ACME_HOST).header("Authorization", "Bearer " + token)).andReturn();
        assertThat(r.getResponse().getStatus()).isEqualTo(200);
        JsonNode ext = mapper.readTree(r.getResponse().getContentAsString());
        assertThat(claims(ext.get("accessToken").asText()).has("tid")).isFalse();
        assertThat(claims(ext.get("refreshToken").asText()).has("tid")).isFalse();
        JsonNode refreshed = mapper.readTree(refresh(null, ext.get("refreshToken").asText()).getResponse().getContentAsString());
        assertThat(claims(refreshed.get("accessToken").asText()).has("tid")).isFalse();
    }

    @Test
    void withEnterpriseOffNothingIsBoundAndTheHostHeaderIsIgnored() throws Exception {
        setting(EnterpriseSettingKeys.FLAG_ENTERPRISE, "{\"on\":false}");
        assertThat(claims(tokens(ACME_HOST, betaEmp).get("accessToken").asText()).has("tid")).isFalse();
    }
}
