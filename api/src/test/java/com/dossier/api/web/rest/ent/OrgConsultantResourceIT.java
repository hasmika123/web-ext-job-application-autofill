package com.dossier.api.web.rest.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.ConsultantSkill;
import com.dossier.api.domain.ent.talent.MarketerAssignment;
import com.dossier.api.domain.ent.talent.MarketerCapacity;
import com.dossier.api.domain.ent.talent.RequirementMatch;
import com.dossier.api.domain.ent.talent.TalentApplication;
import com.dossier.api.domain.ent.talent.TalentInterview;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Consultants board through the real chain on real rows: the directory (paging, search, filters, sort, scope), the KPI tiles with their honest
 * deltas, the drawer and its tabs, every write with its permission, version, idempotency and audit rules, and the cross-tenant and PII negatives.
 *
 * <p>World (on top of {@link MemberItSupport}): organization A has marketer capacity for the marketing manager (TEAM scope) and the specialist
 * (ASSIGNED scope) and six consultants: Ada (assigned to the specialist, AVAILABLE, 40 days old), Bo (assigned to the manager, ON_PROJECT, 60 days old,
 * license NEEDS_REVIEW), Cy (unassigned, AVAILABLE, 10 days old, license EXPIRING), Di (INACTIVE) and Ed (ON_PROJECT, assigned to the specialist).
 * Organization B has one consultant, Zed.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class OrgConsultantResourceIT extends MemberItSupport {

    private ConsultantProfile ada;
    private ConsultantProfile bo;
    private ConsultantProfile cy;
    private ConsultantProfile di;
    private ConsultantProfile ed;
    private ConsultantProfile zed;
    private ClientRequirement openJob;
    private ClientRequirement closedJob;
    private ClientAccount client;

    @BeforeEach
    void seedTalent() {
        capacity(a, mktMgr, 3);
        capacity(a, mktSpec, 10);
        ada = consultant(a, "Ada Archer", "ada@" + p + ".example.org", "AVAILABLE", "ACTIVE", "ACTIVE", 40);
        bo = consultant(a, "Bo Banner", "bo@" + p + ".example.org", "ON_PROJECT", "NEEDS_REVIEW", "ACTIVE", 60);
        cy = consultant(a, "Cy Cole", "cy@" + p + ".example.org", "AVAILABLE", "EXPIRING", "ACTIVE", 10);
        di = consultant(a, "Di Dunn", "di@" + p + ".example.org", "AVAILABLE", "ACTIVE", "INACTIVE", 70);
        ed = consultant(a, "Ed Eze", "ed@" + p + ".example.org", "ON_PROJECT", "ACTIVE", "ACTIVE", 90);
        zed = consultant(b, "Zed Zimmer", "zed@" + p + ".example.org", "AVAILABLE", "ACTIVE", "ACTIVE", 90);
        skill(ada, "Salesforce", true, 0);
        skill(ada, "Agile", false, 1);
        skill(bo, "AWS", true, 0);
        skill(cy, "Salesforce", true, 0);
        skill(ed, "React", true, 0);
        assign(ada, mktSpec);
        assign(bo, mktMgr);
        assign(ed, mktSpec);
        client = new ClientAccount();
        client.setOrgId(a.getId());
        client.setName("TechCorp");
        em.persist(client);
        openJob = job("Senior Salesforce Developer", "OPEN");
        closedJob = job("Old Role", "CLOSED");
        em.flush();
    }

    // ---- the directory --------------------------------------------------------------------------------------------------------

    @Test
    void theOwnerListsActiveConsultantsWithPagingAndRowFacts() throws Exception {
        MvcResult r = call(login("owner"), get(url(a) + "?sort=name,asc&size=2"));
        assertStatus(r, 200);
        JsonNode page = json(r);
        assertThat(page.path("total").asInt()).isEqualTo(4); // Di is INACTIVE
        assertThat(r.getResponse().getHeader("X-Total-Count")).isEqualTo("4");
        assertThat(page.path("hasNext").asBoolean()).isTrue();
        assertThat(names(page, "name")).containsExactly("Ada Archer", "Bo Banner");
        JsonNode adaRow = page.path("items").get(0);
        assertThat(adaRow.path("primarySkills")).extracting(JsonNode::asText).containsExactly("Salesforce");
        assertThat(adaRow.path("skillCount").asInt()).isEqualTo(2);
        assertThat(adaRow.path("marketer").path("name").asText()).isEqualTo("Sam Spec");
        assertThat(adaRow.path("activeApplications").asInt()).isZero();
        assertThat(adaRow.has("phone")).isFalse();
        JsonNode second = json(call(login("owner"), get(url(a) + "?sort=name,asc&size=2&page=1")));
        assertThat(names(second, "name")).containsExactly("Cy Cole", "Ed Eze");
        assertThat(second.path("hasNext").asBoolean()).isFalse();
        assertThat(json(call(login("owner"), get(url(a) + "?size=2&page=9"))).path("items")).isEmpty();
    }

    @Test
    void filtersSearchAndSortNarrowTheDirectory() throws Exception {
        assertThat(names(json(call(login("owner"), get(url(a) + "?availability=ON_PROJECT&sort=name,asc"))), "name")).containsExactly("Bo Banner", "Ed Eze");
        assertThat(names(json(call(login("owner"), get(url(a) + "?license=EXPIRING"))), "name")).containsExactly("Cy Cole");
        assertThat(names(json(call(login("owner"), get(url(a) + "?skill=salesforce&sort=name,asc"))), "name")).containsExactly("Ada Archer", "Cy Cole");
        assertThat(names(json(call(login("owner"), get(url(a) + "?marketerId=none"))), "name")).containsExactly("Cy Cole");
        assertThat(names(json(call(login("owner"), get(url(a) + "?marketerId=" + mktSpec.getId() + "&sort=name,asc"))), "name")).containsExactly("Ada Archer", "Ed Eze");
        assertThat(names(json(call(login("owner"), get(url(a) + "?q=react"))), "name")).as("search reaches skills").containsExactly("Ed Eze");
        assertThat(names(json(call(login("owner"), get(url(a) + "?status=INACTIVE"))), "name")).containsExactly("Di Dunn");
        assertThat(names(json(call(login("owner"), get(url(a) + "?sort=experience,desc&sort=name,asc"))), "name")).hasSize(4);
        assertCode(call(login("owner"), get(url(a) + "?sort=salary,desc")), 400, "SORT_INVALID");
        assertCode(call(login("owner"), get(url(a) + "?availability=SLEEPING")), 400, "FILTER_INVALID");
        assertCode(call(login("owner"), get(url(a) + "?size=0")), 400, "FILTER_INVALID");
        assertCode(call(login("owner"), get(url(a) + "?q=a")), 400, "FILTER_INVALID");
        assertCode(call(login("owner"), get(url(a) + "?marketerId=abc")), 400, "FILTER_INVALID");
    }

    @Test
    void theTilesCountActiveConsultantsWithRealDeltasAndSparklines() throws Exception {
        JsonNode t = json(call(login("owner"), get(url(a) + "/counts")));
        assertThat(t.path("scope").asText()).isEqualTo("ORG");
        assertThat(t.path("total").path("value").asInt()).isEqualTo(4);
        assertThat(t.path("total").path("previous").asInt()).as("Ada, Bo and Ed are older than 30 days").isEqualTo(3);
        assertThat(t.path("total").path("delta").asInt()).isEqualTo(1);
        assertThat(t.path("total").path("deltaPercent").asDouble()).isEqualTo(33.3);
        assertThat(t.path("available").path("value").asInt()).isEqualTo(2);
        assertThat(t.path("available").path("previous").asInt()).isEqualTo(1);
        assertThat(t.path("onProject").path("value").asInt()).isEqualTo(2);
        assertThat(t.path("onProject").path("delta").asInt()).isZero();
        assertThat(t.path("needsReview").path("value").asInt()).isEqualTo(1);
        JsonNode series = t.path("total").path("series");
        assertThat(series).hasSize(8);
        assertThat(series.get(7).asInt()).as("the last point is today's figure").isEqualTo(4);
        assertThat(series.get(0).asInt()).as("seven weeks ago only Bo and Ed existed... Ada joined 40 days ago").isLessThanOrEqualTo(series.get(7).asInt());
    }

    @Test
    void anOrganizationWithNoConsultantOlderThanAMonthHasNoBaseline() throws Exception {
        for (ConsultantProfile c : List.of(ada, bo, ed)) {
            c.setCreatedAt(Instant.now().minus(3, ChronoUnit.DAYS));
            em.merge(c);
        }
        em.flush();
        JsonNode t = json(call(login("owner"), get(url(a) + "/counts")));
        assertThat(t.path("total").path("value").asInt()).isEqualTo(4);
        assertThat(t.path("total").path("previous").isNull()).isTrue();
        assertThat(t.path("total").path("delta").isNull()).isTrue();
        assertThat(t.path("total").path("series")).hasSize(8);
    }

    @Test
    void thePickersListSkillsMarketersWithWorkloadAndDepartments() throws Exception {
        JsonNode f = json(call(login("owner"), get(url(a) + "/filters")));
        assertThat(f.path("skills")).extracting(JsonNode::asText).containsExactly("AWS", "Agile", "React", "Salesforce");
        JsonNode spec = null;
        for (JsonNode m : f.path("marketers")) if (m.path("memberId").asLong() == mktSpec.getId()) spec = m;
        assertThat(spec).isNotNull();
        assertThat(spec.path("workload").asInt()).isEqualTo(2);
        assertThat(spec.path("capacity").asInt()).isEqualTo(10);
        assertThat(f.path("departments")).extracting(n -> n.path("name").asText()).contains("Delivery", "People");
    }

    // ---- scope ----------------------------------------------------------------------------------------------------------------

    @Test
    void aSpecialistSeesOnlyTheirOwnConsultantsAndTheRestIsTheGeneric404() throws Exception {
        JsonNode mine = json(call(login("spec"), get(url(a) + "?sort=name,asc")));
        assertThat(names(mine, "name")).containsExactly("Ada Archer", "Ed Eze");
        assertThat(json(call(login("spec"), get(url(a) + "/counts"))).path("total").path("value").asInt()).isEqualTo(2);
        assertStatus(call(login("spec"), get(url(a) + "/" + ada.getId())), 200);
        assertGeneric404(call(login("spec"), get(url(a) + "/" + bo.getId())), "a consultant of another marketer");
        assertGeneric404(call(login("spec"), get(url(a) + "/" + bo.getId() + "/applications")), "tab of another marketer's consultant");
    }

    @Test
    void aManagerSeesTheirTeamsConsultants() throws Exception {
        JsonNode mine = json(call(login("mgr"), get(url(a))));
        assertThat(names(mine, "name")).containsExactly("Bo Banner");
        assertThat(json(call(login("mgr"), get(url(a) + "/counts"))).path("scope").asText()).isEqualTo("TEAM");
    }

    @Test
    void peopleWithoutTheViewKeyAndOtherOrganizationsGetTheGeneric404() throws Exception {
        assertGeneric404(call(login("plain"), get(url(a))), "a plain member");
        assertGeneric404(call(login("plain"), get(url(a) + "/counts")), "a plain member");
        assertGeneric404(call(login("c1"), get(url(a) + "/" + ada.getId())), "a consultant seat");
        assertGeneric404(call(login("bowner"), get(url(a))), "the owner of another organization");
        assertGeneric404(call(login("bowner"), get(url(a) + "/" + ada.getId())), "another organization's owner on a row");
        assertGeneric404(call(login("bowner"), get(url(b) + "/" + ada.getId())), "his own org id with A's row");
        JsonNode theirs = json(call(login("bowner"), get(url(b))));
        assertThat(names(theirs, "name")).containsExactly("Zed Zimmer");
        assertGeneric404(call(login("owner"), get(url(a) + "/" + zed.getId())), "A's owner naming B's consultant");
        assertGeneric404(call(login("owner"), patch(url(a) + "/" + zed.getId()), "{\"locationLabel\":\"x\"}", "W/\"1\"", null), "A's owner editing B's consultant");
    }

    // ---- the drawer -----------------------------------------------------------------------------------------------------------

    @Test
    void theDrawerCarriesTheChecklistTheMarketerAndWhatTheCallerMayDo() throws Exception {
        MvcResult r = call(login("owner"), get(url(a) + "/" + ada.getId()));
        assertStatus(r, 200);
        JsonNode d = json(r);
        assertThat(r.getResponse().getHeader("ETag")).isEqualTo(d.path("version").asText());
        assertThat(d.path("consultant").path("name").asText()).isEqualTo("Ada Archer");
        assertThat(d.path("skills")).hasSize(2);
        assertThat(d.path("checklist").path("basic").asBoolean()).isTrue();
        assertThat(d.path("checklist").path("skills").asBoolean()).isTrue();
        assertThat(d.path("checklist").path("resume").asBoolean()).isFalse();
        assertThat(d.path("assignment").path("marketer").path("name").asText()).isEqualTo("Sam Spec");
        assertThat(d.path("actions").path("edit").asBoolean()).isTrue();
        assertThat(d.path("actions").path("deactivate").asBoolean()).isTrue();
        JsonNode spec = json(call(login("spec"), get(url(a) + "/" + ada.getId())));
        assertThat(spec.path("actions").path("edit").asBoolean()).as("a specialist cannot edit").isFalse();
        assertThat(spec.path("actions").path("assignMarketer").asBoolean()).isFalse();
        assertThat(spec.path("actions").path("createApplication").asBoolean()).isTrue();
    }

    @Test
    void theTabsAnswerFromRealRows() throws Exception {
        TalentApplication app = application(ada, openJob, "APP-2026-001", "SUBMITTED");
        event(app, "CREATED", null, "ASSIGNED");
        event(app, "STAGE_CHANGE", "ASSIGNED", "SUBMITTED");
        RequirementMatch m = new RequirementMatch();
        m.setOrgId(a.getId());
        m.setRequirementId(openJob.getId());
        m.setConsultantId(ada.getId());
        m.setScore(91);
        m.setStatus("ASSIGNED");
        m.setAssignedAt(Instant.now());
        em.persist(m);
        TalentInterview iv = new TalentInterview();
        iv.setOrgId(a.getId());
        iv.setConsultantId(ada.getId());
        iv.setClientId(client.getId());
        iv.setApplicationId(app.getId());
        iv.setScheduledAt(Instant.now().plus(2, ChronoUnit.DAYS));
        iv.setStatus("SCHEDULED");
        iv.setRoundLabel("Round 1");
        em.persist(iv);
        em.flush();

        JsonNode as = json(call(login("owner"), get(url(a) + "/" + ada.getId() + "/assignments")));
        assertThat(as.path("assignment").path("marketer").path("name").asText()).isEqualTo("Sam Spec");
        assertThat(as.path("jobs")).hasSize(1);
        assertThat(as.path("jobs").get(0).path("score").asInt()).isEqualTo(91);
        assertThat(as.path("jobs").get(0).path("clientName").asText()).isEqualTo("TechCorp");

        JsonNode apps = json(call(login("owner"), get(url(a) + "/" + ada.getId() + "/applications")));
        assertThat(apps.path("items")).hasSize(1);
        assertThat(apps.path("items").get(0).path("code").asText()).isEqualTo("APP-2026-001");
        assertThat(apps.path("interviews")).hasSize(1);
        assertThat(json(call(login("owner"), get(url(a) + "/" + ada.getId()))).path("consultant").path("nextInterview").path("roundLabel").asText()).isEqualTo("Round 1");
        assertThat(json(call(login("owner"), get(url(a) + "?q=Ada"))).path("items").get(0).path("activeApplications").asInt()).isEqualTo(1);

        JsonNode act = json(call(login("owner"), get(url(a) + "/" + ada.getId() + "/activity")));
        assertThat(act.path("items")).hasSize(2);
        assertThat(act.path("items").get(0).path("kind").asText()).isEqualTo("APPLICATION");
        assertThat(act.path("items").get(0).path("jobTitle").asText()).isEqualTo("Senior Salesforce Developer");
    }

    // ---- edits ----------------------------------------------------------------------------------------------------------------

    @Test
    void anEditChangesTheFieldsWritesOneAuditRowAndNeedsTheVersion() throws Exception {
        String version = json(call(login("owner"), get(url(a) + "/" + ada.getId()))).path("version").asText();
        long before = auditCount(a);
        MvcResult noVersion = call(login("owner"), patch(url(a) + "/" + ada.getId()), "{\"availabilityStatus\":\"ON_PROJECT\"}", null, null);
        assertCode(noVersion, 428, "PRECONDITION_REQUIRED");
        assertCode(call(login("owner"), patch(url(a) + "/" + ada.getId()), "{\"availabilityStatus\":\"ON_PROJECT\"}", "W/\"1-1\"", null), 412, "PRECONDITION_FAILED");
        MvcResult ok = call(login("owner"), patch(url(a) + "/" + ada.getId()), "{\"availabilityStatus\":\"ON_PROJECT\",\"licenseStatus\":\"EXPIRING\",\"licenseValidUntil\":\"2027-01-31\",\"locationLabel\":\"Austin, TX\"}", version, null);
        assertStatus(ok, 200);
        JsonNode d = json(ok);
        assertThat(d.path("consultant").path("availability").asText()).isEqualTo("ON_PROJECT");
        assertThat(d.path("consultant").path("license").asText()).isEqualTo("EXPIRING");
        assertThat(d.path("consultant").path("licenseValidUntil").asText()).isEqualTo("2027-01-31");
        assertThat(d.path("marketingStatus").asText()).isEqualTo("PAUSED");
        assertThat(d.path("version").asText()).isNotEqualTo(version);
        assertThat(auditCount(a) - before).isEqualTo(1);
        assertThat(newestAudit(a).getAction()).isEqualTo("CONSULTANT_UPDATE");
        assertThat(newestAudit(a).getTargetId()).isEqualTo(String.valueOf(ada.getId()));
        // the same version is now stale
        assertCode(call(login("owner"), patch(url(a) + "/" + ada.getId()), "{\"locationLabel\":\"Elsewhere\"}", version, null), 412, "PRECONDITION_FAILED");
        // a request that changes nothing writes nothing
        long mid = auditCount(a);
        assertStatus(call(login("owner"), patch(url(a) + "/" + ada.getId()), "{\"licenseStatus\":\"EXPIRING\"}", d.path("version").asText(), null), 200);
        assertThat(auditCount(a)).isEqualTo(mid);
    }

    @Test
    void anEditRefusesUnknownKeysBadValuesAndSensitiveText() throws Exception {
        String version = json(call(login("owner"), get(url(a) + "/" + ada.getId()))).path("version").asText();
        assertStatus(call(login("owner"), patch(url(a) + "/" + ada.getId()), "{\"status\":\"INACTIVE\"}", version, null), 422);
        assertStatus(call(login("owner"), patch(url(a) + "/" + ada.getId()), "{\"orgId\":999}", version, null), 422);
        assertStatus(call(login("owner"), patch(url(a) + "/" + ada.getId()), "{\"availabilityStatus\":\"SLEEPING\"}", version, null), 422);
        assertStatus(call(login("owner"), patch(url(a) + "/" + ada.getId()), "{\"licenseValidUntil\":\"soon\"}", version, null), 422);
        assertCode(call(login("owner"), patch(url(a) + "/" + ada.getId()), "{\"jobTitle\":\"SSN 123-45-6789\"}", version, null), 422, "SENSITIVE_CONTENT");
        assertStatus(call(login("owner"), patch(url(a) + "/" + ada.getId()), "{\"jobTitle\":\"<script>\"}", version, null), 422);
        assertStatus(call(login("owner"), patch(url(a) + "/" + ada.getId()), "{\"departmentGroupId\":999999}", version, null), 404);
        assertGeneric404(call(login("spec"), patch(url(a) + "/" + ada.getId()), "{\"locationLabel\":\"x\"}", version, null), "a specialist cannot edit");
        assertGeneric404(call(login("mgr"), patch(url(a) + "/" + bo.getId()), "{\"locationLabel\":\"x\"}", version, null), "a manager cannot edit");
    }

    // ---- create ---------------------------------------------------------------------------------------------------------------

    @Test
    void addingAConsultantIsIdempotentAuditedAndRefusesDuplicatesAndSensitiveText() throws Exception {
        String body = "{\"displayName\":\"Fay Fox\",\"email\":\"Fay.Fox@" + p + ".example.org\",\"jobTitle\":\"Data Engineer\",\"workMode\":\"remote\",\"skills\":[\"Python\",\"SQL\",\"Airflow\"],\"yearsExperience\":6}";
        long before = auditCount(a);
        String k = key();
        MvcResult first = call(login("owner"), post(url(a)), body, null, k);
        assertStatus(first, 201);
        JsonNode d = json(first);
        assertThat(d.path("consultant").path("email").asText()).isEqualTo("fay.fox@" + p + ".example.org");
        assertThat(d.path("consultant").path("workMode").asText()).isEqualTo("REMOTE");
        assertThat(d.path("consultant").path("availability").asText()).isEqualTo("AVAILABLE");
        assertThat(d.path("consultant").path("license").asText()).isEqualTo("PENDING");
        assertThat(d.path("consultant").path("primarySkills")).extracting(JsonNode::asText).containsExactly("Python", "SQL");
        assertThat(d.path("consultant").path("profileCompleteness").asInt()).isEqualTo(40);
        assertThat(auditCount(a) - before).isEqualTo(1);
        assertThat(newestAudit(a).getAction()).isEqualTo("CONSULTANT_CREATE");

        MvcResult replay = call(login("owner"), post(url(a)), body, null, k);
        assertStatus(replay, 201);
        assertThat(replay.getResponse().getHeader("Idempotent-Replayed")).isEqualTo("true");
        assertThat(json(replay).path("consultant").path("id").asLong()).isEqualTo(d.path("consultant").path("id").asLong());
        assertThat(auditCount(a) - before).as("a replay writes nothing").isEqualTo(1);

        assertCode(call(login("owner"), post(url(a)), body, null, key()), 409, "CONSULTANT_EXISTS");
        assertCode(call(login("owner"), post(url(a)), body, null, null), 400, "IDEMPOTENCY_KEY_MISSING");
        assertCode(call(login("owner"), post(url(a)), "{\"displayName\":\"Gus Gray\",\"email\":\"gus@" + p + ".example.org\",\"jobTitle\":\"passport A1234567\"}", null, key()), 422, "SENSITIVE_CONTENT");
        assertStatus(call(login("owner"), post(url(a)), "{\"displayName\":\"G\",\"email\":\"x\"}", null, key()), 422);
        assertGeneric404(call(login("spec"), post(url(a)), body.replace("Fay", "Hal"), null, key()), "a specialist cannot add consultants");
        assertGeneric404(call(login("bowner"), post(url(a)), body.replace("Fay", "Ivy"), null, key()), "another organization's owner");
    }

    // ---- marketer ---------------------------------------------------------------------------------------------------------------

    @Test
    void assigningAMarketerChecksCapacityTeamScopeAndAuditsOnce() throws Exception {
        long before = auditCount(a);
        MvcResult ok = call(login("owner"), post(url(a) + "/" + cy.getId() + "/marketer"), "{\"marketerMemberId\":" + mktMgr.getId() + ",\"priority\":\"HIGH\"}");
        assertStatus(ok, 200);
        assertThat(json(ok).path("assignment").path("marketer").path("name").asText()).isEqualTo("Maria Lopez");
        assertThat(json(ok).path("assignment").path("priority").asText()).isEqualTo("HIGH");
        assertThat(auditCount(a) - before).isEqualTo(1);
        assertThat(newestAudit(a).getAction()).isEqualTo("CONSULTANT_ASSIGN");
        // the same marketer again changes nothing and writes nothing
        assertStatus(call(login("owner"), post(url(a) + "/" + cy.getId() + "/marketer"), "{\"marketerMemberId\":" + mktMgr.getId() + "}"), 200);
        assertThat(auditCount(a) - before).isEqualTo(1);
        // a seat with no marketer capacity is refused
        assertCode(call(login("owner"), post(url(a) + "/" + cy.getId() + "/marketer"), "{\"marketerMemberId\":" + hr.getId() + "}"), 422, "MARKETER_INVALID");
        assertCode(call(login("owner"), post(url(a) + "/" + cy.getId() + "/marketer"), "{\"marketerMemberId\":" + bOwner.getId() + "}"), 422, "MARKETER_INVALID");
        // a specialist holds no assignment key
        assertGeneric404(call(login("spec"), post(url(a) + "/" + ada.getId() + "/marketer"), "{\"marketerMemberId\":" + mktMgr.getId() + "}"), "a specialist cannot assign");
        // a TEAM manager may not name a marketer outside their team, and cannot touch a consultant outside their reach
        assertCode(call(login("mgr"), post(url(a) + "/" + bo.getId() + "/marketer"), "{\"marketerMemberId\":" + mktSpec.getId() + "}"), 422, "MARKETER_INVALID");
        assertGeneric404(call(login("mgr"), post(url(a) + "/" + ada.getId() + "/marketer"), "{\"marketerMemberId\":" + mktMgr.getId() + "}"), "outside the manager's reach");
    }

    // ---- deactivate / reactivate ------------------------------------------------------------------------------------------------

    @Test
    void deactivatingTakesTheConsultantOutOfTheListAndTheTilesAndReactivatingBringsThemBack() throws Exception {
        assertCode(call(login("owner"), post(url(a) + "/" + cy.getId() + "/deactivate"), "{\"reason\":\"short\"}"), 422, "ORG_INVALID");
        long before = auditCount(a);
        MvcResult off = call(login("owner"), post(url(a) + "/" + cy.getId() + "/deactivate"), "{\"reason\":\"Left the bench, moved overseas\"}");
        assertStatus(off, 200);
        assertThat(json(off).path("consultant").path("status").asText()).isEqualTo("INACTIVE");
        assertThat(json(off).path("actions").path("reactivate").asBoolean()).isTrue();
        assertThat(auditCount(a) - before).isEqualTo(1);
        assertThat(newestAudit(a).getAction()).isEqualTo("CONSULTANT_DEACTIVATE");
        assertThat(json(call(login("owner"), get(url(a) + "/counts"))).path("total").path("value").asInt()).isEqualTo(3);
        assertThat(names(json(call(login("owner"), get(url(a) + "?status=INACTIVE&sort=name,asc"))), "name")).containsExactly("Cy Cole", "Di Dunn");
        // an inactive consultant cannot be edited
        String version = json(off).path("version").asText();
        assertCode(call(login("owner"), patch(url(a) + "/" + cy.getId()), "{\"locationLabel\":\"x\"}", version, null), 409, "CONSULTANT_INACTIVE");
        // deactivating again is a no-op
        long mid = auditCount(a);
        assertStatus(call(login("owner"), post(url(a) + "/" + cy.getId() + "/deactivate"), "{\"reason\":\"Left the bench, moved overseas\"}"), 200);
        assertThat(auditCount(a)).isEqualTo(mid);
        assertStatus(call(login("owner"), post(url(a) + "/" + cy.getId() + "/reactivate"), "{}"), 200);
        assertThat(newestAudit(a).getAction()).isEqualTo("CONSULTANT_REACTIVATE");
        assertThat(json(call(login("owner"), get(url(a) + "/counts"))).path("total").path("value").asInt()).isEqualTo(4);
        assertGeneric404(call(login("spec"), post(url(a) + "/" + ada.getId() + "/deactivate"), "{\"reason\":\"Not allowed to do this\"}"), "a specialist cannot deactivate");
    }

    // ---- create an application ------------------------------------------------------------------------------------------------

    @Test
    void creatingAnApplicationStartsItAssignedOnceAndOnlyForOpenJobs() throws Exception {
        JsonNode options = json(call(login("spec"), get(url(a) + "/" + ada.getId() + "/job-options")));
        assertThat(options).extracting(n -> n.path("title").asText()).containsExactly("Senior Salesforce Developer");
        RequirementMatch m = new RequirementMatch();
        m.setOrgId(a.getId());
        m.setRequirementId(openJob.getId());
        m.setConsultantId(ada.getId());
        m.setScore(88);
        m.setStatus("SUGGESTED");
        em.persist(m);
        em.flush();
        long before = auditCount(a);
        String k = key();
        String body = "{\"requirementId\":" + openJob.getId() + "}";
        MvcResult r = call(login("spec"), post(url(a) + "/" + ada.getId() + "/applications"), body, null, k);
        assertStatus(r, 201);
        JsonNode created = json(r);
        assertThat(created.path("stage").asText()).isEqualTo("ASSIGNED");
        assertThat(created.path("code").asText()).matches("APP-\\d{4}-\\d{3}");
        assertThat(auditCount(a) - before).isEqualTo(1);
        assertThat(newestAudit(a).getAction()).isEqualTo("APPLICATION_CREATE");
        em.flush();
        em.clear();
        RequirementMatch after = em.find(RequirementMatch.class, m.getId());
        assertThat(after.getStatus()).as("the match is now ASSIGNED").isEqualTo("ASSIGNED");
        assertThat(json(call(login("owner"), get(url(a) + "/" + ada.getId() + "/activity"))).path("items").get(0).path("toStage").asText()).isEqualTo("ASSIGNED");
        MvcResult replay = call(login("spec"), post(url(a) + "/" + ada.getId() + "/applications"), body, null, k);
        assertThat(replay.getResponse().getHeader("Idempotent-Replayed")).isEqualTo("true");
        assertCode(call(login("spec"), post(url(a) + "/" + ada.getId() + "/applications"), body, null, key()), 409, "APPLICATION_EXISTS");
        assertCode(call(login("spec"), post(url(a) + "/" + ed.getId() + "/applications"), "{\"requirementId\":" + closedJob.getId() + "}", null, key()), 422, "JOB_NOT_OPEN");
        assertGeneric404(call(login("spec"), post(url(a) + "/" + bo.getId() + "/applications"), body, null, key()), "outside the specialist's reach");
        assertGeneric404(call(login("hr"), get(url(a) + "/" + ada.getId() + "/job-options")), "HR holds no opportunity key");
    }

    // ---- bulk ---------------------------------------------------------------------------------------------------------------------

    @Test
    void bulkAvailabilitySkipsWhatItCannotReachReportsPreviousValuesAndReplays() throws Exception {
        long before = auditCount(a);
        String k = key();
        String body = "{\"ids\":[" + ada.getId() + "," + bo.getId() + "," + zed.getId() + "," + di.getId() + "],\"availability\":\"ON_PROJECT\"}";
        MvcResult r = call(login("owner"), post(url(a) + "/bulk/availability"), body, null, k);
        assertStatus(r, 200);
        JsonNode res = json(r);
        assertThat(res.path("requested").asInt()).isEqualTo(4);
        assertThat(res.path("ok").asInt()).isEqualTo(1); // Ada; Bo is already ON_PROJECT, Zed is another tenant's, Di is inactive
        List<String> reasons = new ArrayList<>();
        for (JsonNode x : res.path("results")) reasons.add(x.path("id").asLong() + ":" + (x.path("ok").asBoolean() ? "ok" : x.path("reason").asText()));
        assertThat(reasons).containsExactly(ada.getId() + ":ok", bo.getId() + ":UNCHANGED", zed.getId() + ":NOT_FOUND", di.getId() + ":INACTIVE");
        assertThat(res.path("results").get(0).path("previous").path("availability").asText()).isEqualTo("AVAILABLE");
        assertThat(auditCount(a) - before).as("one update row plus one bulk summary").isEqualTo(2);
        MvcResult replay = call(login("owner"), post(url(a) + "/bulk/availability"), body, null, k);
        assertThat(replay.getResponse().getHeader("Idempotent-Replayed")).isEqualTo("true");
        assertThat(auditCount(a) - before).isEqualTo(2);
        assertCode(call(login("owner"), post(url(a) + "/bulk/availability"), body, null, null), 400, "IDEMPOTENCY_KEY_MISSING");
        assertGeneric404(call(login("spec"), post(url(a) + "/bulk/availability"), body, null, key()), "a specialist holds no edit key");
        assertGeneric404(call(login("spec"), post(url(a) + "/bulk/availability"), body, null, null), "the wall comes before the header check");
        assertStatus(call(login("owner"), post(url(a) + "/bulk/availability"), "{\"ids\":[],\"availability\":\"AVAILABLE\"}", null, key()), 422);
    }

    @Test
    void bulkMarketerAndStatusAreAuditedPerRow() throws Exception {
        long before = auditCount(a);
        MvcResult m = call(login("owner"), post(url(a) + "/bulk/marketer"), "{\"ids\":[" + cy.getId() + "," + ada.getId() + "],\"marketerMemberId\":" + mktSpec.getId() + "}", null, key());
        assertStatus(m, 200);
        assertThat(json(m).path("ok").asInt()).as("Ada already has this marketer").isEqualTo(1);
        assertThat(auditCount(a) - before).isEqualTo(2);
        MvcResult s = call(login("owner"), post(url(a) + "/bulk/status"), "{\"ids\":[" + cy.getId() + "," + ed.getId() + "],\"action\":\"DEACTIVATE\",\"reason\":\"Seasonal bench clean-up\"}", null, key());
        assertThat(json(s).path("ok").asInt()).isEqualTo(2);
        assertThat(json(call(login("owner"), get(url(a) + "/counts"))).path("total").path("value").asInt()).isEqualTo(2);
        MvcResult back = call(login("owner"), post(url(a) + "/bulk/status"), "{\"ids\":[" + cy.getId() + "," + ed.getId() + "],\"action\":\"REACTIVATE\"}", null, key());
        assertThat(json(back).path("ok").asInt()).isEqualTo(2);
        assertStatus(call(login("owner"), post(url(a) + "/bulk/status"), "{\"ids\":[" + cy.getId() + "],\"action\":\"DEACTIVATE\",\"reason\":\"no\"}", null, key()), 422);
    }

    @Test
    void auditRowsAboutAConsultantShowInTheActivityTabForCallersWithAuditView() throws Exception {
        String version = json(call(login("owner"), get(url(a) + "/" + ada.getId()))).path("version").asText();
        assertStatus(call(login("owner"), patch(url(a) + "/" + ada.getId()), "{\"licenseStatus\":\"PENDING\"}", version, null), 200);
        JsonNode act = json(call(login("owner"), get(url(a) + "/" + ada.getId() + "/activity")));
        assertThat(act.path("items").get(0).path("kind").asText()).isEqualTo("AUDIT");
        assertThat(act.path("items").get(0).path("action").asText()).isEqualTo("CONSULTANT_UPDATE");
        JsonNode viaSpec = json(call(login("spec"), get(url(a) + "/" + ada.getId() + "/activity")));
        assertThat(viaSpec.path("items")).as("a specialist has no audit.view").isEmpty();
    }

    // ---- fixtures -------------------------------------------------------------------------------------------------------------

    private static String url(com.dossier.api.domain.org.Organization o) {
        return "/api/orgs/" + o.getId() + "/consultants";
    }

    private static List<String> names(JsonNode page, String field) {
        List<String> out = new ArrayList<>();
        for (JsonNode n : page.path("items")) out.add(n.path(field).asText());
        return out;
    }

    private void capacity(com.dossier.api.domain.org.Organization org, com.dossier.api.domain.org.OrgMember seat, int capacity) {
        MarketerCapacity c = new MarketerCapacity();
        c.setOrgId(org.getId());
        c.setMemberId(seat.getId());
        c.setCapacity(capacity);
        em.persist(c);
    }

    private ConsultantProfile consultant(com.dossier.api.domain.org.Organization org, String name, String email, String availability, String license, String status, int createdDaysAgo) {
        ConsultantProfile c = new ConsultantProfile();
        c.setOrgId(org.getId());
        c.setDisplayName(name);
        c.setEmail(email);
        c.setJobTitle("Engineer");
        c.setYearsExperience(5);
        c.setLocationLabel("Austin, TX");
        c.setWorkMode("REMOTE");
        c.setAvailabilityStatus(availability);
        c.setLicenseStatus(license);
        c.setStatus(status);
        c.setProfileCompleteness(80);
        Instant created = Instant.now().minus(createdDaysAgo, ChronoUnit.DAYS).truncatedTo(ChronoUnit.MICROS);
        c.setCreatedAt(created);
        c.setUpdatedAt(created);
        c.setAvailabilitySince(LocalDate.now().minusDays(3));
        em.persist(c);
        return c;
    }

    private void skill(ConsultantProfile c, String skill, boolean primary, int order) {
        ConsultantSkill s = new ConsultantSkill();
        s.setOrgId(c.getOrgId());
        s.setConsultantId(c.getId());
        s.setSkill(skill);
        s.setPrimarySkill(primary);
        s.setSortOrder(order);
        em.persist(s);
    }

    private void assign(ConsultantProfile c, com.dossier.api.domain.org.OrgMember marketer) {
        MarketerAssignment m = new MarketerAssignment();
        m.setOrgId(c.getOrgId());
        m.setConsultantId(c.getId());
        m.setMarketerMemberId(marketer.getId());
        em.persist(m);
    }

    private ClientRequirement job(String title, String status) {
        ClientRequirement r = new ClientRequirement();
        r.setOrgId(a.getId());
        r.setClientId(client.getId());
        r.setTitle(title);
        r.setStatus(status);
        em.persist(r);
        return r;
    }

    private TalentApplication application(ConsultantProfile c, ClientRequirement r, String code, String stage) {
        TalentApplication t = new TalentApplication();
        t.setOrgId(a.getId());
        t.setCode(code);
        t.setRequirementId(r.getId());
        t.setConsultantId(c.getId());
        t.setClientId(client.getId());
        t.setStage(stage);
        t.setAppliedOn(LocalDate.now());
        em.persist(t);
        return t;
    }

    private void event(TalentApplication app, String type, String from, String to) {
        com.dossier.api.domain.ent.talent.TalentApplicationEvent e = new com.dossier.api.domain.ent.talent.TalentApplicationEvent();
        e.setOrgId(a.getId());
        e.setApplicationId(app.getId());
        e.setEventType(type);
        e.setFromStage(from);
        e.setToStage(to);
        e.setOccurredAt(Instant.now());
        em.persist(e);
    }

}
