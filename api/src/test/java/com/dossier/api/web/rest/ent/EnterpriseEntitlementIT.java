package com.dossier.api.web.rest.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.dossier.api.IntegrationTest;
import com.dossier.api.ProSubscriptions;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.Authority;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.OrgAccountMode;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.repository.AuthorityRepository;
import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.EntitlementService;
import com.dossier.api.service.MailService;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ent.TenantResolver;
import com.dossier.api.service.inbox.InboxEntitlement;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import com.dossier.api.web.rest.org.OrgFixtures;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.Set;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * Decision O4, phase S5 (docs/enterprise-v2/19 sections 3.2 to 3.4): an enterprise account never resolves a personal plan and a personal plan never
 * reaches an enterprise feature; the personal billing routes and the personal-plan inbox routes answer the generic 404 for an enterprise token,
 * while the personal account of the same address is served exactly as before. Real tokens through the real filter chain.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class EnterpriseEntitlementIT {

    private static final String HOST = "X-Kiwiply-Host";
    private static final String ACME_HOST = "acme-entitle.kiwiply.com";
    private static final String PLATFORM_HOST = "kiwiply.com";
    private static final String PERSONAL_PW = "personal-pass";
    private static final String ENTERPRISE_PW = "enterprise-pass";

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper mapper;
    @Autowired private AppSettingRepository rows;
    @Autowired private ResumeBuilderSettings cache;
    @Autowired private TenantResolver resolver;
    @Autowired private UserRepository users;
    @Autowired private AuthorityRepository authorities;
    @Autowired private OrganizationRepository orgs;
    @Autowired private OrgMemberRepository members;
    @Autowired private PasswordEncoder encoder;
    @Autowired private SubscriptionRepository subscriptions;
    @Autowired private EntitlementService entitlements;
    @Autowired private InboxEntitlement inboxEntitlement;
    @MockitoBean private MailService mailService;

    private Organization acme;
    private String email;
    private User personal;
    private User enterprise;
    private String enterpriseLogin;

    @BeforeEach
    void seed() {
        String n = Long.toString(System.nanoTime(), 36);
        email = "kim" + n + "@entitle.test";
        OrgFixtures fx = new OrgFixtures(users, orgs, members);
        acme = fx.org("acme-e-" + n, OrgStatus.ACTIVE);
        acme.setSubdomain("acme-entitle");
        acme.setSubdomainEnabled(true);
        acme.setAccountMode(OrgAccountMode.SEPARATE);
        orgs.saveAndFlush(acme);
        setting(EnterpriseSettingKeys.FLAG_ENTERPRISE, "{\"on\":true}");
        setting(EnterpriseSettingKeys.FLAG_DOMAINS, "{\"on\":true}");
        setting(EnterpriseSettingKeys.SEPARATE_ACCOUNTS, "true");
        personal = account("p" + n, email, PERSONAL_PW, null);
        enterpriseLogin = "ent#" + acme.getId() + "#" + email;
        enterprise = account(enterpriseLogin, email, ENTERPRISE_PW, acme.getId());
        fx.seat(acme, enterpriseLogin, OrgRole.MEMBER, OrgMemberStatus.ACTIVE);
    }

    @AfterEach
    void drop() {
        resolver.invalidate();
        cache.invalidate();
    }

    private void setting(String key, String value) {
        rows.save(new AppSetting(key, value, "entitle-it", Instant.now()));
        cache.invalidate();
        resolver.invalidate();
    }

    private User account(String login, String mail, String password, Long orgId) {
        User u = new User();
        u.setLogin(login);
        u.setEmail(mail);
        u.setPassword(encoder.encode(password));
        u.setActivated(true);
        u.setLangKey("en");
        u.setOrgId(orgId);
        Authority role = authorities.findById(AuthoritiesConstants.USER).orElseThrow();
        u.setAuthorities(new java.util.HashSet<>(Set.of(role)));
        return users.saveAndFlush(u);
    }

    private String token(String host, String username, String password) throws Exception {
        MvcResult r = mockMvc
            .perform(post("/api/authenticate").header(HOST, host).contentType(MediaType.APPLICATION_JSON).content("{\"username\":\"" + username + "\",\"password\":\"" + password + "\"}"))
            .andReturn();
        assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(200);
        return mapper.readTree(r.getResponse().getContentAsString()).get("accessToken").asText();
    }

    private MvcResult call(String method, String host, String token, String uri) throws Exception {
        var req = method.equals("POST") ? post(uri).contentType(MediaType.APPLICATION_JSON).content("{}") : get(uri);
        return mockMvc.perform(req.header(HOST, host).header("Authorization", "Bearer " + token)).andReturn();
    }

    @Test
    void anEnterpriseAccountNeverResolvesAPersonalPlanEvenWithAStrayRow() {
        ProSubscriptions.makePro(subscriptions, users, enterpriseLogin);
        assertThat(entitlements.isPro(enterpriseLogin)).isFalse();
        assertThat(entitlements.plan(enterpriseLogin).plan()).isEqualTo("FREE");
        assertThat(entitlements.plan(enterpriseLogin).status()).isEqualTo("none");
        assertThatPro(enterpriseLogin).isFalse();
    }

    private org.assertj.core.api.AbstractBooleanAssert<?> assertThatPro(String login) {
        try {
            entitlements.requirePro(login);
            return assertThat(true);
        } catch (RuntimeException e) {
            return assertThat(false);
        }
    }

    @Test
    void aPersonalPlanOfTheSameAddressDoesNotReachTheEnterpriseAccountAndViceVersa() {
        ProSubscriptions.makePro(subscriptions, users, personal.getLogin());
        assertThat(entitlements.isPro(personal.getLogin())).as("the personal account is Pro").isTrue();
        assertThat(entitlements.isPro(enterpriseLogin)).as("its enterprise namesake is not").isFalse();
        assertThat(inboxEntitlement.decide(enterprise.getId(), enterpriseLogin).allowed()).as("no license, so no inbox, whatever the personal plan says").isFalse();
        assertThat(inboxEntitlement.decide(personal.getId(), personal.getLogin()).ground()).isEqualTo(InboxEntitlement.Ground.PERSONAL);
    }

    @Test
    void aPersonalAccountNeverResolvesAnOrganizationLicense() {
        assertThat(inboxEntitlement.organizationDecision(personal.getId()).allowed()).as("it holds no seat anywhere").isFalse();
        assertThat(inboxEntitlement.orgGrants(acme.getId(), personal.getId())).isFalse();
    }

    @Test
    void personalBillingAndPersonalInboxRoutesAreTheGeneric404ForAnEnterpriseToken() throws Exception {
        String t = token(ACME_HOST, email, ENTERPRISE_PW);
        for (String uri : new String[] { "/api/billing/me", "/api/profile/inbox", "/api/profile/inbox/suggestions" }) {
            MvcResult r = call("GET", ACME_HOST, t, uri);
            assertThat(r.getResponse().getStatus()).as(uri).isEqualTo(404);
            assertThat(r.getResponse().getContentAsString()).as(uri).contains("\"code\":\"NOT_FOUND\"");
        }
        for (String uri : new String[] { "/api/billing/checkout", "/api/billing/portal", "/api/profile/inbox/suggestions/1/dismiss" }) {
            assertThat(call("POST", ACME_HOST, t, uri).getResponse().getStatus()).as(uri).isEqualTo(404);
        }
    }

    @Test
    void thePersonalAccountOfTheSameAddressIsServedExactlyAsBefore() throws Exception {
        String t = token(PLATFORM_HOST, email, PERSONAL_PW);
        MvcResult plan = call("GET", PLATFORM_HOST, t, "/api/billing/me");
        assertThat(plan.getResponse().getStatus()).isEqualTo(200);
        assertThat(mapper.readTree(plan.getResponse().getContentAsString()).get("plan").asText()).isEqualTo("FREE");
        assertThat(call("GET", PLATFORM_HOST, t, "/api/profile/inbox").getResponse().getStatus()).isEqualTo(200);
        assertThat(call("GET", PLATFORM_HOST, t, "/api/profile/version").getResponse().getStatus()).isEqualTo(200);
    }

    @Test
    void theEnterpriseAccountStillReachesItsOwnUserScopedRoutes() throws Exception {
        String t = token(ACME_HOST, email, ENTERPRISE_PW);
        MvcResult v = call("GET", ACME_HOST, t, "/api/profile/version");
        assertThat(v.getResponse().getStatus()).isEqualTo(200);
        JsonNode body = mapper.readTree(v.getResponse().getContentAsString());
        assertThat(body.get("plan").asText()).as("no personal plan to report").isEqualTo("FREE");
    }
}
