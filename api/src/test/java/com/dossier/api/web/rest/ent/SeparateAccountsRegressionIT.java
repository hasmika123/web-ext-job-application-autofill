package com.dossier.api.web.rest.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.Authority;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.OrgAccountMode;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.org.OrgMember;
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
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

/**
 * The regression pack of decision O4 (docs/enterprise-v2/19 phase S10): the whole separate-accounts model walked end to end through the HTTP API, so a future
 * change cannot silently break it. A Gamma-like world: the platform admin creates an organization (the owner is a NEW enterprise account), the owner is forced
 * to change the temporary password, the owner creates an employee, the employee signs in and changes the password, the personal accounts that share the
 * addresses of the owner and the employee are untouched and still sign in on the platform host only, the owner offboards the employee, and every token of the
 * employee is refused while the personal account keeps working. At the end the invariants of the model still hold (no count rose).
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class SeparateAccountsRegressionIT {

    private static final String HOST = "X-Kiwiply-Host";
    private static final String PLATFORM = "kiwiply.com";
    private static final String PERSONAL_PW = "Personal-pass-1";
    private static final String WHO = "separate-accounts-regression-it";

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper mapper;
    @Autowired private UserRepository users;
    @Autowired private AuthorityRepository authorities;
    @Autowired private OrganizationRepository orgs;
    @Autowired private OrgMemberRepository members;
    @Autowired private AppSettingRepository rows;
    @Autowired private ResumeBuilderSettings settings;
    @Autowired private TenantResolver resolver;
    @Autowired private PasswordEncoder encoder;
    @MockitoBean private MailService mail;

    private String sfx;

    @BeforeEach
    void flags() {
        sfx = UUID.randomUUID().toString().substring(0, 8);
        setting(EnterpriseSettingKeys.FLAG_ENTERPRISE, "{\"on\":true}");
        setting(EnterpriseSettingKeys.FLAG_DOMAINS, "{\"on\":true}");
        setting(EnterpriseSettingKeys.SEPARATE_ACCOUNTS, "true");
    }

    @AfterEach
    void forget() {
        settings.invalidate();
        resolver.invalidate();
    }

    private void setting(String key, String value) {
        rows.saveAndFlush(new AppSetting(key, value, WHO, Instant.now()));
        settings.invalidate();
        resolver.invalidate();
    }

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

    private JsonNode json(MvcResult r) throws Exception {
        return mapper.readTree(r.getResponse().getContentAsString());
    }

    private MvcResult login(String host, String username, String password) throws Exception {
        MockHttpServletRequestBuilder req = post("/api/authenticate").contentType(MediaType.APPLICATION_JSON).content("{\"username\":\"" + username + "\",\"password\":\"" + password + "\"}");
        if (host != null) req = req.header(HOST, host);
        return mockMvc.perform(req).andReturn();
    }

    private JsonNode signIn(String host, String email, String password) throws Exception {
        MvcResult r = login(host, email, password);
        assertThat(r.getResponse().getStatus()).as(host + " sign-in " + r.getResponse().getContentAsString()).isEqualTo(200);
        return json(r);
    }

    private JsonNode claims(JsonNode pair) throws Exception {
        return mapper.readTree(Base64.getUrlDecoder().decode(pair.get("accessToken").asText().split("\\.")[1]));
    }

    private MvcResult call(MockHttpServletRequestBuilder req, String host, String token) throws Exception {
        if (host != null) req = req.header(HOST, host);
        if (token != null) req = req.header("Authorization", "Bearer " + token);
        return mockMvc.perform(req).andReturn();
    }

    private MvcResult changePassword(String host, String token, String current, String next) throws Exception {
        return call(post("/api/account/change-password").contentType(MediaType.APPLICATION_JSON).content("{\"currentPassword\":\"" + current + "\",\"newPassword\":\"" + next + "\"}"), host, token);
    }

    private long violations() throws Exception {
        MvcResult r = mockMvc.perform(get("/api/admin/enterprise-accounts/health").with(user("admin").roles("ADMIN"))).andReturn();
        assertThat(r.getResponse().getStatus()).isEqualTo(200);
        return json(r).get("totalViolations").asLong();
    }

    private void assertPersonalUntouched(User before, String hash) {
        User after = users.findById(before.getId()).orElseThrow();
        assertThat(after.getPassword()).isEqualTo(hash);
        assertThat(after.getOrgId()).isNull();
        assertThat(after.getLogin()).isEqualTo(before.getLogin());
        assertThat(after.isActivated()).isTrue();
        assertThat(after.isPasswordChangeRequired()).isFalse();
        assertThat(members.findMine(after.getId())).as("a personal account never holds an organization seat").isEmpty();
    }

    @Test
    void theWholeSeparateAccountsModelHoldsFromTheOwnerToTheOffboarding() throws Exception {
        long violationsBefore = violations();
        String ownerEmail = "gina." + sfx + "@gamma-reg.test";
        String employeeEmail = "dana." + sfx + "@gamma-reg.test";
        User ownerTwin = personal(ownerEmail);
        User employeeTwin = personal(employeeEmail);
        String ownerTwinHash = ownerTwin.getPassword();
        String employeeTwinHash = employeeTwin.getPassword();

        // 1. the platform admin creates the organization: the owner is a NEW enterprise account, never the personal twin
        MvcResult created = mockMvc
            .perform(
                post("/api/admin/orgs").with(user("admin").roles("ADMIN")).contentType(MediaType.APPLICATION_JSON)
                    .content("{\"name\":\"Gamma " + sfx + "\",\"label\":\"gamma" + sfx + "\",\"type\":\"STAFFING\",\"ownerEmail\":\"" + ownerEmail + "\",\"ownerName\":\"Gina Alvarez\"}")
            )
            .andReturn();
        assertThat(created.getResponse().getStatus()).as(created.getResponse().getContentAsString()).isEqualTo(201);
        JsonNode org = json(created);
        Long orgId = org.get("id").asLong();
        String host = org.get("host").asText();
        String ownerTemp = org.get("tempPassword").asText();
        assertThat(org.get("ownerAccount").asText()).isEqualTo("CREATED");
        resolver.invalidate();
        assertThat(orgs.findByOrgId(orgId).orElseThrow().getAccountMode()).isEqualTo(OrgAccountMode.SEPARATE);
        User owner = users.findOneByOrgIdAndEmailIgnoreCase(orgId, ownerEmail).orElseThrow();
        assertThat(owner.getId()).isNotEqualTo(ownerTwin.getId());
        assertThat(owner.getLogin()).startsWith("ent#" + orgId + "#");

        // 2. the owner signs in on the tenant host with the temporary password and is forced to change it first
        JsonNode first = signIn(host, ownerEmail, ownerTemp);
        assertThat(claims(first).get("tid").asLong()).isEqualTo(orgId);
        assertThat(claims(first).get("pcr").asBoolean()).isTrue();
        String firstToken = first.get("accessToken").asText();
        assertThat(call(get("/api/orgs/" + orgId + "/members"), host, firstToken).getResponse().getStatus()).as("everything but the password change is refused").isEqualTo(403);
        assertThat(changePassword(host, firstToken, ownerTemp, "Owner-chosen-1!").getResponse().getStatus()).isEqualTo(200);
        assertThat(login(host, ownerEmail, ownerTemp).getResponse().getStatus()).isEqualTo(401);
        JsonNode ownerPair = signIn(host, ownerEmail, "Owner-chosen-1!");
        String ownerToken = ownerPair.get("accessToken").asText();
        assertThat(claims(ownerPair).has("pcr") && claims(ownerPair).get("pcr").asBoolean()).isFalse();

        // 3. the owner creates an employee whose address also belongs to a personal account: still a NEW enterprise account, same response shape as any address
        MvcResult employee = call(
            post("/api/orgs/" + orgId + "/members/account").header("Idempotency-Key", UUID.randomUUID().toString()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"" + employeeEmail + "\",\"fullName\":\"Dana Moreau\",\"role\":\"MEMBER\"}"),
            host, ownerToken
        );
        assertThat(employee.getResponse().getStatus()).as(employee.getResponse().getContentAsString()).isEqualTo(200);
        JsonNode made = json(employee);
        assertThat(made.get("mode").asText()).isEqualTo("ACCOUNT_CREATED");
        String employeeTemp = made.get("tempPassword").asText();
        User employeeAccount = users.findOneByOrgIdAndEmailIgnoreCase(orgId, employeeEmail).orElseThrow();
        assertThat(employeeAccount.getId()).isNotEqualTo(employeeTwin.getId());
        assertThat(employeeAccount.getLogin()).startsWith("ent#" + orgId + "#");

        // 4. the employee signs in on the tenant host, changes the temporary password, and works
        JsonNode eFirst = signIn(host, employeeEmail, employeeTemp);
        assertThat(claims(eFirst).get("tid").asLong()).isEqualTo(orgId);
        assertThat(changePassword(host, eFirst.get("accessToken").asText(), employeeTemp, "Employee-chosen-1!").getResponse().getStatus()).isEqualTo(200);
        JsonNode employeePair = signIn(host, employeeEmail, "Employee-chosen-1!");
        assertThat(call(get("/api/account"), host, employeePair.get("accessToken").asText()).getResponse().getStatus()).isEqualTo(200);

        // 5. the worlds do not meet: each password opens its own host only; the personal twins are untouched and sign in on the platform host
        assertThat(login(host, employeeEmail, PERSONAL_PW).getResponse().getStatus()).as("personal password on the tenant host").isEqualTo(401);
        assertThat(login(PLATFORM, employeeEmail, "Employee-chosen-1!").getResponse().getStatus()).as("enterprise password on the platform").isEqualTo(401);
        assertThat(login(PLATFORM, ownerEmail, "Owner-chosen-1!").getResponse().getStatus()).isEqualTo(401);
        JsonNode twinPair = signIn(PLATFORM, employeeEmail, PERSONAL_PW);
        assertThat(claims(twinPair).has("tid")).isFalse();
        assertThat(claims(twinPair).get("sub").asText()).isEqualTo(employeeTwin.getLogin());
        assertThat(signIn(PLATFORM, ownerEmail, PERSONAL_PW).get("accessToken").asText()).isNotBlank();
        assertPersonalUntouched(ownerTwin, ownerTwinHash);
        assertPersonalUntouched(employeeTwin, employeeTwinHash);
        assertThat(call(get("/api/orgs/" + orgId + "/members"), PLATFORM, twinPair.get("accessToken").asText()).getResponse().getStatus()).as("a personal token reaches no organization route").isIn(401, 403, 404);

        // 6. the owner offboards the employee
        OrgMember seat = members.findByOrgIdAndUserIdAndStatusIn(orgId, employeeAccount.getId(), List.of(OrgMemberStatus.ACTIVE)).get(0);
        MvcResult off = call(
            post("/api/orgs/" + orgId + "/members/" + seat.getId() + "/offboard").header("Idempotency-Key", UUID.randomUUID().toString()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"reason\":\"Contract ended\",\"confirm\":\"Dana Moreau\"}"),
            host, ownerToken
        );
        assertThat(off.getResponse().getStatus()).as(off.getResponse().getContentAsString()).isEqualTo(200);

        // 7. every token of the employee is refused, sign-in is refused, and the personal twin keeps working
        MvcResult stale = call(get("/api/account"), host, employeePair.get("accessToken").asText());
        assertThat(stale.getResponse().getStatus()).isEqualTo(401);
        assertThat(stale.getResponse().getContentAsString()).contains("TOKEN_ACCOUNT_DISABLED");
        MvcResult refresh = call(post("/api/refresh").contentType(MediaType.APPLICATION_JSON).content("{\"refreshToken\":\"" + employeePair.get("refreshToken").asText() + "\"}"), host, null);
        assertThat(refresh.getResponse().getStatus()).isEqualTo(401);
        MvcResult again = login(host, employeeEmail, "Employee-chosen-1!");
        assertThat(again.getResponse().getStatus()).isEqualTo(403);
        assertThat(again.getResponse().getContentAsString()).contains("NOT_A_MEMBER");
        assertThat(call(get("/api/account"), PLATFORM, twinPair.get("accessToken").asText()).getResponse().getStatus()).isEqualTo(200);
        assertThat(signIn(PLATFORM, employeeEmail, PERSONAL_PW).get("accessToken").asText()).isNotBlank();
        assertPersonalUntouched(employeeTwin, employeeTwinHash);
        // the owner is unaffected
        assertThat(call(get("/api/account"), host, ownerToken).getResponse().getStatus()).isEqualTo(200);

        // 8. the invariants of the model still hold after the whole walk
        assertThat(violations()).as("no invariant of the separate-accounts model was broken by the flow").isEqualTo(violationsBefore);
    }
}
