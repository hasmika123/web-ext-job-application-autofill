package com.dossier.api.service.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.Authority;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.OrgAccountMode;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.OrgHostnameRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.ResumeBuilderSettings;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Base64;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * Decision O4, doc 19 phase S10: the Gamma Consulting demo organization. A SEPARATE organization whose people are ENTERPRISE accounts created through
 * {@code UserService.createEnterpriseAccount}, one of them sharing an address with a personal account that stays untouched; acme and beta (SHARED) are
 * left exactly as they were; a second run creates nothing; and the gate (both demo switches, never prod) is the one the other demo seeds use.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
@TestPropertySource(properties = { "dossier.demo.enabled=true", "dossier.demo.enterprise-seed=true", "dossier.demo.create-accounts=false" })
@org.junit.jupiter.api.Timeout(90)
class SeparateDemoSeederIT {

    private static final String HOST = "X-Kiwiply-Host";
    private static final String PW = "Gamma-Demo-2026!";

    @Autowired private EnterpriseDemoSeeder seeder;
    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper mapper;
    @Autowired private UserRepository users;
    @Autowired private OrganizationRepository orgs;
    @Autowired private OrgMemberRepository members;
    @Autowired private OrgHostnameRepository hostnames;
    @Autowired private TenantResolver resolver;
    @Autowired private ResumeBuilderSettings settings;
    @Autowired private com.dossier.api.service.ent.EnterpriseFeatureFlag flags;

    @AfterEach
    void forget() {
        settings.invalidate();
        resolver.invalidate();
    }

    private Organization gamma() {
        return orgs.findBySlug(EnterpriseDemoSeeder.GAMMA_SLUG).orElseThrow();
    }

    private String emailOf(String key) {
        return EnterpriseDemoSeeder.GAMMA.people().stream().filter(p -> p.key().equals(key)).findFirst().orElseThrow().email("gamma");
    }

    private JsonNode loginOn(String host, String email) throws Exception {
        MvcResult r = mockMvc
            .perform(post("/api/authenticate").header(HOST, host).contentType(MediaType.APPLICATION_JSON).content("{\"username\":\"" + email + "\",\"password\":\"" + PW + "\"}"))
            .andReturn();
        assertThat(r.getResponse().getStatus()).as(host + " " + r.getResponse().getContentAsString()).isEqualTo(200);
        return mapper.readTree(r.getResponse().getContentAsString());
    }

    private JsonNode claims(JsonNode pair) throws Exception {
        return mapper.readTree(Base64.getUrlDecoder().decode(pair.get("accessToken").asText().split("\\.")[1]));
    }

    @Test
    void createsASeparateOrganizationWhosePeopleAreEnterpriseAccounts() {
        seeder.seed();
        EnterpriseDemoSeeder.SeparateResult r = seeder.seedSeparate();
        assertThat(r.ran()).as(String.valueOf(r.skippedBecause())).isTrue();
        // 6 enterprise accounts + the personal account that shares Dana's address
        assertThat(r.accountsCreated()).isEqualTo(7);
        assertThat(r.seatsCreated()).isEqualTo(6);

        Organization g = gamma();
        assertThat(g.getAccountMode()).isEqualTo(OrgAccountMode.SEPARATE);
        assertThat(g.getName()).isEqualTo("Gamma Consulting");
        assertThat(hostnames.findPrimaryByOrgId(g.getId()).orElseThrow().getHostname()).isEqualTo("gamma.localhost");

        for (EnterpriseDemoSeeder.Person p : EnterpriseDemoSeeder.GAMMA.people()) {
            User u = users.findOneByOrgIdAndEmailIgnoreCase(g.getId(), p.email("gamma")).orElseThrow();
            assertThat(u.getLogin()).startsWith("ent#" + g.getId() + "#");
            assertThat(u.getOrgId()).isEqualTo(g.getId());
            assertThat(u.isActivated()).isTrue();
            assertThat(users.findOneWithAuthoritiesByLogin(u.getLogin()).orElseThrow().getAuthorities()).extracting(Authority::getName).containsExactly(AuthoritiesConstants.USER);
            assertThat(members.findByOrgIdAndUserIdAndStatusIn(g.getId(), u.getId(), List.of(OrgMemberStatus.ACTIVE))).hasSize(1);
        }
        User gina = users.findOneByOrgIdAndEmailIgnoreCase(g.getId(), emailOf("gina")).orElseThrow();
        OrgMember ginaSeat = members.findByOrgIdAndUserIdAndStatusIn(g.getId(), gina.getId(), List.of(OrgMemberStatus.ACTIVE)).get(0);
        assertThat(ginaSeat.getDisplayLabel()).isEqualTo(RoleTemplates.OWNER);
        assertThat(g.getCreatedByUserId()).isEqualTo(gina.getId());
    }

    @Test
    void everyLiveEnterpriseFlagIsOnForGammaToo() {
        seeder.seed();
        seeder.seedSeparate();
        long gammaId = gamma().getId();
        for (var k : com.dossier.api.service.settings.EnterpriseSettingKeys.all()) {
            if (k.key().startsWith("flag.enterprise")) assertThat(flags.isEnabled(k.key(), gammaId)).as(k.key()).isTrue();
        }
        assertThat(flags.isEnabled(com.dossier.api.service.settings.EnterpriseSettingKeys.FLAG_MARKETING, Long.MAX_VALUE - 7)).as("an unrelated organization stays dark").isFalse();
    }

    @Test
    void danasAddressAlsoExistsAsAPersonalAccountThatNeitherWorldReadsOrLinks() throws Exception {
        seeder.seedSeparate();
        String email = emailOf("dana");
        User personal = users.findOneByOrgIdIsNullAndEmailIgnoreCase(email).orElseThrow();
        User enterprise = users.findOneByOrgIdAndEmailIgnoreCase(gamma().getId(), email).orElseThrow();
        assertThat(personal.getId()).isNotEqualTo(enterprise.getId());
        assertThat(personal.getLogin()).isEqualTo(EnterpriseDemoSeeder.GAMMA_PERSONAL_LOGIN);
        assertThat(personal.getOrgId()).isNull();
        assertThat(members.findMine(personal.getId())).as("the personal account holds no seat anywhere").isEmpty();

        JsonNode onTenant = loginOn("gamma.localhost", email);
        assertThat(claims(onTenant).get("tid").asLong()).isEqualTo(gamma().getId());
        assertThat(claims(onTenant).get("sub").asText()).isEqualTo(enterprise.getLogin());
        JsonNode onPlatform = loginOn("kiwiply.com", email);
        assertThat(claims(onPlatform).has("tid")).isFalse();
        assertThat(claims(onPlatform).get("sub").asText()).isEqualTo(personal.getLogin());
    }

    @Test
    void aSecondRunCreatesNothingAndTheOtherDemoOrganizationsAreNotTouched() {
        seeder.seed();
        long before = users.count();
        seeder.seedSeparate();
        long afterFirst = users.count();
        assertThat(afterFirst - before).isEqualTo(7);
        EnterpriseDemoSeeder.SeparateResult again = seeder.seedSeparate();
        assertThat(again.ran()).isTrue();
        assertThat(again.accountsCreated()).isZero();
        assertThat(again.seatsCreated()).isZero();
        assertThat(users.count()).isEqualTo(afterFirst);
        assertThat(orgs.findBySlug(EnterpriseDemoSeeder.ACME_SLUG).orElseThrow().getAccountMode()).isEqualTo(OrgAccountMode.SHARED);
        assertThat(orgs.findBySlug(EnterpriseDemoSeeder.BETA_SLUG).orElseThrow().getAccountMode()).isEqualTo(OrgAccountMode.SHARED);
        assertThat(EnterpriseDemoSeeder.TENANTS).as("the other demo seeders walk this list").doesNotContain(EnterpriseDemoSeeder.GAMMA);
        // acme's synthetic people are still demo logins, never enterprise accounts
        assertThat(users.findOneByLogin("demo-ent-acme-sarah").orElseThrow().getOrgId()).isNull();
    }

    // ---- D2/D3 (2026-10-16 audit): Gamma's consultants are linked to their seats and assigned to the marketer ---------------

    @Autowired private com.dossier.api.repository.ent.talent.ConsultantProfileRepository consultantProfiles;
    @Autowired private com.dossier.api.repository.ent.talent.MarketerAssignmentRepository marketerAssignments;

    private String loginOf(String key) {
        return users.findOneByOrgIdAndEmailIgnoreCase(gamma().getId(), emailOf(key)).orElseThrow().getLogin();
    }

    private OrgMember seatOf(String key) {
        User u = users.findOneByOrgIdAndEmailIgnoreCase(gamma().getId(), emailOf(key)).orElseThrow();
        return members.findByOrgIdAndUserIdAndStatusIn(gamma().getId(), u.getId(), List.of(OrgMemberStatus.ACTIVE)).get(0);
    }

    private com.dossier.api.domain.ent.talent.ConsultantProfile profileOf(String key) {
        return consultantProfiles.findByOrgIdAndMemberId(gamma().getId(), seatOf(key).getId()).orElse(null);
    }

    @Test
    void gammasConsultantsHaveAProfileLinkedToTheirSeatAndAreAssignedToTheMarketer() {
        seeder.seed();
        seeder.seedSeparate();
        for (String key : List.of("cora", "dana")) {
            var c = profileOf(key);
            assertThat(c).as(key + " has a consultant profile linked to her member").isNotNull();
            assertThat(c.getStatus()).isEqualTo("ACTIVE");
            var a = marketerAssignments.findByOrgIdAndConsultantId(gamma().getId(), c.getId()).orElseThrow();
            assertThat(a.getMarketerMemberId()).isEqualTo(seatOf("marco").getId());
            assertThat(a.getStatus()).isEqualTo("ACTIVE");
        }
        long profilesBefore = consultantProfiles.countByOrgId(gamma().getId());
        seeder.seedSeparate();
        assertThat(consultantProfiles.countByOrgId(gamma().getId())).as("a second run adds nothing").isEqualTo(profilesBefore);
    }

    @Test
    void aProfileAddedByHandWithoutALinkIsLinkedInPlaceNotDuplicated() {
        seeder.seed();
        seeder.seedSeparate();
        var cora = profileOf("cora");
        cora.setMemberId(null); // the state the audit found after "Add consultant" (member_id NULL)
        consultantProfiles.saveAndFlush(cora);
        long before = consultantProfiles.countByOrgId(gamma().getId());
        seeder.seedSeparate();
        assertThat(profileOf("cora")).isNotNull();
        assertThat(profileOf("cora").getId()).isEqualTo(cora.getId());
        assertThat(consultantProfiles.countByOrgId(gamma().getId())).isEqualTo(before);
    }

    private MvcResult as(String login, org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder req) throws Exception {
        return mockMvc.perform(req.with(org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user(login)).contentType(MediaType.APPLICATION_JSON)).andReturn();
    }

    private JsonNode okJson(MvcResult r, int status) throws Exception {
        assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(status);
        return mapper.readTree(r.getResponse().getContentAsString());
    }

    @Test
    void theGammaActForJourneyMarketerPreparesAResumeItWaitsAndTheConsultantApprovesIt() throws Exception {
        seeder.seed();
        seeder.seedSeparate();
        long oid = gamma().getId();
        String marco = loginOf("marco");
        String cora = loginOf("cora");
        String dana = loginOf("dana");
        var coraProfile = profileOf("cora");
        String mkt = "/api/orgs/" + oid + "/mkt/resumes";
        String me = "/api/orgs/" + oid + "/me-workspace/resumes";

        // the consultant workspace opens for both (it was a 404 before the profile was linked)
        okJson(as(dana, get("/api/orgs/" + oid + "/me-workspace/resumes")), 200);
        okJson(as(cora, get("/api/orgs/" + oid + "/me-workspace/resumes")), 200);

        // Marco's picker lists both, both with a sign-in (they are enterprise accounts of Gamma)
        JsonNode picker = okJson(as(marco, get(mkt + "/consultants")), 200);
        assertThat(picker).extracting(n -> n.path("name").asText()).containsExactlyInAnyOrder("Cora Lindahl", "Dana Moreau");
        for (JsonNode c : picker) assertThat(c.path("hasAccount").asBoolean()).as(c.path("name").asText()).isTrue();

        // he prepares a resume for Cora: it is PENDING and hers
        JsonNode created = okJson(as(marco, post(mkt + "/consultants/" + coraProfile.getId() + "/built").content("{\"label\":\"Prepared for Cora\",\"source\":\"scratch\"}")), 201);
        long orgResumeId = created.path("orgResumeId").asLong();
        assertThat(created.path("detail").path("row").path("approval").asText()).isEqualTo("PENDING");

        // Dana can not approve Cora's resume; Cora can, naming the version she reviewed
        assertThat(as(dana, post(me + "/" + orgResumeId + "/approve").content("{\"versionNo\":1}")).getResponse().getStatus()).isEqualTo(404);
        JsonNode mine = okJson(as(cora, get(me)), 200);
        JsonNode row = null;
        for (JsonNode r : mine.path("resumes")) if (r.path("id").asLong() == orgResumeId) row = r;
        assertThat(row).as("the resume waits on Cora's page").isNotNull();
        assertThat(row.path("awaitingMyApproval").asBoolean()).isTrue();
        String decision = "{\"versionNo\":" + row.path("versionNo").asInt() + ",\"contentHash\":\"" + row.path("contentHash").asText() + "\"}";
        JsonNode approved = okJson(as(cora, post(me + "/" + orgResumeId + "/approve").content(decision)), 200);
        assertThat(approved.path("approvalStatus").asText()).isEqualTo("APPROVED");
    }
}
