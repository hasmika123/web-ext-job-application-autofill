package com.dossier.api.web.rest.org;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.OrgAuditEvent;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.org.OrgAuditEventRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.MailService;
import com.dossier.api.service.ResumeBuilderSettingKeys;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.org.OrgAuditService;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;

/**
 * Employee onboarding with a temporary password: an Org Admin creates the account now (roles and team as the invitation form),
 * the person must change the password before anything else works, resets are limited to people still on a temporary password, the
 * role ceiling and the tenant wall hold, and an address that already has an account is invited instead (its password untouched).
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class OrgAccountResourceIT {

    @Autowired private MockMvc mockMvc;
    @Autowired private UserRepository users;
    @Autowired private OrganizationRepository orgs;
    @Autowired private OrgMemberRepository members;
    @Autowired private OrgAuditEventRepository audit;
    @Autowired private AppSettingRepository appSettings;
    @Autowired private ResumeBuilderSettings settings;
    @MockitoBean private MailService mail;

    private OrgFixtures fx;
    private String sfx;
    private Organization acme;
    private String owner;
    private String admin;

    @BeforeEach
    void seed() {
        fx = new OrgFixtures(users, orgs, members);
        sfx = UUID.randomUUID().toString().substring(0, 8);
        owner = "own-" + sfx;
        admin = "adm-" + sfx;
        acme = fx.org("acct-" + sfx, OrgStatus.ACTIVE);
        fx.active(acme, owner, OrgRole.OWNER);
        fx.active(acme, admin, OrgRole.ADMIN);
    }

    private String url(String tail) {
        return "/api/orgs/" + acme.getId() + "/members" + tail;
    }

    private ResultActions as(String login, org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder req, String json) throws Exception {
        return mockMvc.perform(req.with(user(login)).contentType(MediaType.APPLICATION_JSON).content(json));
    }

    private String email() {
        return "new." + UUID.randomUUID().toString().substring(0, 8) + "@example.test";
    }

    private static String read(ResultActions r, String path) throws Exception {
        return com.jayway.jsonpath.JsonPath.read(r.andReturn().getResponse().getContentAsString(), path);
    }

    private ResultActions signIn(String login, String password) throws Exception {
        Authentication before = org.springframework.security.test.context.TestSecurityContextHolder.getContext().getAuthentication();
        try {
            return mockMvc.perform(post("/api/authenticate").contentType(MediaType.APPLICATION_JSON).content("{\"username\":\"" + login + "\",\"password\":\"" + password + "\"}"));
        } finally {
            org.springframework.security.test.context.TestSecurityContextHolder.getContext().setAuthentication(before);
        }
    }

    @Test
    void anOrgAdminCreatesAnAccountNowAndTheNewPersonMustChangeThePasswordFirst() throws Exception {
        String suggested = read(mockMvc.perform(get(url("/temp-password")).with(user(admin))).andExpect(status().isOk()), "$.password");
        assertThat(suggested).hasSize(16);
        String email = email();

        ResultActions created = as(admin, post(url("/account")), "{\"email\":\"" + email + "\",\"fullName\":\"Priya Nair\",\"password\":\"" + suggested + "\",\"role\":\"MEMBER\"}")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.mode").value("ACCOUNT_CREATED"))
            .andExpect(jsonPath("$.tempPassword").doesNotExist()); // the caller already holds the one it sent
        long memberId = ((Number) com.jayway.jsonpath.JsonPath.read(created.andReturn().getResponse().getContentAsString(), "$.memberId")).longValue();

        User person = users.findOneByEmailIgnoreCase(email).orElseThrow();
        assertThat(person.isActivated()).isTrue();
        assertThat(person.isPasswordChangeRequired()).isTrue();
        assertThat(person.getPassword()).isNotEqualTo(suggested).startsWith("$2");
        OrgMember seat = members.findByOrgIdAndId(acme.getId(), memberId).orElseThrow();
        assertThat(seat.getStatus()).isEqualTo(OrgMemberStatus.ACTIVE);
        assertThat(seat.getUserId()).isEqualTo(person.getId());
        assertThat(seat.getRole()).isEqualTo(OrgRole.MEMBER);

        List<OrgAuditEvent> rows = audit.findByOrgIdAndAction(acme.getId(), OrgAuditService.MEMBER_ACCOUNT_CREATE, PageRequest.of(0, 5)).getContent();
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).getRisk()).isEqualTo("HIGH");
        assertThat(rows.get(0).getActorLogin()).isEqualTo(admin);
        assertThat(rows.get(0).getDetails()).contains(email).doesNotContain(suggested);

        // sign-in works, then every call but the password change is refused
        String tokens = signIn(person.getLogin(), suggested).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String access = com.jayway.jsonpath.JsonPath.read(tokens, "$.accessToken");
        String refresh = com.jayway.jsonpath.JsonPath.read(tokens, "$.refreshToken");
        mockMvc.perform(get("/api/orgs/" + acme.getId()).header("Authorization", "Bearer " + access)).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("PASSWORD_CHANGE_REQUIRED"));
        mockMvc.perform(get("/api/notifications").header("Authorization", "Bearer " + access)).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("PASSWORD_CHANGE_REQUIRED"));
        mockMvc.perform(get("/api/account").header("Authorization", "Bearer " + access)).andExpect(status().isOk());
        mockMvc
            .perform(post("/api/account/change-password").header("Authorization", "Bearer " + access).contentType(MediaType.APPLICATION_JSON).content("{\"currentPassword\":\"" + suggested + "\",\"newPassword\":\"Chosen-by-me-1!\"}"))
            .andExpect(status().isOk());
        assertThat(users.findOneByEmailIgnoreCase(email).orElseThrow().isPasswordChangeRequired()).isFalse();
        String clean = com.jayway.jsonpath.JsonPath.read(
            mockMvc.perform(post("/api/refresh").contentType(MediaType.APPLICATION_JSON).content("{\"refreshToken\":\"" + refresh + "\"}")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(),
            "$.accessToken"
        );
        mockMvc.perform(get("/api/profile/version").header("Authorization", "Bearer " + clean)).andExpect(status().isOk());
        signIn(person.getLogin(), suggested).andExpect(status().isUnauthorized());
    }

    @Test
    void withoutAPasswordTheServerGeneratesOneAndReturnsItOnce() throws Exception {
        String email = email();
        ResultActions r = as(admin, post(url("/account")), "{\"email\":\"" + email + "\",\"role\":\"MEMBER\"}").andExpect(status().isOk());
        String temp = read(r, "$.tempPassword");
        assertThat(temp).hasSize(16);
        signIn(users.findOneByEmailIgnoreCase(email).orElseThrow().getLogin(), temp).andExpect(status().isOk());
        assertThat(audit.findByOrgIdAndAction(acme.getId(), OrgAuditService.MEMBER_ACCOUNT_CREATE, PageRequest.of(0, 5)).getContent().get(0).getDetails()).doesNotContain(temp);
    }

    @Test
    void aPasswordThatBreaksThePolicyIsRefusedAndNothingIsCreated() throws Exception {
        String email = email();
        as(admin, post(url("/account")), "{\"email\":\"" + email + "\",\"password\":\"x\",\"role\":\"MEMBER\"}").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("ORG_INVALID"));
        assertThat(users.findOneByEmailIgnoreCase(email)).isEmpty();
    }

    @Test
    void anAddressThatAlreadyHasAnAccountIsInvitedAndItsPasswordIsNotTouched() throws Exception {
        User existing = fx.user("exist-" + sfx);
        String hash = existing.getPassword();
        ResultActions r = as(admin, post(url("/account")), "{\"email\":\"" + existing.getEmail() + "\",\"role\":\"MEMBER\"}").andExpect(status().isOk()).andExpect(jsonPath("$.mode").value("INVITED")).andExpect(jsonPath("$.tempPassword").doesNotExist());
        long seatId = ((Number) com.jayway.jsonpath.JsonPath.read(r.andReturn().getResponse().getContentAsString(), "$.memberId")).longValue();
        User after = users.findOneByLogin(existing.getLogin()).orElseThrow();
        assertThat(after.getPassword()).isEqualTo(hash);
        assertThat(after.isPasswordChangeRequired()).isFalse();
        assertThat(members.findByOrgIdAndId(acme.getId(), seatId).orElseThrow().getStatus()).isEqualTo(OrgMemberStatus.INVITED);
    }

    @Test
    void theRoleCeilingHoldsAndAnAddressThatIsAlreadyAMemberIsRefused() throws Exception {
        as(admin, post(url("/account")), "{\"email\":\"" + email() + "\",\"role\":\"OWNER\"}").andExpect(status().isUnprocessableEntity());
        User member = fx.user("mem-" + sfx);
        fx.active(acme, member.getLogin(), OrgRole.MEMBER);
        as(admin, post(url("/account")), "{\"email\":\"" + member.getEmail() + "\",\"role\":\"MEMBER\"}").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ALREADY_MEMBER"));
    }

    @Test
    void aPersonWithoutTheInvitePermissionAndAnotherTenantCannotCreateAccounts() throws Exception {
        String plain = "plain-" + sfx;
        fx.active(acme, plain, OrgRole.MEMBER);
        as(plain, post(url("/account")), "{\"email\":\"" + email() + "\",\"role\":\"MEMBER\"}").andExpect(status().isNotFound());
        Organization other = fx.org("other-acct-" + sfx, OrgStatus.ACTIVE);
        fx.active(other, "otherown-" + sfx, OrgRole.OWNER);
        as("otherown-" + sfx, post(url("/account")), "{\"email\":\"" + email() + "\",\"role\":\"MEMBER\"}").andExpect(status().isNotFound());
        mockMvc.perform(get(url("/temp-password")).with(user("otherown-" + sfx))).andExpect(status().isNotFound());
        assertThat(audit.findByOrgIdAndAction(acme.getId(), OrgAuditService.MEMBER_ACCOUNT_CREATE, PageRequest.of(0, 5)).getContent()).isEmpty();
    }

    @Test
    void creationAndResetsAreRateLimitedPerHour() throws Exception {
        appSettings.saveAndFlush(new AppSetting(ResumeBuilderSettingKeys.ORG_ACCOUNT_CREATE_PER_HOUR, "1", "test", Instant.now()));
        settings.invalidate();
        try {
            as(admin, post(url("/account")), "{\"email\":\"" + email() + "\",\"role\":\"MEMBER\"}").andExpect(status().isOk());
            as(admin, post(url("/account")), "{\"email\":\"" + email() + "\",\"role\":\"MEMBER\"}").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("ORG_LIMIT_REACHED"));
        } finally {
            appSettings.deleteById(ResumeBuilderSettingKeys.ORG_ACCOUNT_CREATE_PER_HOUR); // the test rolls back, but the settings cache does not
            appSettings.flush();
            settings.invalidate();
        }
    }

    @Test
    void resetIssuesANewTemporaryPasswordOnlyWhileThePersonHasNotChosenTheirOwn() throws Exception {
        String email = email();
        ResultActions r = as(admin, post(url("/account")), "{\"email\":\"" + email + "\",\"role\":\"MEMBER\"}").andExpect(status().isOk());
        String first = read(r, "$.tempPassword");
        long memberId = ((Number) com.jayway.jsonpath.JsonPath.read(r.andReturn().getResponse().getContentAsString(), "$.memberId")).longValue();
        User person = users.findOneByEmailIgnoreCase(email).orElseThrow();

        as(admin, post(url("/" + memberId + "/reset-password")), "{\"reason\":\"short\"}").andExpect(status().isUnprocessableEntity());
        String second = read(as(admin, post(url("/" + memberId + "/reset-password")), "{\"reason\":\"Lost the first password\"}").andExpect(status().isOk()), "$.tempPassword");
        assertThat(second).hasSize(16).isNotEqualTo(first);
        signIn(person.getLogin(), first).andExpect(status().isUnauthorized());
        signIn(person.getLogin(), second).andExpect(status().isOk());
        List<OrgAuditEvent> rows = audit.findByOrgIdAndAction(acme.getId(), OrgAuditService.MEMBER_PASSWORD_RESET, PageRequest.of(0, 5)).getContent();
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).getRisk()).isEqualTo("HIGH");
        assertThat(rows.get(0).getDetails()).doesNotContain(first).doesNotContain(second);

        // an ordinary member who set their own password, the owner, and the caller's own seat are all out of reach
        User chosen = users.findOneByEmailIgnoreCase(email).orElseThrow();
        chosen.setPasswordChangeRequired(false);
        users.saveAndFlush(chosen);
        as(admin, post(url("/" + memberId + "/reset-password")), "{\"reason\":\"Lost the first password\"}").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PASSWORD_ALREADY_SET"));
        OrgMember ownerSeat = members.findByOrgIdAndUserIdAndStatusIn(acme.getId(), users.findOneByLogin(owner).orElseThrow().getId(), List.of(OrgMemberStatus.ACTIVE)).get(0);
        as(admin, post(url("/" + ownerSeat.getId() + "/reset-password")), "{\"reason\":\"Trying to reset the owner\"}").andExpect(status().isNotFound());
        OrgMember self = members.findByOrgIdAndUserIdAndStatusIn(acme.getId(), users.findOneByLogin(admin).orElseThrow().getId(), List.of(OrgMemberStatus.ACTIVE)).get(0);
        as(admin, post(url("/" + self.getId() + "/reset-password")), "{\"reason\":\"Trying to reset myself\"}").andExpect(status().isNotFound());
    }
}
