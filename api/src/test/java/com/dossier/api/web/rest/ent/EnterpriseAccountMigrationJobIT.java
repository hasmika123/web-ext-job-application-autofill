package com.dossier.api.web.rest.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AdminAuditEvent;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.OrgAccountMode;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.OrgAuditEvent;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.AdminAuditEventRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.AdminAuditService;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.web.rest.org.OrgFixtures;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * Decision O4, doc 19 section 5.3 (phase S10): the one-off migrator and the pre-flip check, through the admin routes. A SHARED organization whose seats point at
 * personal accounts: the check counts them, a dry run reports and writes nothing, an apply (with a reason, audited HIGH) gives each seat a NEW enterprise
 * account and leaves every personal account exactly as it was, a re-run finds nothing, and nothing flips a flag or the organization's account mode.
 * Responses carry counts and ids only.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class EnterpriseAccountMigrationJobIT {

    private static final String REASON = "Moving the legacy members onto their own organization accounts";

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper mapper;
    @Autowired private UserRepository users;
    @Autowired private OrganizationRepository orgs;
    @Autowired private OrgMemberRepository members;
    @Autowired private AdminAuditEventRepository adminAudit;
    @Autowired private ResumeBuilderSettings settings;

    @PersistenceContext private EntityManager em;

    private OrgFixtures fx;
    private String sfx;
    private Organization shared;
    private User ann;
    private User raj;
    private OrgMember annSeat;
    private OrgMember rajSeat;

    @BeforeEach
    void world() {
        fx = new OrgFixtures(users, orgs, members);
        sfx = UUID.randomUUID().toString().substring(0, 8);
        shared = fx.org("shared-mig-" + sfx, OrgStatus.ACTIVE); // SHARED by default
        ann = fx.user("ann-mig-" + sfx);
        raj = fx.user("raj-mig-" + sfx);
        annSeat = fx.seat(shared, ann.getLogin(), OrgRole.OWNER, OrgMemberStatus.ACTIVE);
        rajSeat = fx.seat(shared, raj.getLogin(), OrgRole.MEMBER, OrgMemberStatus.ACTIVE);
        shared.setCreatedByUserId(ann.getId());
        orgs.saveAndFlush(shared);
    }

    private MvcResult getAs(String role, String path) throws Exception {
        return mockMvc.perform(get(path).with(user("admin").roles(role))).andReturn();
    }

    private MvcResult migrate(String body) throws Exception {
        return mockMvc.perform(post("/api/admin/orgs/" + shared.getId() + "/account-migration").with(user("admin").roles("ADMIN")).contentType(MediaType.APPLICATION_JSON).content(body)).andReturn();
    }

    private JsonNode json(MvcResult r) throws Exception {
        return mapper.readTree(r.getResponse().getContentAsString());
    }

    private void forget() {
        em.flush();
        em.clear();
    }

    // ---- the pre-flip check -----------------------------------------------------------------------------------------------------

    @Test
    void theCheckCountsSeatsOnPersonalAccountsAndIsAdminOnly() throws Exception {
        MvcResult r = getAs("ADMIN", "/api/admin/orgs/" + shared.getId() + "/account-mode-check");
        assertThat(r.getResponse().getStatus()).isEqualTo(200);
        JsonNode c = json(r);
        assertThat(c.get("orgId").asLong()).isEqualTo(shared.getId());
        assertThat(c.get("accountMode").asText()).isEqualTo("SHARED");
        assertThat(c.get("seatsOnPersonalAccounts").asLong()).isEqualTo(2);
        assertThat(c.get("seatsOnEnterpriseAccounts").asLong()).isZero();
        assertThat(c.get("readyForSeparate").asBoolean()).isFalse();
        assertThat(r.getResponse().getContentAsString()).doesNotContain("@").doesNotContain(ann.getLogin());

        assertThat(getAs("USER", "/api/admin/orgs/" + shared.getId() + "/account-mode-check").getResponse().getStatus()).isEqualTo(403);
        assertThat(getAs("ADMIN", "/api/admin/orgs/999999999/account-mode-check").getResponse().getStatus()).isEqualTo(404);
    }

    // ---- dry run ---------------------------------------------------------------------------------------------------------------

    @Test
    void aDryRunReportsWhatWouldChangeAndWritesNothing() throws Exception {
        long usersBefore = users.count();
        long auditBefore = adminAudit.count();
        for (String body : List.of("", "{}", "{\"apply\":false}")) {
            MvcResult r = body.isEmpty()
                ? mockMvc.perform(post("/api/admin/orgs/" + shared.getId() + "/account-migration").with(user("admin").roles("ADMIN"))).andReturn()
                : migrate(body);
            assertThat(r.getResponse().getStatus()).as(body).isEqualTo(200);
            JsonNode report = json(r);
            assertThat(report.get("dryRun").asBoolean()).isTrue();
            JsonNode o = report.get("orgs").get(0);
            assertThat(o.get("seatsOnPersonalAccounts").asLong()).isEqualTo(2);
            assertThat(o.get("wouldCreate").asLong()).isEqualTo(2);
            assertThat(o.get("created").asLong()).isZero();
            assertThat(o.get("repointed").asLong()).isZero();
        }
        forget();
        assertThat(users.count()).isEqualTo(usersBefore);
        assertThat(adminAudit.count()).isEqualTo(auditBefore);
        assertThat(members.findByOrgIdAndId(shared.getId(), annSeat.getId()).orElseThrow().getUserId()).isEqualTo(ann.getId());
    }

    @Test
    void theOverviewListsEverySharedOrganizationThatStillHoldsPersonalSeats() throws Exception {
        MvcResult r = getAs("ADMIN", "/api/admin/orgs/account-migration/report");
        assertThat(r.getResponse().getStatus()).isEqualTo(200);
        JsonNode report = json(r);
        assertThat(report.get("dryRun").asBoolean()).isTrue();
        boolean found = false;
        for (JsonNode o : report.get("orgs")) {
            if (o.get("orgId").asLong() == shared.getId()) {
                found = true;
                assertThat(o.get("seatsOnPersonalAccounts").asLong()).isEqualTo(2);
            }
        }
        assertThat(found).isTrue();
        assertThat(getAs("USER", "/api/admin/orgs/account-migration/report").getResponse().getStatus()).isEqualTo(403);
    }

    // ---- apply -----------------------------------------------------------------------------------------------------------------

    @Test
    void applyingNeedsAReason() throws Exception {
        assertThat(migrate("{\"apply\":true}").getResponse().getStatus()).isEqualTo(422);
        assertThat(migrate("{\"apply\":true,\"reason\":\"short\"}").getResponse().getStatus()).isEqualTo(422);
        forget();
        assertThat(members.findByOrgIdAndId(shared.getId(), annSeat.getId()).orElseThrow().getUserId()).isEqualTo(ann.getId());
    }

    @Test
    void applyingGivesEverySeatANewEnterpriseAccountAndLeavesEveryPersonalAccountAlone() throws Exception {
        String annHash = ann.getPassword();
        String annEmail = ann.getEmail();
        boolean switchBefore = settings.getBool(EnterpriseSettingKeys.SEPARATE_ACCOUNTS);

        MvcResult r = migrate("{\"apply\":true,\"reason\":\"" + REASON + "\"}");
        assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(200);
        String body = r.getResponse().getContentAsString();
        JsonNode report = mapper.readTree(body);
        assertThat(report.get("dryRun").asBoolean()).isFalse();
        assertThat(report.get("accountsCreated").asLong()).isEqualTo(2);
        assertThat(report.get("seatsRepointed").asLong()).isEqualTo(2);
        assertThat(report.get("personalAccountsChanged").asLong()).isZero();
        assertThat(body).as("counts only").doesNotContain("@").doesNotContain("ent#").doesNotContain(ann.getLogin()).doesNotContain(REASON);
        forget();

        // each seat now points at a NEW enterprise account of the organization, with the same address
        OrgMember a = members.findByOrgIdAndId(shared.getId(), annSeat.getId()).orElseThrow();
        OrgMember b = members.findByOrgIdAndId(shared.getId(), rajSeat.getId()).orElseThrow();
        assertThat(a.getStatus()).isEqualTo(OrgMemberStatus.ACTIVE);
        assertThat(a.getRole()).isEqualTo(OrgRole.OWNER);
        User annEnterprise = users.findById(a.getUserId()).orElseThrow();
        User rajEnterprise = users.findById(b.getUserId()).orElseThrow();
        for (User e : List.of(annEnterprise, rajEnterprise)) {
            assertThat(e.getOrgId()).isEqualTo(shared.getId());
            assertThat(e.getLogin()).startsWith("ent#" + shared.getId() + "#");
            assertThat(e.isActivated()).isTrue();
        }
        assertThat(annEnterprise.getId()).isNotEqualTo(ann.getId());
        assertThat(annEnterprise.getEmail()).isEqualToIgnoringCase(annEmail);
        assertThat(annEnterprise.getPassword()).isNotEqualTo(annHash);
        assertThat(orgs.findByOrgId(shared.getId()).orElseThrow().getCreatedByUserId()).as("the creator is the enterprise account now").isEqualTo(annEnterprise.getId());

        // the personal accounts: same rows, same hash, still personal, no seat
        User annAfter = users.findById(ann.getId()).orElseThrow();
        assertThat(annAfter.getPassword()).isEqualTo(annHash);
        assertThat(annAfter.getOrgId()).isNull();
        assertThat(annAfter.getLogin()).isEqualTo(ann.getLogin());
        assertThat(members.findMine(ann.getId())).isEmpty();
        assertThat(members.findMine(raj.getId())).isEmpty();

        // nothing flipped
        assertThat(orgs.findByOrgId(shared.getId()).orElseThrow().getAccountMode()).isEqualTo(OrgAccountMode.SHARED);
        assertThat(settings.getBool(EnterpriseSettingKeys.SEPARATE_ACCOUNTS)).isEqualTo(switchBefore);

        // the check is clean now, and a second apply finds nothing to do
        JsonNode check = json(getAs("ADMIN", "/api/admin/orgs/" + shared.getId() + "/account-mode-check"));
        assertThat(check.get("seatsOnPersonalAccounts").asLong()).isZero();
        assertThat(check.get("seatsOnEnterpriseAccounts").asLong()).isEqualTo(2);
        assertThat(check.get("readyForSeparate").asBoolean()).isTrue();
        JsonNode again = json(migrate("{\"apply\":true,\"reason\":\"" + REASON + "\"}"));
        assertThat(again.get("accountsCreated").asLong()).isZero();
        assertThat(again.get("seatsRepointed").asLong()).isZero();
    }

    @Test
    void applyingIsAuditedHighInBothTrailsWithoutAnAddress() throws Exception {
        assertThat(migrate("{\"apply\":true,\"reason\":\"" + REASON + "\"}").getResponse().getStatus()).isEqualTo(200);
        forget();
        List<AdminAuditEvent> admin = adminAudit.findAll().stream().filter(e -> AdminAuditService.ORG_ACCOUNT_MIGRATE.equals(e.getAction()) && String.valueOf(shared.getId()).equals(e.getTargetId())).toList();
        assertThat(admin).hasSize(1);
        assertThat(String.valueOf(admin.get(0).getDetails())).contains("created=2").doesNotContain("@");
        List<OrgAuditEvent> tenant = em.createQuery("select e from OrgAuditEvent e where e.orgId = :o and e.action = :a", OrgAuditEvent.class).setParameter("o", shared.getId()).setParameter("a", OrgAuditService.ADMIN_ACCOUNT_MIGRATE).getResultList();
        assertThat(tenant).hasSize(1);
        assertThat(tenant.get(0).getRisk()).isEqualTo("HIGH");
        assertThat(tenant.get(0).getActorLogin()).isEqualTo("admin");
        assertThat(tenant.get(0).getDetails()).doesNotContain("@").doesNotContain("ent#");
    }

    @Test
    void aSeparateOrganizationIsNotMigratedAndAnUnknownOneIs404() throws Exception {
        shared.setAccountMode(OrgAccountMode.SEPARATE);
        orgs.saveAndFlush(shared);
        assertThat(migrate("{\"apply\":false}").getResponse().getStatus()).isEqualTo(409);
        assertThat(mockMvc.perform(post("/api/admin/orgs/999999999/account-migration").with(user("admin").roles("ADMIN")).contentType(MediaType.APPLICATION_JSON).content("{}")).andReturn().getResponse().getStatus()).isEqualTo(404);
        assertThat(mockMvc.perform(post("/api/admin/orgs/" + shared.getId() + "/account-migration").with(user("someone").roles("USER")).contentType(MediaType.APPLICATION_JSON).content("{}")).andReturn().getResponse().getStatus()).isEqualTo(403);
    }
}
