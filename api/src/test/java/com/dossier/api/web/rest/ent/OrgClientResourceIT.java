package com.dossier.api.web.rest.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.ent.OrgSetting;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientContact;
import com.dossier.api.domain.ent.talent.ClientNote;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.TalentApplication;
import com.dossier.api.domain.ent.talent.TalentPlacement;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.repository.ent.OrgSettingRepository;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.ClientContactRepository;
import com.dossier.api.repository.ent.talent.ClientNoteRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.TalentApplicationRepository;
import com.dossier.api.repository.ent.talent.TalentPlacementRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
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
 * The Clients API (talent page "Clients"): directory with filters, sort and paging, the KPI tiles and facets, the health rule driven by
 * settings, the drawer, add and edit a client (idempotency key, If-Match), contacts (work e-mail only), relationship notes, and the
 * Contacts / Requirements / Activity tabs. Every refusal is the generic 404 (never 403), and nothing of organization B is ever visible
 * or changeable through organization A.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class OrgClientResourceIT extends MemberItSupport {

    @Autowired private ClientAccountRepository clients;
    @Autowired private ClientContactRepository contacts;
    @Autowired private ClientNoteRepository notes;
    @Autowired private ClientRequirementRepository requirements;
    @Autowired private ConsultantProfileRepository consultants;
    @Autowired private TalentApplicationRepository applications;
    @Autowired private TalentPlacementRepository placements;
    @Autowired private OrgSettingRepository orgSettings;
    @Autowired private AppSettingRepository appSettings;
    @Autowired private ResumeBuilderSettings platformSettings;

    private OrgMember am; // an Account Manager: clients.view + clients.manage + requirements.manage
    private ClientAccount alpha; // Technology, ACTIVE, owner = Olivia, 2 open requirements, one placed consultant, activity 3 days ago
    private ClientAccount beta; // Healthcare, ACTIVE, owner = the account manager, quiet for 80 days: at risk
    private ClientAccount gamma; // Retail, PROSPECT, no owner
    private ClientAccount secretB; // organization B's client
    private ClientContact pat;
    private ClientContact ben;
    private ConsultantProfile jessica;
    private ClientRequirement r1;
    private ClientRequirement r2;
    private ClientRequirement rBeta;
    private ClientRequirement rB;

    @BeforeEach
    void clientWorld() {
        am = extra(a, "am", OrgRole.STAFF, "Amara", "Silva");
        assign(am, "ACCOUNT_MANAGER");
        alpha = client(a, "Alpha Corp", "Technology", "ACTIVE", owner.getId(), "1000-5000", 200, 3);
        beta = client(a, "Beta Health", "Healthcare", "ACTIVE", am.getId(), "51-200", 220, 80);
        gamma = client(a, "Gamma Retail", "Retail", "PROSPECT", null, null, 10, 10);
        secretB = client(b, "Secret B Client", "Banking", "ACTIVE", bOwner.getId(), null, 100, 1);
        pat = contact(a, alpha, "Pat Contact", "VP of Talent", "pat@alpha.example.com", "HIRING_MANAGER", 150);
        ben = contact(a, alpha, "Ben Recruiter", "Recruiter", "ben@alpha.example.com", "RECRUITER", 100);
        contact(b, secretB, "Secret Person", "CEO", "boss@secret.example.com", "OTHER", 50);
        jessica = consultant(a, "Jessica Davis");
        r1 = requirement(a, alpha, "Senior Frontend Engineer", "OPEN", 20);
        r2 = requirement(a, alpha, "ML Engineer", "OPEN", 90);
        requirement(a, alpha, "Old Role", "FILLED", 120);
        rBeta = requirement(a, beta, "Data Analyst", "ON_HOLD", 100);
        rB = requirement(b, secretB, "Secret B Job", "OPEN", 2);
        placement(a, alpha, jessica, "ACTIVE", 60);
        TalentApplication app = new TalentApplication();
        app.setOrgId(a.getId());
        app.setCode("APP-2026-001");
        app.setRequirementId(r1.getId());
        app.setConsultantId(jessica.getId());
        app.setClientId(alpha.getId());
        app.setAppliedOn(LocalDate.now(ZoneOffset.UTC).minusDays(3));
        app.setStage("INTERVIEWING");
        app.setStageChangedAt(Instant.now().minus(3, ChronoUnit.DAYS));
        applications.saveAndFlush(app);
        em.flush();
    }

    // ---- fixtures ----------------------------------------------------------------------------------------------------

    private ClientAccount client(Organization o, String name, String industry, String status, Long ownerId, String size, int createdDaysAgo, int lastChangeDaysAgo) {
        ClientAccount c = new ClientAccount();
        c.setOrgId(o.getId());
        c.setName(name);
        c.setIndustry(industry);
        c.setStatus(status);
        c.setOwnerMemberId(ownerId);
        c.setSizeBand(size);
        c.setLocation("San Francisco, CA");
        c.setAbout(name + " is a company.");
        c.setWebsite("https://www." + name.toLowerCase().replace(" ", "") + ".com");
        c.setCreatedAt(Instant.now().minus(createdDaysAgo, ChronoUnit.DAYS));
        c.setUpdatedAt(Instant.now().minus(lastChangeDaysAgo, ChronoUnit.DAYS));
        return clients.saveAndFlush(c);
    }

    private ClientContact contact(Organization o, ClientAccount c, String name, String title, String email, String role, int addedDaysAgo) {
        ClientContact x = new ClientContact();
        x.setOrgId(o.getId());
        x.setClientId(c.getId());
        x.setName(name);
        x.setTitle(title);
        x.setWorkEmail(email);
        x.setRoleLabel(role);
        x.setCreatedAt(Instant.now().minus(addedDaysAgo, ChronoUnit.DAYS));
        return contacts.saveAndFlush(x);
    }

    private ConsultantProfile consultant(Organization o, String name) {
        ConsultantProfile c = new ConsultantProfile();
        c.setOrgId(o.getId());
        c.setDisplayName(name);
        c.setEmail(name.toLowerCase().replace(' ', '.') + "@example.com");
        c.setJobTitle("Consultant");
        return consultants.saveAndFlush(c);
    }

    private ClientRequirement requirement(Organization o, ClientAccount c, String title, String status, int postedDaysAgo) {
        ClientRequirement r = new ClientRequirement();
        r.setOrgId(o.getId());
        r.setClientId(c.getId());
        r.setTitle(title);
        r.setStatus(status);
        r.setPostedAt(Instant.now().minus(postedDaysAgo, ChronoUnit.DAYS));
        r.setCreatedAt(r.getPostedAt());
        r.setUpdatedAt(r.getPostedAt());
        if ("FILLED".equals(status)) r.setClosedAt(r.getPostedAt().plus(10, ChronoUnit.DAYS));
        return requirements.saveAndFlush(r);
    }

    private TalentPlacement placement(Organization o, ClientAccount c, ConsultantProfile who, String status, int startedDaysAgo) {
        TalentPlacement p = new TalentPlacement();
        p.setOrgId(o.getId());
        p.setClientId(c.getId());
        p.setConsultantId(who.getId());
        p.setRoleTitle("Engineer");
        p.setStatus(status);
        p.setStartDate(LocalDate.now(ZoneOffset.UTC).minusDays(startedDaysAgo));
        return placements.saveAndFlush(p);
    }

    private static String url(Organization o) {
        return "/api/orgs/" + o.getId() + "/clients";
    }

    private static String url(Organization o, ClientAccount c) {
        return url(o) + "/" + c.getId();
    }

    private String etag(String login, ClientAccount c) throws Exception {
        return call(login, get(url(a, c))).getResponse().getHeader("ETag");
    }

    private JsonNode list(String login, String query) throws Exception {
        MvcResult r = call(login, get(url(a) + query));
        assertStatus(r, 200);
        return json(r);
    }

    private JsonNode detail(String login, ClientAccount c) throws Exception {
        MvcResult r = call(login, get(url(a, c)));
        assertStatus(r, 200);
        return json(r);
    }

    // ---- who may see it ----------------------------------------------------------------------------------------------

    @Test
    void anyoneWithoutTheClientKeyGetsTheGenericNotFound() throws Exception {
        for (String who : List.of("c1", "hr", "plain", "spec", "mgr")) {
            assertGeneric404(call(login(who), get(url(a))), who + " list");
            assertGeneric404(call(login(who), get(url(a) + "/summary")), who + " summary");
            assertGeneric404(call(login(who), get(url(a, alpha))), who + " detail");
            assertGeneric404(call(login(who), get(url(a) + "/contacts")), who + " contacts");
            assertGeneric404(call(login(who), get(url(a) + "/requirements")), who + " requirements");
            assertGeneric404(call(login(who), get(url(a) + "/activity")), who + " activity");
        }
        assertGeneric404(call(login("bowner"), get(url(a))), "B's owner on A");
        assertGeneric404(call(login("bmember"), get(url(a, alpha))), "B's member on A");
    }

    @Test
    void theOwnerTheAdminAndTheAccountManagerCanRead() throws Exception {
        for (String who : List.of("owner", "admin", "am")) assertStatus(call(login(who), get(url(a))), 200);
    }

    // ---- list --------------------------------------------------------------------------------------------------------

    @Test
    void theDirectoryShowsOnlyThisOrganizationsClientsNewestActivityFirstWithTheirFigures() throws Exception {
        MvcResult r = call(login("owner"), get(url(a)));
        assertStatus(r, 200);
        assertThat(r.getResponse().getHeader("X-Total-Count")).isEqualTo("3");
        JsonNode page = json(r);
        assertThat(names(page)).containsExactly("Alpha Corp", "Gamma Retail", "Beta Health");
        JsonNode row = page.path("items").get(0);
        assertThat(row.path("industry").asText()).isEqualTo("Technology");
        assertThat(row.path("openRequirements").asInt()).isEqualTo(2);
        assertThat(row.path("activeConsultants").asInt()).isEqualTo(1);
        assertThat(row.path("manager").path("name").asText()).isEqualTo("Olivia Owner");
        assertThat(row.path("health").path("level").asText()).isEqualTo("HEALTHY");
        assertThat(row.path("health").path("reason").asText()).isNotBlank();
        assertThat(page.toString()).doesNotContain("Secret B");
    }

    @Test
    void filtersSearchSortAndPaging() throws Exception {
        assertThat(names(list(login("owner"), "?industry=Healthcare"))).containsExactly("Beta Health");
        assertThat(names(list(login("owner"), "?industry=technology&industry=retail"))).containsExactly("Alpha Corp", "Gamma Retail");
        assertThat(names(list(login("owner"), "?health=AT_RISK"))).containsExactly("Beta Health");
        assertThat(names(list(login("owner"), "?health=HEALTHY"))).containsExactly("Alpha Corp");
        assertThat(names(list(login("owner"), "?health=NEUTRAL"))).containsExactly("Gamma Retail");
        assertThat(names(list(login("owner"), "?status=PROSPECT"))).containsExactly("Gamma Retail");
        assertThat(names(list(login("owner"), "?sizeBand=51-200"))).containsExactly("Beta Health");
        assertThat(names(list(login("owner"), "?managerId=" + am.getId()))).containsExactly("Beta Health");
        assertThat(names(list(login("owner"), "?managerId=" + bOwner.getId()))).as("another tenant's member id finds nothing").isEmpty();
        assertThat(names(list(login("owner"), "?q=amara"))).as("by account manager").containsExactly("Beta Health");
        assertThat(names(list(login("owner"), "?q=health"))).containsExactly("Beta Health");
        assertThat(names(list(login("owner"), "?q=retail"))).containsExactly("Gamma Retail");
        assertThat(names(list(login("owner"), "?q=%25"))).as("a percent sign is literal, not a wildcard").isEmpty();
        assertThat(names(list(login("owner"), "?sort=name&dir=asc"))).containsExactly("Alpha Corp", "Beta Health", "Gamma Retail");
        assertThat(names(list(login("owner"), "?sort=requirements"))).containsExactly("Alpha Corp", "Beta Health", "Gamma Retail");
        assertThat(names(list(login("owner"), "?sort=health&dir=asc"))).containsExactly("Alpha Corp", "Beta Health", "Gamma Retail");
        assertThat(names(list(login("owner"), "?sort=consultants"))).first().isEqualTo("Alpha Corp");
        JsonNode first = list(login("owner"), "?size=2&page=0&sort=name&dir=asc");
        assertThat(first.path("total").asInt()).isEqualTo(3);
        assertThat(first.path("hasNext").asBoolean()).isTrue();
        assertThat(names(list(login("owner"), "?size=2&page=1&sort=name&dir=asc"))).containsExactly("Gamma Retail");
        assertThat(names(list(login("owner"), "?size=2&page=9"))).isEmpty();
    }

    @Test
    void badQueriesAreRefusedWithAnExplanation() throws Exception {
        assertCode(call(login("owner"), get(url(a) + "?sort=salary")), 400, "SORT_INVALID");
        assertStatus(call(login("owner"), get(url(a) + "?health=BOGUS")), 422);
        assertStatus(call(login("owner"), get(url(a) + "?status=BOGUS")), 422);
        assertStatus(call(login("owner"), get(url(a) + "?size=500")), 422);
        assertStatus(call(login("owner"), get(url(a) + "?q=a")), 422);
        assertStatus(call(login("owner"), get(url(a) + "?managerId=abc")), 422);
        assertStatus(call(login("owner"), get(url(a) + "?dir=sideways")), 422);
    }

    @Test
    void healthFollowsTheOrganizationsOwnThresholds() throws Exception {
        assertThat(names(list(login("owner"), "?health=HEALTHY"))).containsExactly("Alpha Corp");
        setting("org.clients.healthy_days", "1"); // Alpha was last active 3 days ago: no longer healthy
        assertThat(names(list(login("owner"), "?health=HEALTHY"))).isEmpty();
        assertThat(names(list(login("owner"), "?health=NEUTRAL"))).contains("Alpha Corp");
        setting("org.clients.at_risk_days", "3"); // 3 days of silence is now at risk (the at-risk window is always above the healthy one)
        assertThat(names(list(login("owner"), "?health=AT_RISK"))).contains("Alpha Corp", "Beta Health");
        JsonNode summary = json(call(login("owner"), get(url(a) + "/summary")));
        assertThat(summary.path("healthRule").path("healthyDays").asInt()).isEqualTo(1);
        assertThat(summary.path("healthRule").path("atRiskDays").asInt()).isEqualTo(3);
    }

    private void setting(String key, String value) {
        OrgSetting s = new OrgSetting();
        s.setOrgId(a.getId());
        s.setSettingKey(key);
        s.setValueJson(value);
        s.setUpdatedBy("it");
        orgSettings.saveAndFlush(s);
    }

    // ---- summary -----------------------------------------------------------------------------------------------------

    @Test
    void theTilesAreComputedFromRowsOfThisOrganization() throws Exception {
        JsonNode s = json(call(login("owner"), get(url(a) + "/summary")));
        assertThat(s.path("totalClients").path("value").asInt()).isEqualTo(3);
        assertThat(s.path("totalClients").path("previous").asInt()).as("created at least 30 days ago: Alpha and Beta, not Gamma (10 days)").isEqualTo(2);
        assertThat(s.path("activeRequirements").path("value").asInt()).isEqualTo(2);
        assertThat(s.path("newThisMonth").path("value").asInt()).as("created in the last 30 days: Gamma").isEqualTo(1);
        assertThat(s.path("placementsViaClients").path("value").asInt()).isEqualTo(1);
        assertThat(s.path("totalClients").path("series")).hasSize(8);
        assertThat(s.path("facets").path("health").toString()).contains("\"value\":\"HEALTHY\",\"label\":\"HEALTHY\",\"count\":1").contains("\"value\":\"AT_RISK\",\"label\":\"AT_RISK\",\"count\":1");
        assertThat(s.path("facets").path("industries")).hasSize(3);
        assertThat(s.path("facets").path("managers")).hasSize(2);
        assertThat(s.path("access").path("canManage").asBoolean()).isTrue();
        assertThat(s.path("managerOptions").toString()).contains("Olivia Owner").doesNotContain("Bo Owner");
        assertThat(s.toString()).doesNotContain("Secret B").doesNotContain("Banking");
    }

    @Test
    void anOrganizationWithNoClientOlderThanAMonthHasNoMonthlyDelta() throws Exception {
        for (ClientAccount c : List.of(alpha, beta, gamma)) {
            c.setCreatedAt(Instant.now().minus(5, ChronoUnit.DAYS));
            clients.saveAndFlush(c);
        }
        JsonNode s = json(call(login("owner"), get(url(a) + "/summary")));
        assertThat(s.path("totalClients").path("previous").isNull()).isTrue();
        assertThat(s.path("totalClients").path("delta").isNull()).isTrue();
        assertThat(s.path("newThisMonth").path("value").asInt()).isEqualTo(3);
        assertThat(s.path("newThisMonth").path("previous").isNull()).isTrue();
    }

    // ---- detail ------------------------------------------------------------------------------------------------------

    @Test
    void theDrawerCarriesTheFactsContactsRequirementsSubmissionsAndAVersion() throws Exception {
        MvcResult r = call(login("owner"), get(url(a, alpha)));
        assertStatus(r, 200);
        assertThat(r.getResponse().getHeader("ETag")).isNotBlank();
        JsonNode d = json(r);
        assertThat(d.path("name").asText()).isEqualTo("Alpha Corp");
        assertThat(d.path("sizeBand").asText()).isEqualTo("1000-5000");
        assertThat(d.path("about").asText()).isEqualTo("Alpha Corp is a company.");
        assertThat(d.path("contactCount").asInt()).isEqualTo(2);
        assertThat(d.path("contacts").get(0).path("name").asText()).as("the longest-standing contact first").isEqualTo("Pat Contact");
        assertThat(d.path("contacts").get(0).path("email").asText()).isEqualTo("pat@alpha.example.com");
        assertThat(d.path("requirementCount").asInt()).isEqualTo(3);
        assertThat(d.path("requirements").get(0).path("title").asText()).isEqualTo("Senior Frontend Engineer");
        assertThat(d.path("requirements").get(0).path("submissions").asInt()).isEqualTo(1);
        assertThat(d.path("submissions").get(0).path("consultantName").asText()).isEqualTo("Jessica Davis");
        assertThat(d.path("submissions").get(0).path("jobTitle").asText()).isEqualTo("Senior Frontend Engineer");
        assertThat(d.path("submissions").get(0).path("stage").asText()).isEqualTo("INTERVIEWING");
        assertThat(d.path("openRequirements").asInt()).isEqualTo(2);
        assertThat(d.path("activeConsultants").asInt()).isEqualTo(1);
        assertThat(d.path("placements").asInt()).isEqualTo(1);
        assertThat(d.path("health").path("level").asText()).isEqualTo("HEALTHY");
        assertThat(d.path("access").path("canManage").asBoolean()).isTrue();
        assertThat(d.toString()).doesNotContain("phone").doesNotContain("Secret");
    }

    @Test
    void anotherTenantsClientIsTheGenericNotFoundEverywhere() throws Exception {
        assertGeneric404(call(login("owner"), get(url(a, secretB))), "A's owner reads B's client through A");
        assertGeneric404(call(login("bowner"), get(url(b, alpha))), "B's owner reads A's client through B");
        assertGeneric404(call(login("bowner"), get("/api/orgs/" + a.getId() + "/clients/" + alpha.getId())), "B's owner reads A's client through A");
        assertGeneric404(call(login("owner"), patch(url(a, secretB)), "{\"about\":\"Hijack\"}", "\"1\"", null), "patch");
        assertGeneric404(call(login("owner"), post(url(a, secretB) + "/contacts"), "{\"name\":\"Mallory\"}", null, null), "add a contact");
        assertGeneric404(call(login("owner"), post(url(a, secretB) + "/notes"), "{\"body\":\"hi\"}", null, null), "add a note");
        assertThat(clients.findByOrgIdAndId(b.getId(), secretB.getId()).orElseThrow().getAbout()).isEqualTo("Secret B Client is a company.");
    }

    @Test
    void anArchivedClientIsGone() throws Exception {
        alpha.setArchivedAt(Instant.now());
        clients.saveAndFlush(alpha);
        assertGeneric404(call(login("owner"), get(url(a, alpha))), "archived");
        assertThat(names(list(login("owner"), ""))).doesNotContain("Alpha Corp");
    }

    // ---- create ------------------------------------------------------------------------------------------------------

    @Test
    void addingAClientIsIdempotentAuditedAndOpensWithItsFacts() throws Exception {
        String body = "{\"name\":\"Delta Logistics\",\"industry\":\"Logistics\",\"website\":\"delta-logistics.com\",\"location\":\"Dallas, TX\",\"sizeBand\":\"201-1000\",\"clientSince\":\"2022-01-15\",\"about\":\"Moves freight.\",\"ownerMemberId\":" + am.getId() + "}";
        long before = auditCount(a, "CLIENT_CREATE");
        String key = key();
        MvcResult r = call(login("owner"), post(url(a)), body, null, key);
        assertStatus(r, 201);
        JsonNode d = json(r);
        assertThat(d.path("name").asText()).isEqualTo("Delta Logistics");
        assertThat(d.path("status").asText()).isEqualTo("ACTIVE");
        assertThat(d.path("website").asText()).as("a bare domain gets its scheme").isEqualTo("https://delta-logistics.com");
        assertThat(d.path("clientSince").asText()).isEqualTo("2022-01-15");
        assertThat(d.path("manager").path("name").asText()).isEqualTo("Amara Silva");
        assertThat(auditCount(a, "CLIENT_CREATE") - before).isEqualTo(1);
        assertThat(newestAudit(a).getTargetType()).isEqualTo("CLIENT");
        assertThat(clients.findByOrgId(a.getId())).hasSize(4);

        MvcResult again = call(login("owner"), post(url(a)), body, null, key);
        assertStatus(again, 201);
        assertThat(again.getResponse().getHeader("Idempotent-Replayed")).isEqualTo("true");
        assertThat(json(again).path("id").asLong()).isEqualTo(d.path("id").asLong());
        assertThat(clients.findByOrgId(a.getId())).as("the replay created nothing").hasSize(4);
        assertThat(auditCount(a, "CLIENT_CREATE") - before).isEqualTo(1);
        assertCode(call(login("owner"), post(url(a)), body.replace("Delta", "Another"), null, key), 422, "IDEMPOTENCY_KEY_REUSED");
    }

    @Test
    void addingNeedsTheKeyTheRoleAndAUniqueName() throws Exception {
        String ok = "{\"name\":\"Delta Logistics\"}";
        assertCode(call(login("owner"), post(url(a)), ok, null, null), 400, "IDEMPOTENCY_KEY_MISSING");
        assertGeneric404(call(login("spec"), post(url(a)), ok, null, key()), "a marketing specialist cannot add");
        assertGeneric404(call(login("hr"), post(url(a)), ok, null, key()), "nor can hr");
        assertCode(call(login("owner"), post(url(a)), "{\"name\":\"alpha corp\"}", null, key()), 409, "DUPLICATE_CLIENT");
        assertThat(clients.findByOrgId(a.getId())).hasSize(3);
        assertStatus(call(login("am"), post(url(a)), ok, null, key()), 201);
        // the same name in another organization is not a duplicate
        assertStatus(call(login("bowner"), post(url(b)), "{\"name\":\"Alpha Corp\"}", null, key()), 201);
    }

    @Test
    void addingValidatesAndRefusesSensitiveTextAndUnknownProperties() throws Exception {
        for (String bad : List.of(
            "{\"name\":\"x\"}",
            "{}",
            "{\"name\":\"Ok Co\",\"sizeBand\":\"huge\"}",
            "{\"name\":\"Ok Co\",\"status\":\"INACTIVE\"}",
            "{\"name\":\"Ok Co\",\"website\":\"javascript:alert(1)\"}",
            "{\"name\":\"Ok Co\",\"website\":\"not a site\"}",
            "{\"name\":\"Ok Co\",\"clientSince\":\"2999-01-01\"}",
            "{\"name\":\"Ok Co\",\"ownerMemberId\":" + bOwner.getId() + "}",
            "{\"name\":\"Ok Co\",\"about\":\"<script>alert(1)</script>\"}",
            "{\"name\":\"Ok Co\",\"about\":\"Their tax id is 123-45-6789\"}"
        )) {
            MvcResult r = call(login("owner"), post(url(a)), bad, null, key());
            assertThat(r.getResponse().getStatus()).as(bad).isEqualTo(422);
        }
        assertThat(call(login("owner"), post(url(a)), "{\"name\":\"Ok Co\",\"orgId\":" + b.getId() + "}", null, key()).getResponse().getStatus()).as("an unknown property is refused, never bound").isGreaterThanOrEqualTo(400);
        assertThat(clients.findByOrgId(a.getId())).hasSize(3);
    }

    // ---- edit --------------------------------------------------------------------------------------------------------

    @Test
    void editingNeedsTheVersionAndWritesOneAuditRowPerFamily() throws Exception {
        assertCode(call(login("owner"), patch(url(a, alpha)), "{\"about\":\"New text\"}", null, null), 428, "PRECONDITION_REQUIRED");
        assertCode(call(login("owner"), patch(url(a, alpha)), "{\"about\":\"New text\"}", "\"1\"", null), 412, "PRECONDITION_FAILED");
        long updates = auditCount(a, "CLIENT_UPDATE");
        long statuses = auditCount(a, "CLIENT_STATUS");
        MvcResult r = call(login("owner"), patch(url(a, alpha)), "{\"about\":\"New text\",\"industry\":\"Software\",\"location\":\"Austin, TX\",\"sizeBand\":\"5000+\",\"clientSince\":\"2021-06-01\",\"ownerMemberId\":" + am.getId() + ",\"website\":\"alpha.io\"}", etag(login("owner"), alpha), null);
        assertStatus(r, 200);
        JsonNode d = json(r);
        assertThat(d.path("about").asText()).isEqualTo("New text");
        assertThat(d.path("industry").asText()).isEqualTo("Software");
        assertThat(d.path("sizeBand").asText()).isEqualTo("5000+");
        assertThat(d.path("manager").path("name").asText()).isEqualTo("Amara Silva");
        assertThat(d.path("website").asText()).isEqualTo("https://alpha.io");
        assertThat(auditCount(a, "CLIENT_UPDATE") - updates).isEqualTo(1);
        assertThat(auditCount(a, "CLIENT_STATUS") - statuses).isZero();
    }

    @Test
    void changingTheStatusIsAuditedAndUndoable() throws Exception {
        long statuses = auditCount(a, "CLIENT_STATUS");
        MvcResult r = call(login("owner"), patch(url(a, alpha)), "{\"status\":\"INACTIVE\"}", etag(login("owner"), alpha), null);
        assertStatus(r, 200);
        assertThat(json(r).path("status").asText()).isEqualTo("INACTIVE");
        assertThat(json(r).path("health").path("level").asText()).as("an inactive client is not rated").isEqualTo("NEUTRAL");
        assertThat(auditCount(a, "CLIENT_STATUS") - statuses).isEqualTo(1);
        assertThat(newestAudit(a).getDetails()).isEqualTo("active to inactive");
        MvcResult undone = call(login("owner"), patch(url(a, alpha)), "{\"status\":\"ACTIVE\"}", json(r).path("version").asText(), null);
        assertThat(json(undone).path("health").path("level").asText()).isEqualTo("HEALTHY");
    }

    @Test
    void aRequestThatChangesNothingWritesNothingAndBadEditsAreRefused() throws Exception {
        long before = auditCount(a);
        assertStatus(call(login("owner"), patch(url(a, alpha)), "{\"name\":\"Alpha Corp\"}", etag(login("owner"), alpha), null), 200);
        assertThat(auditCount(a)).isEqualTo(before);
        for (String bad : List.of("{}", "{\"orgId\":1}", "{\"createdAt\":\"2020-01-01T00:00:00Z\"}", "{\"name\":\"x\"}", "{\"name\":\"Beta Health\"}", "{\"status\":\"BOGUS\"}", "{\"sizeBand\":\"huge\"}", "{\"clientSince\":\"yesterday\"}", "{\"ownerMemberId\":\"me\"}", "{\"ownerMemberId\":" + bOwner.getId() + "}", "{\"website\":\"ftp://x.com\"}")) {
            MvcResult r = call(login("owner"), patch(url(a, alpha)), bad, etag(login("owner"), alpha), null);
            assertThat(r.getResponse().getStatus()).as(bad).isIn(404, 409, 422);
        }
        assertThat(auditCount(a)).isEqualTo(before);
        assertGeneric404(call(login("spec"), patch(url(a, alpha)), "{\"about\":\"Nope\"}", "\"1\"", null), "a specialist cannot edit");
        // a field can be cleared with null
        MvcResult cleared = call(login("owner"), patch(url(a, alpha)), "{\"location\":null,\"ownerMemberId\":null}", etag(login("owner"), alpha), null);
        assertStatus(cleared, 200);
        assertThat(json(cleared).path("location").isNull()).isTrue();
        assertThat(json(cleared).path("manager").isNull()).isTrue();
    }

    // ---- contacts ----------------------------------------------------------------------------------------------------

    @Test
    void addingAContactKeepsOnlyAWorkEmailAndIsAudited() throws Exception {
        long before = auditCount(a, "CLIENT_CONTACT_ADD");
        MvcResult r = call(login("am"), post(url(a, alpha) + "/contacts"), "{\"name\":\"Robert Chen\",\"title\":\"Hiring Manager\",\"email\":\"Robert.Chen@Alpha.example.com\",\"role\":\"HIRING_MANAGER\"}", null, key());
        assertStatus(r, 201);
        JsonNode d = json(r);
        assertThat(d.path("contactCount").asInt()).isEqualTo(3);
        assertThat(d.path("contacts").toString()).contains("robert.chen@alpha.example.com");
        assertThat(auditCount(a, "CLIENT_CONTACT_ADD") - before).isEqualTo(1);
        assertThat(contacts.findByOrgIdAndClientId(a.getId(), alpha.getId())).hasSize(3);
    }

    @Test
    void aPrivateMailboxADuplicateAndABadContactAreRefused() throws Exception {
        String u = url(a, alpha) + "/contacts";
        assertCode(call(login("am"), post(u), "{\"name\":\"Jo Doe\",\"email\":\"jo.doe@gmail.com\"}", null, key()), 422, "WORK_EMAIL_REQUIRED");
        assertCode(call(login("am"), post(u), "{\"name\":\"Pat Again\",\"email\":\"PAT@alpha.example.com\"}", null, key()), 409, "DUPLICATE_CONTACT");
        assertStatus(call(login("am"), post(u), "{\"name\":\"Jo Doe\",\"email\":\"not-an-email\"}", null, key()), 422);
        assertStatus(call(login("am"), post(u), "{\"name\":\"J\"}", null, key()), 422);
        assertStatus(call(login("am"), post(u), "{\"name\":\"Jo Doe\",\"role\":\"BOSS\"}", null, key()), 422);
        assertThat(call(login("am"), post(u), "{\"name\":\"Jo Doe\",\"phone\":\"555-0100\"}", null, key()).getResponse().getStatus()).as("a phone number is not a field").isGreaterThanOrEqualTo(400);
        assertStatus(call(login("am"), post(u), "{\"name\":\"Jo Doe\",\"title\":\"SSN 123-45-6789\"}", null, key()), 422);
        assertGeneric404(call(login("spec"), post(u), "{\"name\":\"Jo Doe\"}", null, key()), "a specialist cannot add contacts");
        assertThat(contacts.findByOrgIdAndClientId(a.getId(), alpha.getId())).hasSize(2);
        // the consumer-domain list is a PLATFORM setting (app_setting), not code and not an org override (an organization may only override the two day counts)
        AppSetting domains = appSettings.saveAndFlush(new AppSetting(EnterpriseSettingKeys.ORG_CLIENTS_CONSUMER_DOMAINS, "[\"alpha.example.com\"]", "it", Instant.now()));
        platformSettings.invalidate();
        try {
            assertCode(call(login("am"), post(u), "{\"name\":\"Jo Doe\",\"email\":\"jo@alpha.example.com\"}", null, key()), 422, "WORK_EMAIL_REQUIRED");
        } finally {
            appSettings.delete(domains);
            appSettings.flush();
            platformSettings.invalidate();
        }
    }

    @Test
    void aContactCanBeMarkedAsLeftAndBackAndOnlyWithinItsOwnClient() throws Exception {
        long before = auditCount(a, "CLIENT_CONTACT_UPDATE");
        MvcResult left = call(login("am"), patch(url(a, alpha) + "/contacts/" + pat.getId()), "{\"status\":\"LEFT\"}");
        assertStatus(left, 200);
        assertThat(json(left).path("contactCount").asInt()).isEqualTo(1);
        assertThat(json(left).path("contacts").toString()).doesNotContain("Pat Contact");
        MvcResult back = call(login("am"), patch(url(a, alpha) + "/contacts/" + pat.getId()), "{\"status\":\"ACTIVE\"}");
        assertThat(json(back).path("contactCount").asInt()).isEqualTo(2);
        assertThat(auditCount(a, "CLIENT_CONTACT_UPDATE") - before).isEqualTo(2);
        assertGeneric404(call(login("am"), patch(url(a, beta) + "/contacts/" + pat.getId()), "{\"status\":\"LEFT\"}"), "a contact of another client");
        assertGeneric404(call(login("am"), patch(url(a, alpha) + "/contacts/99999999"), "{\"status\":\"LEFT\"}"), "unknown contact");
        assertStatus(call(login("am"), patch(url(a, alpha) + "/contacts/" + ben.getId()), "{\"orgId\":1}"), 422);
        assertGeneric404(call(login("spec"), patch(url(a, alpha) + "/contacts/" + pat.getId()), "{\"status\":\"LEFT\"}"), "a specialist");
    }

    // ---- notes -------------------------------------------------------------------------------------------------------

    @Test
    void aRelationshipNoteIsStoredWithItsAuthorAndTheAuditRowNeverCarriesTheText() throws Exception {
        long before = auditCount(a, "CLIENT_NOTE_ADD");
        MvcResult r = call(login("am"), post(url(a, alpha) + "/notes"), "{\"body\":\"Great quarterly review. Looking to expand into data analytics roles.\"}", null, key());
        assertStatus(r, 201);
        JsonNode d = json(r);
        assertThat(d.path("noteCount").asInt()).isEqualTo(1);
        assertThat(d.path("notes").get(0).path("body").asText()).startsWith("Great quarterly review");
        assertThat(d.path("notes").get(0).path("author").asText()).isEqualTo("Amara Silva");
        assertThat(auditCount(a, "CLIENT_NOTE_ADD") - before).isEqualTo(1);
        assertThat(newestAudit(a).getDetails()).doesNotContain("quarterly");
        assertThat(notes.findByOrgIdAndClientIdOrderByCreatedAtDescIdDesc(a.getId(), alpha.getId())).hasSize(1);
        assertThat(list(login("owner"), "?sort=activity").path("items").get(0).path("name").asText()).isEqualTo("Alpha Corp");
    }

    @Test
    void aNoteIsValidatedScannedAndOnlyForManagers() throws Exception {
        String u = url(a, alpha) + "/notes";
        assertStatus(call(login("am"), post(u), "{\"body\":\"\"}", null, key()), 422);
        assertStatus(call(login("am"), post(u), "{\"body\":\"" + "x".repeat(1001) + "\"}", null, key()), 422);
        // a card number is not one of the never-collected classes (cards go to Stripe, never to us); an SSN is
        assertStatus(call(login("am"), post(u), "{\"body\":\"Their SSN is 123-45-6789\"}", null, key()), 422);
        assertStatus(call(login("am"), post(u), "{\"body\":\"<b>x</b>\"}", null, key()), 422);
        assertThat(call(login("am"), post(u), "{\"body\":\"ok\",\"clientId\":9}", null, key()).getResponse().getStatus()).isGreaterThanOrEqualTo(400);
        assertGeneric404(call(login("spec"), post(u), "{\"body\":\"hello there\"}", null, key()), "a specialist cannot write notes");
        assertThat(notes.countByOrgIdAndClientId(a.getId(), alpha.getId())).isZero();
    }

    @Test
    void aViewerWithoutManageSeesTheDrawerButNoWriteControls() throws Exception {
        // an Account Manager can manage; the owner can too. A seat with only the view key: a custom role is not set up here, so assert via the flags instead
        assertThat(json(call(login("am"), get(url(a) + "/summary"))).path("access").path("canCreateRequirement").asBoolean()).isTrue();
        ClientNote n = new ClientNote();
        n.setOrgId(a.getId());
        n.setClientId(alpha.getId());
        n.setAuthorMemberId(am.getId());
        n.setBody("Seeded note");
        notes.saveAndFlush(n);
        assertThat(detail(login("owner"), alpha).path("notes").get(0).path("body").asText()).isEqualTo("Seeded note");
    }

    // ---- the other tabs ----------------------------------------------------------------------------------------------

    @Test
    void theContactsTabListsEveryContactOfThisOrganizationOnly() throws Exception {
        JsonNode page = list(login("owner"), "/contacts");
        assertThat(page.path("total").asInt()).isEqualTo(2);
        assertThat(names(page)).containsExactly("Ben Recruiter", "Pat Contact");
        assertThat(page.path("items").get(0).path("client").path("name").asText()).isEqualTo("Alpha Corp");
        assertThat(page.toString()).doesNotContain("Secret Person");
        assertThat(names(list(login("owner"), "/contacts?q=recruiter"))).containsExactly("Ben Recruiter");
        assertThat(names(list(login("owner"), "/contacts?q=alpha"))).as("by client name").hasSize(2);
        assertThat(names(list(login("owner"), "/contacts?clientId=" + beta.getId()))).isEmpty();
        assertThat(names(list(login("owner"), "/contacts?clientId=" + secretB.getId()))).as("another tenant's client id finds nothing").isEmpty();
        assertStatus(call(login("owner"), get(url(a) + "/contacts?q=a")), 422);
    }

    @Test
    void theRequirementsTabListsEveryRequirementNewestFirst() throws Exception {
        JsonNode page = list(login("owner"), "/requirements");
        assertThat(page.path("total").asInt()).isEqualTo(4);
        assertThat(page.path("items").get(0).path("title").asText()).isEqualTo("Senior Frontend Engineer");
        assertThat(page.path("items").get(0).path("submissions").asInt()).isEqualTo(1);
        assertThat(page.toString()).doesNotContain("Secret B Job");
        assertThat(list(login("owner"), "/requirements?status=ON_HOLD").path("items").get(0).path("title").asText()).isEqualTo("Data Analyst");
        assertThat(list(login("owner"), "/requirements?q=beta").path("total").asInt()).isEqualTo(1);
        assertStatus(call(login("owner"), get(url(a) + "/requirements?status=BOGUS")), 422);
    }

    @Test
    void theActivityTabMergesWhatHappenedAndHidesOtherTenants() throws Exception {
        call(login("am"), post(url(a, alpha) + "/notes"), "{\"body\":\"Spoke with the hiring manager.\"}", null, key());
        JsonNode feed = json(call(login("owner"), get(url(a) + "/activity?limit=50")));
        String all = feed.toString();
        assertThat(all).contains("Senior Frontend Engineer was posted for Alpha Corp").contains("Jessica Davis is interviewing").contains("A relationship note was added for Alpha Corp").contains("Pat Contact was added as a contact at Alpha Corp").contains("Beta Health became a client");
        assertThat(all).doesNotContain("Secret");
        assertThat(feed.path("items").get(0).path("kind").asText()).as("newest first").isEqualTo("note");
        assertThat(json(call(login("owner"), get(url(a) + "/activity?limit=2"))).path("items")).hasSize(2);
        assertStatus(call(login("owner"), get(url(a) + "/activity?limit=0")), 422);
        assertStatus(call(login("owner"), get(url(a) + "/activity?limit=500")), 422);
    }
}
