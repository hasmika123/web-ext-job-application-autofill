package com.dossier.api.web.rest.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientContact;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.MarketerAssignment;
import com.dossier.api.domain.ent.talent.RequirementMatch;
import com.dossier.api.domain.ent.talent.RequirementSkill;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.ClientContactRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.MarketerAssignmentRepository;
import com.dossier.api.repository.ent.talent.RequirementMatchRepository;
import com.dossier.api.repository.ent.talent.RequirementSkillRepository;
import com.dossier.api.repository.ent.talent.TalentApplicationEventRepository;
import com.dossier.api.repository.ent.talent.TalentApplicationRepository;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Jobs board API (talent page "Jobs"): list with filters, sort and paging, the KPI tiles and facets, the drawer, create with an
 * idempotency key, edit with If-Match, bulk status, assigning a top match and dismissing one. Every refusal is the generic 404 (never 403),
 * and nothing of organization B is ever visible or changeable through organization A.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class OrgJobResourceIT extends MemberItSupport {

    @Autowired private ClientAccountRepository clients;
    @Autowired private ClientContactRepository contacts;
    @Autowired private ClientRequirementRepository jobs;
    @Autowired private RequirementSkillRepository skills;
    @Autowired private RequirementMatchRepository matches;
    @Autowired private ConsultantProfileRepository consultants;
    @Autowired private MarketerAssignmentRepository marketerAssignments;
    @Autowired private TalentApplicationRepository applications;
    @Autowired private TalentApplicationEventRepository applicationEvents;

    private ClientAccount clientA;
    private ClientAccount clientB;
    private ClientContact contactA;
    private ConsultantProfile jessica;
    private ConsultantProfile michael;
    private ClientRequirement j1; // OPEN, React + TypeScript, matches 92 (Jessica) and 88 (Michael)
    private ClientRequirement j2; // ON_HOLD, Python, match 70 (Jessica)
    private ClientRequirement jb; // organization B's job
    private RequirementMatch m1;
    private RequirementMatch m2;
    private RequirementMatch m3;

    @BeforeEach
    void talentWorld() {
        clientA = client(a, "Northwind Labs");
        clientB = client(b, "Other Tenant Client");
        contactA = new ClientContact();
        contactA.setOrgId(a.getId());
        contactA.setClientId(clientA.getId());
        contactA.setName("Pat Contact");
        contactA.setWorkEmail("pat@northwind.example.com");
        contactA = contacts.saveAndFlush(contactA);
        jessica = consultant(a, "Jessica Davis");
        michael = consultant(a, "Michael Park");
        j1 = job(a, clientA, "Senior React Developer", "OPEN", Instant.now().minus(2, ChronoUnit.DAYS), "React", "TypeScript");
        j1.setContactId(contactA.getId());
        j1.setLocation("New York, NY");
        j1.setWorkMode("HYBRID");
        j1.setEmploymentLabel("CONTRACT");
        j1.setRateMinMinor(12000L);
        j1.setRateMaxMinor(16000L);
        j1.setRateUnit("HOUR");
        j1 = jobs.saveAndFlush(j1);
        j2 = job(a, clientA, "Data Analyst", "ON_HOLD", Instant.now().minus(40, ChronoUnit.DAYS), "Python");
        jb = job(b, clientB, "Secret B Job", "OPEN", Instant.now().minus(1, ChronoUnit.DAYS), "Cobol");
        m1 = match(a, j1, jessica, 92, "SUGGESTED");
        m2 = match(a, j1, michael, 88, "SUGGESTED");
        m3 = match(a, j2, jessica, 70, "SUGGESTED");
        MarketerAssignment ma = new MarketerAssignment();
        ma.setOrgId(a.getId());
        ma.setConsultantId(jessica.getId());
        ma.setMarketerMemberId(mktSpec.getId());
        marketerAssignments.saveAndFlush(ma);
        em.flush();
    }

    // ---- fixtures ----------------------------------------------------------------------------------------------------

    private ClientAccount client(Organization o, String name) {
        ClientAccount c = new ClientAccount();
        c.setOrgId(o.getId());
        c.setName(name);
        return clients.saveAndFlush(c);
    }

    private ConsultantProfile consultant(Organization o, String name) {
        ConsultantProfile c = new ConsultantProfile();
        c.setOrgId(o.getId());
        c.setDisplayName(name);
        c.setEmail(name.toLowerCase().replace(' ', '.') + "@example.com");
        c.setJobTitle("Consultant");
        return consultants.saveAndFlush(c);
    }

    private ClientRequirement job(Organization o, ClientAccount client, String title, String status, Instant posted, String... skillNames) {
        ClientRequirement r = new ClientRequirement();
        r.setOrgId(o.getId());
        r.setClientId(client.getId());
        r.setTitle(title);
        r.setStatus(status);
        r.setPostedAt(posted);
        r.setCreatedAt(posted);
        r = jobs.saveAndFlush(r);
        int i = 0;
        for (String s : skillNames) {
            RequirementSkill rs = new RequirementSkill();
            rs.setOrgId(o.getId());
            rs.setRequirementId(r.getId());
            rs.setSkill(s);
            rs.setSortOrder(i++);
            skills.saveAndFlush(rs);
        }
        return r;
    }

    private RequirementMatch match(Organization o, ClientRequirement r, ConsultantProfile c, int score, String status) {
        RequirementMatch m = new RequirementMatch();
        m.setOrgId(o.getId());
        m.setRequirementId(r.getId());
        m.setConsultantId(c.getId());
        m.setScore(score);
        m.setReason("Skills overlap");
        m.setStatus(status);
        return matches.saveAndFlush(m);
    }

    private static String url(Organization o) {
        return "/api/orgs/" + o.getId() + "/jobs";
    }

    private static String url(Organization o, ClientRequirement r) {
        return url(o) + "/" + r.getId();
    }

    private String etag(String login, ClientRequirement r) throws Exception {
        return call(login, get(url(a, r))).getResponse().getHeader("ETag");
    }

    private JsonNode list(String login, String query) throws Exception {
        MvcResult r = call(login, get(url(a) + query));
        assertStatus(r, 200);
        return json(r);
    }

    // ---- who may see it ----------------------------------------------------------------------------------------------

    @Test
    void anyoneWithoutAPipelineOrClientKeyGetsTheGenericNotFound() throws Exception {
        for (String who : List.of("c1", "hr", "plain")) {
            assertGeneric404(call(login(who), get(url(a))), who + " list");
            assertGeneric404(call(login(who), get(url(a) + "/summary")), who + " summary");
            assertGeneric404(call(login(who), get(url(a, j1))), who + " detail");
        }
        // a member of another organization, and the organization's own outsider, are the same 404
        assertGeneric404(call(login("bowner"), get(url(a))), "B's owner on A");
        assertGeneric404(call(login("bmember"), get(url(a, j1))), "B's member on A");
    }

    @Test
    void theMarketingRolesAndTheOwnerCanRead() throws Exception {
        for (String who : List.of("owner", "admin", "mgr", "spec")) assertStatus(call(login(who), get(url(a))), 200);
    }

    // ---- list --------------------------------------------------------------------------------------------------------

    @Test
    void theListShowsOnlyThisOrganizationsJobsNewestFirstWithTheirSkillsAndBestMatches() throws Exception {
        MvcResult r = call(login("owner"), get(url(a)));
        assertStatus(r, 200);
        assertThat(r.getResponse().getHeader("X-Total-Count")).isEqualTo("2");
        JsonNode page = json(r);
        assertThat(ids(page)).containsExactly(j1.getId(), j2.getId());
        JsonNode row = page.path("items").get(0);
        assertThat(row.path("title").asText()).isEqualTo("Senior React Developer");
        assertThat(row.path("client").path("name").asText()).isEqualTo("Northwind Labs");
        assertThat(row.path("skills")).extracting(JsonNode::asText).containsExactly("React", "TypeScript");
        assertThat(row.path("matches").path("best").asInt()).isEqualTo(92);
        assertThat(row.path("matches").path("count").asInt()).isEqualTo(2);
        assertThat(row.path("matches").path("top").get(0).path("name").asText()).isEqualTo("Jessica Davis");
        assertThat(row.path("submissions").asInt()).isZero();
        assertThat(page.toString()).doesNotContain("Secret B Job");
    }

    @Test
    void filtersSearchSortAndPaging() throws Exception {
        assertThat(ids(list(login("owner"), "?status=ON_HOLD"))).containsExactly(j2.getId());
        assertThat(ids(list(login("owner"), "?status=OPEN&status=ON_HOLD"))).hasSize(2);
        assertThat(ids(list(login("owner"), "?q=data"))).containsExactly(j2.getId());
        assertThat(ids(list(login("owner"), "?q=northwind"))).as("by client name").hasSize(2);
        assertThat(ids(list(login("owner"), "?q=typescript"))).as("by skill").containsExactly(j1.getId());
        assertThat(ids(list(login("owner"), "?q=%25"))).as("a percent sign is literal, not a wildcard").isEmpty();
        assertThat(ids(list(login("owner"), "?skill=python"))).containsExactly(j2.getId());
        assertThat(ids(list(login("owner"), "?clientId=" + clientA.getId()))).hasSize(2);
        assertThat(ids(list(login("owner"), "?clientId=" + clientB.getId()))).as("another tenant's client id finds nothing").isEmpty();
        assertThat(ids(list(login("owner"), "?workMode=HYBRID"))).containsExactly(j1.getId());
        assertThat(ids(list(login("owner"), "?employment=CONTRACT"))).containsExactly(j1.getId());
        assertThat(ids(json(call(login("owner"), get(url(a)).param("location", "New York, NY")))) /* .param: a template string would encode the percent signs twice */).as("a comma is not a separator").containsExactly(j1.getId());
        assertThat(ids(list(login("owner"), "?minMatch=90"))).containsExactly(j1.getId());
        assertThat(ids(list(login("owner"), "?minMatch=60"))).hasSize(2);
        assertThat(ids(list(login("owner"), "?sort=title&dir=asc"))).containsExactly(j2.getId(), j1.getId());
        assertThat(ids(list(login("owner"), "?sort=match"))).containsExactly(j1.getId(), j2.getId());
        JsonNode first = list(login("owner"), "?size=1&page=0");
        assertThat(first.path("total").asInt()).isEqualTo(2);
        assertThat(first.path("hasNext").asBoolean()).isTrue();
        assertThat(ids(list(login("owner"), "?size=1&page=1"))).containsExactly(j2.getId());
        assertThat(ids(list(login("owner"), "?size=1&page=5"))).isEmpty();
    }

    @Test
    void badQueriesAreRefusedWithAnExplanation() throws Exception {
        assertCode(call(login("owner"), get(url(a) + "?sort=salary")), 400, "SORT_INVALID");
        assertStatus(call(login("owner"), get(url(a) + "?status=BOGUS")), 422);
        assertStatus(call(login("owner"), get(url(a) + "?size=500")), 422);
        assertStatus(call(login("owner"), get(url(a) + "?q=a")), 422);
        assertStatus(call(login("owner"), get(url(a) + "?minMatch=150")), 422);
        assertStatus(call(login("owner"), get(url(a) + "?clientId=abc")), 422);
    }

    // ---- summary -----------------------------------------------------------------------------------------------------

    @Test
    void theTilesAreComputedFromRowsAndHaveNoDeltaWithoutHistory() throws Exception {
        // j2 was posted 40 days ago, so the organization has history: last month's open count is j2 only if it was open then (it is ON_HOLD now: not counted)
        JsonNode s = json(call(login("owner"), get(url(a) + "/summary")));
        assertThat(s.path("openJobs").path("value").asInt()).isEqualTo(1);
        assertThat(s.path("newThisWeek").path("value").asInt()).isEqualTo(1);
        assertThat(s.path("newThisWeek").path("previous").asInt()).isZero();
        assertThat(s.path("highMatchJobs").path("value").asInt()).isEqualTo(1);
        assertThat(s.path("assignedOpportunities").path("value").asInt()).isZero();
        assertThat(s.path("openJobs").path("series")).hasSize(8);
        assertThat(s.path("facets").path("statuses").toString()).contains("\"value\":\"ON_HOLD\",\"label\":\"ON_HOLD\",\"count\":1");
        assertThat(s.path("facets").path("clients")).hasSize(1);
        assertThat(s.path("facets").path("skills").toString()).contains("React").doesNotContain("Cobol");
        assertThat(s.path("clientOptions")).hasSize(1);
        assertThat(s.path("clientOptions").get(0).path("contacts").get(0).path("name").asText()).isEqualTo("Pat Contact");
        assertThat(s.path("access").path("canCreate").asBoolean()).isTrue();
        assertThat(s.toString()).doesNotContain("Other Tenant Client");
    }

    @Test
    void anOrganizationWithNoJobOlderThanAMonthHasNoMonthlyDelta() throws Exception {
        j2.setPostedAt(Instant.now().minus(3, ChronoUnit.DAYS));
        jobs.saveAndFlush(j2);
        JsonNode s = json(call(login("owner"), get(url(a) + "/summary")));
        assertThat(s.path("openJobs").path("previous").isNull()).isTrue();
        assertThat(s.path("openJobs").path("delta").isNull()).isTrue();
        assertThat(s.path("assignedOpportunities").path("previous").isNull()).isTrue();
        assertThat(s.path("newThisWeek").path("delta").asInt()).as("weekly tiles always compare").isEqualTo(2);
    }

    @Test
    void whatTheCallerMayDoIsInTheSummary() throws Exception {
        JsonNode spec = json(call(login("spec"), get(url(a) + "/summary"))).path("access");
        assertThat(spec.path("canCreate").asBoolean()).isFalse();
        assertThat(spec.path("canEdit").asBoolean()).isFalse();
        assertThat(spec.path("canAssign").asBoolean()).isTrue();
        assertThat(json(call(login("spec"), get(url(a) + "/summary"))).path("clientOptions")).as("no client list for someone who cannot create").isEmpty();
    }

    // ---- detail ------------------------------------------------------------------------------------------------------

    @Test
    void theDrawerCarriesTheFactsTheContactTheMatchesAndAVersion() throws Exception {
        MvcResult r = call(login("owner"), get(url(a, j1)));
        assertStatus(r, 200);
        assertThat(r.getResponse().getHeader("ETag")).isNotBlank();
        JsonNode d = json(r);
        assertThat(d.path("rate").path("min").asInt()).isEqualTo(120);
        assertThat(d.path("rate").path("max").asInt()).isEqualTo(160);
        assertThat(d.path("rate").path("unit").asText()).isEqualTo("HOUR");
        assertThat(d.path("contact").path("email").asText()).isEqualTo("pat@northwind.example.com");
        assertThat(d.path("topMatches").get(0).path("name").asText()).isEqualTo("Jessica Davis");
        assertThat(d.path("topMatches").get(0).path("score").asInt()).isEqualTo(92);
        assertThat(d.path("submissionCount").asInt()).isZero();
        assertThat(d.path("access").path("canEdit").asBoolean()).isTrue();
    }

    @Test
    void anotherTenantsJobIsTheGenericNotFoundEverywhere() throws Exception {
        assertGeneric404(call(login("owner"), get(url(a, jb))), "A's owner reads B's job through A");
        assertGeneric404(call(login("bowner"), get(url(b, j1))), "B's owner reads A's job through B");
        assertGeneric404(call(login("bowner"), get("/api/orgs/" + a.getId() + "/jobs/" + j1.getId())), "B's owner reads A's job through A");
        assertGeneric404(call(login("owner"), patch(url(a, jb)), "{\"title\":\"Hijack\"}", "\"1\"", null), "patch");
        assertGeneric404(call(login("owner"), post(url(a, jb) + "/matches/" + m1.getId() + "/assign")), "assign through another tenant's job");
        assertThat(jobs.findByOrgIdAndId(b.getId(), jb.getId()).orElseThrow().getTitle()).isEqualTo("Secret B Job");
    }

    // ---- create ------------------------------------------------------------------------------------------------------

    @Test
    void creatingAJobIsIdempotentAuditedAndOpensWithItsSkills() throws Exception {
        String body = "{\"title\":\"Platform Engineer\",\"clientId\":" + clientA.getId() + ",\"contactId\":" + contactA.getId()
            + ",\"location\":\"Austin, TX\",\"workMode\":\"REMOTE\",\"employment\":\"FTE\",\"experienceLevel\":\"SENIOR\",\"rateMin\":140000,\"rateMax\":170000,\"rateUnit\":\"YEAR\",\"positions\":2,"
            + "\"skills\":[\"Kubernetes\",\"kubernetes\",\" Go \",\"\"],\"description\":\"Build the platform.\"}";
        long before = auditCount(a, "JOB_CREATE");
        String key = key();
        MvcResult r = call(login("owner"), post(url(a)), body, null, key);
        assertStatus(r, 201);
        JsonNode d = json(r);
        assertThat(d.path("status").asText()).isEqualTo("OPEN");
        assertThat(d.path("skills")).extracting(JsonNode::asText).containsExactly("Kubernetes", "Go");
        assertThat(d.path("rate").path("min").asInt()).isEqualTo(140000);
        assertThat(d.path("positions").asInt()).isEqualTo(2);
        assertThat(auditCount(a, "JOB_CREATE") - before).isEqualTo(1);
        assertThat(newestAudit(a).getTargetType()).isEqualTo("JOB");
        assertThat(jobs.findByOrgId(a.getId())).hasSize(3);

        MvcResult again = call(login("owner"), post(url(a)), body, null, key);
        assertStatus(again, 201);
        assertThat(again.getResponse().getHeader("Idempotent-Replayed")).isEqualTo("true");
        assertThat(json(again).path("id").asLong()).isEqualTo(d.path("id").asLong());
        assertThat(jobs.findByOrgId(a.getId())).as("the replay created nothing").hasSize(3);
        assertThat(auditCount(a, "JOB_CREATE") - before).isEqualTo(1);
        assertCode(call(login("owner"), post(url(a)), body.replace("Platform", "Another"), null, key), 422, "IDEMPOTENCY_KEY_REUSED");
    }

    @Test
    void creatingNeedsTheKeyTheRoleAndAClientOfThisOrganization() throws Exception {
        String ok = "{\"title\":\"Platform Engineer\",\"clientId\":" + clientA.getId() + "}";
        assertCode(call(login("owner"), post(url(a)), ok, null, null), 400, "IDEMPOTENCY_KEY_MISSING");
        assertGeneric404(call(login("spec"), post(url(a)), ok, null, key()), "a marketing specialist cannot create");
        assertGeneric404(call(login("mgr"), post(url(a)), ok, null, key()), "nor can a marketing manager");
        assertGeneric404(call(login("owner"), post(url(a)), "{\"title\":\"Platform\",\"clientId\":" + clientB.getId() + "}", null, key()), "B's client");
        assertGeneric404(call(login("owner"), post(url(a)), "{\"title\":\"Platform\",\"clientId\":" + clientA.getId() + ",\"contactId\":99999999}", null, key()), "unknown contact");
        assertThat(jobs.findByOrgId(a.getId())).hasSize(2);
    }

    @Test
    void creatingValidatesAndRefusesSensitiveText() throws Exception {
        String c = String.valueOf(clientA.getId());
        assertStatus(call(login("owner"), post(url(a)), "{\"title\":\"x\",\"clientId\":" + c + "}", null, key()), 422);
        assertStatus(call(login("owner"), post(url(a)), "{\"clientId\":" + c + "}", null, key()), 422);
        assertStatus(call(login("owner"), post(url(a)), "{\"title\":\"Ok job\"}", null, key()), 422);
        assertStatus(call(login("owner"), post(url(a)), "{\"title\":\"Ok job\",\"clientId\":" + c + ",\"workMode\":\"MOON\"}", null, key()), 422);
        assertStatus(call(login("owner"), post(url(a)), "{\"title\":\"Ok job\",\"clientId\":" + c + ",\"rateMin\":200,\"rateMax\":100,\"rateUnit\":\"HOUR\"}", null, key()), 422);
        assertStatus(call(login("owner"), post(url(a)), "{\"title\":\"Ok job\",\"clientId\":" + c + ",\"rateMin\":100}", null, key()), 422);
        assertStatus(call(login("owner"), post(url(a)), "{\"title\":\"Ok job\",\"clientId\":" + c + ",\"positions\":0}", null, key()), 422);
        assertStatus(call(login("owner"), post(url(a)), "{\"title\":\"Ok job\",\"clientId\":" + c + ",\"description\":\"<script>alert(1)</script>\"}", null, key()), 422);
        assertStatus(call(login("owner"), post(url(a)), "{\"title\":\"Ok job\",\"clientId\":" + c + ",\"description\":\"Applicant SSN 123-45-6789 must match\"}", null, key()), 422);
        assertThat(call(login("owner"), post(url(a)), "{\"title\":\"Ok job\",\"clientId\":" + c + ",\"orgId\":" + b.getId() + "}", null, key()).getResponse().getStatus()).as("an unknown property is refused, never bound").isGreaterThanOrEqualTo(400);
        assertThat(jobs.findByOrgId(a.getId())).hasSize(2);
    }

    // ---- edit --------------------------------------------------------------------------------------------------------

    @Test
    void editingNeedsTheVersionAndWritesOneAuditRowPerFamily() throws Exception {
        assertCode(call(login("owner"), patch(url(a, j1)), "{\"title\":\"Staff React Developer\"}", null, null), 428, "PRECONDITION_REQUIRED");
        assertCode(call(login("owner"), patch(url(a, j1)), "{\"title\":\"Staff React Developer\"}", "\"1\"", null), 412, "PRECONDITION_FAILED");
        long updates = auditCount(a, "JOB_UPDATE");
        long statuses = auditCount(a, "JOB_STATUS");
        MvcResult r = call(login("owner"), patch(url(a, j1)), "{\"title\":\"Staff React Developer\",\"skills\":[\"React\",\"GraphQL\"],\"rateMin\":150,\"rateMax\":180}", etag(login("owner"), j1), null);
        assertStatus(r, 200);
        JsonNode d = json(r);
        assertThat(d.path("title").asText()).isEqualTo("Staff React Developer");
        assertThat(d.path("skills")).extracting(JsonNode::asText).containsExactly("React", "GraphQL");
        assertThat(d.path("rate").path("min").asInt()).isEqualTo(150);
        assertThat(auditCount(a, "JOB_UPDATE") - updates).isEqualTo(1);
        assertThat(auditCount(a, "JOB_STATUS") - statuses).isZero();
        assertThat(skills.findByOrgIdAndRequirementIdIn(a.getId(), List.of(j1.getId()))).hasSize(2);
    }

    @Test
    void changingTheStatusIsAuditedAndStampsTheClosingTime() throws Exception {
        long statuses = auditCount(a, "JOB_STATUS");
        MvcResult r = call(login("owner"), patch(url(a, j1)), "{\"status\":\"FILLED\"}", etag(login("owner"), j1), null);
        assertStatus(r, 200);
        assertThat(json(r).path("status").asText()).isEqualTo("FILLED");
        assertThat(json(r).path("closedAt").isNull()).isFalse();
        assertThat(auditCount(a, "JOB_STATUS") - statuses).isEqualTo(1);
        assertThat(newestAudit(a).getDetails()).isEqualTo("open to filled");
        MvcResult reopened = call(login("owner"), patch(url(a, j1)), "{\"status\":\"OPEN\"}", etag(login("owner"), j1), null);
        assertThat(json(reopened).path("closedAt").isNull()).isTrue();
    }

    @Test
    void aRequestThatChangesNothingWritesNothingAndBadEditsAreRefused() throws Exception {
        long before = auditCount(a);
        assertStatus(call(login("owner"), patch(url(a, j1)), "{\"title\":\"Senior React Developer\"}", etag(login("owner"), j1), null), 200);
        assertThat(auditCount(a)).isEqualTo(before);
        for (String bad : List.of("{}", "{\"clientId\":1}", "{\"postedAt\":\"2020-01-01T00:00:00Z\"}", "{\"title\":\"x\"}", "{\"status\":\"BOGUS\"}", "{\"filled\":9}", "{\"positions\":\"two\"}", "{\"contactId\":99999999}")) {
            MvcResult r = call(login("owner"), patch(url(a, j1)), bad, etag(login("owner"), j1), null);
            assertThat(r.getResponse().getStatus()).as(bad).isIn(404, 422);
        }
        assertThat(auditCount(a)).isEqualTo(before);
        assertGeneric404(call(login("spec"), patch(url(a, j1)), "{\"title\":\"Nope title\"}", etag(login("spec"), j1), null), "a specialist cannot edit");
    }

    // ---- bulk status -------------------------------------------------------------------------------------------------

    @Test
    void bulkStatusChangesThisOrganizationsJobsSkipsTheRestAndCanBeReplayed() throws Exception {
        long before = auditCount(a, "JOB_STATUS");
        String body = "{\"ids\":[" + j1.getId() + "," + j2.getId() + "," + jb.getId() + ",999999],\"status\":\"CLOSED\"}";
        String key = key();
        MvcResult r = call(login("owner"), post(url(a) + "/bulk/status"), body, null, key);
        assertStatus(r, 200);
        JsonNode res = json(r);
        assertThat(res.path("ok").asInt()).isEqualTo(2);
        assertThat(res.path("requested").asInt()).isEqualTo(4);
        assertThat(res.path("skipped")).hasSize(2);
        assertThat(res.path("skipped").toString()).contains("NOT_FOUND");
        assertThat(res.path("results").get(0).path("previous").path("status").asText()).isEqualTo("OPEN");
        assertThat(jobs.findByOrgIdAndId(b.getId(), jb.getId()).orElseThrow().getStatus()).as("B's job is untouched").isEqualTo("OPEN");
        assertThat(auditCount(a, "JOB_STATUS") - before).isEqualTo(2);
        MvcResult again = call(login("owner"), post(url(a) + "/bulk/status"), body, null, key);
        assertThat(again.getResponse().getHeader("Idempotent-Replayed")).isEqualTo("true");
        assertThat(auditCount(a, "JOB_STATUS") - before).isEqualTo(2);
        assertCode(call(login("owner"), post(url(a) + "/bulk/status"), body, null, null), 400, "IDEMPOTENCY_KEY_MISSING");
        assertStatus(call(login("owner"), post(url(a) + "/bulk/status"), "{\"ids\":[],\"status\":\"OPEN\"}", null, key()), 422);
        assertStatus(call(login("owner"), post(url(a) + "/bulk/status"), "{\"ids\":[" + j1.getId() + "],\"status\":\"BOGUS\"}", null, key()), 422);
        assertGeneric404(call(login("spec"), post(url(a) + "/bulk/status"), body, null, key()), "a specialist cannot change statuses");
    }

    // ---- assign ------------------------------------------------------------------------------------------------------

    @Test
    void assigningATopMatchOpensAnApplicationAndAnEventAndMarksTheMatch() throws Exception {
        long before = auditCount(a, "JOB_ASSIGN");
        MvcResult r = call(login("spec"), post(url(a, j1) + "/matches/" + m1.getId() + "/assign"), null, null, key());
        assertStatus(r, 200);
        JsonNode res = json(r);
        assertThat(res.path("alreadyAssigned").asBoolean()).isFalse();
        String code = res.path("applicationCode").asText();
        assertThat(code).matches("APP-\\d{4}-\\d{3}");
        assertThat(res.path("job").path("submissionCount").asInt()).isEqualTo(1);
        assertThat(res.path("job").path("topMatches").get(0).path("status").asText()).isEqualTo("ASSIGNED");
        var app = applications.findByOrgIdAndCode(a.getId(), code).orElseThrow();
        assertThat(app.getStage()).isEqualTo("ASSIGNED");
        assertThat(app.getRequirementId()).isEqualTo(j1.getId());
        assertThat(app.getConsultantId()).isEqualTo(jessica.getId());
        assertThat(app.getMarketerMemberId()).as("the consultant's marketer").isEqualTo(mktSpec.getId());
        var events = applicationEvents.findByOrgIdAndApplicationIdOrderByOccurredAtAsc(a.getId(), app.getId());
        assertThat(events).hasSize(1);
        assertThat(events.get(0).getEventType()).isEqualTo("CREATED");
        assertThat(events.get(0).getActorMemberId()).isEqualTo(mktSpec.getId());
        RequirementMatch m = matches.findByOrgIdAndId(a.getId(), m1.getId()).orElseThrow();
        assertThat(m.getStatus()).isEqualTo("ASSIGNED");
        assertThat(m.getAssignedByMemberId()).isEqualTo(mktSpec.getId());
        assertThat(auditCount(a, "JOB_ASSIGN") - before).isEqualTo(1);

        MvcResult again = call(login("spec"), post(url(a, j1) + "/matches/" + m1.getId() + "/assign"), null, null, key());
        assertStatus(again, 200);
        assertThat(json(again).path("alreadyAssigned").asBoolean()).isTrue();
        assertThat(json(again).path("applicationCode").asText()).isEqualTo(code);
        assertThat(applications.findByOrgId(a.getId())).as("no second application").hasSize(1);
        assertThat(auditCount(a, "JOB_ASSIGN") - before).isEqualTo(1);
        List<JsonNode> activity = new ArrayList<>();
        json(call(login("owner"), get(url(a, j1)))).path("activity").forEach(activity::add);
        assertThat(activity.toString()).contains("was assigned").contains(code);
        assertThat(json(call(login("owner"), get(url(a) + "/summary"))).path("assignedOpportunities").path("value").asInt()).isEqualTo(1);
    }

    @Test
    void aSpecialistAssignsOnlyConsultantsTheyMarketAndOnlyOnAJobThatIsTakingThem() throws Exception {
        assertGeneric404(call(login("spec"), post(url(a, j1) + "/matches/" + m2.getId() + "/assign"), null, null, null), "Michael is not Sam's consultant");
        assertThat(applications.findByOrgId(a.getId())).isEmpty();
        MvcResult closed = call(login("owner"), post(url(a, j2) + "/matches/" + m3.getId() + "/assign"), null, null, null);
        assertCode(closed, 409, "JOB_NOT_OPEN");
        // the owner holds the permission at ORG scope: any consultant
        assertStatus(call(login("owner"), post(url(a, j1) + "/matches/" + m2.getId() + "/assign"), null, null, null), 200);
        // a match of another job does not belong to this one
        assertGeneric404(call(login("owner"), post(url(a, j1) + "/matches/" + m3.getId() + "/assign"), null, null, null), "match of another job");
        assertGeneric404(call(login("hr"), post(url(a, j1) + "/matches/" + m1.getId() + "/assign"), null, null, null), "hr cannot assign");
        assertGeneric404(call(login("mgr"), post(url(a, j1) + "/matches/99999999/assign"), null, null, null), "unknown match");
    }

    @Test
    void aMatchCanBeDismissedAndRestoredButNotOnceAssigned() throws Exception {
        long dismiss = auditCount(a, "JOB_MATCH_DISMISS");
        MvcResult r = call(login("spec"), patch(url(a, j1) + "/matches/" + m1.getId()), "{\"status\":\"DISMISSED\"}");
        assertStatus(r, 200);
        assertThat(json(r).path("topMatches").get(0).path("status").asText()).isEqualTo("DISMISSED");
        assertThat(auditCount(a, "JOB_MATCH_DISMISS") - dismiss).isEqualTo(1);
        JsonNode row = list(login("owner"), "").path("items").get(0);
        assertThat(row.path("matches").path("best").asInt()).as("a dismissed match no longer counts").isEqualTo(88);
        assertThat(json(call(login("owner"), get(url(a) + "/summary"))).path("highMatchJobs").path("value").asInt()).isZero();
        assertCode(call(login("spec"), post(url(a, j1) + "/matches/" + m1.getId() + "/assign"), null, null, null), 409, "MATCH_STATE");
        assertStatus(call(login("spec"), patch(url(a, j1) + "/matches/" + m1.getId()), "{\"status\":\"SUGGESTED\"}"), 200);
        assertThat(auditCount(a, "JOB_MATCH_RESTORE")).isEqualTo(1);
        assertStatus(call(login("spec"), post(url(a, j1) + "/matches/" + m1.getId() + "/assign"), null, null, null), 200);
        assertCode(call(login("spec"), patch(url(a, j1) + "/matches/" + m1.getId()), "{\"status\":\"DISMISSED\"}"), 409, "MATCH_STATE");
        assertStatus(call(login("owner"), patch(url(a, j1) + "/matches/" + m2.getId()), "{\"status\":\"ASSIGNED\"}"), 422);
    }
}
