package com.dossier.api.web.rest.ent.mkt;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.ent.OrgSetting;
import com.dossier.api.domain.ent.mkt.MktOpportunity;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.RequirementMatch;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.OrgSettingRepository;
import com.dossier.api.repository.ent.PipelineGuardRepository;
import com.dossier.api.repository.ent.mkt.MktOpportunityRepository;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.ent.talent.RequirementMatchRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ent.EnterpriseDemoSeeder;
import com.dossier.api.service.ent.TalentDemoSeeder;
import com.dossier.api.service.ent.TenantResolver;
import com.dossier.api.service.ent.mkt.opportunities.MktOpportunityDemoSeeder;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * The duplicate-submission guard and the open-assignment cap on the real stack, with two tenants (Sprint 2 / B1; X8.4, X8.8): the same role through another
 * vendor is a 409 DUPLICATE_WARNING that a confirmation with a reason (audited) lets through, BLOCK cannot be overridden, a bulk assign skips such rows with
 * the code, the cap answers 409 ASSIGNMENT_CAP, the limit on consultants per posting counts only the organization's own rows, and the same check runs when
 * a submission record is made. Same demo world and properties as {@code MktOpportunitiesIT}, so the Spring context is shared.
 *
 * <p>Only the refusals and the record-time path run here: the test pool has ONE connection, so an assign that goes through (it reads the new row back in a
 * transaction of its own, see docs/V2-TEST-PASS-REPORT.md) is covered by {@code OpportunityAssignmentServiceTest} and {@code DuplicateGuardTest} instead.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
@TestPropertySource(properties = { "dossier.demo.enabled=true", "dossier.demo.enterprise-seed=true", "dossier.demo.create-accounts=false" })
@org.junit.jupiter.api.Timeout(240)
class PipelineGuardIT {

    private static final String ADMIN = "demo-ent-acme-sarah"; // Org Admin + Marketing Manager: ORG scope
    private static final String BETA_MARKETER = "demo-ent-beta-bea";

    @Autowired private EnterpriseDemoSeeder baseSeeder;
    @Autowired private TalentDemoSeeder talentSeeder;
    @Autowired private MktOpportunityDemoSeeder oppSeeder;
    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper om;
    @Autowired private OrganizationRepository orgs;
    @Autowired private ClientAccountRepository clients;
    @Autowired private ClientRequirementRepository requirements;
    @Autowired private RequirementMatchRepository matches;
    @Autowired private MktOpportunityRepository opportunities;
    @Autowired private OrgSettingRepository orgSettings;
    @Autowired private PipelineGuardRepository guardRepo;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private ResumeBuilderSettings settings;
    @Autowired private TenantResolver resolver;

    private Long acme;
    private Long beta;
    private Long consultant;
    private Long otherConsultant;
    private final String title = "Zebra Quality Engineer " + System.nanoTime();
    private Long tek;
    private Long globex;

    @BeforeEach
    void seed() {
        assertThat(baseSeeder.seed().ran()).isTrue();
        assertThat(talentSeeder.seed().ran()).isTrue();
        oppSeeder.seed();
        acme = orgs.findBySlug(EnterpriseDemoSeeder.ACME_SLUG).map(Organization::getId).orElseThrow();
        beta = orgs.findBySlug(EnterpriseDemoSeeder.BETA_SLUG).map(Organization::getId).orElseThrow();
        List<Long> eligible = jdbc.queryForList(
            "select cp.id from consultant_profile cp where cp.org_id = ? and cp.status = 'ACTIVE' and cp.marketing_status = 'ACTIVE' "
                + "and exists (select 1 from org_resume r where r.org_id = cp.org_id and r.consultant_id = cp.id and r.approval_status = 'APPROVED') order by cp.id limit 2", Long.class, acme);
        assertThat(eligible).as("two consultants with an approved resume").hasSize(2);
        consultant = eligible.get(0);
        otherConsultant = eligible.get(1);
        tek = client(acme, "TekVendor Test");
        globex = client(acme, "Globex Test");
    }

    @AfterEach
    void forget() {
        settings.invalidate();
        resolver.invalidate();
    }

    // ---- fixtures ---------------------------------------------------------------------------------------------------------

    private Long client(Long org, String name) {
        ClientAccount c = new ClientAccount();
        c.setOrgId(org);
        c.setName(name + " " + System.nanoTime());
        return clients.saveAndFlush(c).getId();
    }

    private Long job(Long org, Long clientId, String jobTitle) {
        ClientRequirement r = new ClientRequirement();
        r.setOrgId(org);
        r.setClientId(clientId);
        r.setTitle(jobTitle);
        r.setLocation("Austin, TX");
        return requirements.saveAndFlush(r).getId();
    }

    /** A match of the consultant to the job, with the opportunity overlay the board shows. */
    private Long match(Long org, Long consultantId, Long jobId, String status) {
        RequirementMatch m = new RequirementMatch();
        m.setOrgId(org);
        m.setRequirementId(jobId);
        m.setConsultantId(consultantId);
        m.setScore(80);
        m.setReason("test");
        m.setStatus(status);
        if ("ASSIGNED".equals(status)) m.setAssignedAt(Instant.now());
        Long id = matches.saveAndFlush(m).getId();
        // every match gets its opportunity overlay: assigning then needs no insert in a transaction of its own (the test pool has one connection)
        MktOpportunity o = new MktOpportunity();
        o.setOrgId(org);
        o.setMatchId(id);
        o.setState("ASSIGNED");
        opportunities.save(o);
        return id;
    }

    private void setting(Long org, String key, String json) {
        OrgSetting s = new OrgSetting();
        s.setOrgId(org);
        s.setSettingKey(key);
        s.setValueJson(json);
        orgSettings.saveAndFlush(s);
    }

    private MvcResult assign(String login, Long org, Long matchId, String body) throws Exception {
        var req = post("/api/orgs/" + org + "/mkt/opportunities/" + matchId + "/assign").with(user(login));
        if (body != null) req.contentType(MediaType.APPLICATION_JSON).content(body);
        return mockMvc.perform(req).andReturn();
    }

    private JsonNode body(MvcResult r, int status) throws Exception {
        assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(status);
        return om.readTree(r.getResponse().getContentAsString());
    }

    private long auditRows(String action) {
        return jdbc.queryForObject("select count(*) from org_audit_event where org_id = ? and action = ?", Long.class, acme, action);
    }

    /** The consultant already holds the role through TekVendor; the same role through Globex is a SUGGESTED match waiting to be assigned. Returns that match. */
    private Long theSameRoleThroughAnotherVendor() {
        match(acme, consultant, job(acme, tek, title), "ASSIGNED");
        return match(acme, consultant, job(acme, globex, title), "SUGGESTED");
    }

    // ---- assignment time ----------------------------------------------------------------------------------------------------

    @Test
    void theSameRoleThroughAnotherVendorIsAWarningThatNamesWhatItFound() throws Exception {
        Long m = theSameRoleThroughAnotherVendor();
        JsonNode e = body(assign(ADMIN, acme, m, null), 409);
        assertThat(e.path("code").asText()).isEqualTo("DUPLICATE_WARNING");
        assertThat(e.path("message").asText()).contains("another vendor").contains("TekVendor Test");
        assertThat(e.path("findings").get(0).path("rule").asText()).isEqualTo("VENDOR_CHAIN");
        assertThat(jdbc.queryForObject("select status from requirement_match where id = ?", String.class, m)).as("nothing was written").isEqualTo("SUGGESTED");
        assertThat(auditRows("PIPELINE_DUPLICATE_OVERRIDE")).isZero();
    }

    @Test
    void aConfirmationWithoutAReasonIsA400AndNothingIsWritten() throws Exception {
        Long m = theSameRoleThroughAnotherVendor();
        MvcResult r = assign(ADMIN, acme, m, "{\"confirmDuplicate\":true}");
        assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(400);
        MvcResult tooLong = assign(ADMIN, acme, m, "{\"confirmDuplicate\":true,\"duplicateReason\":\"" + "x".repeat(201) + "\"}");
        assertThat(tooLong.getResponse().getStatus()).as(tooLong.getResponse().getContentAsString()).isEqualTo(400);
        assertThat(jdbc.queryForObject("select status from requirement_match where id = ?", String.class, m)).isEqualTo("SUGGESTED");
        assertThat(auditRows("PIPELINE_DUPLICATE_OVERRIDE")).isZero();
    }

    @Test
    void theReasonIsScannedForSensitiveData() throws Exception {
        Long m = theSameRoleThroughAnotherVendor();
        MvcResult r = assign(ADMIN, acme, m, "{\"confirmDuplicate\":true,\"duplicateReason\":\"ssn 123-45-6789\"}");
        assertThat(r.getResponse().getStatus()).isEqualTo(422);
        assertThat(auditRows("PIPELINE_DUPLICATE_OVERRIDE")).isZero();
    }

    @Test
    void theBlockPolicyCannotBeOverridden() throws Exception {
        setting(acme, EnterpriseSettingKeys.ORG_PIPELINE_DUPLICATE_POLICY, "\"BLOCK\"");
        Long m = theSameRoleThroughAnotherVendor();
        JsonNode e = body(assign(ADMIN, acme, m, "{\"confirmDuplicate\":true,\"duplicateReason\":\"Please\"}"), 409);
        assertThat(e.path("code").asText()).isEqualTo("DUPLICATE_BLOCKED");
        assertThat(jdbc.queryForObject("select status from requirement_match where id = ?", String.class, m)).isEqualTo("SUGGESTED");
    }

    @Test
    void aBulkAssignLeavesTheDuplicateOutWithItsCode() throws Exception {
        Long dup = theSameRoleThroughAnotherVendor();
        MvcResult r = mockMvc.perform(post("/api/orgs/" + acme + "/mkt/opportunities/bulk-assign").with(user(ADMIN)).contentType(MediaType.APPLICATION_JSON).content("{\"ids\":[" + dup + "]}")).andReturn();
        JsonNode out = body(r, 200);
        assertThat(out.path("done").asInt()).isZero();
        assertThat(out.path("skipped").get(0).path("id").asLong()).isEqualTo(dup);
        assertThat(out.path("skipped").get(0).path("code").asText()).isEqualTo("DUPLICATE_WARNING");
        assertThat(jdbc.queryForObject("select status from requirement_match where id = ?", String.class, dup)).isEqualTo("SUGGESTED");
    }

    @Test
    void theOpenCapRefusesAtTheLimitWithTheFigures() throws Exception {
        match(acme, consultant, job(acme, tek, title), "ASSIGNED"); // one open at least, whatever the seed gave this consultant
        long open = guardRepo.countOpenMatches(acme, consultant);
        assertThat(open).isGreaterThanOrEqualTo(1);
        setting(acme, EnterpriseSettingKeys.ORG_PIPELINE_OPEN_MATCHES_MAX, String.valueOf(open));
        Long next = match(acme, consultant, job(acme, globex, "Another Role " + System.nanoTime()), "SUGGESTED");
        JsonNode e = body(assign(ADMIN, acme, next, null), 409);
        assertThat(e.path("code").asText()).isEqualTo("ASSIGNMENT_CAP");
        assertThat(e.path("message").asText()).contains("most your organization allows");
        assertThat(e.path("open").asLong()).isEqualTo(open);
        assertThat(e.path("cap").asLong()).isEqualTo(open);
        assertThat(jdbc.queryForObject("select status from requirement_match where id = ?", String.class, next)).isEqualTo("SUGGESTED");
    }

    @Test
    void theLimitOnConsultantsPerPostingCountsOnlyThisOrganization() throws Exception {
        setting(acme, EnterpriseSettingKeys.ORG_PIPELINE_MAX_PER_REQUIREMENT, "1");
        Long posting = job(acme, tek, title);
        match(acme, otherConsultant, posting, "ASSIGNED");
        Long mine = match(acme, consultant, posting, "SUGGESTED");
        JsonNode e = body(assign(ADMIN, acme, mine, null), 409);
        assertThat(e.path("code").asText()).isEqualTo("DUPLICATE_WARNING");
        assertThat(e.path("findings").get(0).path("rule").asText()).isEqualTo("TOO_MANY_CONSULTANTS");

        // a posting held in ANOTHER organization is nobody's business here: the count names the organization first
        Long betaConsultant = jdbc.queryForObject("select id from consultant_profile where org_id = ? order by id limit 1", Long.class, beta);
        Long betaPosting = job(beta, client(beta, "Beta Client"), title);
        match(beta, betaConsultant, betaPosting, "ASSIGNED");
        assertThat(guardRepo.countOtherConsultantsHolding(beta, List.of(betaPosting), consultant)).as("a Beta posting seen from Acme's consultant").isEqualTo(1L);
        assertThat(guardRepo.countOtherConsultantsHolding(acme, List.of(betaPosting), consultant)).as("the same ids asked as Acme").isZero();
        assertThat(guardRepo.countOtherConsultantsHolding(acme, List.of(posting), consultant)).isEqualTo(1L);
        assertThat(guardRepo.liveAssignments(acme, betaConsultant)).as("a Beta consultant's holdings asked as Acme").isEmpty();
    }

    // ---- the tenant wall ----------------------------------------------------------------------------------------------------

    @Test
    void anotherOrganizationCannotAssignOrConfirmOnOurMatch() throws Exception {
        Long m = theSameRoleThroughAnotherVendor();
        assertThat(assign(BETA_MARKETER, beta, m, "{\"confirmDuplicate\":true,\"duplicateReason\":\"x\"}").getResponse().getStatus()).isEqualTo(404);
        assertThat(assign(BETA_MARKETER, acme, m, null).getResponse().getStatus()).isEqualTo(404);
        assertThat(jdbc.queryForObject("select status from requirement_match where id = ?", String.class, m)).isEqualTo("SUGGESTED");
        assertThat(auditRows("PIPELINE_DUPLICATE_OVERRIDE")).isZero();
    }

    // ---- record time --------------------------------------------------------------------------------------------------------

    @Test
    void recordingASubmissionRunsTheSameCheck() throws Exception {
        match(acme, consultant, job(acme, tek, title), "ASSIGNED");
        Long again = job(acme, globex, title);
        String base = "\"consultantId\":" + consultant + ",\"requirementId\":" + again;
        MvcResult r = mockMvc.perform(post("/api/orgs/" + acme + "/mkt/submissions").with(user(ADMIN)).contentType(MediaType.APPLICATION_JSON).content("{" + base + "}")).andReturn();
        JsonNode e = body(r, 409);
        assertThat(e.path("code").asText()).isEqualTo("DUPLICATE_WARNING");
        MvcResult ok = mockMvc.perform(post("/api/orgs/" + acme + "/mkt/submissions").with(user(ADMIN)).contentType(MediaType.APPLICATION_JSON).content("{" + base + ",\"confirmDuplicate\":true,\"duplicateReason\":\"Both vendors asked\"}")).andReturn();
        assertThat(ok.getResponse().getStatus()).as(ok.getResponse().getContentAsString()).isIn(200, 201);
        assertThat(auditRows("PIPELINE_DUPLICATE_OVERRIDE")).isEqualTo(1);
    }
}
