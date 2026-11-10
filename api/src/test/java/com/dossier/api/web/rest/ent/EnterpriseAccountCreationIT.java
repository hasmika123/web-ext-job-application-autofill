package com.dossier.api.web.rest.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.verify;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
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
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.repository.AuthorityRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.MailService;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.UserService;
import com.dossier.api.service.ent.TenantResolver;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import com.dossier.api.web.rest.org.OrgFixtures;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * Decision O4, phase S4 (docs/enterprise-v2/19): the three ways an enterprise account is created, with {@code enterprise.separate_accounts} on.
 * Every flow makes a NEW account of the organization even when a personal account with the same address exists; that personal account (id,
 * password hash, flags) is never read into the answer, attached, or changed; and nothing in a response tells a caller whether such an account
 * exists. Signing in on each host reaches the right account only. The legacy behaviour (switch off, SHARED organizations) is checked too.
 * Not transactional: accepting an invitation commits and its mail goes out after commit; every name carries a random suffix.
 */
@IntegrationTest
@AutoConfigureMockMvc
class EnterpriseAccountCreationIT {

    private static final String HOST = "X-Kiwiply-Host";
    private static final String CONSENT = "org-share/v1";
    private static final String PERSONAL_PW = "Personal-pass-1";
    private static final String WHO = "ent-account-creation-it";

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper mapper;
    @Autowired private UserRepository users;
    @Autowired private AuthorityRepository authorities;
    @Autowired private OrganizationRepository orgs;
    @Autowired private com.dossier.api.service.ent.OrgRoleService roleService;
    @Autowired private OrgMemberRepository members;
    @Autowired private AppSettingRepository rows;
    @Autowired private ResumeBuilderSettings settings;
    @Autowired private TenantResolver resolver;
    @Autowired private PasswordEncoder encoder;
    @Autowired private UserService userService;
    @Autowired private com.dossier.api.repository.org.OrgJoinCodeRepository joinCodes;
    @MockitoBean private MailService mail;

    private OrgFixtures fx;
    private String sfx;

    @BeforeEach
    void seed() {
        fx = new OrgFixtures(users, orgs, members).withRoles(roleService);
        sfx = UUID.randomUUID().toString().substring(0, 8);
        setting(EnterpriseSettingKeys.FLAG_ENTERPRISE, "{\"on\":true}");
        setting(EnterpriseSettingKeys.FLAG_DOMAINS, "{\"on\":true}");
        setting(EnterpriseSettingKeys.SEPARATE_ACCOUNTS, "true");
        setting("org.join.missPerMin", "100");
    }

    @AfterEach
    void forget() {
        for (AppSetting s : rows.findAll()) if (WHO.equals(s.getUpdatedBy())) rows.delete(s);
        settings.invalidate();
        resolver.invalidate();
    }

    private void setting(String key, String value) {
        rows.saveAndFlush(new AppSetting(key, value, WHO, Instant.now()));
        settings.invalidate();
        resolver.invalidate();
    }

    // ---- helpers ------------------------------------------------------------------------------------------------------------

    private User personal(String email) {
        User u = new User();
        u.setLogin("p" + UUID.randomUUID().toString().substring(0, 12));
        u.setEmail(email);
        u.setPassword(encoder.encode(PERSONAL_PW));
        u.setActivated(true);
        u.setLangKey("en");
        Authority role = authorities.findById(AuthoritiesConstants.USER).orElseThrow();
        u.setAuthorities(new HashSet<>(Set.of(role)));
        return users.saveAndFlush(u);
    }

    private MvcResult postAs(String adminLogin, String path, String json) throws Exception {
        return mockMvc.perform(post(path).with(user(adminLogin).roles("ADMIN")).contentType(MediaType.APPLICATION_JSON).content(json)).andReturn();
    }

    private MvcResult createOrg(String label, String ownerEmail) throws Exception {
        return postAs("admin", "/api/admin/orgs", "{\"name\":\"Newco " + label + "\",\"label\":\"" + label + "\",\"type\":\"STAFFING\",\"ownerEmail\":\"" + ownerEmail + "\",\"ownerName\":\"Olivia Owner\"}");
    }

    private JsonNode json(MvcResult r) throws Exception {
        return mapper.readTree(r.getResponse().getContentAsString());
    }

    private MvcResult login(String host, String username, String password) throws Exception {
        var req = post("/api/authenticate").contentType(MediaType.APPLICATION_JSON).content("{\"username\":\"" + username + "\",\"password\":\"" + password + "\"}");
        if (host != null) req = req.header(HOST, host);
        return mockMvc.perform(req).andReturn();
    }

    private JsonNode claims(String jwt) throws Exception {
        return mapper.readTree(Base64.getUrlDecoder().decode(jwt.split("\\.")[1]));
    }

    private MvcResult withToken(String host, String token, org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder req) throws Exception {
        if (host != null) req = req.header(HOST, host);
        return mockMvc.perform(req.header("Authorization", "Bearer " + token)).andReturn();
    }

    /** The names of a response's fields, sorted: two responses with the same shape give the same list. */
    private static List<String> shape(JsonNode n) {
        List<String> names = new ArrayList<>();
        n.fieldNames().forEachRemaining(names::add);
        names.sort(String::compareTo);
        return names;
    }

    private void assertPersonalUntouched(User before, String hashBefore) {
        User after = users.findById(before.getId()).orElseThrow();
        assertThat(after.getPassword()).isEqualTo(hashBefore);
        assertThat(after.getOrgId()).isNull();
        assertThat(after.isActivated()).isTrue();
        assertThat(after.isPasswordChangeRequired()).isFalse();
        assertThat(after.getLogin()).isEqualTo(before.getLogin());
        assertThat(after.getEmail()).isEqualTo(before.getEmail());
        assertThat(users.findOneByOrgIdIsNullAndEmailIgnoreCase(before.getEmail())).map(User::getId).contains(before.getId());
    }

    // ---- owner (app admin creates the organization) -----------------------------------------------------------------------

    @Test
    void theOwnerIsAlwaysANewEnterpriseAccountEvenWhenAPersonalAccountHasThatAddress() throws Exception {
        String email = "owner." + sfx + "@acme-ent.test";
        User personal = personal(email);
        String hash = personal.getPassword();
        User stranger = null; // no personal account for this one: the comparison answer
        String otherEmail = "owner2." + sfx + "@acme-ent.test";

        MvcResult known = createOrg("known" + sfx, email);
        MvcResult unknown = createOrg("unknown" + sfx, otherEmail);
        assertThat(known.getResponse().getStatus()).isEqualTo(201);
        assertThat(unknown.getResponse().getStatus()).isEqualTo(201);
        JsonNode k = json(known);
        JsonNode u = json(unknown);

        // no difference an observer could use: same fields, ownerAccount CREATED, a one-time temporary password of the same form, same headers
        assertThat(shape(k)).isEqualTo(shape(u));
        assertThat(k.get("ownerAccount").asText()).isEqualTo("CREATED").isEqualTo(u.get("ownerAccount").asText());
        assertThat(k.get("tempPassword").asText()).hasSize(16).hasSameSizeAs(u.get("tempPassword").asText());
        assertThat(k.get("tempPasswordExpiresAt").isNull()).isFalse();
        assertThat(known.getResponse().getHeaderNames()).containsExactlyInAnyOrderElementsOf(unknown.getResponse().getHeaderNames());

        Organization org = orgs.findByOrgId(k.get("id").asLong()).orElseThrow();
        assertThat(org.getAccountMode()).isEqualTo(OrgAccountMode.SEPARATE);
        User owner = users.findOneByOrgIdAndEmailIgnoreCase(org.getId(), email).orElseThrow();
        assertThat(owner.getId()).isNotEqualTo(personal.getId());
        assertThat(owner.getLogin()).startsWith("ent#" + org.getId() + "#");
        assertThat(owner.getOrgId()).isEqualTo(org.getId());
        assertThat(owner.isActivated()).isTrue();
        assertThat(owner.isPasswordChangeRequired()).isTrue();
        assertThat(owner.getPasswordTempExpiresAt()).isAfter(Instant.now().plus(6, ChronoUnit.DAYS));
        assertThat(owner.getPassword()).isNotEqualTo(hash).isNotEqualTo(k.get("tempPassword").asText()).startsWith("$2");
        assertThat(users.findOneWithAuthoritiesByLogin(owner.getLogin()).orElseThrow().getAuthorities()).extracting(Authority::getName).containsExactly(AuthoritiesConstants.USER);
        List<OrgMember> seats = members.findByOrgIdAndUserIdAndStatusIn(org.getId(), owner.getId(), List.of(OrgMemberStatus.ACTIVE));
        assertThat(seats).hasSize(1);
        assertThat(seats.get(0).getRole()).isEqualTo(OrgRole.OWNER);
        assertThat(members.findByOrgIdAndUserIdAndStatusIn(org.getId(), personal.getId(), List.of(OrgMemberStatus.ACTIVE, OrgMemberStatus.INVITED))).isEmpty();
        assertPersonalUntouched(personal, hash);
        assertThat(stranger).isNull();
    }

    @Test
    void theOwnerSignsInOnTheTenantHostWithTheTemporaryPasswordAndMustChangeItAndThePersonalAccountIsUnaffected() throws Exception {
        String email = "owner." + sfx + "@acme-ent.test";
        User personal = personal(email);
        String hash = personal.getPassword();
        JsonNode created = json(createOrg("flow" + sfx, email));
        String host = created.get("host").asText();
        String temp = created.get("tempPassword").asText();
        Long orgId = created.get("id").asLong();
        resolver.invalidate();

        // each host reaches its own account only
        assertThat(login(host, email, PERSONAL_PW).getResponse().getStatus()).as("personal password on the tenant host").isEqualTo(401);
        assertThat(login("kiwiply.com", email, temp).getResponse().getStatus()).as("temporary password on the platform").isEqualTo(401);
        assertThat(login(null, email, temp).getResponse().getStatus()).isEqualTo(401);
        MvcResult personalLogin = login("kiwiply.com", email, PERSONAL_PW);
        assertThat(personalLogin.getResponse().getStatus()).isEqualTo(200);
        assertThat(claims(json(personalLogin).get("accessToken").asText()).has("tid")).isFalse();

        MvcResult in = login(host, email, temp);
        assertThat(in.getResponse().getStatus()).as(in.getResponse().getContentAsString()).isEqualTo(200);
        String access = json(in).get("accessToken").asText();
        JsonNode c = claims(access);
        assertThat(c.get("tid").asLong()).isEqualTo(orgId);
        assertThat(c.get("sub").asText()).startsWith("ent#" + orgId + "#");
        assertThat(c.get("pcr").asBoolean()).isTrue();

        // forced change: everything but the password change is refused
        assertThat(withToken(host, access, get("/api/profile")).getResponse().getStatus()).isEqualTo(403);
        assertThat(withToken(host, access, get("/api/account")).getResponse().getStatus()).isEqualTo(200);
        MvcResult change = mockMvc.perform(
            post("/api/account/change-password").header(HOST, host).header("Authorization", "Bearer " + access).contentType(MediaType.APPLICATION_JSON)
                .content("{\"currentPassword\":\"" + temp + "\",\"newPassword\":\"Chosen-by-owner-1!\"}")
        ).andReturn();
        assertThat(change.getResponse().getStatus()).isEqualTo(200);
        assertThat(login(host, email, temp).getResponse().getStatus()).isEqualTo(401);
        MvcResult after = login(host, email, "Chosen-by-owner-1!");
        assertThat(after.getResponse().getStatus()).isEqualTo(200);
        assertThat(claims(json(after).get("accessToken").asText()).has("pcr") && claims(json(after).get("accessToken").asText()).get("pcr").asBoolean()).isFalse();

        // changing the enterprise password never touched the personal account
        assertPersonalUntouched(personal, hash);
        assertThat(login("kiwiply.com", email, PERSONAL_PW).getResponse().getStatus()).isEqualTo(200);
    }

    @Test
    void anOwnerWhoHasNotChosenAPasswordGetsANewTemporaryOneAndItWorksOnTheTenantHost() throws Exception {
        String email = "owner." + sfx + "@acme-ent.test";
        personal(email);
        JsonNode created = json(createOrg("reset" + sfx, email));
        String host = created.get("host").asText();
        Long orgId = created.get("id").asLong();
        resolver.invalidate();

        MvcResult reset = postAs("admin", "/api/admin/orgs/" + orgId + "/owner/reset-password", "{\"reason\":\"Owner lost the first password\"}");
        assertThat(reset.getResponse().getStatus()).isEqualTo(200);
        String second = json(reset).get("tempPassword").asText();
        assertThat(login(host, email, created.get("tempPassword").asText()).getResponse().getStatus()).isEqualTo(401);
        assertThat(login(host, email, second).getResponse().getStatus()).isEqualTo(200);
        assertThat(login("kiwiply.com", email, second).getResponse().getStatus()).isEqualTo(401);
    }

    @Test
    void withTheSwitchOffTheOwnerIsAttachedLikeBefore() throws Exception {
        rows.findById(EnterpriseSettingKeys.SEPARATE_ACCOUNTS).ifPresent(rows::delete);
        settings.invalidate();
        String email = "legacy." + sfx + "@acme-ent.test";
        User personal = personal(email);
        String hash = personal.getPassword();
        JsonNode created = json(createOrg("legacy" + sfx, email));
        assertThat(created.get("ownerAccount").asText()).isEqualTo("EXISTING");
        assertThat(created.get("tempPassword").isNull()).isTrue();
        Organization org = orgs.findByOrgId(created.get("id").asLong()).orElseThrow();
        assertThat(org.getAccountMode()).isEqualTo(OrgAccountMode.SHARED);
        assertThat(members.findByOrgIdAndUserIdAndStatusIn(org.getId(), personal.getId(), List.of(OrgMemberStatus.ACTIVE))).hasSize(1);
        assertPersonalUntouched(personal, hash);
    }

    // ---- employee (Org Admin: Create account now) -------------------------------------------------------------------------

    private Organization separateOrg() {
        Organization org = fx.org("sep-" + sfx, OrgStatus.ACTIVE);
        org.setSubdomain("sep" + sfx);
        org.setSubdomainEnabled(true);
        org.setAccountMode(OrgAccountMode.SEPARATE);
        return orgs.saveAndFlush(org);
    }

    /** An enterprise Org Admin of {@code org}; returns the login. */
    private String enterpriseAdmin(Organization org) {
        User admin = userService.createEnterpriseAccount(org.getId(), "boss." + sfx + "@acme-ent.test", "Bea", "Boss", "Admin-pass-1", null).user();
        fx.seat(org, admin.getLogin(), OrgRole.ADMIN, OrgMemberStatus.ACTIVE);
        return admin.getLogin();
    }

    @Test
    void anOrgAdminCreatesEnterpriseAccountsAndNothingDependsOnAPersonalAccountWithThatAddress() throws Exception {
        Organization org = separateOrg();
        String admin = enterpriseAdmin(org);
        String host = "sep" + sfx + ".kiwiply.com";
        String known = "known." + sfx + "@acme-ent.test";
        String unknown = "unknown." + sfx + "@acme-ent.test";
        User personal = personal(known);
        String hash = personal.getPassword();
        String url = "/api/orgs/" + org.getId() + "/members/account";

        MvcResult a = postAs(admin, url, "{\"email\":\"" + known + "\",\"fullName\":\"Priya Nair\",\"role\":\"MEMBER\"}");
        MvcResult b = postAs(admin, url, "{\"email\":\"" + unknown + "\",\"fullName\":\"Uma Unknown\",\"role\":\"MEMBER\"}");
        assertThat(a.getResponse().getStatus()).isEqualTo(200);
        assertThat(b.getResponse().getStatus()).isEqualTo(200);
        JsonNode ja = json(a);
        JsonNode jb = json(b);
        assertThat(ja.get("mode").asText()).isEqualTo("ACCOUNT_CREATED").isEqualTo(jb.get("mode").asText()); // never INVITED because a personal account exists
        assertThat(shape(ja)).isEqualTo(shape(jb));
        assertThat(ja.get("tempPassword").asText()).hasSize(16);
        assertThat(a.getResponse().getHeaderNames()).containsExactlyInAnyOrderElementsOf(b.getResponse().getHeaderNames());

        User created = users.findOneByOrgIdAndEmailIgnoreCase(org.getId(), known).orElseThrow();
        assertThat(created.getId()).isNotEqualTo(personal.getId());
        assertThat(created.getLogin()).startsWith("ent#" + org.getId() + "#");
        assertThat(created.isPasswordChangeRequired()).isTrue();
        assertThat(members.findByOrgIdAndUserIdAndStatusIn(org.getId(), created.getId(), List.of(OrgMemberStatus.ACTIVE))).hasSize(1);
        assertThat(members.findByOrgIdAndUserIdAndStatusIn(org.getId(), personal.getId(), List.of(OrgMemberStatus.ACTIVE, OrgMemberStatus.INVITED))).isEmpty();
        assertPersonalUntouched(personal, hash);

        // sign in: the tenant host takes the temporary password, the platform takes the personal one, never the other way
        resolver.invalidate();
        String temp = ja.get("tempPassword").asText();
        MvcResult in = login(host, known, temp);
        assertThat(in.getResponse().getStatus()).as(in.getResponse().getContentAsString()).isEqualTo(200);
        String access = json(in).get("accessToken").asText();
        assertThat(claims(access).get("tid").asLong()).isEqualTo(org.getId());
        assertThat(claims(access).get("pcr").asBoolean()).isTrue();
        assertThat(login(host, known, PERSONAL_PW).getResponse().getStatus()).isEqualTo(401);
        assertThat(login("kiwiply.com", known, temp).getResponse().getStatus()).isEqualTo(401);
        assertThat(login("kiwiply.com", known, PERSONAL_PW).getResponse().getStatus()).isEqualTo(200);
        assertThat(withToken(host, access, get("/api/profile")).getResponse().getStatus()).isEqualTo(403);

        // reset while still on the temporary password: a new one, the old one dead, the personal account still untouched
        long memberId = ja.get("memberId").asLong();
        MvcResult reset = postAs(admin, "/api/orgs/" + org.getId() + "/members/" + memberId + "/reset-password", "{\"reason\":\"Lost the first password\"}");
        assertThat(reset.getResponse().getStatus()).isEqualTo(200);
        String second = json(reset).get("tempPassword").asText();
        assertThat(login(host, known, temp).getResponse().getStatus()).isEqualTo(401);
        assertThat(login(host, known, second).getResponse().getStatus()).isEqualTo(200);
        assertPersonalUntouched(personal, hash);
    }

    @Test
    void aDuplicateAddressInsideTheOrganizationIsAGeneric409WhateverElseExists() throws Exception {
        Organization org = separateOrg();
        String admin = enterpriseAdmin(org);
        String known = "dupk." + sfx + "@acme-ent.test";
        String unknown = "dupu." + sfx + "@acme-ent.test";
        personal(known);
        String url = "/api/orgs/" + org.getId() + "/members/account";
        for (String email : List.of(known, unknown)) {
            assertThat(postAs(admin, url, "{\"email\":\"" + email + "\",\"role\":\"MEMBER\"}").getResponse().getStatus()).isEqualTo(200);
        }
        MvcResult d1 = postAs(admin, url, "{\"email\":\"" + known + "\",\"role\":\"MEMBER\"}");
        MvcResult d2 = postAs(admin, url, "{\"email\":\"" + unknown + "\",\"role\":\"MEMBER\"}");
        assertThat(d1.getResponse().getStatus()).isEqualTo(409);
        assertThat(d2.getResponse().getStatus()).isEqualTo(409);
        assertThat(json(d1).get("code").asText()).isEqualTo(json(d2).get("code").asText());
        assertThat(json(d1).get("detail")).isEqualTo(json(d2).get("detail"));
        assertThat(d1.getResponse().getContentAsString().toLowerCase()).doesNotContain("kiwiply account").doesNotContain("personal");
    }

    @Test
    void inALegacySharedOrganizationAKnownAddressIsStillInvited() throws Exception {
        Organization org = fx.org("shared-" + sfx, OrgStatus.ACTIVE); // account_mode defaults to SHARED
        String admin = "shadm" + sfx;
        fx.active(org, admin, OrgRole.ADMIN);
        String known = "shk." + sfx + "@acme-ent.test";
        User personal = personal(known);
        String hash = personal.getPassword();
        MvcResult r = postAs(admin, "/api/orgs/" + org.getId() + "/members/account", "{\"email\":\"" + known + "\",\"role\":\"MEMBER\"}");
        assertThat(r.getResponse().getStatus()).isEqualTo(200);
        assertThat(json(r).get("mode").asText()).isEqualTo("INVITED");
        assertThat(users.findOneByOrgIdAndEmailIgnoreCase(org.getId(), known)).isEmpty();
        assertPersonalUntouched(personal, hash);
    }

    // ---- invitation acceptance --------------------------------------------------------------------------------------------

    private String inviteToken(Organization org, String ownerLogin, String email) throws Exception {
        clearInvocations(mail);
        MvcResult r = postAs(ownerLogin, "/api/orgs/" + org.getId() + "/members/invite", "{\"emails\":[\"" + email + "\"],\"role\":\"MEMBER\"}");
        assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(200);
        ArgumentCaptor<String> link = ArgumentCaptor.forClass(String.class);
        verify(mail, atLeastOnce()).sendOrgInviteEmail(any(), any(), any(), any(), any(), any(), link.capture(), any(), any(), any());
        String last = link.getAllValues().get(link.getAllValues().size() - 1);
        return last.substring(last.indexOf("/join/t/") + "/join/t/".length());
    }

    private MvcResult accept(String host, String token, String password) throws Exception {
        String body = "{\"shareScope\":\"SUMMARY\",\"consentVersion\":\"" + CONSENT + "\"" + (password == null ? "" : ",\"password\":\"" + password + "\"") + "}";
        var req = post("/api/join/" + token + "/accept").contentType(MediaType.APPLICATION_JSON).content(body);
        if (host != null) req = req.header(HOST, host);
        return mockMvc.perform(req).andReturn();
    }

    @Test
    void acceptingAnInvitationCreatesTheEnterpriseAccountWithAPasswordChosenThenAndNeverTouchesAPersonalOne() throws Exception {
        Organization org = separateOrg();
        String admin = enterpriseAdmin(org);
        String host = "sep" + sfx + ".kiwiply.com";
        String known = "joink." + sfx + "@acme-ent.test";
        String unknown = "joinu." + sfx + "@acme-ent.test";
        User personal = personal(known);
        String hash = personal.getPassword();
        resolver.invalidate();
        String tokenKnown = inviteToken(org, admin, known);
        String tokenUnknown = inviteToken(org, admin, unknown);

        // the preview says the same thing for both and announces that an account is created
        MvcResult pk = mockMvc.perform(get("/api/join/" + tokenKnown).header(HOST, host)).andReturn();
        MvcResult pu = mockMvc.perform(get("/api/join/" + tokenUnknown).header(HOST, host)).andReturn();
        assertThat(pk.getResponse().getStatus()).isEqualTo(200);
        assertThat(json(pk).get("createsAccount").asBoolean()).isTrue();
        assertThat(shape(json(pk))).isEqualTo(shape(json(pu)));

        // a password is required, and a too-short one is refused before anything is created
        assertThat(accept(host, tokenKnown, null).getResponse().getStatus()).isEqualTo(422);
        assertThat(accept(host, tokenKnown, "abc").getResponse().getStatus()).isEqualTo(422);
        assertThat(users.findOneByOrgIdAndEmailIgnoreCase(org.getId(), known)).isEmpty();

        MvcResult ak = accept(host, tokenKnown, "Chosen-at-join-1!"); // no Authorization header at all: the link is the credential
        MvcResult au = accept(host, tokenUnknown, "Chosen-at-join-2!");
        assertThat(ak.getResponse().getStatus()).as(ak.getResponse().getContentAsString()).isEqualTo(200);
        assertThat(au.getResponse().getStatus()).isEqualTo(200);
        assertThat(shape(json(ak))).isEqualTo(shape(json(au)));
        assertThat(ak.getResponse().getContentAsString().toLowerCase()).doesNotContain("personal").doesNotContain("existing");

        User created = users.findOneByOrgIdAndEmailIgnoreCase(org.getId(), known).orElseThrow();
        assertThat(created.getId()).isNotEqualTo(personal.getId());
        assertThat(created.isPasswordChangeRequired()).isFalse(); // their own choice, not a temporary password
        assertThat(created.getPasswordTempExpiresAt()).isNull();
        assertThat(members.findByOrgIdAndUserIdAndStatusIn(org.getId(), created.getId(), List.of(OrgMemberStatus.ACTIVE))).hasSize(1);
        assertPersonalUntouched(personal, hash);

        // the accept answer carries the tenant-bound session of the NEW account
        JsonNode session = json(ak).get("session");
        assertThat(session).isNotNull();
        JsonNode c = claims(session.get("accessToken").asText());
        assertThat(c.get("tid").asLong()).isEqualTo(org.getId());
        assertThat(c.get("sub").asText()).isEqualTo(created.getLogin());
        assertThat(withToken(host, session.get("accessToken").asText(), get("/api/account")).getResponse().getStatus()).isEqualTo(200);

        // sign-in per host
        assertThat(login(host, known, "Chosen-at-join-1!").getResponse().getStatus()).isEqualTo(200);
        assertThat(login(host, known, PERSONAL_PW).getResponse().getStatus()).isEqualTo(401);
        assertThat(login("kiwiply.com", known, "Chosen-at-join-1!").getResponse().getStatus()).isEqualTo(401);
        assertThat(login("kiwiply.com", known, PERSONAL_PW).getResponse().getStatus()).isEqualTo(200);

        // single use: the link is spent for everyone
        assertThat(accept(host, tokenKnown, "Another-pass-1!").getResponse().getStatus()).isEqualTo(404);
    }

    @Test
    void anInvitationToALegacySharedOrganizationStillNeedsASignedInAccount() throws Exception {
        Organization org = fx.org("shj-" + sfx, OrgStatus.ACTIVE);
        String owner = "shown" + sfx;
        fx.active(org, owner, OrgRole.OWNER);
        String email = "shj." + sfx + "@acme-ent.test";
        String token = inviteToken(org, owner, email);
        MvcResult noSession = accept(null, token, "Chosen-at-join-1!");
        assertThat(noSession.getResponse().getStatus()).isEqualTo(401);
        assertThat(users.findOneByOrgIdAndEmailIgnoreCase(org.getId(), email)).isEmpty();
        assertThat(json(mockMvc.perform(get("/api/join/" + token)).andReturn()).get("createsAccount").asBoolean()).isFalse();
    }

    @Test
    void aSharedJoinCodeCannotCreateAnEnterpriseAccount() throws Exception {
        Organization org = separateOrg();
        String admin = enterpriseAdmin(org);
        String code = Long.toString(System.nanoTime() % 90000000L + 10000000L); // 8 digits: a valid Crockford code
        com.dossier.api.domain.org.OrgJoinCode row = new com.dossier.api.domain.org.OrgJoinCode();
        row.setOrgId(org.getId());
        row.setCode(code);
        row.setRole(OrgRole.MEMBER);
        row.setMaxUses(10);
        joinCodes.save(row);
        MvcResult preview = mockMvc.perform(get("/api/join/code/" + code)).andReturn();
        assertThat(preview.getResponse().getStatus()).isEqualTo(200);
        assertThat(json(preview).get("open").asBoolean()).isFalse();
        MvcResult accepted = mockMvc.perform(
            post("/api/join/code/" + code).with(user(admin)).contentType(MediaType.APPLICATION_JSON).content("{\"shareScope\":\"SUMMARY\",\"consentVersion\":\"" + CONSENT + "\"}")
        ).andReturn();
        assertThat(accepted.getResponse().getStatus()).isEqualTo(409);
        assertThat(accepted.getResponse().getContentAsString()).contains("CODE_JOIN_UNAVAILABLE");
    }
}
