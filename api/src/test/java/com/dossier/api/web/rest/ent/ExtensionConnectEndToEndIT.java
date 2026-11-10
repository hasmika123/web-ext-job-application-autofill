package com.dossier.api.web.rest.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.Authority;
import com.dossier.api.domain.User;
import com.dossier.api.domain.ent.OrgMemberRole;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.enumeration.OrgAccountMode;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.repository.AuthorityRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.OrgMemberRoleRepository;
import com.dossier.api.repository.ent.OrgRoleRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.ExtensionConnectCodeService;
import com.dossier.api.service.MailService;
import com.dossier.api.service.ent.LegacyRoleMirror;
import com.dossier.api.service.ent.RoleTemplates;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ent.TenantResolver;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import com.dossier.api.web.filter.ConnectCodeThrottle;
import com.dossier.api.web.rest.org.OrgFixtures;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.Base64;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
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

/**
 * Connecting the browser extension to an organization, end to end: sign in on the tenant host, mint a connect code, exchange it on the platform host,
 * then use and refresh the resulting extension session. Covers BOTH account modes of an organization: SEPARATE (members have their own {@code ent#}
 * accounts, {@code org_id} set) and SHARED (members are ordinary accounts, {@code org_id} NULL, that hold a seat).
 *
 * <p>Deliberately NOT {@code @Transactional}: {@code ConnectCodeIT} is, and a class-level transaction keeps a lazy association loadable that is
 * detached in production (the exchange once failed with a LazyInitializationException only outside a test transaction). Every name carries a random
 * suffix and the settings it writes are removed afterwards.
 */
@IntegrationTest
@AutoConfigureMockMvc
class ExtensionConnectEndToEndIT {

    private static final String HOST = "X-Kiwiply-Host";
    private static final String PLATFORM_HOST = "kiwiply.com";
    private static final String PW = "Connect-pass-1";
    private static final String WHO = "ext-connect-e2e-it";

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper mapper;
    @Autowired private UserRepository users;
    @Autowired private AuthorityRepository authorities;
    @Autowired private OrganizationRepository orgs;
    @Autowired private OrgMemberRepository members;
    @Autowired private com.dossier.api.service.ent.OrgRoleService roleService;
    @Autowired private AppSettingRepository rows;
    @Autowired private ResumeBuilderSettings settings;
    @Autowired private TenantResolver resolver;
    @Autowired private PasswordEncoder encoder;
    @Autowired private ConnectCodeThrottle throttle;
    @Autowired private ExtensionConnectCodeService codes;
    @Autowired private OrgRoleRepository roleRows;
    @Autowired private OrgMemberRoleRepository memberRoles;
    @Autowired private ConsultantProfileRepository consultantProfiles;
    @MockitoBean private MailService mail;

    private OrgFixtures fx;
    private String sfx;

    @BeforeEach
    void seed() {
        throttle.reset();
        fx = new OrgFixtures(users, orgs, members).withRoles(roleService);
        sfx = UUID.randomUUID().toString().replace("-", "").substring(0, 10);
        setting(EnterpriseSettingKeys.FLAG_ENTERPRISE, "{\"on\":true}");
        setting(EnterpriseSettingKeys.FLAG_DOMAINS, "{\"on\":true}");
    }

    @AfterEach
    void forget() {
        for (AppSetting s : rows.findAll()) if (WHO.equals(s.getUpdatedBy())) rows.delete(s);
        settings.invalidate();
        resolver.invalidate();
        throttle.reset();
    }

    // ---- (1) a separate-accounts member --------------------------------------------------------------------------------------

    @Test
    void aSeparateAccountsMemberConnectsEndToEnd() throws Exception {
        setting(EnterpriseSettingKeys.SEPARATE_ACCOUNTS, "true");
        Organization org = org("sep", OrgAccountMode.SEPARATE);
        String email = "sep" + sfx + "@e2e.test";
        String login = "ent#" + org.getId() + "#" + email;
        User member = account(login, email, org.getId());
        fx.seat(org, login, OrgRole.MEMBER, OrgMemberStatus.ACTIVE);

        JsonNode session = connect(host(org), email);
        assertEnterpriseSession(session, member, org);
        assertThat(session.has("username")).as("the synthetic login is never sent").isFalse();
        assertThat(session.toString()).doesNotContain("ent#");
        assertUsableAndRefreshable(session);
    }

    // ---- (2) a shared-accounts member with an active seat ----------------------------------------------------------------------

    @Test
    void aSharedAccountsMemberWithAnActiveSeatConnectsEndToEnd() throws Exception {
        sharedMemberConnects(false);
    }

    @Test
    void aSharedAccountsMemberConnectsEndToEndWithSeparateAccountsSwitchedOn() throws Exception {
        sharedMemberConnects(true);
    }

    private void sharedMemberConnects(boolean separateSwitch) throws Exception {
        if (separateSwitch) setting(EnterpriseSettingKeys.SEPARATE_ACCOUNTS, "true");
        Organization org = org("shr", OrgAccountMode.SHARED);
        String email = "shr" + sfx + "@e2e.test";
        User member = account("shr" + sfx, email, null);
        fx.seat(org, member.getLogin(), OrgRole.MEMBER, OrgMemberStatus.ACTIVE);

        JsonNode session = connect(host(org), member.getLogin());
        assertEnterpriseSession(session, member, org);
        assertUsableAndRefreshable(session);

        // held to ExtensionRoutes like any ext=1 token: the personal-account surface is the generic 404, not 200
        String access = session.get("accessToken").asText();
        for (String uri : List.of("/api/account", "/api/billing/me", "/api/profile/inbox", "/api/notifications", "/api/orgs/" + org.getId() + "/members")) {
            MvcResult r = call("GET", PLATFORM_HOST, access, uri);
            assertThat(r.getResponse().getStatus()).as(uri + " -> " + r.getResponse().getContentAsString()).isEqualTo(404);
        }
        // it can not mint another code, nor a personal extension session
        assertThat(call("POST", PLATFORM_HOST, access, "/api/extension/connect-code").getResponse().getStatus()).isEqualTo(404);
        assertThat(call("POST", PLATFORM_HOST, access, "/api/extension/session").getResponse().getStatus()).isEqualTo(404);
    }

    @Test
    void aSharedMembersExtensionSessionDiesWithTheSeat() throws Exception {
        Organization org = org("die", OrgAccountMode.SHARED);
        User member = account("die" + sfx, "die" + sfx + "@e2e.test", null);
        OrgMember seat = fx.seat(org, member.getLogin(), OrgRole.MEMBER, OrgMemberStatus.ACTIVE);
        JsonNode session = connect(host(org), member.getLogin());
        String access = session.get("accessToken").asText();
        assertThat(call("GET", PLATFORM_HOST, access, "/api/profile/version").getResponse().getStatus()).isEqualTo(200);

        seat.setStatus(OrgMemberStatus.SUSPENDED);
        members.saveAndFlush(seat);
        MvcResult after = call("GET", PLATFORM_HOST, access, "/api/profile/version");
        assertThat(after.getResponse().getStatus()).as("the already-issued access token is refused at once").isEqualTo(401);
        assertThat(after.getResponse().getContentAsString()).contains("TOKEN_ACCOUNT_DISABLED");
        assertThat(refresh(session.get("refreshToken").asText()).getResponse().getStatus()).as("and it no longer rotates").isEqualTo(401);
    }

    // ---- (3) shared member without a (usable) seat ----------------------------------------------------------------------------

    @Test
    void aSharedAccountWithoutASeatCanNotMintOrExchange() throws Exception {
        Organization org = org("noseat", OrgAccountMode.SHARED);
        User outsider = account("out" + sfx, "out" + sfx + "@e2e.test", null);

        // on the tenant host a person without a seat is not even signed in
        assertThat(login(host(org), outsider.getLogin()).getResponse().getStatus()).isEqualTo(403);
        // the platform-host (tid-less) session can not mint: there is no organization to bind to
        String platformAccess = mapper.readTree(login(PLATFORM_HOST, outsider.getLogin()).getResponse().getContentAsString()).get("accessToken").asText();
        assertThat(call("POST", PLATFORM_HOST, platformAccess, "/api/extension/connect-code").getResponse().getStatus()).isEqualTo(404);
        // a code minted straight in the service (bypassing the route) for an account with no seat is refused by the exchange
        assertThat(exchange(codes.mint(outsider.getId(), org.getId())).getResponse().getStatus()).isEqualTo(401);
    }

    @Test
    void aSharedAccountWithASuspendedSeatCanNotMintOrExchange() throws Exception {
        Organization org = org("susp", OrgAccountMode.SHARED);
        User member = account("sus" + sfx, "sus" + sfx + "@e2e.test", null);
        OrgMember seat = fx.seat(org, member.getLogin(), OrgRole.MEMBER, OrgMemberStatus.ACTIVE);
        String tenantAccess = mapper.readTree(login(host(org), member.getLogin()).getResponse().getContentAsString()).get("accessToken").asText();
        // a code minted while the seat was active dies with the seat
        String code = mintCode(host(org), tenantAccess);
        seat.setStatus(OrgMemberStatus.SUSPENDED);
        members.saveAndFlush(seat);
        assertThat(exchange(code).getResponse().getStatus()).as("exchange after suspension").isEqualTo(401);
        assertThat(call("POST", host(org), tenantAccess, "/api/extension/connect-code").getResponse().getStatus()).as("mint after suspension").isEqualTo(404);
    }

    // ---- (4) a seat in another organization -----------------------------------------------------------------------------------

    @Test
    void aSeatInAnotherOrganizationIsNotASeatHere() throws Exception {
        Organization mine = org("mine", OrgAccountMode.SHARED);
        Organization theirs = org("theirs", OrgAccountMode.SHARED);
        User member = account("oth" + sfx, "oth" + sfx + "@e2e.test", null);
        fx.seat(theirs, member.getLogin(), OrgRole.MEMBER, OrgMemberStatus.ACTIVE);

        // a token of the organization they belong to never works against the other one
        String access = mapper.readTree(login(host(theirs), member.getLogin()).getResponse().getContentAsString()).get("accessToken").asText();
        assertThat(call("POST", host(mine), access, "/api/extension/connect-code").getResponse().getStatus()).as("token of one tenant on the other's host").isEqualTo(401);
        // a code bound to the organization they have no seat in is refused by the exchange
        assertThat(exchange(codes.mint(member.getId(), mine.getId())).getResponse().getStatus()).isEqualTo(401);
        // while the same person connects to the organization where they do have a seat
        JsonNode session = connect(host(theirs), member.getLogin());
        assertThat(session.get("orgId").asLong()).isEqualTo(theirs.getId());
    }

    @Test
    void anOrdinaryAccountIsNeverAcceptedForASeparateAccountsOrganization() throws Exception {
        setting(EnterpriseSettingKeys.SEPARATE_ACCOUNTS, "true");
        Organization org = org("sepx", OrgAccountMode.SEPARATE);
        User personal = account("per" + sfx, "per" + sfx + "@e2e.test", null);
        // even with a (legacy-looking) seat row, a personal account has no business in a SEPARATE organization's extension session
        fx.seat(org, personal.getLogin(), OrgRole.MEMBER, OrgMemberStatus.ACTIVE);
        assertThat(exchange(codes.mint(personal.getId(), org.getId())).getResponse().getStatus()).isEqualTo(401);
    }

    // ---- Bug B: the extension fills from the consultant's own workspace profile ---------------------------------------------

    @Test
    void aSharedConsultantsExtensionPullsTheirWorkspaceProfileAsTheBio() throws Exception {
        setting(EnterpriseSettingKeys.FLAG_ROLES, "{\"on\":true}");
        Organization org = org("cws", OrgAccountMode.SHARED);
        String email = "cws" + sfx + "@e2e.test";
        User member = account("cws" + sfx, email, null);
        ConsultantProfile profile = consultant(org, member, "Anika Rao", "Austin, TX", "+1 512 555 0100");

        JsonNode session = connect(host(org), member.getLogin());
        String access = session.get("accessToken").asText();

        // the account is an ENTERPRISE one for the organization (not "personal"), although the row has no org_id
        JsonNode before = mapper.readTree(call("GET", PLATFORM_HOST, access, "/api/profile/version").getResponse().getContentAsString());
        assertThat(before.path("account").path("kind").asText()).isEqualTo("ENTERPRISE");
        assertThat(before.path("account").path("orgId").asLong()).isEqualTo(org.getId());

        MvcResult pull = call("GET", PLATFORM_HOST, access, "/api/profile");
        assertThat(pull.getResponse().getStatus()).as(pull.getResponse().getContentAsString()).isEqualTo(200);
        JsonNode bio = mapper.readTree(mapper.readTree(pull.getResponse().getContentAsString()).get("payload").asText());
        assertThat(bio.path("firstName").asText()).isEqualTo("Anika");
        assertThat(bio.path("lastName").asText()).isEqualTo("Rao");
        assertThat(bio.path("email").asText()).isEqualTo(email);
        assertThat(bio.path("phone").asText()).isEqualTo("+1 512 555 0100");
        assertThat(bio.path("city").asText()).isEqualTo("Austin");
        assertThat(bio.path("state").asText()).isEqualTo("TX");

        // the mirror re-pulls when the workspace profile changes: the version covers what the pull returns
        profile.setPhone("+1 512 555 0111");
        consultantProfiles.saveAndFlush(profile);
        JsonNode after = mapper.readTree(call("GET", PLATFORM_HOST, access, "/api/profile/version").getResponse().getContentAsString());
        assertThat(after.path("version").asText()).isNotEqualTo(before.path("version").asText());

        // the same account's ordinary (personal) extension session and web session are unchanged: no personal bio, so 404
        String personalAccess = mapper.readTree(login(PLATFORM_HOST, member.getLogin()).getResponse().getContentAsString()).get("accessToken").asText();
        String personalExt = mapper.readTree(call("POST", PLATFORM_HOST, personalAccess, "/api/extension/session").getResponse().getContentAsString()).get("accessToken").asText();
        assertThat(call("GET", PLATFORM_HOST, personalExt, "/api/profile").getResponse().getStatus()).isEqualTo(404);
        assertThat(call("GET", PLATFORM_HOST, personalAccess, "/api/profile").getResponse().getStatus()).isEqualTo(404);
    }

    @Test
    void aMemberWhoIsNotAConsultantKeepsTheirOwnBio() throws Exception {
        setting(EnterpriseSettingKeys.FLAG_ROLES, "{\"on\":true}");
        Organization org = org("ncs", OrgAccountMode.SHARED);
        User member = account("ncs" + sfx, "ncs" + sfx + "@e2e.test", null);
        fx.seat(org, member.getLogin(), OrgRole.MEMBER, OrgMemberStatus.ACTIVE);
        String access = connect(host(org), member.getLogin()).get("accessToken").asText();
        assertThat(call("GET", PLATFORM_HOST, access, "/api/profile").getResponse().getStatus()).as("no consultant record and no bio of their own").isEqualTo(404);
    }

    private ConsultantProfile consultant(Organization org, User user, String name, String location, String phone) {
        OrgMember m = fx.seat(org, user.getLogin(), LegacyRoleMirror.toEnum(RoleTemplates.CONSULTANT).orElse(OrgRole.MEMBER), OrgMemberStatus.ACTIVE);
        OrgMemberRole row = new OrgMemberRole();
        row.setOrgId(org.getId());
        row.setMemberId(m.getId());
        row.setRoleId(roleRows.findSystemByRoleKey(RoleTemplates.CONSULTANT).orElseThrow().getId());
        row.setPrimary(true);
        row.setGrantedAt(Instant.now());
        memberRoles.saveAndFlush(row);
        m.setPrimaryRoleId(row.getRoleId());
        members.saveAndFlush(m);
        ConsultantProfile p = new ConsultantProfile();
        p.setOrgId(org.getId());
        p.setMemberId(m.getId());
        p.setDisplayName(name);
        p.setEmail(user.getEmail());
        p.setJobTitle("Senior Engineer");
        p.setYearsExperience(8);
        p.setLocationLabel(location);
        p.setPhone(phone);
        p.setProfileCompleteness(78);
        return consultantProfiles.saveAndFlush(p);
    }

    // ---- helpers -------------------------------------------------------------------------------------------------------------

    private void assertEnterpriseSession(JsonNode session, User member, Organization org) throws Exception {
        assertThat(session.get("kind").asText()).isEqualTo("ENTERPRISE");
        assertThat(session.get("userId").asLong()).isEqualTo(member.getId());
        assertThat(session.get("orgId").asLong()).isEqualTo(org.getId());
        assertThat(session.get("orgName").asText()).isEqualTo(org.getName());
        assertThat(session.get("email").asText()).isEqualTo(member.getEmail());
        for (String key : new String[] { "accessToken", "refreshToken" }) {
            JsonNode c = claims(session.get(key).asText());
            assertThat(c.get("tid").asLong()).as(key).isEqualTo(org.getId());
            assertThat(c.get("ext").asInt()).as(key).isEqualTo(1);
            assertThat(c.get("userId").asLong()).as(key).isEqualTo(member.getId());
            assertThat(c.has("hid")).as(key + " is not tied to a hostname").isFalse();
        }
    }

    private void assertUsableAndRefreshable(JsonNode session) throws Exception {
        String access = session.get("accessToken").asText();
        for (String uri : List.of("/api/profile/version", "/api/profile/resumes", "/api/profile/applications", "/api/ai/usage")) {
            MvcResult r = call("GET", PLATFORM_HOST, access, uri);
            assertThat(r.getResponse().getStatus()).as(uri + " -> " + r.getResponse().getContentAsString()).isEqualTo(200);
        }
        JsonNode version = mapper.readTree(call("GET", PLATFORM_HOST, access, "/api/profile/version").getResponse().getContentAsString());
        assertThat(version.path("account").path("kind").asText()).isEqualTo("ENTERPRISE");
        MvcResult rotated = refresh(session.get("refreshToken").asText());
        assertThat(rotated.getResponse().getStatus()).as(rotated.getResponse().getContentAsString()).isEqualTo(200);
        JsonNode next = mapper.readTree(rotated.getResponse().getContentAsString());
        assertThat(claims(next.get("accessToken").asText()).get("ext").asInt()).as("ext survives rotation").isEqualTo(1);
        assertThat(claims(next.get("accessToken").asText()).get("tid").asLong()).isEqualTo(session.path("orgId").asLong());
    }

    /** Sign in on the tenant host, mint on it, exchange on the platform host. */
    private JsonNode connect(String tenantHost, String username) throws Exception {
        MvcResult l = login(tenantHost, username);
        assertThat(l.getResponse().getStatus()).as(l.getResponse().getContentAsString()).isEqualTo(200);
        String code = mintCode(tenantHost, mapper.readTree(l.getResponse().getContentAsString()).get("accessToken").asText());
        MvcResult r = exchange(code);
        assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(200);
        return mapper.readTree(r.getResponse().getContentAsString());
    }

    private String mintCode(String tenantHost, String access) throws Exception {
        MvcResult r = call("POST", tenantHost, access, "/api/extension/connect-code");
        assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(200);
        String url = mapper.readTree(r.getResponse().getContentAsString()).get("connectUrl").asText();
        return url.substring(url.indexOf("code=") + 5);
    }

    private MvcResult exchange(String code) throws Exception {
        return mockMvc.perform(post("/api/extension/connect-code/exchange").contentType(MediaType.APPLICATION_JSON).content("{\"code\":\"" + code + "\"}")).andReturn();
    }

    private MvcResult login(String host, String username) throws Exception {
        return mockMvc
            .perform(post("/api/authenticate").header(HOST, host).contentType(MediaType.APPLICATION_JSON).content("{\"username\":\"" + username + "\",\"password\":\"" + PW + "\"}"))
            .andReturn();
    }

    private MvcResult refresh(String refreshToken) throws Exception {
        return mockMvc.perform(post("/api/refresh").header(HOST, PLATFORM_HOST).contentType(MediaType.APPLICATION_JSON).content("{\"refreshToken\":\"" + refreshToken + "\"}")).andReturn();
    }

    private MvcResult call(String method, String host, String token, String uri) throws Exception {
        var req = "POST".equals(method) ? post(uri).contentType(MediaType.APPLICATION_JSON).content("{}") : get(uri);
        return mockMvc.perform(req.header(HOST, host).header("Authorization", "Bearer " + token)).andReturn();
    }

    private JsonNode claims(String jwt) throws Exception {
        return mapper.readTree(Base64.getUrlDecoder().decode(jwt.split("\\.")[1]));
    }

    private String host(Organization org) {
        return org.getSubdomain() + ".kiwiply.com";
    }

    private Organization org(String tag, OrgAccountMode mode) {
        Organization o = fx.org(tag + "-" + sfx, OrgStatus.ACTIVE);
        o.setSubdomain(tag + sfx);
        o.setSubdomainEnabled(true);
        o.setAccountMode(mode);
        return orgs.saveAndFlush(o);
    }

    private User account(String login, String email, Long orgId) {
        User u = new User();
        u.setLogin(login);
        u.setEmail(email);
        u.setPassword(encoder.encode(PW));
        u.setActivated(true);
        u.setLangKey("en");
        u.setOrgId(orgId);
        Authority role = authorities.findById(AuthoritiesConstants.USER).orElseThrow();
        u.setAuthorities(new HashSet<>(Set.of(role)));
        return users.saveAndFlush(u);
    }

    private void setting(String key, String value) {
        rows.saveAndFlush(new AppSetting(key, value, WHO, Instant.now()));
        settings.invalidate();
        resolver.invalidate();
    }
}
