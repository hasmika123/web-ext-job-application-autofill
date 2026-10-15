package com.dossier.api.web.rest.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.dossier.api.IntegrationTest;
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
import com.dossier.api.service.GoogleIdTokenService;
import com.dossier.api.service.MailService;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ent.TenantResolver;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import com.dossier.api.web.rest.org.OrgFixtures;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.Base64;
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
 * Decision O4, phase S3 (docs/enterprise-v2/19): host-scoped authentication through the real filter chain. With
 * {@code enterprise.separate_accounts} on and a SEPARATE organization, a tenant host authenticates that organization's enterprise accounts only and
 * the platform host personal accounts only; one email may be both; credentials of the other world are the same generic 401 as a wrong password;
 * tokens, refresh tokens, registration, Google sign-in and password reset all stay inside their world; failed sign-ins are counted per world.
 * The organization and its enterprise account are created directly (phase S4 builds the creation flows).
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class ScopedAuthenticationIT {

    private static final String HOST = "X-Kiwiply-Host";
    private static final String ACME_HOST = "acme-scoped.kiwiply.com";
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
    @MockitoBean private MailService mailService;
    @MockitoBean private GoogleIdTokenService google;

    private Organization acme;
    private String email;
    private User personal;
    private User enterprise;
    private String enterpriseLogin;

    @BeforeEach
    void seed() {
        reset(mailService);
        String n = Long.toString(System.nanoTime(), 36);
        email = "sam" + n + "@scoped.test";
        OrgFixtures fx = new OrgFixtures(users, orgs, members);
        acme = fx.org("acme-s-" + n, OrgStatus.ACTIVE);
        acme.setSubdomain("acme-scoped");
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
        rows.save(new AppSetting(key, value, "scoped-it", Instant.now()));
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

    private MvcResult login(String host, String username, String password) throws Exception {
        var req = post("/api/authenticate")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"username\":\"" + username + "\",\"password\":\"" + password + "\"}");
        if (host != null) req = req.header(HOST, host);
        return mockMvc.perform(req).andReturn();
    }

    private JsonNode tokens(String host, String username, String password) throws Exception {
        MvcResult r = login(host, username, password);
        assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(200);
        return mapper.readTree(r.getResponse().getContentAsString());
    }

    private JsonNode claims(String jwt) throws Exception {
        return mapper.readTree(Base64.getUrlDecoder().decode(jwt.split("\\.")[1]));
    }

    private MvcResult call(String host, String token, String uri) throws Exception {
        var req = get(uri);
        if (host != null) req = req.header(HOST, host);
        if (token != null) req = req.header("Authorization", "Bearer " + token);
        return mockMvc.perform(req).andReturn();
    }

    private MvcResult refresh(String host, String refreshToken) throws Exception {
        var req = post("/api/refresh").contentType(MediaType.APPLICATION_JSON).content("{\"refreshToken\":\"" + refreshToken + "\"}");
        if (host != null) req = req.header(HOST, host);
        return mockMvc.perform(req).andReturn();
    }

    private MvcResult postJson(String host, String uri, String body) throws Exception {
        var req = post(uri).contentType(MediaType.APPLICATION_JSON).content(body);
        if (host != null) req = req.header(HOST, host);
        return mockMvc.perform(req).andReturn();
    }

    // ---- login matrix ------------------------------------------------------------------------------------------------------

    @Test
    void enterpriseCredentialsOnThePlatformHostAreTheSameGeneric401AsAWrongPassword() throws Exception {
        MvcResult wrongWorld = login(PLATFORM_HOST, email, ENTERPRISE_PW);
        MvcResult wrongPassword = login(PLATFORM_HOST, email, "not-the-password");
        MvcResult unknownUser = login(PLATFORM_HOST, "nobody" + email, "whatever-pass");
        assertThat(wrongWorld.getResponse().getStatus()).isEqualTo(401);
        assertThat(wrongWorld.getResponse().getContentAsString()).isEqualTo(wrongPassword.getResponse().getContentAsString());
        assertThat(wrongWorld.getResponse().getContentAsString()).isEqualTo(unknownUser.getResponse().getContentAsString());
        assertThat(wrongWorld.getResponse().getHeader("Authorization")).isNull();
        // the enterprise login (never typed by a person) is just as unknown here
        assertThat(login(PLATFORM_HOST, enterpriseLogin, ENTERPRISE_PW).getResponse().getStatus()).isEqualTo(401);
        assertThat(login(null, enterpriseLogin, ENTERPRISE_PW).getResponse().getStatus()).as("no host is the personal world").isEqualTo(401);
    }

    @Test
    void personalCredentialsOnTheTenantHostAreTheSameGeneric401() throws Exception {
        MvcResult wrongWorld = login(ACME_HOST, email, PERSONAL_PW);
        MvcResult wrongPassword = login(ACME_HOST, email, "not-the-password");
        MvcResult unknownUser = login(ACME_HOST, "nobody" + email, "whatever-pass");
        assertThat(wrongWorld.getResponse().getStatus()).isEqualTo(401);
        assertThat(wrongWorld.getResponse().getContentAsString()).isEqualTo(wrongPassword.getResponse().getContentAsString());
        assertThat(wrongWorld.getResponse().getContentAsString()).isEqualTo(unknownUser.getResponse().getContentAsString());
        // a personal account with the same login-style name is just as unknown on the tenant host
        assertThat(login(ACME_HOST, personal.getLogin(), PERSONAL_PW).getResponse().getStatus()).isEqualTo(401);
    }

    @Test
    void theSameEmailSignsIntoTheRightWorldPerHostAndTidIsPresentOnlyForTheEnterpriseAccount() throws Exception {
        JsonNode personalTokens = tokens(PLATFORM_HOST, email, PERSONAL_PW);
        JsonNode enterpriseTokens = tokens(ACME_HOST, email, ENTERPRISE_PW);
        for (String key : new String[] { "accessToken", "refreshToken" }) {
            JsonNode p = claims(personalTokens.get(key).asText());
            JsonNode e = claims(enterpriseTokens.get(key).asText());
            assertThat(p.has("tid")).as("personal " + key).isFalse();
            assertThat(p.get("userId").asLong()).isEqualTo(personal.getId());
            assertThat(p.get("sub").asText()).isEqualTo(personal.getLogin());
            assertThat(e.get("tid").asLong()).as("enterprise " + key).isEqualTo(acme.getId());
            assertThat(e.get("userId").asLong()).isEqualTo(enterprise.getId());
            assertThat(e.get("sub").asText()).isEqualTo(enterpriseLogin);
        }
        // hostless callers (the extension, scripts) are the personal world
        assertThat(claims(tokens(null, email, PERSONAL_PW).get("accessToken").asText()).has("tid")).isFalse();
        // the enterprise account may also sign in with its (never typed) login on its own host
        assertThat(claims(tokens(ACME_HOST, enterpriseLogin, ENTERPRISE_PW).get("accessToken").asText()).get("tid").asLong()).isEqualTo(acme.getId());
        // and each password only works in its own world
        assertThat(login(PLATFORM_HOST, email, ENTERPRISE_PW).getResponse().getStatus()).isEqualTo(401);
        assertThat(login(ACME_HOST, email, PERSONAL_PW).getResponse().getStatus()).isEqualTo(401);
    }

    @Test
    void anEnterpriseAccountWithoutAnActiveSeatIsRefusedWithNotAMemberAndNeverGetsATidlessToken() throws Exception {
        var seats = members.findByOrgIdAndUserIdAndStatusIn(acme.getId(), enterprise.getId(), java.util.List.of(OrgMemberStatus.ACTIVE));
        seats.forEach(m -> { m.setStatus(OrgMemberStatus.SUSPENDED); members.save(m); });
        MvcResult r = login(ACME_HOST, email, ENTERPRISE_PW);
        assertThat(r.getResponse().getStatus()).isEqualTo(403);
        assertThat(r.getResponse().getContentAsString()).contains("NOT_A_MEMBER");
    }

    // ---- refresh ------------------------------------------------------------------------------------------------------------

    @Test
    void refreshTokensDoNotCrossWorlds() throws Exception {
        String personalRefresh = tokens(PLATFORM_HOST, email, PERSONAL_PW).get("refreshToken").asText();
        String enterpriseRefresh = tokens(ACME_HOST, email, ENTERPRISE_PW).get("refreshToken").asText();

        assertThat(refresh(ACME_HOST, personalRefresh).getResponse().getStatus()).as("personal refresh on the tenant host").isEqualTo(401);
        assertThat(refresh(PLATFORM_HOST, enterpriseRefresh).getResponse().getStatus()).as("enterprise refresh on the platform host").isEqualTo(401);
        assertThat(refresh(null, enterpriseRefresh).getResponse().getStatus()).as("enterprise refresh with no host").isEqualTo(401);

        // each still works in its own world, and the enterprise binding survives the rotation
        MvcResult own = refresh(ACME_HOST, enterpriseRefresh);
        assertThat(own.getResponse().getStatus()).isEqualTo(200);
        assertThat(claims(mapper.readTree(own.getResponse().getContentAsString()).get("accessToken").asText()).get("tid").asLong()).isEqualTo(acme.getId());
        MvcResult ownPersonal = refresh(PLATFORM_HOST, personalRefresh);
        assertThat(ownPersonal.getResponse().getStatus()).isEqualTo(200);
        assertThat(claims(mapper.readTree(ownPersonal.getResponse().getContentAsString()).get("accessToken").asText()).has("tid")).isFalse();
    }

    @Test
    void aRefreshTokenWhoseTidDoesNotMatchTheAccountRowIsRefused() throws Exception {
        String enterpriseRefresh = tokens(ACME_HOST, email, ENTERPRISE_PW).get("refreshToken").asText();
        // the row is edited by hand to another organization: the token's tid no longer is the account's org_id
        Organization other = new OrgFixtures(users, orgs, members).org("other-s-" + System.nanoTime(), OrgStatus.ACTIVE);
        enterprise.setOrgId(other.getId());
        users.saveAndFlush(enterprise);
        assertThat(refresh(ACME_HOST, enterpriseRefresh).getResponse().getStatus()).isEqualTo(401);
    }

    // ---- access tokens (world check) ----------------------------------------------------------------------------------------

    @Test
    void aPersonalTokenNeverWorksOnATenantHostAndAnEnterpriseTokenNeverOnThePlatform() throws Exception {
        String personalToken = tokens(PLATFORM_HOST, email, PERSONAL_PW).get("accessToken").asText();
        String enterpriseToken = tokens(ACME_HOST, email, ENTERPRISE_PW).get("accessToken").asText();

        for (String uri : new String[] { "/api/account", "/api/orgs/" + acme.getId() }) {
            MvcResult personalOnTenant = call(ACME_HOST, personalToken, uri);
            assertThat(personalOnTenant.getResponse().getStatus()).as(uri).isEqualTo(401);
            assertThat(personalOnTenant.getResponse().getContentAsString()).contains("TOKEN_WRONG_WORLD");
        }
        for (String host : new String[] { PLATFORM_HOST, null }) {
            MvcResult enterpriseOnPlatform = call(host, enterpriseToken, "/api/account");
            assertThat(enterpriseOnPlatform.getResponse().getStatus()).as("host " + host).isEqualTo(401);
            assertThat(enterpriseOnPlatform.getResponse().getContentAsString()).contains("TOKEN_WRONG_WORLD");
        }
        assertThat(call(ACME_HOST, enterpriseToken, "/api/account").getResponse().getStatus()).isEqualTo(200);
        assertThat(call(PLATFORM_HOST, personalToken, "/api/account").getResponse().getStatus()).isEqualTo(200);
        assertThat(call(null, personalToken, "/api/account").getResponse().getStatus()).isEqualTo(200);
        // each token reads its own account, not the other one that shares its email
        assertThat(mapper.readTree(call(ACME_HOST, enterpriseToken, "/api/account").getResponse().getContentAsString()).get("login").asText()).isEqualTo(enterpriseLogin);
        assertThat(mapper.readTree(call(PLATFORM_HOST, personalToken, "/api/account").getResponse().getContentAsString()).get("login").asText()).isEqualTo(personal.getLogin());
    }

    // ---- register -----------------------------------------------------------------------------------------------------------

    @Test
    void registrationIs404OnATenantHostAndStillWorksOnThePlatform() throws Exception {
        String n = Long.toString(System.nanoTime(), 36);
        String body = "{\"login\":\"reg" + n + "\",\"password\":\"password\",\"firstName\":\"R\",\"lastName\":\"G\",\"email\":\"reg" + n + "@scoped.test\",\"langKey\":\"en\"}";
        assertThat(postJson(ACME_HOST, "/api/register", body).getResponse().getStatus()).isEqualTo(404);
        assertThat(users.findOneByLogin("reg" + n)).isEmpty();
        assertThat(postJson(PLATFORM_HOST, "/api/register", body).getResponse().getStatus()).isEqualTo(201);
    }

    // ---- password reset -----------------------------------------------------------------------------------------------------

    private MvcResult resetInit(String host, String mail) throws Exception {
        var req = post("/api/account/reset-password/init").content(mail);
        if (host != null) req = req.header(HOST, host);
        return mockMvc.perform(req).andReturn();
    }

    @Test
    void aResetEmailGoesOnlyToTheAccountOfTheHostsWorld() throws Exception {
        assertThat(resetInit(ACME_HOST, email).getResponse().getStatus()).isEqualTo(200);
        verify(mailService).sendPasswordResetMail(argThat(u -> u != null && enterprise.getId().equals(u.getId())), anyString());
        verify(mailService, never()).sendPasswordResetMail(any(User.class));
        assertThat(users.findById(enterprise.getId()).orElseThrow().getResetKey()).isNotNull();
        assertThat(users.findById(personal.getId()).orElseThrow().getResetKey()).as("the personal account is untouched").isNull();

        reset(mailService);
        assertThat(resetInit(PLATFORM_HOST, email).getResponse().getStatus()).isEqualTo(200);
        verify(mailService).sendPasswordResetMail(argThat(u -> u != null && personal.getId().equals(u.getId())));
        verify(mailService, never()).sendPasswordResetMail(any(User.class), anyString());
        assertThat(users.findById(personal.getId()).orElseThrow().getResetKey()).isNotNull();
    }

    @Test
    void anAddressThatExistsOnlyInTheOtherWorldGetsTheSame200AndNoMail() throws Exception {
        // personal-only address asked on the tenant host, and enterprise-only address asked on the platform
        String personalOnly = "po" + email;
        account("po" + System.nanoTime(), personalOnly, PERSONAL_PW, null);
        String enterpriseOnly = "eo" + email;
        account("ent#" + acme.getId() + "#" + enterpriseOnly, enterpriseOnly, ENTERPRISE_PW, acme.getId());

        MvcResult onTenant = resetInit(ACME_HOST, personalOnly);
        MvcResult onPlatform = resetInit(PLATFORM_HOST, enterpriseOnly);
        MvcResult unknown = resetInit(ACME_HOST, "nobody" + email);
        assertThat(onTenant.getResponse().getStatus()).isEqualTo(200);
        assertThat(onPlatform.getResponse().getStatus()).isEqualTo(200);
        assertThat(onTenant.getResponse().getContentAsString()).isEqualTo(unknown.getResponse().getContentAsString());
        verify(mailService, never()).sendPasswordResetMail(any(User.class));
        verify(mailService, never()).sendPasswordResetMail(any(User.class), anyString());
    }

    @Test
    void aResetKeyOnlyFinishesOnTheHostOfItsOwnWorld() throws Exception {
        resetInit(ACME_HOST, email);
        resetInit(PLATFORM_HOST, email);
        String enterpriseKey = users.findById(enterprise.getId()).orElseThrow().getResetKey();
        String personalKey = users.findById(personal.getId()).orElseThrow().getResetKey();
        assertThat(enterpriseKey).isNotNull().isNotEqualTo(personalKey);

        assertThat(finish(PLATFORM_HOST, enterpriseKey, "brand-new-pass").getResponse().getStatus()).as("enterprise key on the platform").isGreaterThanOrEqualTo(400);
        assertThat(finish(ACME_HOST, personalKey, "brand-new-pass").getResponse().getStatus()).as("personal key on the tenant host").isGreaterThanOrEqualTo(400);
        assertThat(encoder.matches(ENTERPRISE_PW, users.findById(enterprise.getId()).orElseThrow().getPassword())).isTrue();
        assertThat(encoder.matches(PERSONAL_PW, users.findById(personal.getId()).orElseThrow().getPassword())).isTrue();

        assertThat(finish(ACME_HOST, enterpriseKey, "brand-new-pass").getResponse().getStatus()).isEqualTo(200);
        assertThat(encoder.matches("brand-new-pass", users.findById(enterprise.getId()).orElseThrow().getPassword())).isTrue();
        assertThat(encoder.matches(PERSONAL_PW, users.findById(personal.getId()).orElseThrow().getPassword())).as("the personal password did not change").isTrue();
        assertThat(finish(PLATFORM_HOST, personalKey, "another-new-pass").getResponse().getStatus()).isEqualTo(200);
    }

    private MvcResult finish(String host, String key, String password) throws Exception {
        return postJson(host, "/api/account/reset-password/finish", "{\"key\":\"" + key + "\",\"newPassword\":\"" + password + "\"}");
    }

    // ---- Google -------------------------------------------------------------------------------------------------------------

    @Test
    void googleOnATenantHostFindsOnlyTheEnterpriseAccountAndNeverCreatesOne() throws Exception {
        when(google.isConfigured()).thenReturn(true);
        String onlyPersonal = "gp" + email;
        User gp = account("gp" + System.nanoTime(), onlyPersonal, PERSONAL_PW, null);
        long before = users.count();

        // verified address with an enterprise account here: signed in, bound to the organization
        when(google.verify("tok-ent")).thenReturn(new GoogleIdTokenService.GoogleProfile(email, true, "S", "M"));
        MvcResult ok = postJson(ACME_HOST, "/api/auth/google", "{\"credential\":\"tok-ent\"}");
        assertThat(ok.getResponse().getStatus()).isEqualTo(200);
        JsonNode c = claims(mapper.readTree(ok.getResponse().getContentAsString()).get("accessToken").asText());
        assertThat(c.get("tid").asLong()).isEqualTo(acme.getId());
        assertThat(c.get("userId").asLong()).isEqualTo(enterprise.getId());

        // an address that is only a personal account (or nobody) is the same generic 401, and nothing is created
        when(google.verify("tok-personal")).thenReturn(new GoogleIdTokenService.GoogleProfile(onlyPersonal, true, "G", "P"));
        when(google.verify("tok-new")).thenReturn(new GoogleIdTokenService.GoogleProfile("new" + email, true, "N", "W"));
        MvcResult personalOnly = postJson(ACME_HOST, "/api/auth/google", "{\"credential\":\"tok-personal\"}");
        MvcResult unknown = postJson(ACME_HOST, "/api/auth/google", "{\"credential\":\"tok-new\"}");
        assertThat(personalOnly.getResponse().getStatus()).isEqualTo(401);
        assertThat(unknown.getResponse().getStatus()).isEqualTo(401);
        assertThat(personalOnly.getResponse().getContentAsString()).isEqualTo(unknown.getResponse().getContentAsString());
        assertThat(users.count()).isEqualTo(before);
        assertThat(users.findById(gp.getId())).isPresent();
    }

    @Test
    void googleOnThePlatformUsesThePersonalAccountNotTheEnterpriseOne() throws Exception {
        when(google.isConfigured()).thenReturn(true);
        when(google.verify("tok")).thenReturn(new GoogleIdTokenService.GoogleProfile(email, true, "S", "M"));
        MvcResult r = postJson(PLATFORM_HOST, "/api/auth/google", "{\"credential\":\"tok\"}");
        assertThat(r.getResponse().getStatus()).isEqualTo(200);
        JsonNode c = claims(mapper.readTree(r.getResponse().getContentAsString()).get("accessToken").asText());
        assertThat(c.has("tid")).isFalse();
        assertThat(c.get("userId").asLong()).isEqualTo(personal.getId());

        // an address that is an enterprise account only does not sign into it: a personal account is found-or-created instead
        String enterpriseOnly = "geo" + email;
        User eo = account("ent#" + acme.getId() + "#" + enterpriseOnly, enterpriseOnly, ENTERPRISE_PW, acme.getId());
        when(google.verify("tok2")).thenReturn(new GoogleIdTokenService.GoogleProfile(enterpriseOnly, true, "E", "O"));
        MvcResult r2 = postJson(PLATFORM_HOST, "/api/auth/google", "{\"credential\":\"tok2\"}");
        assertThat(r2.getResponse().getStatus()).isEqualTo(200);
        JsonNode c2 = claims(mapper.readTree(r2.getResponse().getContentAsString()).get("accessToken").asText());
        assertThat(c2.has("tid")).isFalse();
        assertThat(c2.get("userId").asLong()).isNotEqualTo(eo.getId());
    }

    // ---- rate limits --------------------------------------------------------------------------------------------------------

    @Test
    void failedSignInsAreCountedPerWorldSoOneWorldCannotLockTheOther() throws Exception {
        for (int i = 0; i < 10; i++) {
            assertThat(login(ACME_HOST, email, "wrong-" + i).getResponse().getStatus()).as("attempt " + i).isEqualTo(401);
        }
        MvcResult locked = login(ACME_HOST, email, ENTERPRISE_PW);
        assertThat(locked.getResponse().getStatus()).as("the enterprise world for this address is locked, even for the right password").isEqualTo(429);
        assertThat(locked.getResponse().getHeader("Retry-After")).isNotNull();

        assertThat(login(PLATFORM_HOST, email, PERSONAL_PW).getResponse().getStatus()).as("the personal account with the same address is not").isEqualTo(200);
        assertThat(login(ACME_HOST, "other" + email, "x-pass").getResponse().getStatus()).as("another address in the same world").isEqualTo(401);
    }

    @Test
    void aSuccessfulSignInClearsTheCount() throws Exception {
        for (int i = 0; i < 9; i++) login(ACME_HOST, email, "wrong-" + i);
        assertThat(login(ACME_HOST, email, ENTERPRISE_PW).getResponse().getStatus()).isEqualTo(200);
        for (int i = 0; i < 9; i++) login(ACME_HOST, email, "wrong-again-" + i);
        assertThat(login(ACME_HOST, email, ENTERPRISE_PW).getResponse().getStatus()).as("count restarted at the success").isEqualTo(200);
    }

    // ---- switch off / legacy organizations: today's behaviour ---------------------------------------------------------------

    @Test
    void withTheSwitchOffNothingIsScopedAndNothingIsCounted() throws Exception {
        setting(EnterpriseSettingKeys.SEPARATE_ACCOUNTS, "false");
        // the personal account with a seat in the (SEPARATE-mode) organization signs into its tenant host as it always did
        String n = Long.toString(System.nanoTime(), 36);
        User member = account("m" + n, "m" + n + "@scoped.test", PERSONAL_PW, null);
        new OrgFixtures(users, orgs, members).seat(acme, member.getLogin(), OrgRole.MEMBER, OrgMemberStatus.ACTIVE);
        JsonNode t = tokens(ACME_HOST, member.getLogin(), PERSONAL_PW);
        assertThat(claims(t.get("accessToken").asText()).get("tid").asLong()).isEqualTo(acme.getId());
        // enterprise credentials are not found by the legacy personal-only lookup
        assertThat(login(PLATFORM_HOST, email, ENTERPRISE_PW).getResponse().getStatus()).isEqualTo(401);
        for (int i = 0; i < 12; i++) assertThat(login(ACME_HOST, "z" + n, "wrong-" + i).getResponse().getStatus()).isEqualTo(401);
        // no world check on tokens: the tenant token still opens user routes on the platform
        assertThat(call(PLATFORM_HOST, t.get("accessToken").asText(), "/api/account").getResponse().getStatus()).isEqualTo(200);
        // registration is open on every host
        assertThat(postJson(ACME_HOST, "/api/register", "{\"login\":\"off" + n + "\",\"password\":\"password\",\"firstName\":\"O\",\"lastName\":\"F\",\"email\":\"off" + n + "@scoped.test\",\"langKey\":\"en\"}").getResponse().getStatus()).isEqualTo(201);
    }

    @Test
    void aLegacySharedOrganizationKeepsItsPersonalMembers() throws Exception {
        acme.setAccountMode(OrgAccountMode.SHARED);
        orgs.saveAndFlush(acme);
        String n = Long.toString(System.nanoTime(), 36);
        User member = account("s" + n, "s" + n + "@scoped.test", PERSONAL_PW, null);
        new OrgFixtures(users, orgs, members).seat(acme, member.getLogin(), OrgRole.MEMBER, OrgMemberStatus.ACTIVE);
        JsonNode t = tokens(ACME_HOST, "s" + n + "@scoped.test", PERSONAL_PW);
        String access = t.get("accessToken").asText();
        assertThat(claims(access).get("tid").asLong()).isEqualTo(acme.getId());
        assertThat(call(ACME_HOST, access, "/api/account").getResponse().getStatus()).isEqualTo(200);
        assertThat(call(PLATFORM_HOST, access, "/api/account").getResponse().getStatus()).as("legacy tid tokens keep user routes on the platform").isEqualTo(200);
        assertThat(refresh(ACME_HOST, t.get("refreshToken").asText()).getResponse().getStatus()).isEqualTo(200);
        // sign-up stays open on a legacy organization's host, as before
        assertThat(postJson(ACME_HOST, "/api/register", "{\"login\":\"sh" + n + "\",\"password\":\"password\",\"firstName\":\"S\",\"lastName\":\"H\",\"email\":\"sh" + n + "@scoped.test\",\"langKey\":\"en\"}").getResponse().getStatus()).isEqualTo(201);
    }
}
