package com.dossier.api.web.rest.org;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.org.OrgAuditEventRepository;
import com.dossier.api.repository.org.OrgGroupRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ResumeBuilderSettingKeys;
import com.dossier.api.service.ResumeBuilderSettings;
import java.time.Instant;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;

/**
 * O1.3a: the abuse caps on creating organizations (per person) and groups (per org). Both are admin settings with safe
 * defaults (3 and 50), never constants; exceeding one is a 422 {@code ORG_LIMIT_REACHED} naming the cap and its value.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class OrgLimitsIT {

    @Autowired private MockMvc mockMvc;
    @Autowired private UserRepository users;
    @Autowired private OrganizationRepository orgs;
    @Autowired private OrgMemberRepository members;
    @Autowired private OrgGroupRepository groups;
    @Autowired private OrgAuditEventRepository audit;
    @Autowired private AppSettingRepository appSettings;
    @Autowired private ResumeBuilderSettings settings;

    private OrgFixtures fx;

    @BeforeEach
    void seed() {
        fx = new OrgFixtures(users, orgs, members);
    }

    @AfterEach
    void forgetTheCache() {
        settings.invalidate();
    }

    private void store(String key, String value) {
        appSettings.saveAndFlush(new AppSetting(key, value, "test", Instant.now()));
        settings.invalidate();
    }

    private ResultActions createOrg(String login, String name) throws Exception {
        fx.user(login);
        return mockMvc.perform(post("/api/orgs").with(user(login)).contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"" + name + "\",\"type\":\"BOOTCAMP\"}"));
    }

    private ResultActions createGroup(String login, Organization org, String name) throws Exception {
        return mockMvc.perform(post("/api/orgs/" + org.getId() + "/groups").with(user(login)).contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"" + name + "\"}"));
    }

    @Test
    void theDefaultsAreSafeAndDeclaredInTheSettingsRegistry() {
        assertThat(settings.getInt(ResumeBuilderSettingKeys.ORG_LIMIT_CREATED_PER_USER)).isEqualTo(3);
        assertThat(settings.getInt(ResumeBuilderSettingKeys.ORG_LIMIT_GROUPS_PER_ORG)).isEqualTo(50);
    }

    @Test
    void aPersonMayCreateThreeOrgsAndTheFourthIs422WithTheCapNamed() throws Exception {
        for (int i = 1; i <= 3; i++) createOrg("alice", "Alice Org " + i).andExpect(status().isCreated());
        long orgsBefore = orgs.countByCreatedByUserId(fx.user("alice").getId());

        createOrg("alice", "Alice Org 4")
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("ORG_LIMIT_REACHED"))
            .andExpect(jsonPath("$.limit").value("orgsCreatedPerUser"))
            .andExpect(jsonPath("$.max").value(3));

        assertThat(orgs.countByCreatedByUserId(fx.user("alice").getId())).as("nothing was written").isEqualTo(orgsBefore);
        assertThat(orgs.existsBySlug("alice-org-4")).isFalse();
    }

    @Test
    void theCapIsPerPersonAndAClosedOrgStillCounts() throws Exception {
        for (int i = 1; i <= 3; i++) createOrg("alice", "Alice Org " + i).andExpect(status().isCreated());
        createOrg("bob", "Bob Org").andExpect(status().isCreated()); // someone else is unaffected

        Organization first = orgs.findBySlug("alice-org-1").orElseThrow();
        mockMvc.perform(post("/api/orgs/" + first.getId() + "/close").with(user("alice"))).andExpect(status().isOk());
        assertThat(orgs.findBySlug("alice-org-1").orElseThrow().getStatus()).isEqualTo(OrgStatus.CLOSED);

        createOrg("alice", "Alice Org 5").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("ORG_LIMIT_REACHED"));
    }

    @Test
    void anAdminCanRaiseOrLowerTheCapWithoutADeploy() throws Exception {
        store(ResumeBuilderSettingKeys.ORG_LIMIT_CREATED_PER_USER, "1");
        createOrg("carol", "Carol One").andExpect(status().isCreated());
        createOrg("carol", "Carol Two").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.max").value(1));

        store(ResumeBuilderSettingKeys.ORG_LIMIT_CREATED_PER_USER, "5");
        createOrg("carol", "Carol Two").andExpect(status().isCreated());
    }

    @Test
    void anOutOfBoundsStoredCapFallsBackToTheDefaultNeverToUnlimited() throws Exception {
        store(ResumeBuilderSettingKeys.ORG_LIMIT_CREATED_PER_USER, "0");
        assertThat(settings.getInt(ResumeBuilderSettingKeys.ORG_LIMIT_CREATED_PER_USER)).isEqualTo(3);
        store(ResumeBuilderSettingKeys.ORG_LIMIT_CREATED_PER_USER, "-1");
        assertThat(settings.getInt(ResumeBuilderSettingKeys.ORG_LIMIT_CREATED_PER_USER)).isEqualTo(3);
        store(ResumeBuilderSettingKeys.ORG_LIMIT_CREATED_PER_USER, "999999");
        assertThat(settings.getInt(ResumeBuilderSettingKeys.ORG_LIMIT_CREATED_PER_USER)).as("above the declared maximum").isEqualTo(3);
        store(ResumeBuilderSettingKeys.ORG_LIMIT_GROUPS_PER_ORG, "unlimited");
        assertThat(settings.getInt(ResumeBuilderSettingKeys.ORG_LIMIT_GROUPS_PER_ORG)).isEqualTo(50);
    }

    @Test
    void anOrgMayHaveFiftyGroupsAndTheFiftyFirstIs422() throws Exception {
        Organization org = fx.org("acme", OrgStatus.ACTIVE);
        fx.active(org, "owner", OrgRole.OWNER);
        for (int i = 1; i <= 50; i++) createGroup("owner", org, "Group " + i).andExpect(status().isCreated());
        long auditBefore = audit.countByOrgId(org.getId());

        createGroup("owner", org, "Group 51")
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("ORG_LIMIT_REACHED"))
            .andExpect(jsonPath("$.limit").value("groupsPerOrg"))
            .andExpect(jsonPath("$.max").value(50));

        assertThat(groups.countByOrgId(org.getId())).isEqualTo(50);
        assertThat(audit.countByOrgId(org.getId())).as("a refused create writes no audit row").isEqualTo(auditBefore);
    }

    @Test
    void theGroupCapIsPerOrgAndADuplicateNameStillReadsAsADuplicate() throws Exception {
        store(ResumeBuilderSettingKeys.ORG_LIMIT_GROUPS_PER_ORG, "2");
        Organization a = fx.org("acme", OrgStatus.ACTIVE);
        Organization b = fx.org("globex", OrgStatus.ACTIVE);
        fx.active(a, "owner-a", OrgRole.OWNER);
        fx.active(b, "owner-b", OrgRole.OWNER);

        createGroup("owner-a", a, "One").andExpect(status().isCreated());
        createGroup("owner-a", a, "Two").andExpect(status().isCreated());
        createGroup("owner-a", a, "Two").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("GROUP_NAME_TAKEN"));
        createGroup("owner-a", a, "Three").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.max").value(2));

        createGroup("owner-b", b, "One").andExpect(status().isCreated()); // another org has its own allowance

        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete("/api/orgs/" + a.getId() + "/groups/" + groups.findByOrgIdOrderBySortOrderAscNameAsc(a.getId()).get(0).getId()).with(user("owner-a")))
            .andExpect(status().isNoContent());
        createGroup("owner-a", a, "Three").andExpect(status().isCreated()); // room again after a delete
    }
}
