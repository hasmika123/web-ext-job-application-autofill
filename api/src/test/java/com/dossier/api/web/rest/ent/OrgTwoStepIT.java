package com.dossier.api.web.rest.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.OrgTwoStepChallenge;
import com.dossier.api.domain.User;
import com.dossier.api.domain.ent.OrgSetting;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.repository.OrgTwoStepChallengeRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.OrgSettingRepository;
import com.dossier.api.repository.org.OrgAuditEventRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ent.TenantResolver;
import com.dossier.api.service.org.OrgAuditService;
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
import org.springframework.data.domain.PageRequest;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * Gap D-2 through the real filter chain: an organization that requires two-step sign-in sends a code after the password on its host; the code
 * works only there, a remembered browser skips it, a kiwiply.com session can not reach that organization, and turning it off restores the
 * one-step sign-in. The emailed code itself is replaced by a known one (the mail is not read).
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class OrgTwoStepIT {

    private static final String HOST = "X-Kiwiply-Host";
    private static final String ACME_HOST = "acme-twostep.kiwiply.com";
    private static final String BETA_HOST = "beta-twostep.kiwiply.com";
    private static final String PLATFORM_HOST = "kiwiply.com";

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper mapper;
    @Autowired private AppSettingRepository rows;
    @Autowired private ResumeBuilderSettings cache;
    @Autowired private TenantResolver resolver;
    @Autowired private UserRepository users;
    @Autowired private OrganizationRepository orgs;
    @Autowired private OrgMemberRepository members;
    @Autowired private OrgSettingRepository orgSettings;
    @Autowired private OrgTwoStepChallengeRepository challenges;
    @Autowired private OrgAuditEventRepository audits;
    @Autowired private PasswordEncoder encoder;

    private Organization acme;
    private Organization beta;
    private String emp;

    @BeforeEach
    void seed() {
        OrgFixtures fx = new OrgFixtures(users, orgs, members);
        String n = Long.toString(System.nanoTime(), 36);
        emp = "tsacme" + n;
        acme = fx.org("acme-ts-" + System.nanoTime(), OrgStatus.ACTIVE);
        beta = fx.org("beta-ts-" + System.nanoTime(), OrgStatus.ACTIVE);
        acme.setSubdomain("acme-twostep");
        acme.setSubdomainEnabled(true);
        beta.setSubdomain("beta-twostep");
        beta.setSubdomainEnabled(true);
        orgs.saveAndFlush(acme);
        orgs.saveAndFlush(beta);
        User u = fx.user(emp);
        u.setPassword(encoder.encode("test"));
        u.setEmail(emp + "@acme.test");
        users.saveAndFlush(u);
        fx.seat(acme, emp, OrgRole.MEMBER, OrgMemberStatus.ACTIVE);
        fx.seat(beta, emp, OrgRole.MEMBER, OrgMemberStatus.ACTIVE);
        rows.save(new AppSetting(EnterpriseSettingKeys.FLAG_ENTERPRISE, "{\"on\":true}", "twostep-it", Instant.now()));
        cache.invalidate();
        resolver.invalidate();
        require(acme, true);
    }

    @AfterEach
    void drop() {
        resolver.invalidate();
        cache.invalidate();
    }

    private void require(Organization org, boolean on) {
        OrgSetting s = orgSettings.findByOrgIdAndSettingKey(org.getId(), EnterpriseSettingKeys.ORG_SECURITY_TWO_STEP_REQUIRED).orElseGet(() -> {
            OrgSetting x = new OrgSetting();
            x.setOrgId(org.getId());
            x.setSettingKey(EnterpriseSettingKeys.ORG_SECURITY_TWO_STEP_REQUIRED);
            return x;
        });
        s.setValueJson(String.valueOf(on));
        if (s.getUpdatedAt() == null) s.setUpdatedAt(Instant.now());
        orgSettings.save(s);
    }

    private MvcResult login(String host, String device) throws Exception {
        var req = post("/api/authenticate").contentType(MediaType.APPLICATION_JSON).content("{\"username\":\"" + emp + "\",\"password\":\"test\"}");
        if (host != null) req = req.header(HOST, host);
        if (device != null) req = req.header("X-Kiwiply-Device", device);
        return mockMvc.perform(req).andReturn();
    }

    private MvcResult code(String host, String mfaToken, String code, boolean remember) throws Exception {
        var req = post("/api/authenticate/mfa").contentType(MediaType.APPLICATION_JSON).content("{\"mfaToken\":\"" + mfaToken + "\",\"code\":\"" + code + "\",\"rememberDevice\":" + remember + "}");
        if (host != null) req = req.header(HOST, host);
        return mockMvc.perform(req).andReturn();
    }

    private JsonNode body(MvcResult r) throws Exception {
        return mapper.readTree(r.getResponse().getContentAsString());
    }

    /** The emailed code is unknown to the test: make it a known one. */
    private void knownCode(String mfaToken, String code) {
        OrgTwoStepChallenge c = challenges.findByChallengeToken(mfaToken).orElseThrow();
        c.setCodeHash(encoder.encode(code));
        challenges.saveAndFlush(c);
    }

    private long auditCount(String action) {
        return audits.findByOrgIdAndAction(acme.getId(), action, PageRequest.of(0, 50)).getTotalElements();
    }

    private int status(String host, String token, String uri) throws Exception {
        var req = get(uri).header("Authorization", "Bearer " + token);
        if (host != null) req = req.header(HOST, host);
        return mockMvc.perform(req).andReturn().getResponse().getStatus();
    }

    @Test
    void theOrganizationsHostAsksForACodeThatWorksOnlyThereAndARememberedBrowserSkipsIt() throws Exception {
        JsonNode first = body(login(ACME_HOST, null));
        assertThat(first.path("mfaRequired").asBoolean()).isTrue();
        assertThat(first.path("rememberDays").asInt()).isEqualTo(30);
        assertThat(first.has("accessToken")).as("no session before the code").isFalse();
        assertThat(auditCount(OrgAuditService.LOGIN_TWO_STEP_CHALLENGED)).isEqualTo(1);
        String token = first.path("mfaToken").asText();
        knownCode(token, "246810");

        assertThat(code(BETA_HOST, token, "246810", false).getResponse().getStatus()).as("not on another organization's host").isEqualTo(401);
        assertThat(code(PLATFORM_HOST, token, "246810", false).getResponse().getStatus()).as("not on kiwiply.com").isEqualTo(401);
        assertThat(code(ACME_HOST, token, "135791", false).getResponse().getStatus()).as("a wrong code").isEqualTo(401);
        assertThat(auditCount(OrgAuditService.LOGIN_TWO_STEP_FAILED)).isEqualTo(3);

        MvcResult ok = code(ACME_HOST, token, "246810", true);
        assertThat(ok.getResponse().getStatus()).as(ok.getResponse().getContentAsString()).isEqualTo(200);
        JsonNode pair = body(ok);
        JsonNode claims = mapper.readTree(Base64.getUrlDecoder().decode(pair.path("accessToken").asText().split("\\.")[1]));
        assertThat(claims.path("tid").asLong()).isEqualTo(acme.getId());
        String device = pair.path("deviceToken").asText();
        assertThat(device).isNotBlank();
        assertThat(pair.path("deviceExpiresAt").asText()).isNotBlank();
        assertThat(auditCount(OrgAuditService.LOGIN_TWO_STEP_PASSED)).isEqualTo(1);
        assertThat(code(ACME_HOST, token, "246810", false).getResponse().getStatus()).as("single use").isEqualTo(401);

        JsonNode again = body(login(ACME_HOST, device));
        assertThat(again.has("accessToken")).as("a remembered browser signs in with the password alone").isTrue();
        assertThat(body(login(BETA_HOST, device)).has("accessToken")).as("beta does not require two-step").isTrue();
        assertThat(body(login(ACME_HOST, "made-up-device")).path("mfaRequired").asBoolean()).as("an unknown browser is asked again").isTrue();
    }

    @Test
    void aKiwiplySessionCannotReachTheOrganizationButReachesOthers() throws Exception {
        String personal = body(login(PLATFORM_HOST, null)).path("accessToken").asText();
        assertThat(personal).as("kiwiply.com never asks for the organization's code").isNotBlank();
        assertThat(status(PLATFORM_HOST, personal, "/api/orgs/" + acme.getId())).isEqualTo(403);
        assertThat(status(PLATFORM_HOST, personal, "/api/orgs/" + beta.getId())).as("another organization is untouched").isEqualTo(200);
        assertThat(status(PLATFORM_HOST, personal, "/api/account")).isEqualTo(200);
    }

    @Test
    void turningItOffRestoresTheOneStepSignInAndTheLoginSaysWhenACodeFollows() throws Exception {
        JsonNode publicView = mapper.readTree(mockMvc.perform(get("/api/public/tenant").header(HOST, ACME_HOST)).andReturn().getResponse().getContentAsString());
        assertThat(publicView.path("login").path("mfaRequired").asBoolean()).isTrue();
        require(acme, false);
        assertThat(body(login(ACME_HOST, null)).has("accessToken")).isTrue();
        JsonNode after = mapper.readTree(mockMvc.perform(get("/api/public/tenant").header(HOST, ACME_HOST)).andReturn().getResponse().getContentAsString());
        assertThat(after.path("login").path("mfaRequired").asBoolean()).isFalse();
    }

    @Test
    void aMemberWithNoEmailIsRefusedNotLetThrough() throws Exception {
        User u = users.findOneByLogin(emp).orElseThrow();
        u.setEmail(null);
        users.saveAndFlush(u);
        MvcResult r = login(ACME_HOST, null);
        assertThat(r.getResponse().getStatus()).isEqualTo(403);
        assertThat(r.getResponse().getContentAsString()).contains("TWO_STEP_NO_EMAIL").doesNotContain("accessToken");
    }
}
