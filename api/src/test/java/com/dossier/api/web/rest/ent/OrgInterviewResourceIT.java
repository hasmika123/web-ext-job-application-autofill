package com.dossier.api.web.rest.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.MarketerAssignment;
import com.dossier.api.domain.ent.talent.TalentApplication;
import com.dossier.api.domain.ent.talent.TalentInterview;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.org.OrgMember;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Interviews API through the real chain: scope (an assigned marketer sees only their own, a team manager their team, the owner everything),
 * the generic 404 for every kind of outsider, the status machine and its Undo, reschedule, reminder and feedback as records, the overlap
 * check, strict bodies, idempotent creation, honest KPI deltas, PII refusal, and one audit row per mutation.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
@org.junit.jupiter.api.Timeout(120)
class OrgInterviewResourceIT extends MemberItSupport {

    private ClientAccount client;
    private ClientRequirement job;
    private ConsultantProfile k1;
    private ConsultantProfile k2;
    private ConsultantProfile k3;
    private TalentApplication app1; // marketer = mktSpec
    private TalentApplication app2; // marketer = mktMgr
    private TalentInterview iv1; // SCHEDULED in 3 days, app1, created 2 days ago
    private TalentInterview iv2; // COMPLETED 40 days ago, app2, created 45 days ago
    private TalentInterview iv3; // SCHEDULED in 5 days, no application, consultant assigned to the owner

    @BeforeEach
    void interviewsWorld() {
        client = ApplicationItSupport.client(em, a.getId(), "Initech");
        job = ApplicationItSupport.job(em, a.getId(), client, "Data Engineer");
        k1 = ApplicationItSupport.consultant(em, a.getId(), "Kara One");
        k2 = ApplicationItSupport.consultant(em, a.getId(), "Kyle Two");
        k3 = ApplicationItSupport.consultant(em, a.getId(), "Kim Three");
        ApplicationItSupport.capacity(em, a.getId(), mktSpec.getId());
        ApplicationItSupport.capacity(em, a.getId(), mktMgr.getId());
        ApplicationItSupport.capacity(em, a.getId(), owner.getId());
        app1 = ApplicationItSupport.application(em, a.getId(), job, k1, mktSpec.getId(), "ASSIGNED", 10);
        app2 = ApplicationItSupport.application(em, a.getId(), job, k2, mktMgr.getId(), "ASSIGNED", 50);
        MarketerAssignment ma = new MarketerAssignment();
        ma.setOrgId(a.getId());
        ma.setConsultantId(k3.getId());
        ma.setMarketerMemberId(owner.getId());
        em.persist(ma);
        iv1 = interview(app1, k1, "SCHEDULED", Duration.ofDays(3), 2);
        iv2 = interview(app2, k2, "COMPLETED", Duration.ofDays(-40), 45);
        iv3 = interview(null, k3, "SCHEDULED", Duration.ofDays(5), 1);
        em.flush();
    }

    private TalentInterview interview(TalentApplication app, ConsultantProfile c, String status, Duration from, int createdDaysAgo) {
        TalentInterview i = new TalentInterview();
        i.setOrgId(a.getId());
        i.setApplicationId(app == null ? null : app.getId());
        i.setConsultantId(c.getId());
        i.setClientId(client.getId());
        i.setScheduledAt(Instant.now().plus(from).truncatedTo(java.time.temporal.ChronoUnit.SECONDS));
        i.setDurationMinutes(60);
        i.setStatus(status);
        i.setRoundLabel("Technical Interview");
        i.setRoundNo(1);
        i.setCreatedAt(Instant.now().minus(Duration.ofDays(createdDaysAgo)));
        i.setUpdatedAt(Instant.now().minus(Duration.ofDays(createdDaysAgo)));
        em.persist(i);
        return i;
    }

    private String url() {
        return "/api/orgs/" + a.getId() + "/interviews";
    }

    private MvcResult read(String who, String path) throws Exception {
        return call(login(who), get(url() + path));
    }

    private MvcResult send(String who, org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder req, String body) throws Exception {
        return call(login(who), req, body, null, key());
    }

    private String when(int days, int hour) {
        return Instant.now().plus(Duration.ofDays(days)).truncatedTo(java.time.temporal.ChronoUnit.DAYS).plus(Duration.ofHours(hour)).toString();
    }

    // ---- reading ---------------------------------------------------------------------------------------------------------------

    @Test
    void theOwnerSeesEveryInterviewWithRealRowsAndTotals() throws Exception {
        MvcResult r = read("owner", "?size=10");
        assertStatus(r, 200);
        JsonNode page = json(r);
        assertThat(page.path("total").asInt()).isEqualTo(3);
        assertThat(r.getResponse().getHeader("X-Total-Count")).isEqualTo("3");
        assertThat(ids(page)).containsExactly(iv3.getId(), iv1.getId(), iv2.getId()); // newest scheduled date first
        JsonNode first = page.path("items").get(1);
        assertThat(first.path("jobTitle").asText()).isEqualTo("Data Engineer");
        assertThat(first.path("jobCode").asText()).isEqualTo("JOB-" + (1000 + job.getId()));
        assertThat(first.path("consultant").path("name").asText()).isEqualTo("Kara One");
        assertThat(first.path("client").path("initials").asText()).isEqualTo("IN");
        assertThat(first.path("nextStep").asText()).isEqualTo("Send prep materials");
        assertThat(page.path("items").get(0).path("jobTitle").isNull()).as("an interview without an application has no role").isTrue();
    }

    @Test
    void searchStatusFilterSortAndPaginationAreServerSide() throws Exception {
        assertThat(ids(json(read("owner", "?q=kyle")))).containsExactly(iv2.getId());
        assertThat(ids(json(read("owner", "?q=job-" + (1000 + job.getId()))))).containsExactlyInAnyOrder(iv1.getId(), iv2.getId());
        assertThat(ids(json(read("owner", "?q=INT-" + (1000 + iv3.getId()))))).containsExactly(iv3.getId());
        assertThat(ids(json(read("owner", "?status=COMPLETED")))).containsExactly(iv2.getId());
        assertThat(ids(json(read("owner", "?status=SCHEDULED&sort=consultant,asc")))).containsExactly(iv1.getId(), iv3.getId());
        assertThat(ids(json(read("owner", "?mode=ONSITE")))).isEmpty();
        JsonNode paged = json(read("owner", "?size=2&page=1"));
        assertThat(paged.path("items")).hasSize(1);
        assertThat(paged.path("hasNext").asBoolean()).isFalse();
        String day = iv1.getScheduledAt().toString().substring(0, 10);
        assertThat(ids(json(read("owner", "?from=" + day + "&to=" + day)))).containsExactly(iv1.getId());
    }

    @Test
    void badQueriesAreRefusedPlainly() throws Exception {
        assertCode(read("owner", "?sort=bogus,asc"), 400, "SORT_INVALID");
        assertStatus(read("owner", "?q=a"), 422);
        assertStatus(read("owner", "?size=101"), 422);
        assertStatus(read("owner", "?status=NOPE"), 422);
        assertStatus(read("owner", "?mode=TELEPATHY"), 422);
    }

    @Test
    void kpiTilesComeFromTheHistoryWithHonestDeltas() throws Exception {
        JsonNode c = json(read("owner", "/counts"));
        assertThat(c.path("total").path("value").asInt()).isEqualTo(3);
        assertThat(c.path("total").path("previous").asInt()).as("only the 45 day old interview existed 30 days ago").isEqualTo(1);
        assertThat(c.path("total").path("series")).hasSize(8);
        assertThat(c.path("completed").path("value").asInt()).isEqualTo(1);
        assertThat(c.path("inProgress").path("value").asInt()).isZero();
        assertThat(c.path("scheduledThisWeek").path("series")).hasSize(8);
    }

    @Test
    void anOrganizationYoungerThanAMonthHasNoDelta() throws Exception {
        em.createQuery("delete from TalentInterview x where x.orgId = :o and x.id = :id").setParameter("o", a.getId()).setParameter("id", iv2.getId()).executeUpdate();
        em.clear();
        JsonNode c = json(read("owner", "/counts"));
        assertThat(c.path("total").path("value").asInt()).isEqualTo(2);
        assertThat(c.path("total").path("previous").isNull()).isTrue();
        assertThat(c.path("total").path("delta").isNull()).isTrue();
        assertThat(c.path("completed").path("previous").isNull()).isTrue();
    }

    @Test
    void filtersPipelineAndAnalyticsAreBuiltFromTheSameRows() throws Exception {
        JsonNode f = json(read("owner", "/filters"));
        assertThat(f.path("clients")).hasSize(1);
        assertThat(f.path("consultants")).hasSize(3);
        assertThat(f.path("statuses")).hasSize(4);
        assertThat(f.path("limits").path("maxInterviewers").asInt()).isEqualTo(6);
        JsonNode p = json(read("owner", "/pipeline"));
        assertThat(p.path("columns")).hasSize(4);
        assertThat(p.path("columns").get(0).path("count").asInt()).isEqualTo(2);
        assertThat(p.path("columns").get(2).path("items").get(0).path("id").asLong()).isEqualTo(iv2.getId());
        JsonNode an = json(read("owner", "/analytics"));
        assertThat(an.path("total").asInt()).isEqualTo(3);
        assertThat(an.path("perMonth")).hasSize(6);
        assertThat(an.path("topClients").get(0).path("label").asText()).isEqualTo("Initech");
    }

    @Test
    void theDetailCarriesTheStepperTimelineAndWhatTheCallerMayDo() throws Exception {
        JsonNode d = json(read("owner", "/" + iv1.getId()));
        assertThat(d.path("code").asText()).isEqualTo("INT-" + (1000 + iv1.getId()));
        assertThat(d.path("steps").get(0).path("state").asText()).isEqualTo("CURRENT");
        assertThat(d.path("steps").get(1).path("label").asText()).isEqualTo("Final Round");
        assertThat(d.path("steps").get(1).path("state").asText()).isEqualTo("NOT_SCHEDULED");
        assertThat(d.path("steps").get(2).path("label").asText()).isEqualTo("Offer");
        assertThat(d.path("nextStatuses")).hasSize(3);
        assertThat(d.path("actions").path("reschedule").asBoolean()).isTrue();
        assertThat(d.path("actions").path("feedback").asBoolean()).isFalse();
        assertThat(json(read("owner", "/" + iv2.getId())).path("actions").path("feedback").asBoolean()).isTrue();
    }

    // ---- scope and the generic 404 ---------------------------------------------------------------------------------------------

    @Test
    void anAssignedMarketerSeesOnlyTheirOwnInterviews() throws Exception {
        assertThat(ids(json(read("spec", "")))).containsExactly(iv1.getId());
        assertThat(json(read("spec", "/counts")).path("total").path("value").asInt()).isEqualTo(1);
        assertGeneric404(read("spec", "/" + iv2.getId()), "another marketer's interview");
        assertGeneric404(read("spec", "/" + iv3.getId()), "the owner's consultant's interview");
    }

    @Test
    void aTeamManagerSeesTheirTeamAndNotAnotherMarketersInterviews() throws Exception {
        assertThat(ids(json(read("mgr", "")))).contains(iv2.getId()).doesNotContain(iv1.getId(), iv3.getId());
    }

    @Test
    void everyKindOfOutsiderGetsTheSameGeneric404() throws Exception {
        long before = auditCount(a);
        for (String who : java.util.List.of("plain", "hr", "c1")) {
            assertGeneric404(read(who, ""), who + " list");
            assertGeneric404(read(who, "/counts"), who + " counts");
            assertGeneric404(read(who, "/" + iv1.getId()), who + " detail");
            assertGeneric404(send(who, post(url() + "/" + iv1.getId() + "/status"), "{\"status\":\"COMPLETED\"}"), who + " status");
            assertGeneric404(send(who, post(url() + "/" + iv1.getId() + "/reminder"), "{}"), who + " reminder");
            assertGeneric404(send(who, post(url()), "{\"consultantId\":" + k1.getId() + ",\"clientId\":" + client.getId() + ",\"scheduledAt\":\"" + when(9, 10) + "\"}"), who + " create");
        }
        String bOwnerLogin = login("bowner");
        assertGeneric404(call(bOwnerLogin, get(url())), "B's owner on A's org");
        assertGeneric404(call(bOwnerLogin, get("/api/orgs/" + b.getId() + "/interviews/" + iv1.getId())), "A's interview id inside B");
        assertGeneric404(call(bOwnerLogin, post("/api/orgs/" + b.getId() + "/interviews"), "{\"consultantId\":" + k1.getId() + ",\"clientId\":" + client.getId() + ",\"scheduledAt\":\"" + when(9, 10) + "\"}"), "A's consultant in B");
        assertThat(auditCount(a)).as("nothing was written").isEqualTo(before);
        em.refresh(iv1);
        assertThat(iv1.getStatus()).isEqualTo("SCHEDULED");
    }

    @Test
    void aReadOnlyRoleSeesTheBoardButCannotChangeIt() throws Exception {
        OrgMember viewer = extra(a, "viewer", OrgRole.MEMBER, "Vera", "Viewer");
        assign(viewer, "EXECUTIVE_VIEWER");
        assertStatus(read("viewer", ""), 200);
        JsonNode d = json(read("viewer", "/" + iv1.getId()));
        assertThat(d.path("actions").path("edit").asBoolean()).isFalse();
        assertThat(d.path("nextStatuses")).isEmpty();
        assertGeneric404(send("viewer", post(url() + "/" + iv1.getId() + "/status"), "{\"status\":\"COMPLETED\"}"), "viewer status");
        assertGeneric404(send("viewer", patch(url() + "/" + iv1.getId()), "{\"notes\":\"x\"}"), "viewer edit");
        assertGeneric404(read("viewer", "/pickers?kind=consultant"), "viewer pickers");
    }

    @Test
    void aMarketerCannotChangeSomeoneElsesInterview() throws Exception {
        assertGeneric404(send("spec", post(url() + "/" + iv2.getId() + "/reminder"), "{}"), "spec on mgr's interview");
        assertStatus(send("spec", post(url() + "/" + iv1.getId() + "/reminder"), "{}"), 200);
    }

    // ---- status machine --------------------------------------------------------------------------------------------------------

    @Test
    void aForwardChangeIsRecordedWithAnEventAndOneAuditRow() throws Exception {
        long before = auditCount(a, "INTERVIEW_STATUS");
        MvcResult r = send("owner", post(url() + "/" + iv1.getId() + "/status"), "{\"status\":\"IN_PROGRESS\"}");
        assertStatus(r, 200);
        JsonNode d = json(r);
        assertThat(d.path("status").asText()).isEqualTo("IN_PROGRESS");
        assertThat(d.path("nextStep").asText()).isEqualTo("Complete feedback");
        assertThat(d.path("undo").path("fromStatus").asText()).isEqualTo("SCHEDULED");
        assertThat(auditCount(a, "INTERVIEW_STATUS") - before).isEqualTo(1);
        assertThat(d.path("timeline").get(0).path("type").asText()).isEqualTo("STATUS");
        assertThat(json(read("owner", "/counts")).path("inProgress").path("value").asInt()).isEqualTo(1);
    }

    @Test
    void invalidChangesAreRefusedWithTheAllowedStatuses() throws Exception {
        MvcResult back = send("owner", post(url() + "/" + iv2.getId() + "/status"), "{\"status\":\"SCHEDULED\"}");
        assertCode(back, 422, "INVALID_TRANSITION");
        assertStatus(send("owner", post(url() + "/" + iv1.getId() + "/status"), "{\"status\":\"NOWHERE\"}"), 422);
        assertCode(send("owner", post(url() + "/" + iv1.getId() + "/status"), "{\"status\":\"SCHEDULED\"}"), 422, "INVALID_TRANSITION");
        assertStatus(send("owner", post(url() + "/" + iv1.getId() + "/status"), "{\"status\":\"COMPLETED\",\"surprise\":1}"), 422);
    }

    @Test
    void undoRevertsTheCallersOwnLatestChangeAndKeepsBothEventsInTheHistory() throws Exception {
        JsonNode moved = json(send("owner", post(url() + "/" + iv1.getId() + "/status"), "{\"status\":\"CANCELLED\",\"reason\":\"Client postponed\"}"));
        long eventId = moved.path("undo").path("eventId").asLong();
        assertThat(eventId).isPositive();
        // the marketer who owns the interview did not make the change, so it is not theirs to undo
        assertCode(send("spec", post(url() + "/" + iv1.getId() + "/status"), "{\"undoEventId\":" + eventId + "}"), 422, "UNDO_NOT_AVAILABLE");
        long before = auditCount(a, "INTERVIEW_STATUS_UNDO");
        JsonNode d = json(send("owner", post(url() + "/" + iv1.getId() + "/status"), "{\"undoEventId\":" + eventId + "}"));
        assertThat(d.path("status").asText()).isEqualTo("SCHEDULED");
        assertThat(d.path("timeline").get(0).path("type").asText()).isEqualTo("STATUS_REVERT");
        assertThat(d.path("timeline")).hasSize(3); // created, cancelled, undone: nothing is erased
        assertThat(d.path("undo").isNull()).isTrue();
        assertThat(auditCount(a, "INTERVIEW_STATUS_UNDO") - before).isEqualTo(1);
        assertCode(send("owner", post(url() + "/" + iv1.getId() + "/status"), "{\"undoEventId\":" + eventId + "}"), 422, "UNDO_NOT_AVAILABLE");
    }

    // ---- create ----------------------------------------------------------------------------------------------------------------

    @Test
    void schedulingRecordsAnInterviewAndNothingMore() throws Exception {
        long before = auditCount(a, "INTERVIEW_CREATE");
        String body = "{\"consultantId\":" + k1.getId() + ",\"applicationId\":" + app1.getId() + ",\"round\":\"Final Round\",\"scheduledAt\":\"" + when(9, 14) + "\",\"durationMinutes\":45,\"mode\":\"VIDEO\","
            + "\"meetingLink\":\"https://meet.example.com/abc\",\"notes\":\"Bring a portfolio\",\"interviewers\":[{\"name\":\"Dana Reed\",\"title\":\"VP Engineering\",\"primary\":true},{\"name\":\"Lee Park\"}]}";
        MvcResult r = send("owner", post(url()), body);
        assertStatus(r, 201);
        JsonNode d = json(r);
        assertThat(d.path("status").asText()).isEqualTo("SCHEDULED");
        assertThat(d.path("roundNo").asInt()).isEqualTo(2);
        assertThat(d.path("interviewers")).hasSize(2);
        assertThat(d.path("interviewers").get(0).path("primary").asBoolean()).isTrue();
        assertThat(d.path("steps")).hasSize(3);
        assertThat(d.path("timeline").get(0).path("type").asText()).isEqualTo("CREATED");
        assertThat(auditCount(a, "INTERVIEW_CREATE") - before).isEqualTo(1);
        assertThat(newestAudit(a).getDetails()).doesNotContain("portfolio");
    }

    @Test
    void creationValidatesItsInputsAndRefusesOverlapsAndIsIdempotentWithAKey() throws Exception {
        String ok = "\"consultantId\":" + k1.getId() + ",\"clientId\":" + client.getId();
        assertStatus(send("owner", post(url()), "{" + ok + "}"), 422); // no time
        assertStatus(send("owner", post(url()), "{\"scheduledAt\":\"" + when(9, 10) + "\"}"), 422); // no consultant
        assertStatus(send("owner", post(url()), "{\"consultantId\":" + k1.getId() + ",\"scheduledAt\":\"" + when(9, 10) + "\"}"), 422); // no client, no application
        assertGeneric404(send("owner", post(url()), "{\"consultantId\":999999,\"clientId\":" + client.getId() + ",\"scheduledAt\":\"" + when(9, 10) + "\"}"), "unknown consultant");
        assertCode(send("owner", post(url()), "{" + ok + ",\"applicationId\":" + app2.getId() + ",\"scheduledAt\":\"" + when(9, 10) + "\"}"), 422, "INVALID_APPLICATION");
        assertStatus(send("owner", post(url()), "{" + ok + ",\"scheduledAt\":\"" + when(9, 10) + "\",\"mode\":\"TELEPATHY\"}"), 422);
        assertStatus(send("owner", post(url()), "{" + ok + ",\"scheduledAt\":\"" + when(9, 10) + "\",\"durationMinutes\":5}"), 422);
        assertStatus(send("owner", post(url()), "{" + ok + ",\"scheduledAt\":\"" + when(9, 10) + "\",\"meetingLink\":\"javascript:alert(1)\"}"), 422);
        assertStatus(send("owner", post(url()), "{" + ok + ",\"scheduledAt\":\"" + when(9, 10) + "\",\"notes\":\"SSN 123-45-6789\"}"), 422);
        assertStatus(send("owner", post(url()), "{" + ok + ",\"scheduledAt\":\"" + when(9, 10) + "\",\"unknownThing\":true}"), 422);
        assertStatus(send("owner", post(url()), "{" + ok + ",\"scheduledAt\":\"" + when(9, 10) + "\",\"interviewers\":[{\"name\":\"a\"},{\"name\":\"b\"},{\"name\":\"c\"},{\"name\":\"d\"},{\"name\":\"e\"},{\"name\":\"f\"},{\"name\":\"g\"}]}"), 422);
        // iv1 occupies [now+3d, +60 min): a second one inside it clashes
        String clash = "{" + ok + ",\"scheduledAt\":\"" + iv1.getScheduledAt().plus(Duration.ofMinutes(30)) + "\"}";
        assertCode(send("owner", post(url()), clash), 409, "SLOT_OVERLAP");

        String body = "{" + ok + ",\"scheduledAt\":\"" + when(12, 10) + "\"}";
        String k = key();
        MvcResult first = call(login("owner"), post(url()), body, null, k);
        MvcResult replay = call(login("owner"), post(url()), body, null, k);
        assertStatus(first, 201);
        assertStatus(replay, 201);
        assertThat(replay.getResponse().getHeader("Idempotent-Replayed")).isEqualTo("true");
        assertThat(json(replay).path("id").asLong()).isEqualTo(json(first).path("id").asLong());
        assertThat(ids(json(read("owner", "?size=50")))).hasSize(4);
    }

    // ---- edit, reschedule, reminder, feedback ----------------------------------------------------------------------------------

    @Test
    void editingWritesOneEventAndOneAuditRowAndANoOpWritesNone() throws Exception {
        long before = auditCount(a, "INTERVIEW_UPDATE");
        MvcResult r = send("owner", patch(url() + "/" + iv1.getId()), "{\"notes\":\"Focus on system design\",\"nextStep\":\"Send calendar invite\",\"mode\":\"ONSITE\",\"location\":\"HQ, floor 3\"}");
        assertStatus(r, 200);
        JsonNode d = json(r);
        assertThat(d.path("notes").asText()).isEqualTo("Focus on system design");
        assertThat(d.path("nextStep").asText()).isEqualTo("Send calendar invite");
        assertThat(d.path("mode").asText()).isEqualTo("ONSITE");
        assertThat(auditCount(a, "INTERVIEW_UPDATE") - before).isEqualTo(1);
        assertThat(newestAudit(a).getDetails()).doesNotContain("system design");

        assertStatus(send("owner", patch(url() + "/" + iv1.getId()), "{\"notes\":\"Focus on system design\"}"), 200);
        assertThat(auditCount(a, "INTERVIEW_UPDATE") - before).as("nothing changed").isEqualTo(1);
        assertThat(json(send("owner", patch(url() + "/" + iv1.getId()), "{\"nextStep\":null}")).path("nextStep").asText()).as("back to the suggestion").isEqualTo("Send prep materials");

        MvcResult people = send("owner", patch(url() + "/" + iv1.getId()), "{\"interviewers\":[{\"name\":\"Dana Reed\",\"title\":\"VP\"},{\"name\":\"Lee Park\"}]}");
        assertThat(json(people).path("interviewers")).hasSize(2);
        assertCode(send("owner", patch(url() + "/" + iv1.getId()), "{\"status\":\"COMPLETED\"}"), 422, "FIELD_UNKNOWN");
        assertStatus(send("owner", patch(url() + "/" + iv1.getId()), "{\"notes\":\"SSN 123-45-6789\"}"), 422);
        assertStatus(send("owner", patch(url() + "/" + iv1.getId()), "{\"meetingLink\":\"ftp://x\"}"), 422);
    }

    @Test
    void rescheduleRecordsTheNewTimeAndBringsACancelledInterviewBack() throws Exception {
        long before = auditCount(a, "INTERVIEW_RESCHEDULE");
        String when = when(8, 11);
        MvcResult r = send("owner", post(url() + "/" + iv1.getId() + "/reschedule"), "{\"scheduledAt\":\"" + when + "\",\"reason\":\"Client asked\"}");
        assertStatus(r, 200);
        assertThat(json(r).path("scheduledAt").asText()).startsWith(when.substring(0, 16));
        assertThat(json(r).path("timeline").get(0).path("type").asText()).isEqualTo("RESCHEDULE");
        assertThat(auditCount(a, "INTERVIEW_RESCHEDULE") - before).isEqualTo(1);
        assertStatus(send("owner", post(url() + "/" + iv1.getId() + "/reschedule"), "{\"scheduledAt\":\"" + when + "\"}"), 200);
        assertThat(auditCount(a, "INTERVIEW_RESCHEDULE") - before).as("same time again: nothing").isEqualTo(1);

        send("owner", post(url() + "/" + iv1.getId() + "/status"), "{\"status\":\"CANCELLED\"}");
        JsonNode back = json(send("owner", post(url() + "/" + iv1.getId() + "/reschedule"), "{\"scheduledAt\":\"" + when(10, 9) + "\"}"));
        assertThat(back.path("status").asText()).isEqualTo("SCHEDULED");
        assertCode(send("owner", post(url() + "/" + iv2.getId() + "/reschedule"), "{\"scheduledAt\":\"" + when(10, 9) + "\"}"), 422, "INVALID_TRANSITION");
        JsonNode second = json(send("owner", post(url()), "{\"consultantId\":" + k1.getId() + ",\"clientId\":" + client.getId() + ",\"scheduledAt\":\"" + when(30, 10) + "\"}"));
        assertCode(send("owner", post(url() + "/" + second.path("id").asLong() + "/reschedule"), "{\"scheduledAt\":\"" + iv1.getScheduledAt() + "\"}"), 409, "SLOT_OVERLAP");
    }

    @Test
    void aReminderIsOnlyARecordAndHonoursTheCooldown() throws Exception {
        long before = auditCount(a, "INTERVIEW_REMINDER");
        MvcResult r = send("owner", post(url() + "/" + iv1.getId() + "/reminder"), "{}");
        assertStatus(r, 200);
        assertThat(json(r).path("reminderRequestedAt").isNull()).isFalse();
        assertThat(json(r).path("timeline").get(0).path("type").asText()).isEqualTo("REMINDER");
        assertThat(auditCount(a, "INTERVIEW_REMINDER") - before).isEqualTo(1);
        assertCode(send("owner", post(url() + "/" + iv1.getId() + "/reminder"), "{}"), 409, "REMINDER_RECENT");
        assertCode(send("owner", post(url() + "/" + iv2.getId() + "/reminder"), "{}"), 422, "REMINDER_NOT_APPLICABLE");
    }

    @Test
    void feedbackIsAddedOnceTheInterviewStartedAndNeverSurfacesInTheAudit() throws Exception {
        assertCode(send("owner", post(url() + "/" + iv1.getId() + "/feedback"), "{\"rating\":4,\"recommendation\":\"ADVANCE\"}"), 422, "FEEDBACK_NOT_APPLICABLE");
        long before = auditCount(a, "INTERVIEW_FEEDBACK");
        MvcResult r = send("owner", post(url() + "/" + iv2.getId() + "/feedback"), "{\"rating\":5,\"recommendation\":\"ADVANCE\",\"note\":\"Excellent communicator\"}");
        assertStatus(r, 201);
        JsonNode d = json(r);
        assertThat(d.path("feedback")).hasSize(1);
        assertThat(d.path("feedback").get(0).path("author").path("name").asText()).isNotBlank();
        assertThat(d.path("nextStep").asText()).isEqualTo("Share results");
        assertThat(auditCount(a, "INTERVIEW_FEEDBACK") - before).isEqualTo(1);
        assertThat(newestAudit(a).getDetails()).doesNotContain("Excellent");
        assertStatus(send("owner", post(url() + "/" + iv2.getId() + "/feedback"), "{\"rating\":9,\"recommendation\":\"ADVANCE\"}"), 422);
        assertStatus(send("owner", post(url() + "/" + iv2.getId() + "/feedback"), "{\"rating\":3,\"recommendation\":\"MAYBE\"}"), 422);
        assertStatus(send("owner", post(url() + "/" + iv2.getId() + "/feedback"), "{\"rating\":3,\"recommendation\":\"HOLD\",\"note\":\"card 4111 1111 1111 1111\"}"), 422);
    }

    @Test
    void pickersListWhatTheCallerMaySchedule() throws Exception {
        assertThat(json(read("owner", "/pickers?kind=consultant&q=kim")).path("items")).hasSize(1);
        assertThat(json(read("owner", "/pickers?kind=application&consultantId=" + k1.getId())).path("items").get(0).path("label").asText()).isEqualTo("Data Engineer");
        assertThat(json(read("owner", "/pickers?kind=client&q=init")).path("items")).hasSize(1);
        assertStatus(read("owner", "/pickers?kind=nope"), 422);
        assertThat(json(read("spec", "/pickers?kind=consultant")).path("items")).isEmpty(); // nobody is assigned to the specialist
    }
}
