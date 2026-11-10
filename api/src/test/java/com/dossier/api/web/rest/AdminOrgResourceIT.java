package com.dossier.api.web.rest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AdminAuditEvent;
import com.dossier.api.domain.AppSettingHistory;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.OrgAuditEvent;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.AdminAuditEventRepository;
import com.dossier.api.repository.AppSettingHistoryRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.org.OrgAuditEventRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.ent.TenantContext;
import com.dossier.api.service.ent.TenantResolver;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.web.rest.org.OrgFixtures;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;

/**
 * X1.11: the platform admin's Organizations API. ROLE_ADMIN only; provisioning, the enterprise switch and hostname suspension
 * each write one admin audit row and one HIGH row in the tenant's own trail, and the real {@link TenantResolver} answers for the
 * hostname afterwards. (The resolver's cache is evicted after COMMIT, which a rolled-back test never reaches, so the tests drop it
 * by hand before each resolution; the eviction itself is covered in {@code OrgTenancyServiceTest}.)
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class AdminOrgResourceIT {

    private static final String ADMIN = "admin";

    @Autowired private MockMvc mockMvc;
    @Autowired private OrganizationRepository orgs;
    @Autowired private OrgMemberRepository members;
    @Autowired private UserRepository users;
    @Autowired private OrgAuditEventRepository orgAudit;
    @Autowired private AdminAuditEventRepository adminAudit;
    @Autowired private AppSettingHistoryRepository settingHistory;
    @Autowired private TenantResolver resolver;

    private OrgFixtures fx;
    private Organization acme;

    @BeforeEach
    void seed() {
        fx = new OrgFixtures(users, orgs, members);
        acme = fx.org("acme-it-" + System.nanoTime(), OrgStatus.ACTIVE);
        fx.active(acme, "acme-it-owner-" + System.nanoTime(), OrgRole.OWNER);
    }

    private ResultActions postJson(String path, String body) throws Exception {
        return mockMvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private long adminRows(String action, Long orgId) {
        return adminAudit.findAll().stream().filter(e -> action.equals(e.getAction()) && String.valueOf(orgId).equals(e.getTargetId())).count();
    }

    private List<OrgAuditEvent> orgRows(Long orgId, String action) {
        return orgAudit.findByOrgIdAndAction(orgId, action, PageRequest.of(0, 20)).getContent();
    }

    /** The base domain addresses are provisioned under here (kiwiply.com, or localhost when development hosts are configured). */
    private String base() throws Exception {
        String host = com.jayway.jsonpath.JsonPath.read(mockMvc.perform(get("/api/admin/orgs/label-check").param("label", "probe-label")).andReturn().getResponse().getContentAsString(), "$.host");
        return host.substring(host.indexOf('.') + 1);
    }

    private TenantContext resolve(String host) {
        resolver.invalidate();
        return resolver.resolve(host);
    }

    @Test
    @WithMockUser(username = "leak", authorities = AuthoritiesConstants.USER)
    void aNormalUserIsForbiddenEverywhere() throws Exception {
        mockMvc.perform(get("/api/admin/orgs")).andExpect(status().isForbidden());
        mockMvc.perform(get("/api/admin/orgs/" + acme.getId())).andExpect(status().isForbidden());
        postJson("/api/admin/orgs/" + acme.getId() + "/hostnames/subdomain", "{\"label\":\"nope-it\"}").andExpect(status().isForbidden());
        postJson("/api/admin/orgs/" + acme.getId() + "/enterprise", "{\"on\":true,\"reason\":\"not allowed here\"}").andExpect(status().isForbidden());
        postJson("/api/admin/orgs", "{\"name\":\"X Corp\",\"type\":\"COMPANY\",\"ownerEmail\":\"o@example.test\"}").andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser(username = ADMIN, authorities = AuthoritiesConstants.ADMIN)
    void listsFiltersAndPagesWithHeadersAndASummary() throws Exception {
        mockMvc
            .perform(get("/api/admin/orgs").param("search", acme.getName()))
            .andExpect(status().isOk())
            .andExpect(header().exists("X-Total-Count"))
            .andExpect(jsonPath("$.length()").value(1))
            .andExpect(jsonPath("$[0].id").value(acme.getId()))
            .andExpect(jsonPath("$[0].memberCount").value(1))
            .andExpect(jsonPath("$[0].enterpriseOn").value(false));
        mockMvc.perform(get("/api/admin/orgs").param("search", acme.getName()).param("status", "CLOSED")).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
        mockMvc.perform(get("/api/admin/orgs").param("search", acme.getName()).param("type", "BOGUS")).andExpect(status().isUnprocessableEntity());
        mockMvc.perform(get("/api/admin/orgs").param("search", acme.getName()).param("enterprise", "true")).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
        mockMvc.perform(get("/api/admin/orgs").param("size", "1")).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1));
        mockMvc.perform(get("/api/admin/orgs/summary")).andExpect(status().isOk()).andExpect(jsonPath("$.orgs").isNumber()).andExpect(jsonPath("$.pending").isNumber());
    }

    @Test
    @WithMockUser(username = ADMIN, authorities = AuthoritiesConstants.ADMIN)
    void theDetailCarriesCountsAndHostnamesButNoMemberData() throws Exception {
        String body = mockMvc
            .perform(get("/api/admin/orgs/" + acme.getId()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(acme.getId()))
            .andExpect(jsonPath("$.memberCount").value(1))
            .andExpect(jsonPath("$.pendingInvites").value(0))
            .andExpect(jsonPath("$.enterprise.on").value(false))
            .andExpect(jsonPath("$.hostnames.length()").value(0))
            .andReturn()
            .getResponse()
            .getContentAsString();
        assertThat(body).doesNotContain("acme-it-owner").doesNotContain("email").doesNotContain("login\"");
        mockMvc.perform(get("/api/admin/orgs/" + Long.MAX_VALUE)).andExpect(status().isNotFound());
    }

    @Test
    @WithMockUser(username = ADMIN, authorities = AuthoritiesConstants.ADMIN)
    void provisioningASubdomainMakesTheHostResolveAndAuditsOnceEachWay() throws Exception {
        String label = "acme" + System.nanoTime();
        String host = label + "." + base();
        postJson("/api/admin/orgs/" + acme.getId() + "/enterprise", "{\"on\":true,\"reason\":\"pilot customer onboarding\"}").andExpect(status().isOk());
        int before = orgs.findByOrgId(acme.getId()).orElseThrow().getConfigVersion();

        postJson("/api/admin/orgs/" + acme.getId() + "/hostnames/subdomain", "{\"label\":\"" + label.toUpperCase() + "\"}")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.subdomain").value(label))
            .andExpect(jsonPath("$.subdomainEnabled").value(true))
            .andExpect(jsonPath("$.hostnames.length()").value(1))
            .andExpect(jsonPath("$.hostnames[0].hostname").value(host))
            .andExpect(jsonPath("$.hostnames[0].status").value("ACTIVE"))
            .andExpect(jsonPath("$.hostnames[0].primary").value(true))
            .andExpect(jsonPath("$.audit[0].action").value("ADMIN_SUBDOMAIN_PROVISION"))
            .andExpect(jsonPath("$.audit[0].risk").value("HIGH"));

        assertThat(orgs.findByOrgId(acme.getId()).orElseThrow().getConfigVersion()).isGreaterThan(before);
        TenantContext ctx = resolve(host);
        assertThat(ctx.isTenant()).isTrue();
        assertThat(ctx.orgId()).isEqualTo(acme.getId());

        assertThat(adminRows("ORG_SUBDOMAIN_PROVISION", acme.getId())).isEqualTo(1);
        List<OrgAuditEvent> rows = orgRows(acme.getId(), OrgAuditService.ADMIN_SUBDOMAIN_PROVISION);
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).getActorLogin()).isEqualTo(ADMIN);
        assertThat(rows.get(0).getRisk()).isEqualTo("HIGH");
        assertThat(rows.get(0).getHostnameId()).isNotNull();

        postJson("/api/admin/orgs/" + acme.getId() + "/hostnames/subdomain", "{\"label\":\"" + label + "\"}").andExpect(status().isOk()).andExpect(jsonPath("$.hostnames.length()").value(1)); // idempotent
    }

    @Test
    @WithMockUser(username = ADMIN, authorities = AuthoritiesConstants.ADMIN)
    void aReservedLabelIs422AndATakenOneIs409WithASuggestionAndNothingChanges() throws Exception {
        Organization other = fx.org("other-it-" + System.nanoTime(), OrgStatus.ACTIVE);
        String taken = "taken" + System.nanoTime();
        postJson("/api/admin/orgs/" + other.getId() + "/hostnames/subdomain", "{\"label\":\"" + taken + "\"}").andExpect(status().isOk());
        long before = orgAudit.countByOrgId(acme.getId());

        postJson("/api/admin/orgs/" + acme.getId() + "/hostnames/subdomain", "{\"label\":\"api\"}").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("RESERVED_VALUE"));
        postJson("/api/admin/orgs/" + acme.getId() + "/hostnames/subdomain", "{\"label\":\"" + taken + "\"}")
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("SLUG_TAKEN"))
            .andExpect(jsonPath("$.suggestion").value(taken + "-2"));
        postJson("/api/admin/orgs/" + acme.getId() + "/hostnames/subdomain", "{\"label\":\"-bad-\"}").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("ORG_INVALID"));

        assertThat(orgAudit.countByOrgId(acme.getId())).isEqualTo(before);
        assertThat(orgs.findByOrgId(acme.getId()).orElseThrow().getSubdomain()).isNull();
        assertThat(adminRows("ORG_SUBDOMAIN_PROVISION", acme.getId())).isZero();
    }

    @Test
    @WithMockUser(username = ADMIN, authorities = AuthoritiesConstants.ADMIN)
    void theLiveLabelCheckSaysReservedTakenOrFree() throws Exception {
        String taken = "chk" + System.nanoTime();
        Organization other = fx.org("chk-it-" + System.nanoTime(), OrgStatus.ACTIVE);
        postJson("/api/admin/orgs/" + other.getId() + "/hostnames/subdomain", "{\"label\":\"" + taken + "\"}").andExpect(status().isOk());

        mockMvc.perform(get("/api/admin/orgs/label-check").param("label", "www").param("orgId", String.valueOf(acme.getId()))).andExpect(jsonPath("$.reserved").value(true)).andExpect(jsonPath("$.valid").value(false));
        mockMvc.perform(get("/api/admin/orgs/label-check").param("label", taken).param("orgId", String.valueOf(acme.getId()))).andExpect(jsonPath("$.taken").value(true)).andExpect(jsonPath("$.suggestion").value(taken + "-2"));
        mockMvc.perform(get("/api/admin/orgs/label-check").param("label", taken).param("orgId", String.valueOf(other.getId()))).andExpect(jsonPath("$.valid").value(true)); // its own label
        mockMvc.perform(get("/api/admin/orgs/label-check").param("label", "free" + System.nanoTime())).andExpect(jsonPath("$.valid").value(true)).andExpect(jsonPath("$.host").isNotEmpty());
        mockMvc.perform(get("/api/admin/orgs/label-check").param("label", "x")).andExpect(jsonPath("$.valid").value(false)).andExpect(jsonPath("$.reserved").value(false));
    }

    @Test
    @WithMockUser(username = ADMIN, authorities = AuthoritiesConstants.ADMIN)
    void theEnterpriseSwitchEditsTheAllowListWithAReasonAndAuditsIt() throws Exception {
        long before = orgAudit.countByOrgId(acme.getId());
        postJson("/api/admin/orgs/" + acme.getId() + "/enterprise", "{\"on\":true,\"reason\":\"short\"}").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("ORG_INVALID"));
        assertThat(orgAudit.countByOrgId(acme.getId())).isEqualTo(before);

        postJson("/api/admin/orgs/" + acme.getId() + "/enterprise", "{\"on\":true,\"reason\":\"Acme signed the order form\"}")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.enterprise.on").value(true))
            .andExpect(jsonPath("$.enterprise.allowListed").value(true))
            .andExpect(jsonPath("$.enterprise.masterOn").value(true));
        List<AppSettingHistory> history = settingHistory.findByKeyOrderByIdDesc("flag.enterprise", PageRequest.of(0, 1));
        assertThat(history.get(0).getReason()).isEqualTo("Acme signed the order form");
        assertThat(history.get(0).getNewValue()).contains(String.valueOf(acme.getId()));
        assertThat(adminRows("ORG_ENTERPRISE_SET", acme.getId())).isEqualTo(1);
        List<OrgAuditEvent> on = orgRows(acme.getId(), OrgAuditService.ADMIN_ENTERPRISE_ON);
        assertThat(on).hasSize(1);
        assertThat(on.get(0).getRisk()).isEqualTo("HIGH");
        assertThat(on.get(0).getActorLogin()).isEqualTo(ADMIN);

        postJson("/api/admin/orgs/" + acme.getId() + "/enterprise", "{\"on\":false,\"reason\":\"Pilot ended by the customer\"}")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.enterprise.on").value(false))
            .andExpect(jsonPath("$.enterprise.allowListed").value(false))
            .andExpect(jsonPath("$.enterprise.on").value(false)); // whatever else the flag holds, this organization is out
        assertThat(settingHistory.findByKeyOrderByIdDesc("flag.enterprise", PageRequest.of(0, 1)).get(0).getNewValue()).doesNotContain("\"allow\":[" + acme.getId());
        assertThat(orgRows(acme.getId(), OrgAuditService.ADMIN_ENTERPRISE_OFF)).hasSize(1);
    }

    @Test
    @WithMockUser(username = ADMIN, authorities = AuthoritiesConstants.ADMIN)
    void theModuleSwitchesEditTheirOwnAllowListWithAReasonAndAuditIt() throws Exception {
        postJson("/api/admin/orgs/" + acme.getId() + "/enterprise", "{\"on\":true,\"reason\":\"Pilot customer onboarding\"}").andExpect(status().isOk());
        mockMvc.perform(get("/api/admin/orgs/" + acme.getId())).andExpect(jsonPath("$.modules.length()").value(4)).andExpect(jsonPath("$.modules[?(@.key=='roles')].allowListed").value(false));
        long before = orgAudit.countByOrgId(acme.getId());
        postJson("/api/admin/orgs/" + acme.getId() + "/modules", "{\"key\":\"roles\",\"on\":true,\"reason\":\"short\"}").andExpect(status().isUnprocessableEntity());
        postJson("/api/admin/orgs/" + acme.getId() + "/modules", "{\"key\":\"nonsense\",\"on\":true,\"reason\":\"Needed for the pilot\"}").andExpect(status().isUnprocessableEntity());
        assertThat(orgAudit.countByOrgId(acme.getId())).isEqualTo(before);
        postJson("/api/admin/orgs/" + acme.getId() + "/modules", "{\"key\":\"roles\",\"on\":true,\"reason\":\"Needed for the pilot\"}")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.modules[?(@.key=='roles')].on").value(true))
            .andExpect(jsonPath("$.modules[?(@.key=='roles')].allowListed").value(true))
            .andExpect(jsonPath("$.modules[?(@.key=='marketing')].allowListed").value(false));
        assertThat(settingHistory.findByKeyOrderByIdDesc("flag.enterprise.roles", PageRequest.of(0, 1)).get(0).getReason()).isEqualTo("Needed for the pilot");
        assertThat(adminRows("ORG_MODULE_SET", acme.getId())).isEqualTo(1);
        assertThat(orgRows(acme.getId(), OrgAuditService.ADMIN_MODULE_ON)).hasSize(1).allMatch(e -> "HIGH".equals(e.getRisk()));
        postJson("/api/admin/orgs/" + acme.getId() + "/modules", "{\"key\":\"roles\",\"on\":false,\"reason\":\"Pilot over for this module\"}")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.modules[?(@.key=='roles')].allowListed").value(false));
        assertThat(orgRows(acme.getId(), OrgAuditService.ADMIN_MODULE_OFF)).hasSize(1);
    }

    @Test
    @WithMockUser(username = ADMIN, authorities = AuthoritiesConstants.ADMIN)
    void suspendingAHostnameMakesItUnknownAtOnceAndResumeRestoresIt() throws Exception {
        String label = "susp" + System.nanoTime();
        String host = label + "." + base();
        postJson("/api/admin/orgs/" + acme.getId() + "/enterprise", "{\"on\":true,\"reason\":\"pilot customer onboarding\"}").andExpect(status().isOk());
        String body = postJson("/api/admin/orgs/" + acme.getId() + "/hostnames/subdomain", "{\"label\":\"" + label + "\"}").andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        long hid = ((Number) com.jayway.jsonpath.JsonPath.read(body, "$.hostnames[0].id")).longValue();
        assertThat(resolve(host).isTenant()).isTrue();

        postJson("/api/admin/orgs/" + acme.getId() + "/hostnames/" + hid + "/suspend", "{\"reason\":\"short\"}").andExpect(status().isUnprocessableEntity());
        postJson("/api/admin/orgs/" + acme.getId() + "/hostnames/" + hid + "/suspend", "{\"reason\":\"Payment dispute under review\"}")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.hostnames[0].status").value("SUSPENDED"));
        assertThat(resolve(host).isTenant()).isFalse();
        postJson("/api/admin/orgs/" + acme.getId() + "/hostnames/" + hid + "/suspend", "{\"reason\":\"Payment dispute under review\"}").andExpect(status().isConflict());

        postJson("/api/admin/orgs/" + acme.getId() + "/hostnames/" + hid + "/resume", "{\"reason\":\"Dispute resolved in our favour\"}")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.hostnames[0].status").value("ACTIVE"));
        assertThat(resolve(host).isTenant()).isTrue();

        assertThat(adminRows("ORG_HOSTNAME_SUSPEND", acme.getId())).isEqualTo(1);
        assertThat(adminRows("ORG_HOSTNAME_RESUME", acme.getId())).isEqualTo(1);
        assertThat(orgRows(acme.getId(), OrgAuditService.ADMIN_HOSTNAME_SUSPEND)).hasSize(1).allMatch(e -> "HIGH".equals(e.getRisk()) && ADMIN.equals(e.getActorLogin()));
        assertThat(orgRows(acme.getId(), OrgAuditService.ADMIN_HOSTNAME_RESUME)).hasSize(1);

        Organization other = fx.org("foreign-it-" + System.nanoTime(), OrgStatus.ACTIVE);
        postJson("/api/admin/orgs/" + other.getId() + "/hostnames/" + hid + "/suspend", "{\"reason\":\"Wrong organization on purpose\"}").andExpect(status().isNotFound());
    }


    private String created(String label, String email, String name) throws Exception {
        return postJson("/api/admin/orgs", "{\"name\":\"Newco Staffing\",\"label\":\"" + label + "\",\"type\":\"STAFFING\",\"ownerEmail\":\"" + email + "\",\"ownerName\":\"" + name + "\"}")
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();
    }

    private static String read(String json, String path) {
        return com.jayway.jsonpath.JsonPath.read(json, path);
    }

    @Test
    @WithMockUser(username = ADMIN, authorities = AuthoritiesConstants.ADMIN)
    void creatingAnOrganizationProvisionsItAndCreatesItsOwnerWithAOneTimeTemporaryPassword() throws Exception {
        String label = "newco" + System.nanoTime();
        String email = "owner." + System.nanoTime() + "@example.test";
        String body = created(label, email, "Olivia Owner");
        long id = ((Number) com.jayway.jsonpath.JsonPath.read(body, "$.id")).longValue();
        String temp = read(body, "$.tempPassword");
        assertThat(read(body, "$.host")).isEqualTo(label + "." + base());
        assertThat(read(body, "$.ownerAccount")).isEqualTo("CREATED");
        assertThat(temp).hasSize(16);

        Organization org = orgs.findByOrgId(id).orElseThrow();
        assertThat(org.getStatus()).isEqualTo(OrgStatus.ACTIVE);
        assertThat(org.getSubdomain()).isEqualTo(label);
        assertThat(org.isSubdomainEnabled()).isTrue();

        User owner = users.findOneByOrgIdIsNullAndEmailIgnoreCase(email).orElseThrow();
        assertThat(owner.isActivated()).isTrue();
        assertThat(owner.isPasswordChangeRequired()).isTrue();
        assertThat(owner.getPasswordTempExpiresAt()).isAfter(Instant.now().plus(6, ChronoUnit.DAYS)).isBefore(Instant.now().plus(8, ChronoUnit.DAYS));
        assertThat(owner.getPassword()).isNotEqualTo(temp).startsWith("$2"); // stored hashed only
        List<OrgMember> seats = members.findByOrgIdAndUserIdAndStatusIn(id, owner.getId(), List.of(OrgMemberStatus.ACTIVE));
        assertThat(seats).hasSize(1);
        assertThat(seats.get(0).getRole()).isEqualTo(OrgRole.OWNER);

        assertThat(adminRows("ORG_CREATE", id)).isEqualTo(1);
        List<OrgAuditEvent> rows = orgRows(id, OrgAuditService.ADMIN_ORG_CREATE);
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).getRisk()).isEqualTo("HIGH");
        assertThat(rows.get(0).getDetails()).contains(email).doesNotContain(temp);
        for (AdminAuditEvent e : adminAudit.findAll()) assertThat(String.valueOf(e.getDetails()) + e.getReason()).doesNotContain(temp);

        String detail = mockMvc.perform(get("/api/admin/orgs/" + id)).andExpect(jsonPath("$.memberCount").value(1)).andReturn().getResponse().getContentAsString();
        assertThat(detail).doesNotContain(temp).doesNotContain("tempPassword");
    }

    @Test
    @WithMockUser(username = ADMIN, authorities = AuthoritiesConstants.ADMIN)
    void anExistingAccountIsAttachedAsOwnerAndItsPasswordIsNotTouched() throws Exception {
        User existing = fx.user("exist-" + System.nanoTime());
        String hashBefore = existing.getPassword();
        String body = created("exist" + System.nanoTime(), existing.getEmail(), "Someone Else");
        long id = ((Number) com.jayway.jsonpath.JsonPath.read(body, "$.id")).longValue();
        assertThat(read(body, "$.ownerAccount")).isEqualTo("EXISTING");
        assertThat((Object) com.jayway.jsonpath.JsonPath.read(body, "$.tempPassword")).isNull();
        User after = users.findOneByLogin(existing.getLogin()).orElseThrow();
        assertThat(after.getPassword()).isEqualTo(hashBefore);
        assertThat(after.isPasswordChangeRequired()).isFalse();
        assertThat(members.findByOrgIdAndUserIdAndStatusIn(id, after.getId(), List.of(OrgMemberStatus.ACTIVE))).hasSize(1);
        postJson("/api/admin/orgs/" + id + "/owner/reset-password", "{\"reason\":\"Owner locked out of the page\"}").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("OWNER_ACTIVE"));
    }

    @Test
    @WithMockUser(username = ADMIN, authorities = AuthoritiesConstants.ADMIN)
    void theOwnerMustChangeTheTemporaryPasswordBeforeAnythingElseWorks() throws Exception {
        String label = "forced" + System.nanoTime();
        String email = "forced." + System.nanoTime() + "@example.test";
        String body = created(label, email, "Fiona Forced");
        String temp = read(body, "$.tempPassword");
        String login = users.findOneByOrgIdIsNullAndEmailIgnoreCase(email).orElseThrow().getLogin();

        String tokens = signIn(login, temp).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String access = read(tokens, "$.accessToken");
        String refresh = read(tokens, "$.refreshToken");

        mockMvc.perform(get("/api/profile").header("Authorization", "Bearer " + access)).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("PASSWORD_CHANGE_REQUIRED"));
        mockMvc.perform(get("/api/notifications").header("Authorization", "Bearer " + access)).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("PASSWORD_CHANGE_REQUIRED"));
        mockMvc.perform(get("/api/account").header("Authorization", "Bearer " + access)).andExpect(status().isOk());

        postJsonAs("/api/account/change-password", access, "{\"currentPassword\":\"" + temp + "\",\"newPassword\":\"" + temp + "\"}").andExpect(status().isBadRequest()); // must actually change
        postJsonAs("/api/account/change-password", access, "{\"currentPassword\":\"" + temp + "\",\"newPassword\":\"x\"}").andExpect(status().isBadRequest()); // password policy
        postJsonAs("/api/account/change-password", access, "{\"currentPassword\":\"" + temp + "\",\"newPassword\":\"My-own-passw0rd!\"}").andExpect(status().isOk());

        User after = users.findOneByLogin(login).orElseThrow();
        assertThat(after.isPasswordChangeRequired()).isFalse();
        assertThat(after.getPasswordTempExpiresAt()).isNull();

        // the token minted before the change still says "change it": one refresh re-reads the flag and returns a clean pair
        mockMvc.perform(get("/api/profile").header("Authorization", "Bearer " + access)).andExpect(status().isForbidden());
        String refreshed = postJson("/api/refresh", "{\"refreshToken\":\"" + refresh + "\"}").andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        mockMvc.perform(get("/api/profile").header("Authorization", "Bearer " + read(refreshed, "$.accessToken"))).andExpect(status().is(org.hamcrest.Matchers.not(403)));

        signIn(login, temp).andExpect(status().isUnauthorized()); // the old temporary password no longer works
        signIn(login, "My-own-passw0rd!").andExpect(status().isOk());
    }

    @Test
    @WithMockUser(username = ADMIN, authorities = AuthoritiesConstants.ADMIN)
    void anExpiredTemporaryPasswordIsRefusedAtSignIn() throws Exception {
        String email = "expired." + System.nanoTime() + "@example.test";
        String body = created("expired" + System.nanoTime(), email, "Eve Expired");
        String temp = read(body, "$.tempPassword");
        User owner = users.findOneByOrgIdIsNullAndEmailIgnoreCase(email).orElseThrow();
        owner.setPasswordTempExpiresAt(Instant.now().minus(1, ChronoUnit.HOURS));
        users.saveAndFlush(owner);
        signIn(owner.getLogin(), temp).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("TEMP_PASSWORD_EXPIRED"));
        signIn(owner.getLogin(), "not-the-password").andExpect(status().isUnauthorized()); // expiry is only revealed to someone who knows the password
    }

    @Test
    @WithMockUser(username = ADMIN, authorities = AuthoritiesConstants.ADMIN)
    void resettingTheOwnerPasswordIssuesANewOneOnceAndSetsTheFlagAgain() throws Exception {
        String email = "reset." + System.nanoTime() + "@example.test";
        String body = created("reset" + System.nanoTime(), email, "Rita Reset");
        long id = ((Number) com.jayway.jsonpath.JsonPath.read(body, "$.id")).longValue();
        String first = read(body, "$.tempPassword");
        User owner = users.findOneByOrgIdIsNullAndEmailIgnoreCase(email).orElseThrow();
        String hash = owner.getPassword();

        postJson("/api/admin/orgs/" + id + "/owner/reset-password", "{\"reason\":\"short\"}").andExpect(status().isUnprocessableEntity());
        String reset = postJson("/api/admin/orgs/" + id + "/owner/reset-password", "{\"reason\":\"Owner lost the first password\"}").andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String second = read(reset, "$.tempPassword");
        assertThat(second).hasSize(16).isNotEqualTo(first);
        assertThat(users.findOneByOrgIdIsNullAndEmailIgnoreCase(email).orElseThrow().getPassword()).isNotEqualTo(hash);
        signIn(owner.getLogin(), first).andExpect(status().isUnauthorized());
        signIn(owner.getLogin(), second).andExpect(status().isOk());
        assertThat(adminRows("ORG_OWNER_PASSWORD_RESET", id)).isEqualTo(1);
        List<OrgAuditEvent> rows = orgRows(id, OrgAuditService.ADMIN_OWNER_PASSWORD_RESET);
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).getRisk()).isEqualTo("HIGH");
        assertThat(rows.get(0).getDetails()).doesNotContain(second).doesNotContain(first);
        mockMvc.perform(get("/api/admin/orgs/" + id)).andExpect(status().isOk());

        // once the owner has set their own password the admin may not overwrite it
        owner = users.findOneByOrgIdIsNullAndEmailIgnoreCase(email).orElseThrow();
        owner.setPasswordChangeRequired(false);
        users.saveAndFlush(owner);
        postJson("/api/admin/orgs/" + id + "/owner/reset-password", "{\"reason\":\"Owner lost the first password\"}").andExpect(status().isConflict());
    }

    @Test
    @WithMockUser(username = ADMIN, authorities = AuthoritiesConstants.ADMIN)
    void creatingValidatesTheLabelTypeAndEmail() throws Exception {
        String label = "dupe" + System.nanoTime();
        created(label, "dupe." + System.nanoTime() + "@example.test", "Dee Dupe");
        postJson("/api/admin/orgs", "{\"name\":\"Newco Two\",\"label\":\"" + label + "\",\"type\":\"STAFFING\",\"ownerEmail\":\"x" + System.nanoTime() + "@example.test\"}")
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("SLUG_TAKEN"))
            .andExpect(jsonPath("$.suggestion").value(label + "-2"));
        postJson("/api/admin/orgs", "{\"name\":\"Bad Co\",\"label\":\"badco-it\",\"type\":\"STAFFING\",\"ownerEmail\":\"not-an-email\"}").andExpect(status().isUnprocessableEntity());
        postJson("/api/admin/orgs", "{\"name\":\"Coach Co\",\"label\":\"coachco-it\",\"type\":\"COACH\",\"ownerEmail\":\"c@example.test\"}").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("RESERVED_VALUE"));
        postJson("/api/admin/orgs", "{\"name\":\"Api Co\",\"label\":\"api\",\"type\":\"COMPANY\",\"ownerEmail\":\"c@example.test\"}").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("RESERVED_VALUE"));
    }

    private ResultActions signIn(String login, String password) throws Exception {
        // /api/authenticate puts the signed-in person into the thread's security context; in a MockMvc test that is the admin's thread, so put the admin back
        org.springframework.security.core.Authentication before = org.springframework.security.test.context.TestSecurityContextHolder.getContext().getAuthentication();
        try {
            return postJson("/api/authenticate", "{\"username\":\"" + login + "\",\"password\":\"" + password + "\"}");
        } finally {
            org.springframework.security.test.context.TestSecurityContextHolder.getContext().setAuthentication(before);
        }
    }

    private ResultActions postJsonAs(String path, String accessToken, String body) throws Exception {
        return mockMvc.perform(post(path).header("Authorization", "Bearer " + accessToken).contentType(MediaType.APPLICATION_JSON).content(body));
    }
}
