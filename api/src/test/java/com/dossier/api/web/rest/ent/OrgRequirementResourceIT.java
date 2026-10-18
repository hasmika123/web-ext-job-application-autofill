package com.dossier.api.web.rest.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientContact;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.OrgResume;
import com.dossier.api.domain.ent.talent.RequirementMatch;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.ClientContactRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.OrgResumeRepository;
import com.dossier.api.repository.ent.talent.RequirementMatchRepository;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Account Manager's Requirements API (X10.2 / X10.5): intake (typed, pasted text, link), the duplicate check, the list with its filters, the Home figures,
 * edit and the status workflow, and putting a requirement in front of a consultant (a record only, the consultant decides). Every refusal is the generic 404
 * (never 403) and nothing of organization B is ever visible or changeable through organization A.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
@org.springframework.test.context.TestPropertySource(properties = "spring.datasource.hikari.maximum-pool-size=4") // an assignment writes through REQUIRES_NEW helpers: a second connection beside the test's transaction
class OrgRequirementResourceIT extends MemberItSupport {

    @Autowired private ClientAccountRepository clients;
    @Autowired private ClientContactRepository contacts;
    @Autowired private ClientRequirementRepository requirements;
    @Autowired private ConsultantProfileRepository consultants;
    @Autowired private RequirementMatchRepository matches;
    @Autowired private OrgResumeRepository resumes;

    private OrgMember am; // an Account Manager: clients.view + clients.manage + requirements.manage
    private ClientAccount alpha;
    private ClientAccount beta;
    private ClientAccount secretB;
    private ClientContact pat;
    private ClientRequirement r1; // alpha, OPEN, 20 days old, assigned to jessica
    private ClientRequirement r2; // alpha, OPEN, 2 days old, nobody
    private ClientRequirement r3; // beta, ON_HOLD
    private ClientRequirement rB; // organization B's
    private ConsultantProfile jessica;
    private ConsultantProfile nobodyReady; // active, no approved resume

    @BeforeEach
    void world() {
        am = extra(a, "am", OrgRole.STAFF, "Amara", "Silva");
        assign(am, "ACCOUNT_MANAGER");
        alpha = client(a, "Alpha Corp");
        beta = client(a, "Beta Health");
        secretB = client(b, "Secret B Client");
        pat = contact(a, alpha, "Pat Contact");
        r1 = requirement(a, alpha, "Senior Frontend Engineer", "OPEN", 20);
        r2 = requirement(a, alpha, "ML Engineer", "OPEN", 2);
        r3 = requirement(a, beta, "Data Analyst", "ON_HOLD", 5);
        rB = requirement(b, secretB, "Secret B Job", "OPEN", 1);
        jessica = consultant(a, "Jessica Davis");
        nobodyReady = consultant(a, "Noah Newcomer");
        approvedResume(jessica);
        RequirementMatch m = new RequirementMatch();
        m.setOrgId(a.getId());
        m.setRequirementId(r1.getId());
        m.setConsultantId(jessica.getId());
        m.setScore(80);
        m.setStatus("ASSIGNED");
        m.setAssignedAt(Instant.now());
        matches.saveAndFlush(m);
        flushIfInTransaction();
    }

    // ---- fixtures ----------------------------------------------------------------------------------------------------

    private ClientAccount client(Organization o, String name) {
        ClientAccount c = new ClientAccount();
        c.setOrgId(o.getId());
        c.setName(name);
        c.setStatus("ACTIVE");
        return clients.saveAndFlush(c);
    }

    private ClientContact contact(Organization o, ClientAccount c, String name) {
        ClientContact x = new ClientContact();
        x.setOrgId(o.getId());
        x.setClientId(c.getId());
        x.setName(name);
        x.setWorkEmail(name.toLowerCase().replace(' ', '.') + "@alpha.example.com");
        return contacts.saveAndFlush(x);
    }

    private ClientRequirement requirement(Organization o, ClientAccount c, String title, String status, int postedDaysAgo) {
        ClientRequirement r = new ClientRequirement();
        r.setOrgId(o.getId());
        r.setClientId(c.getId());
        r.setTitle(title);
        r.setStatus(status);
        r.setLocation("Austin, TX");
        r.setPostedAt(Instant.now().minus(postedDaysAgo, ChronoUnit.DAYS));
        r.setCreatedAt(r.getPostedAt());
        r.setUpdatedAt(r.getPostedAt());
        return requirements.saveAndFlush(r);
    }

    private ConsultantProfile consultant(Organization o, String name) {
        ConsultantProfile c = new ConsultantProfile();
        c.setOrgId(o.getId());
        c.setDisplayName(name);
        c.setEmail(name.toLowerCase().replace(' ', '.') + "@example.com");
        c.setJobTitle("Consultant");
        return consultants.saveAndFlush(c);
    }

    private void approvedResume(ConsultantProfile c) {
        OrgResume r = new OrgResume();
        r.setOrgId(a.getId());
        r.setConsultantId(c.getId());
        r.setName(c.getDisplayName() + " resume");
        r.setApprovalStatus("APPROVED");
        resumes.saveAndFlush(r);
    }

    private static String url(Organization o) {
        return "/api/orgs/" + o.getId() + "/requirements";
    }

    private static String url(Organization o, ClientRequirement r) {
        return url(o) + "/" + r.getId();
    }

    private JsonNode list(String who, String query) throws Exception {
        MvcResult r = call(login(who), get(url(a) + query));
        assertStatus(r, 200);
        return json(r);
    }

    private static List<String> titles(JsonNode page) {
        List<String> out = new java.util.ArrayList<>();
        page.path("items").forEach(n -> out.add(n.path("title").asText()));
        return out;
    }

    private String etag(String who, ClientRequirement r) throws Exception {
        return call(login(who), get(url(a, r))).getResponse().getHeader("ETag");
    }

    private String intake(String title) {
        return "{\"title\":\"" + title + "\",\"clientId\":" + alpha.getId() + ",\"location\":\"Remote\",\"workMode\":\"REMOTE\",\"skills\":[\"Java\",\"Spring\"],\"rateMin\":70,\"rateMax\":90,\"rateUnit\":\"HOUR\",\"positions\":2,\"priority\":\"HIGH\",\"dueOn\":\""
            + LocalDate.now(ZoneOffset.UTC).plusDays(20) + "\"}";
    }

    // ---- who may see and write ---------------------------------------------------------------------------------------

    @Test
    void anyoneWithoutTheKeyOrFromAnotherOrganizationGetsTheGenericNotFound() throws Exception {
        for (String who : List.of("c1", "hr", "plain")) {
            assertGeneric404(call(login(who), get(url(a))), who + " list");
            assertGeneric404(call(login(who), get(url(a) + "/summary")), who + " summary");
            assertGeneric404(call(login(who), get(url(a, r1))), who + " detail");
            assertGeneric404(call(login(who), post(url(a)), intake("Nope"), null, key()), who + " create");
        }
        assertGeneric404(call(login("bowner"), get(url(a))), "B's owner on A");
        assertGeneric404(call(login("bowner"), get(url(a, r1))), "B's owner reading A's requirement");
        assertGeneric404(call(login("bowner"), patch(url(a, r1)), "{\"priority\":\"LOW\"}", "\"1\"", null), "B's owner editing A's requirement");
        assertGeneric404(call(login("bowner"), post(url(a, r1) + "/assignments"), "{\"consultantId\":" + jessica.getId() + "}"), "B's owner assigning on A");
        assertGeneric404(call(login("bowner"), get(url(b, r1))), "A's requirement id under B's own org id");
        assertGeneric404(call(login("owner"), get(url(a, rB))), "B's requirement id through A");
        assertGeneric404(call(login("owner"), patch(url(a, rB)), "{\"priority\":\"LOW\"}", "\"1\"", null), "editing B's requirement through A");
        assertGeneric404(call(login("owner"), post(url(a, rB) + "/assignments"), "{\"consultantId\":" + jessica.getId() + "}"), "assigning on B's requirement through A");
    }

    @Test
    void theAccountManagerTheOwnerAndTheAdminCanRead() throws Exception {
        for (String who : List.of("owner", "admin", "am")) assertStatus(call(login(who), get(url(a))), 200);
    }

    @Test
    void aViewerWithoutRequirementsManageCanReadButNotWrite() throws Exception {
        // a marketing specialist holds pipeline.view, which is the Jobs board's view key too
        assertStatus(call(login("spec"), get(url(a))), 200);
        assertGeneric404(call(login("spec"), post(url(a)), intake("Nope"), null, key()), "create");
        assertGeneric404(call(login("spec"), patch(url(a, r1)), "{\"priority\":\"LOW\"}", etag("owner", r1), null), "edit");
        assertGeneric404(call(login("spec"), post(url(a, r1) + "/assignments"), "{\"consultantId\":" + jessica.getId() + "}"), "assign");
        assertGeneric404(call(login("spec"), get(url(a, r1) + "/candidates")), "candidates");
    }

    // ---- list, summary, detail ---------------------------------------------------------------------------------------

    @Test
    void theListShowsOnlyThisOrganizationsRequirementsNewestFirstWithTheirFigures() throws Exception {
        MvcResult r = call(login("am"), get(url(a)));
        assertStatus(r, 200);
        assertThat(r.getResponse().getHeader("X-Total-Count")).isEqualTo("3");
        JsonNode page = json(r);
        assertThat(titles(page)).containsExactly("ML Engineer", "Data Analyst", "Senior Frontend Engineer");
        JsonNode first = page.path("items").get(2);
        assertThat(first.path("consultantCount").asInt()).isEqualTo(1);
        assertThat(first.path("client").path("name").asText()).isEqualTo("Alpha Corp");
        assertThat(first.path("ageDays").asInt()).isGreaterThanOrEqualTo(20);
        assertThat(page.toString()).doesNotContain("Secret B");
    }

    @Test
    void filtersSearchSortAndPaging() throws Exception {
        assertThat(titles(list("am", "?status=ON_HOLD"))).containsExactly("Data Analyst");
        assertThat(titles(list("am", "?status=OPEN&status=ON_HOLD"))).hasSize(3);
        assertThat(titles(list("am", "?clientId=" + beta.getId()))).containsExactly("Data Analyst");
        assertThat(titles(list("am", "?clientId=" + secretB.getId()))).as("another tenant's client id finds nothing").isEmpty();
        assertThat(titles(list("am", "?assigned=NONE"))).containsExactlyInAnyOrder("ML Engineer", "Data Analyst");
        assertThat(titles(list("am", "?assigned=ANY"))).containsExactly("Senior Frontend Engineer");
        assertThat(titles(list("am", "?aging=true"))).as("open and older than 14 days").containsExactly("Senior Frontend Engineer");
        assertThat(titles(list("am", "?q=machine"))).isEmpty();
        assertThat(titles(list("am", "?q=ml"))).containsExactly("ML Engineer");
        assertThat(titles(list("am", "?q=beta"))).containsExactly("Data Analyst");
        assertThat(titles(list("am", "?q=%25"))).as("a percent sign is literal").isEmpty();
        assertThat(titles(list("am", "?sort=title&dir=asc"))).containsExactly("Data Analyst", "ML Engineer", "Senior Frontend Engineer");
        assertThat(titles(list("am", "?sort=age"))).first().isEqualTo("Senior Frontend Engineer");
        JsonNode firstPage = list("am", "?size=2&page=0&sort=title&dir=asc");
        assertThat(firstPage.path("total").asInt()).isEqualTo(3);
        assertThat(firstPage.path("hasNext").asBoolean()).isTrue();
        assertThat(titles(list("am", "?size=2&page=1&sort=title&dir=asc"))).containsExactly("Senior Frontend Engineer");
        assertCode(call(login("am"), get(url(a) + "?sort=nope")), 400, "SORT_INVALID");
        assertStatus(call(login("am"), get(url(a) + "?status=NOPE")), 422);
        assertStatus(call(login("am"), get(url(a) + "?assigned=MAYBE")), 422);
        assertStatus(call(login("am"), get(url(a) + "?size=500")), 422);
    }

    @Test
    void theSummaryCountsOpenWithoutAConsultantAgingAndContacts() throws Exception {
        MvcResult r = call(login("am"), get(url(a) + "/summary"));
        assertStatus(r, 200);
        JsonNode s = json(r);
        assertThat(s.path("open").asInt()).isEqualTo(2);
        assertThat(s.path("unassigned").asInt()).isEqualTo(1);
        assertThat(s.path("aging").asInt()).isEqualTo(1);
        assertThat(s.path("onHold").asInt()).isEqualTo(1);
        assertThat(s.path("contacts").asInt()).isEqualTo(1);
        assertThat(s.path("agingDays").asInt()).isEqualTo(14);
        assertThat(s.path("access").path("canCreate").asBoolean()).isTrue();
        List<String> clientNames = new java.util.ArrayList<>();
        s.path("clientOptions").forEach(c -> clientNames.add(c.path("name").asText()));
        assertThat(clientNames).containsExactly("Alpha Corp", "Beta Health");
        assertThat(s.toString()).doesNotContain("Secret B");
        assertThat(json(call(login("spec"), get(url(a) + "/summary"))).path("access").path("canCreate").asBoolean()).as("a viewer may not create").isFalse();
    }

    @Test
    void theDetailCarriesTheAssigneesAndAnEtag() throws Exception {
        MvcResult r = call(login("am"), get(url(a, r1)));
        assertStatus(r, 200);
        assertThat(r.getResponse().getHeader("ETag")).isNotBlank();
        JsonNode d = json(r);
        assertThat(d.path("requirement").path("title").asText()).isEqualTo("Senior Frontend Engineer");
        assertThat(d.path("assignees").get(0).path("name").asText()).isEqualTo("Jessica Davis");
        assertThat(d.path("version").asText()).isNotBlank();
    }

    // ---- intake -------------------------------------------------------------------------------------------------------

    @Test
    void anAccountManagerEntersARequirementManuallyWithEverythingTheClientAsked() throws Exception {
        long before = auditCount(a);
        String k = key();
        MvcResult r = call(login("am"), post(url(a)), intake("Platform Engineer"), null, k);
        assertStatus(r, 201);
        JsonNode d = json(r);
        JsonNode row = d.path("requirement");
        assertThat(row.path("title").asText()).isEqualTo("Platform Engineer");
        assertThat(row.path("status").asText()).isEqualTo("OPEN");
        assertThat(row.path("priority").asText()).isEqualTo("HIGH");
        assertThat(row.path("source").asText()).isEqualTo("MANUAL");
        assertThat(row.path("positions").asInt()).isEqualTo(2);
        assertThat(row.path("rate").path("min").asInt()).isEqualTo(70);
        assertThat(row.path("rate").path("unit").asText()).isEqualTo("HOUR");
        assertThat(row.path("dueOn").asText()).isEqualTo(LocalDate.now(ZoneOffset.UTC).plusDays(20).toString());
        assertThat(row.path("skills").toString()).contains("Java").contains("Spring");
        assertThat(auditCount(a) - before).as("one create row and one intake row").isEqualTo(2);
        assertThat(newestAudit(a).getAction()).isEqualTo("REQUIREMENT_INTAKE");
        assertThat(newestAudit(a).getDetails()).as("the audit row never carries the client's text").doesNotContain("Spring");
        MvcResult again = call(login("am"), post(url(a)), intake("Platform Engineer"), null, k);
        assertStatus(again, 201);
        assertThat(again.getResponse().getHeader("Idempotent-Replayed")).isEqualTo("true");
        assertThat(requirements.findByOrgId(a.getId())).as("the replay created nothing").hasSize(4);
        assertCode(call(login("am"), post(url(a)), intake("Platform Engineer"), null, null), 400, "IDEMPOTENCY_KEY_MISSING");
    }

    @Test
    void aPastedClientTextBecomesTheDescriptionAndNeedsText() throws Exception {
        String body = "{\"title\":\"Pasted Role\",\"clientId\":" + alpha.getId() + ",\"source\":\"PASTED_TEXT\",\"description\":\"We need a senior Java developer for a 6 month contract in Austin.\"}";
        MvcResult r = call(login("am"), post(url(a)), body, null, key());
        assertStatus(r, 201);
        assertThat(json(r).path("requirement").path("source").asText()).isEqualTo("PASTED_TEXT");
        assertThat(json(r).path("description").asText()).contains("senior Java developer");
        assertStatus(call(login("am"), post(url(a)), "{\"title\":\"Pasted Two\",\"clientId\":" + alpha.getId() + ",\"source\":\"PASTED_TEXT\"}", null, key()), 422);
    }

    @Test
    void aPostingLinkIsKeptAndTheSameLinkTwiceIsADuplicate() throws Exception {
        String body = "{\"title\":\"Linked Role\",\"clientId\":" + alpha.getId() + ",\"source\":\"LINK\",\"sourceUrl\":\"https://boards.example.com/jobs/12345\"}";
        MvcResult r = call(login("am"), post(url(a)), body, null, key());
        assertStatus(r, 201);
        assertThat(json(r).path("jobUrl").asText()).isEqualTo("https://boards.example.com/jobs/12345");
        MvcResult dup = call(login("am"), post(url(a)), body.replace("Linked Role", "Same posting, other words"), null, key());
        assertCode(dup, 409, "REQUIREMENT_EXISTS");
        assertThat(json(dup).path("existingId").asLong()).isEqualTo(json(r).path("requirement").path("id").asLong());
        assertStatus(call(login("am"), post(url(a)), body.replace("https://boards.example.com/jobs/12345", "javascript:alert(1)").replace("Linked Role", "Bad Link"), null, key()), 400);
        assertStatus(call(login("am"), post(url(a)), "{\"title\":\"No Link\",\"clientId\":" + alpha.getId() + ",\"source\":\"LINK\"}", null, key()), 400);
        assertStatus(call(login("am"), post(url(a)), "{\"title\":\"Stray Url\",\"clientId\":" + alpha.getId() + ",\"sourceUrl\":\"https://x.example.com/1\"}", null, key()), 422);
    }

    @Test
    void theSameClientTitleAndLocationIsRefusedWhileItIsLiveButNotAfterItClosed() throws Exception {
        String body = "{\"title\":\"  ml   ENGINEER \",\"clientId\":" + alpha.getId() + ",\"location\":\"austin tx\"}";
        MvcResult dup = call(login("am"), post(url(a)), body, null, key());
        assertCode(dup, 409, "REQUIREMENT_EXISTS");
        assertThat(json(dup).path("existingId").asLong()).isEqualTo(r2.getId());
        assertStatus(call(login("am"), post(url(a)), body.replace("alpha", "x").replace(String.valueOf(alpha.getId()), String.valueOf(beta.getId())), null, key()), 201);
        r2.setStatus("CLOSED");
        requirements.saveAndFlush(r2);
        assertStatus(call(login("am"), post(url(a)), body, null, key()), 201);
    }

    @Test
    void intakeValidatesAndRefusesSensitiveTextOtherClientsAndUnknownProperties() throws Exception {
        for (String bad : List.of(
            "{\"clientId\":" + alpha.getId() + "}",
            "{\"title\":\"x\",\"clientId\":" + alpha.getId() + "}",
            "{\"title\":\"Fine title\"}",
            "{\"title\":\"Fine title\",\"clientId\":" + alpha.getId() + ",\"priority\":\"SOON\"}",
            "{\"title\":\"Fine title\",\"clientId\":" + alpha.getId() + ",\"dueOn\":\"2001-01-01\"}",
            "{\"title\":\"Fine title\",\"clientId\":" + alpha.getId() + ",\"source\":\"CARRIER_PIGEON\"}",
            "{\"title\":\"Fine title\",\"clientId\":" + alpha.getId() + ",\"status\":\"FILLED\"}",
            "{\"title\":\"Fine title\",\"clientId\":" + alpha.getId() + ",\"rateMin\":100,\"rateMax\":50,\"rateUnit\":\"HOUR\"}",
            "{\"title\":\"Fine title\",\"clientId\":" + alpha.getId() + ",\"description\":\"Candidate SSN 123-45-6789 attached\"}",
            "{\"title\":\"Fine title\",\"clientId\":" + alpha.getId() + ",\"skills\":[\"SSN 123-45-6789\"]}",
            "{\"title\":\"Fine title\",\"clientId\":" + alpha.getId() + ",\"orgId\":" + b.getId() + "}"
        )) {
            MvcResult r = call(login("am"), post(url(a)), bad, null, key());
            assertThat(r.getResponse().getStatus()).as(bad).isEqualTo(422);
        }
        assertGeneric404(call(login("am"), post(url(a)), "{\"title\":\"Fine title\",\"clientId\":" + secretB.getId() + "}", null, key()), "another organization's client");
        assertThat(requirements.findByOrgId(a.getId())).hasSize(3);
        assertThat(requirements.findByOrgId(b.getId())).hasSize(1);
    }

    @Test
    void aContactOfAnotherClientIsRefused() throws Exception {
        String body = "{\"title\":\"Contact Role\",\"clientId\":" + beta.getId() + ",\"contactId\":" + pat.getId() + "}";
        assertStatus(call(login("am"), post(url(a)), body, null, key()), 422);
        String ok = "{\"title\":\"Contact Role\",\"clientId\":" + alpha.getId() + ",\"contactId\":" + pat.getId() + "}";
        MvcResult r = call(login("am"), post(url(a)), ok, null, key());
        assertStatus(r, 201);
        assertThat(json(r).path("contact").path("name").asText()).isEqualTo("Pat Contact");
    }

    // ---- edit and workflow --------------------------------------------------------------------------------------------

    @Test
    void editNeedsTheVersionAndChangesPriorityDueDateAndTheCoreFields() throws Exception {
        String tag = etag("am", r2);
        assertCode(call(login("am"), patch(url(a, r2)), "{\"priority\":\"URGENT\"}", null, null), 428, "PRECONDITION_REQUIRED");
        assertCode(call(login("am"), patch(url(a, r2)), "{\"priority\":\"URGENT\"}", "\"1\"", null), 412, "PRECONDITION_FAILED");
        long before = auditCount(a);
        String due = LocalDate.now(ZoneOffset.UTC).plusDays(10).toString();
        MvcResult r = call(login("am"), patch(url(a, r2)), "{\"priority\":\"URGENT\",\"dueOn\":\"" + due + "\",\"location\":\"Dallas, TX\",\"skills\":[\"Python\"]}", tag, null);
        assertStatus(r, 200);
        JsonNode row = json(r).path("requirement");
        assertThat(row.path("priority").asText()).isEqualTo("URGENT");
        assertThat(row.path("dueOn").asText()).isEqualTo(due);
        assertThat(row.path("location").asText()).isEqualTo("Dallas, TX");
        assertThat(row.path("skills").toString()).contains("Python");
        assertThat(auditCount(a, "JOB_UPDATE")).isGreaterThanOrEqualTo(1);
        assertThat(auditCount(a) - before).isPositive();
        String newTag = r.getResponse().getHeader("ETag");
        assertThat(newTag).isNotEqualTo(tag);
        // a request that changes nothing writes no audit row
        long quiet = auditCount(a);
        assertStatus(call(login("am"), patch(url(a, r2)), "{\"priority\":\"URGENT\"}", newTag, null), 200);
        assertThat(auditCount(a)).isEqualTo(quiet);
        // the due date can be cleared
        JsonNode cleared = json(call(login("am"), patch(url(a, r2)), "{\"dueOn\":null}", etag("am", r2), null));
        assertThat(cleared.path("requirement").path("dueOn").isNull()).isTrue();
    }

    @Test
    void editRefusesUnknownKeysBadValuesAndSensitiveText() throws Exception {
        for (String bad : List.of("{\"clientId\":1}", "{\"orgId\":1}", "{\"source\":\"MANUAL\"}", "{\"priority\":\"SOON\"}", "{\"priority\":null}", "{\"dueOn\":\"yesterday\"}", "{\"dueOn\":\"1999-01-01\"}", "{\"description\":\"SSN 123-45-6789\"}", "{\"status\":\"WHATEVER\"}", "{}")) {
            MvcResult r = call(login("am"), patch(url(a, r2)), bad, etag("am", r2), null);
            assertThat(r.getResponse().getStatus()).as(bad).isEqualTo(422);
        }
    }

    @Test
    void movingToHoldAndBackAndFillingWorks() throws Exception {
        JsonNode hold = json(call(login("am"), patch(url(a, r2)), "{\"status\":\"ON_HOLD\"}", etag("am", r2), null));
        assertThat(hold.path("requirement").path("status").asText()).isEqualTo("ON_HOLD");
        JsonNode open = json(call(login("am"), patch(url(a, r2)), "{\"status\":\"OPEN\"}", etag("am", r2), null));
        assertThat(open.path("requirement").path("status").asText()).isEqualTo("OPEN");
        JsonNode filled = json(call(login("am"), patch(url(a, r2)), "{\"status\":\"FILLED\"}", etag("am", r2), null));
        assertThat(filled.path("requirement").path("status").asText()).isEqualTo("FILLED");
        assertThat(auditCount(a, "JOB_STATUS")).isEqualTo(3);
        assertThat(titles(list("am", "?status=OPEN"))).doesNotContain("ML Engineer");
    }

    // Assigning writes through REQUIRES_NEW helpers (the match insert and its ledger row). A new transaction cannot see, and its foreign keys lock-wait on, rows the
    // class transaction has not committed (the organization, the requirement, the consultant): the call timed out in a 50 s lock wait. Like MktJobsIT, this test
    // runs without the class transaction; its world is named by nanoTime, so what it commits touches no other test.
    @Test
    @Transactional(propagation = org.springframework.transaction.annotation.Propagation.NOT_SUPPORTED)
    void closingARequirementClosesTheAssignmentsStillOpenOnIt() throws Exception {
        MvcResult put = call(login("am"), post(url(a, r2) + "/assignments"), "{\"consultantId\":" + jessica.getId() + "}");
        assertStatus(put, 200);
        long opportunitiesBefore = ((Number) em.createNativeQuery("select count(*) from mkt_opportunity where org_id = ?1 and state = 'ASSIGNED'").setParameter(1, a.getId()).getSingleResult()).longValue();
        assertThat(opportunitiesBefore).isEqualTo(1);
        assertStatus(call(login("am"), patch(url(a, r2)), "{\"status\":\"CLOSED\"}", etag("am", r2), null), 200);
        long stillOpen = ((Number) em.createNativeQuery("select count(*) from mkt_opportunity where org_id = ?1 and state = 'ASSIGNED'").setParameter(1, a.getId()).getSingleResult()).longValue();
        assertThat(stillOpen).as("the opportunity was closed with the requirement").isZero();
        assertThat(auditCount(a, "REQUIREMENT_CLOSE")).isEqualTo(1);
    }

    // ---- assign -------------------------------------------------------------------------------------------------------

    @Test
    void candidatesAreActiveConsultantsWithTheirNameAndTitleOnly() throws Exception {
        MvcResult r = call(login("am"), get(url(a, r2) + "/candidates"));
        assertStatus(r, 200);
        JsonNode list = json(r);
        assertThat(list).hasSize(2);
        assertThat(list.toString()).doesNotContain("@example.com").doesNotContain("Secret");
        assertThat(json(call(login("am"), get(url(a, r2) + "/candidates?q=jess"))).get(0).path("name").asText()).isEqualTo("Jessica Davis");
    }

    // Assigning writes through REQUIRES_NEW helpers (the match insert and its ledger row). A new transaction cannot see, and its foreign keys lock-wait on, rows the
    // class transaction has not committed (the organization, the requirement, the consultant): the call timed out in a 50 s lock wait. Like MktJobsIT, this test
    // runs without the class transaction; its world is named by nanoTime, so what it commits touches no other test.
    @Test
    @Transactional(propagation = org.springframework.transaction.annotation.Propagation.NOT_SUPPORTED)
    void puttingARequirementInFrontOfAConsultantRecordsItOnceAndTheConsultantStillDecides() throws Exception {
        long before = auditCount(a, "REQUIREMENT_ASSIGN");
        MvcResult r = call(login("am"), post(url(a, r2) + "/assignments"), "{\"consultantId\":" + jessica.getId() + "}");
        assertStatus(r, 200);
        JsonNode result = json(r);
        assertThat(result.path("created").asBoolean()).isTrue();
        assertThat(result.path("requirement").path("requirement").path("consultantCount").asInt()).isEqualTo(1);
        assertThat(result.path("requirement").path("assignees").get(0).path("name").asText()).isEqualTo("Jessica Davis");
        assertThat(auditCount(a, "REQUIREMENT_ASSIGN") - before).isEqualTo(1);
        assertThat(((Number) em.createNativeQuery("select count(*) from talent_application where org_id = ?1 and requirement_id = ?2").setParameter(1, a.getId()).setParameter(2, r2.getId()).getSingleResult()).longValue())
            .as("nobody applies for the consultant").isZero();
        MvcResult again = call(login("am"), post(url(a, r2) + "/assignments"), "{\"consultantId\":" + jessica.getId() + "}");
        assertStatus(again, 200);
        assertThat(json(again).path("existing").asBoolean()).isTrue();
        assertThat(titles(list("am", "?assigned=NONE"))).doesNotContain("ML Engineer");
    }

    @Test
    void assigningRefusesAConsultantWithoutAnApprovedResumeAnotherTenantsConsultantAndAClosedRequirement() throws Exception {
        assertCode(call(login("am"), post(url(a, r2) + "/assignments"), "{\"consultantId\":" + nobodyReady.getId() + "}"), 409, "RESUME_NOT_APPROVED");
        ConsultantProfile foreign = consultant(b, "Foreign Fiona");
        assertGeneric404(call(login("am"), post(url(a, r2) + "/assignments"), "{\"consultantId\":" + foreign.getId() + "}"), "another organization's consultant");
        assertStatus(call(login("am"), post(url(a, r2) + "/assignments"), "{}"), 422);
        assertStatus(call(login("am"), post(url(a, r2) + "/assignments"), "{\"consultantId\":" + jessica.getId() + ",\"orgId\":" + b.getId() + "}"), 422);
        r3.setStatus("CLOSED");
        requirements.saveAndFlush(r3);
        assertCode(call(login("am"), post(url(a, r3) + "/assignments"), "{\"consultantId\":" + jessica.getId() + "}"), 409, "JOB_NOT_OPEN");
    }

    @Test
    void aClosedOrganizationCannotBeWritten() throws Exception {
        a.setStatus(com.dossier.api.domain.enumeration.OrgStatus.CLOSED);
        orgs.saveAndFlush(a);
        assertGeneric404(call(login("am"), post(url(a)), intake("Late One"), null, key()), "create in a closed organization");
    }
}
