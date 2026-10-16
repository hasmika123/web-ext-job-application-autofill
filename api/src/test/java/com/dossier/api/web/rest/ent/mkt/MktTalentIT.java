package com.dossier.api.web.rest.ent.mkt;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.ConsultantSkill;
import com.dossier.api.domain.ent.talent.MarketerAssignment;
import com.dossier.api.domain.ent.talent.OrgResume;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.ConsultantSkillRepository;
import com.dossier.api.repository.ent.talent.MarketerAssignmentRepository;
import com.dossier.api.repository.ent.talent.OrgResumeRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ent.OrgRoleService;
import com.dossier.api.service.ent.TenantModule;
import com.dossier.api.service.ent.TenantModules;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import com.dossier.api.web.rest.org.OrgFixtures;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Marketing "My Assigned Talent" page through the real chain on real rows ({@code /api/orgs/{orgId}/mkt/talent}): a marketing
 * specialist sees only the consultants assigned to them, a consultant of another marketer or of another organization is the generic 404,
 * the numbers are counted from the rows the test wrote, and saved views are the caller's own.
 *
 * <p>NOT EXECUTED on the machine that wrote it (no Docker for Testcontainers); it compiles. The marketing module flag is still a
 * "deferred" setting key, so {@link TenantModules} cannot be turned on through settings: the test replaces that one bean.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class MktTalentIT {

    private static final String WHO = "mkt-talent-it";

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper om;
    @Autowired private UserRepository users;
    @Autowired private OrganizationRepository orgs;
    @Autowired private OrgMemberRepository members;
    @Autowired private OrgRoleService roleService;
    @Autowired private AppSettingRepository settingRows;
    @Autowired private ResumeBuilderSettings cache;
    @Autowired private ConsultantProfileRepository consultants;
    @Autowired private ConsultantSkillRepository skills;
    @Autowired private OrgResumeRepository resumes;
    @Autowired private MarketerAssignmentRepository assignments;
    @Autowired private jakarta.persistence.EntityManager em;
    @MockitoBean private TenantModules modules;

    private Organization a;
    private Organization b;
    private String sam; // marketing specialist of A (assigned c1)
    private String max; // another marketing specialist of A (assigned c2)
    private String bob; // marketing specialist of B
    private ConsultantProfile c1;
    private ConsultantProfile c2;
    private ConsultantProfile c3;
    private ConsultantProfile bc;
    private OrgMember samSeat;

    @BeforeEach
    void seed() {
        when(modules.isOn(eq(TenantModule.MARKETING), any())).thenReturn(true);
        for (AppSetting s : settingRows.findAll()) if (WHO.equals(s.getUpdatedBy())) settingRows.delete(s);
        settingRows.save(new AppSetting(EnterpriseSettingKeys.FLAG_ENTERPRISE, "{\"on\":true}", WHO, Instant.now()));
        settingRows.save(new AppSetting(EnterpriseSettingKeys.FLAG_ROLES, "{\"on\":true}", WHO, Instant.now()));
        cache.invalidate();

        OrgFixtures fx = new OrgFixtures(users, orgs, members);
        String n = String.valueOf(System.nanoTime());
        a = fx.org("mkt-talent-a-" + n, OrgStatus.ACTIVE);
        b = fx.org("mkt-talent-b-" + n, OrgStatus.ACTIVE);
        sam = "mkt-talent-sam-" + n;
        max = "mkt-talent-max-" + n;
        bob = "mkt-talent-bob-" + n;
        samSeat = fx.active(a, sam, OrgRole.MARKETER);
        OrgMember maxSeat = fx.active(a, max, OrgRole.MARKETER);
        OrgMember bobSeat = fx.active(b, bob, OrgRole.MARKETER);
        for (OrgMember m : new OrgMember[] { samSeat, maxSeat, bobSeat }) roleService.syncFromLegacy(m);

        c1 = consultant(a, "Alex Morgan", "Senior Java Developer", 8, "New York, NY", "AVAILABLE", 200);
        c2 = consultant(a, "Priya Sharma", "Business Analyst", 6, "Austin, TX", "AVAILABLE", 100);
        c3 = consultant(a, "Unassigned Una", "QA Engineer", 3, "Remote", "AVAILABLE", 100);
        bc = consultant(b, "Beta Person", "Dev", 5, "Berlin", "AVAILABLE", 100);
        skill(c1, "Java", true, 0);
        skill(c2, "Business Analysis", true, 0);
        assign(a, c1, samSeat);
        assign(a, c2, maxSeat);
        assign(b, bc, bobSeat);
        OrgResume pending = new OrgResume();
        pending.setOrgId(a.getId());
        pending.setConsultantId(c1.getId());
        pending.setName("Alex - Java");
        pending.setApprovalStatus("PENDING");
        resumes.saveAndFlush(pending);
    }

    @AfterEach
    void clean() {
        for (AppSetting s : settingRows.findAll()) if (WHO.equals(s.getUpdatedBy())) settingRows.delete(s);
        cache.invalidate();
    }

    private ConsultantProfile consultant(Organization org, String name, String title, int years, String location, String availability, int daysOld) {
        ConsultantProfile c = new ConsultantProfile();
        c.setOrgId(org.getId());
        c.setDisplayName(name);
        c.setEmail(name.toLowerCase().replace(' ', '.') + "@example.com");
        c.setJobTitle(title);
        c.setYearsExperience(years);
        c.setLocationLabel(location);
        c.setAvailabilityStatus(availability);
        c.setCreatedAt(Instant.now().minus(daysOld, ChronoUnit.DAYS));
        return consultants.saveAndFlush(c);
    }

    private void skill(ConsultantProfile c, String name, boolean primary, int order) {
        ConsultantSkill s = new ConsultantSkill();
        s.setOrgId(c.getOrgId());
        s.setConsultantId(c.getId());
        s.setSkill(name);
        s.setPrimarySkill(primary);
        s.setSortOrder(order);
        skills.saveAndFlush(s);
    }

    private void assign(Organization org, ConsultantProfile c, OrgMember marketer) {
        MarketerAssignment row = new MarketerAssignment();
        row.setOrgId(org.getId());
        row.setConsultantId(c.getId());
        row.setMarketerMemberId(marketer.getId());
        assignments.saveAndFlush(row);
    }

    private MvcResult call(String login, MockHttpServletRequestBuilder req) throws Exception {
        return mockMvc.perform(req.with(user(login)).contentType(MediaType.APPLICATION_JSON)).andReturn();
    }

    private JsonNode ok(String login, MockHttpServletRequestBuilder req) throws Exception {
        MvcResult r = call(login, req);
        assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(200);
        return om.readTree(r.getResponse().getContentAsString());
    }

    private void assertGeneric404(MvcResult r, String what) throws Exception {
        String body = r.getResponse().getContentAsString();
        assertThat(r.getResponse().getStatus()).as(what + " -> " + body).isEqualTo(404);
        assertThat(body.toLowerCase()).as(what).contains("\"code\":\"not_found\"").doesNotContain("forbidden").doesNotContain("permission").doesNotContain("denied");
    }

    private String base(Organization org) {
        return "/api/orgs/" + org.getId() + "/mkt/talent";
    }

    @Test
    void aMarketerSeesOnlyTheirOwnConsultantsAndTheNumbersAreCountedFromRows() throws Exception {
        JsonNode r = ok(sam, get(base(a)));
        assertThat(r.path("total").asLong()).isEqualTo(1);
        assertThat(r.path("items")).hasSize(1);
        JsonNode row = r.path("items").get(0);
        assertThat(row.path("name").asText()).isEqualTo("Alex Morgan");
        assertThat(row.path("primarySkill").asText()).isEqualTo("Java");
        assertThat(row.path("availability").path("label").asText()).isEqualTo("Available Now");
        assertThat(row.path("resume").path("state").asText()).as("a pending resume that is fresh").isEqualTo("PENDING_APPROVAL");
        assertThat(r.path("counts").path("all").asLong()).isEqualTo(1);
        assertThat(r.path("counts").path("pendingApproval").asLong()).isEqualTo(1);
        assertThat(r.path("kpis")).hasSize(5);
        assertThat(r.path("kpis").get(0).path("value").asLong()).isEqualTo(1);
        assertThat(r.toString()).as("no other marketer's consultant, no unassigned one").doesNotContain("Priya Sharma").doesNotContain("Unassigned Una").doesNotContain("Beta Person");
        assertThat(r.toString().toLowerCase()).as("no contact details on the wire").doesNotContain("@example.com").doesNotContain("phone");
    }

    @Test
    void filtersAreAppliedByTheApi() throws Exception {
        assertThat(ok(sam, get(base(a)).param("status", "NEEDS_UPDATE")).path("total").asLong()).as("a resume exists and is fresh").isZero();
        assertThat(ok(sam, get(base(a)).param("q", "java")).path("total").asLong()).isEqualTo(1);
        assertThat(ok(sam, get(base(a)).param("q", "nobody")).path("total").asLong()).isZero();
        assertThat(ok(sam, get(base(a)).param("experience", "6-8")).path("total").asLong()).isEqualTo(1);
        assertThat(ok(sam, get(base(a)).param("experience", "0-2")).path("total").asLong()).isZero();
    }

    @Test
    void aConsultantOfAnotherMarketerOrAnotherOrganizationIsTheGeneric404() throws Exception {
        assertThat(call(sam, get(base(a) + "/" + c1.getId())).getResponse().getStatus()).isEqualTo(200);
        assertGeneric404(call(sam, get(base(a) + "/" + c2.getId())), "another marketer's consultant");
        assertGeneric404(call(sam, get(base(a) + "/" + c3.getId())), "an unassigned consultant");
        assertGeneric404(call(sam, get(base(a) + "/" + bc.getId())), "another organization's consultant id on my org path");
    }

    @Test
    void anotherOrganizationsMarketerGetsTheGeneric404ForMyOrg() throws Exception {
        assertGeneric404(call(bob, get(base(a))), "list");
        assertGeneric404(call(bob, get(base(a) + "/" + c1.getId())), "detail");
        assertGeneric404(call(bob, post(base(a) + "/views").content("{\"name\":\"x\"}")), "save view");
    }

    @Test
    void theDrawerIsASummaryWithoutContactDetails() throws Exception {
        JsonNode d = ok(sam, get(base(a) + "/" + c1.getId()));
        assertThat(d.path("name").asText()).isEqualTo("Alex Morgan");
        assertThat(d.path("consent").asText()).isEqualTo("SUMMARY");
        assertThat(d.path("skills").get(0).asText()).isEqualTo("Java");
        assertThat(d.toString().toLowerCase()).doesNotContain("@example.com").doesNotContain("phone").doesNotContain("email");
    }

    @Test
    void theOverviewGivesTheAssignedMarketerContactPlacementResumesAndApplicationsWithWhoUpdatedThem() throws Exception {
        com.dossier.api.domain.ent.talent.ClientAccount client = com.dossier.api.web.rest.ent.ApplicationItSupport.client(em, a.getId(), "Overview Client");
        com.dossier.api.domain.ent.talent.ClientRequirement job = com.dossier.api.web.rest.ent.ApplicationItSupport.job(em, a.getId(), client, "Staff Engineer");
        com.dossier.api.domain.ent.talent.TalentApplication app = com.dossier.api.web.rest.ent.ApplicationItSupport.application(em, a.getId(), job, c1, samSeat.getId(), "ASSIGNED");
        app.setUpdatedByMemberId(samSeat.getId());
        com.dossier.api.domain.ent.talent.TalentPlacement pl = new com.dossier.api.domain.ent.talent.TalentPlacement();
        pl.setOrgId(a.getId());
        pl.setConsultantId(c1.getId());
        pl.setClientId(client.getId());
        pl.setRoleTitle("Platform Engineer");
        pl.setStartDate(java.time.LocalDate.now().minusMonths(3));
        pl.setBillRateMinor(987654321L); // money exists on the row; it must never reach the wire
        em.persist(pl);
        em.flush();

        JsonNode o = ok(sam, get(base(a) + "/" + c1.getId() + "/overview"));
        assertThat(o.path("name").asText()).isEqualTo("Alex Morgan");
        assertThat(o.path("contact").path("workEmail").asText()).isEqualTo("alex.morgan@example.com");
        assertThat(o.path("contact").path("location").asText()).isEqualTo("New York, NY");
        assertThat(o.path("skills").get(0).asText()).isEqualTo("Java");
        assertThat(o.path("placement").path("roleTitle").asText()).isEqualTo("Platform Engineer");
        assertThat(o.path("placement").path("client").asText()).isEqualTo("Overview Client");
        assertThat(o.path("resumes")).hasSize(1);
        assertThat(o.path("resumes").get(0).path("approval").asText()).isEqualTo("PENDING");
        assertThat(o.path("applications").path("total").asInt()).isEqualTo(1);
        assertThat(o.path("applications").path("open").asInt()).isEqualTo(1);
        JsonNode recent = o.path("applications").path("recent").get(0);
        assertThat(recent.path("jobTitle").asText()).isEqualTo("Staff Engineer");
        assertThat(recent.path("updatedBy").path("kind").asText()).isEqualTo("PERSON");
        assertThat(recent.path("updatedBy").path("relation").asText()).isEqualTo("marketer");
        assertThat(o.toString().toLowerCase()).as("no money, no identity numbers").doesNotContain("987654321").doesNotContain("billrate").doesNotContain("ssn").doesNotContain("passport").doesNotContain("birth").doesNotContain("bank");
    }

    @Test
    void theOverviewOfAnUnassignedOrForeignConsultantIsTheGeneric404() throws Exception {
        assertGeneric404(call(sam, get(base(a) + "/" + c2.getId() + "/overview")), "another marketer's consultant");
        assertGeneric404(call(sam, get(base(a) + "/" + c3.getId() + "/overview")), "an unassigned consultant");
        assertGeneric404(call(sam, get(base(a) + "/" + bc.getId() + "/overview")), "another organization's consultant id");
        assertGeneric404(call(bob, get(base(a) + "/" + c1.getId() + "/overview")), "another organization's marketer");
        assertGeneric404(call(sam, get(base(a) + "/9999999/overview")), "an id that does not exist");
    }

    @Test
    void savedViewsAreMyOwnSavedByNameAndDeletedByMeOnly() throws Exception {
        MvcResult saved = call(sam, post(base(a) + "/views").content("{\"name\":\"Needs refresh\",\"status\":\"NEEDS_UPDATE\",\"skill\":\"Java\"}"));
        assertThat(saved.getResponse().getStatus()).isEqualTo(201);
        long id = om.readTree(saved.getResponse().getContentAsString()).path("id").asLong();
        JsonNode views = ok(sam, get(base(a))).path("views");
        assertThat(views).hasSize(1);
        assertThat(views.get(0).path("filters").path("status").asText()).isEqualTo("NEEDS_UPDATE");
        assertThat(ok(max, get(base(a))).path("views")).as("another marketer does not see it").isEmpty();

        // the same name overwrites, never duplicates
        call(sam, post(base(a) + "/views").content("{\"name\":\"Needs refresh\",\"status\":\"AVAILABLE_NOW\"}"));
        assertThat(ok(sam, get(base(a))).path("views")).hasSize(1);

        // a view that is not mine is a 404; mine is deleted
        assertGeneric404(call(max, delete(base(a) + "/views/" + id)), "someone else's view");
        assertThat(call(sam, delete(base(a) + "/views/" + id)).getResponse().getStatus()).isEqualTo(204);
        assertThat(ok(sam, get(base(a))).path("views")).isEmpty();
    }

    @Test
    void savedViewInputIsValidated() throws Exception {
        assertThat(call(sam, post(base(a) + "/views").content("{\"name\":\"  \"}")).getResponse().getStatus()).isEqualTo(422);
        assertThat(call(sam, post(base(a) + "/views").content("{\"name\":\"ok\",\"status\":\"DROP TABLE\"}")).getResponse().getStatus()).isEqualTo(422);
    }

    @Test
    void addConsultantIsOnlyOfferedToThoseWhoHoldTheEditGrant() throws Exception {
        assertThat(ok(sam, get(base(a))).path("canAddConsultant").asBoolean()).as("a marketing specialist has no consultants.edit").isFalse();
    }
}
