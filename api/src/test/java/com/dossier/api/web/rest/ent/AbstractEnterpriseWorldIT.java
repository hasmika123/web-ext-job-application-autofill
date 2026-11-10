package com.dossier.api.web.rest.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

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
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.MailService;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ent.TenantResolver;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import com.dossier.api.web.filter.ConnectCodeThrottle;
import com.dossier.api.web.rest.org.OrgFixtures;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.Base64;
import java.util.Set;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * Shared world for the extension tests of decision O4 (phase S6): an organization with SEPARATE accounts on its own tenant host, an enterprise account in
 * it, and a personal account with the SAME address. Real tokens through the real filter chain. Subclasses carry the {@code @IntegrationTest},
 * {@code @AutoConfigureMockMvc} and {@code @Transactional} annotations.
 */
abstract class AbstractEnterpriseWorldIT {

    static final String HOST = "X-Kiwiply-Host";
    static final String ACME_HOST = "acme-extw.kiwiply.com";
    static final String OTHER_HOST = "other-extw.kiwiply.com";
    static final String PLATFORM_HOST = "kiwiply.com";
    static final String PERSONAL_PW = "personal-pass";
    static final String ENTERPRISE_PW = "enterprise-pass";

    @Autowired MockMvc mockMvc;
    @Autowired ObjectMapper mapper;
    @Autowired AppSettingRepository rows;
    @Autowired ResumeBuilderSettings cache;
    @Autowired TenantResolver resolver;
    @Autowired UserRepository users;
    @Autowired AuthorityRepository authorities;
    @Autowired OrganizationRepository orgs;
    @Autowired OrgMemberRepository members;
    @Autowired PasswordEncoder encoder;
    @Autowired ConnectCodeThrottle throttle;
    @Autowired com.dossier.api.service.ent.OrgRoleService roleService;
    @MockitoBean MailService mailService;

    Organization acme;
    Organization other;
    String email;
    User personal;
    User enterprise;
    String enterpriseLogin;
    OrgFixtures fx;

    @BeforeEach
    void seedWorld() {
        throttle.reset();
        String n = Long.toString(System.nanoTime(), 36);
        email = "lee" + n + "@extw.test";
        fx = new OrgFixtures(users, orgs, members).withRoles(roleService);
        acme = separateOrg("acme-w-" + n, "acme-extw");
        other = separateOrg("other-w-" + n, "other-extw");
        setting(EnterpriseSettingKeys.FLAG_ENTERPRISE, "{\"on\":true}");
        setting(EnterpriseSettingKeys.FLAG_DOMAINS, "{\"on\":true}");
        setting(EnterpriseSettingKeys.SEPARATE_ACCOUNTS, "true");
        personal = account("p" + n, email, PERSONAL_PW, null);
        enterpriseLogin = "ent#" + acme.getId() + "#" + email;
        enterprise = account(enterpriseLogin, email, ENTERPRISE_PW, acme.getId());
        fx.seat(acme, enterpriseLogin, OrgRole.MEMBER, OrgMemberStatus.ACTIVE);
    }

    @AfterEach
    void dropWorld() {
        resolver.invalidate();
        cache.invalidate();
        throttle.reset();
    }

    private Organization separateOrg(String slug, String subdomain) {
        Organization o = fx.org(slug, OrgStatus.ACTIVE);
        o.setSubdomain(subdomain);
        o.setSubdomainEnabled(true);
        o.setAccountMode(OrgAccountMode.SEPARATE);
        return orgs.saveAndFlush(o);
    }

    void setting(String key, String value) {
        rows.save(new AppSetting(key, value, "ext-world-it", Instant.now()));
        cache.invalidate();
        resolver.invalidate();
    }

    User account(String login, String mail, String password, Long orgId) {
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

    JsonNode claims(String jwt) throws Exception {
        return mapper.readTree(Base64.getUrlDecoder().decode(jwt.split("\\.")[1]));
    }

    /** Signs in and returns the token pair. */
    JsonNode login(String host, String username, String password) throws Exception {
        MvcResult r = mockMvc
            .perform(post("/api/authenticate").header(HOST, host).contentType(MediaType.APPLICATION_JSON).content("{\"username\":\"" + username + "\",\"password\":\"" + password + "\"}"))
            .andReturn();
        assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(200);
        return mapper.readTree(r.getResponse().getContentAsString());
    }

    MvcResult call(String method, String host, String token, String uri) throws Exception {
        var req = switch (method) {
            case "POST" -> post(uri).contentType(MediaType.APPLICATION_JSON).content("{}");
            default -> get(uri);
        };
        if (host != null) req = req.header(HOST, host);
        if (token != null) req = req.header("Authorization", "Bearer " + token);
        return mockMvc.perform(req).andReturn();
    }

    MvcResult refresh(String host, String refreshToken) throws Exception {
        var req = post("/api/refresh").contentType(MediaType.APPLICATION_JSON).content("{\"refreshToken\":\"" + refreshToken + "\"}");
        if (host != null) req = req.header(HOST, host);
        return mockMvc.perform(req).andReturn();
    }

    /** The enterprise account's one-time code, minted from its session on its tenant host. */
    String mintCode(String accessToken) throws Exception {
        MvcResult r = call("POST", ACME_HOST, accessToken, "/api/extension/connect-code");
        assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(200);
        String url = mapper.readTree(r.getResponse().getContentAsString()).get("connectUrl").asText();
        return url.substring(url.indexOf("code=") + 5);
    }

    MvcResult exchange(String code) throws Exception {
        return mockMvc.perform(post("/api/extension/connect-code/exchange").contentType(MediaType.APPLICATION_JSON).content("{\"code\":\"" + code + "\"}")).andReturn();
    }

    /** The enterprise extension session: mint on the tenant host, exchange on the platform. */
    JsonNode extensionSession() throws Exception {
        String code = mintCode(login(ACME_HOST, email, ENTERPRISE_PW).get("accessToken").asText());
        MvcResult r = exchange(code);
        assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(200);
        return mapper.readTree(r.getResponse().getContentAsString());
    }
}
