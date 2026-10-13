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
import com.dossier.api.domain.ent.talent.TalentApplicationEvent;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.org.OrgMember;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Applications API through the real chain: scope (an assigned marketer sees only their own, a team manager their team, the owner
 * everything), the generic 404 for every kind of outsider, the stage machine (forward moves, invalid transitions, closing reasons, the Undo
 * that reverts a caller's own latest move), idempotent creation, honest KPI deltas, PII refusal in notes, and one audit row per mutation.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class OrgApplicationResourceIT extends MemberItSupport {

    private ClientAccount client;
    private ClientRequirement job;
    private ClientRequirement job2;
    private ConsultantProfile k1;
    private ConsultantProfile k2;
    private ConsultantProfile k3;
    private ConsultantProfile spare;
    private TalentApplication app1; // ASSIGNED, marketer = mktSpec
    private TalentApplication app2; // UNDER_REVIEW, marketer = mktMgr
    private TalentApplication app3; // OFFER, marketer = owner, created 45 days ago

    @BeforeEach
    void applicationsWorld() {
        client = ApplicationItSupport.client(em, a.getId(), "Initech");
        job = ApplicationItSupport.job(em, a.getId(), client, "Data Engineer");
        job2 = ApplicationItSupport.job(em, a.getId(), client, "QA Lead");
        k1 = ApplicationItSupport.consultant(em, a.getId(), "Kara One");
        k2 = ApplicationItSupport.consultant(em, a.getId(), "Kyle Two");
        k3 = ApplicationItSupport.consultant(em, a.getId(), "Kim Three");
        spare = ApplicationItSupport.consultant(em, a.getId(), "Sky Spare");
        ApplicationItSupport.capacity(em, a.getId(), mktSpec.getId());
        ApplicationItSupport.capacity(em, a.getId(), mktMgr.getId());
        ApplicationItSupport.capacity(em, a.getId(), owner.getId());
        app1 = ApplicationItSupport.application(em, a.getId(), job, k1, mktSpec.getId(), "ASSIGNED", 2);
        app2 = ApplicationItSupport.application(em, a.getId(), job, k2, mktMgr.getId(), "ASSIGNED", 10);
        move(app2, "ASSIGNED", "SUBMITTED", 9);
        move(app2, "SUBMITTED", "UNDER_REVIEW", 5);
        app3 = ApplicationItSupport.application(em, a.getId(), job2, k3, owner.getId(), "ASSIGNED", 45);
        move(app3, "ASSIGNED", "SUBMITTED", 40);
        move(app3, "SUBMITTED", "OFFER", 2);
        em.flush();
    }

    /** A recorded move {@code daysAgo} days back, as the seeder writes it. */
    private void move(TalentApplication app, String from, String to, int daysAgo) {
        TalentApplicationEvent e = new TalentApplicationEvent();
        e.setOrgId(app.getOrgId());
        e.setApplicationId(app.getId());
        e.setEventType("STAGE_CHANGE");
        e.setFromStage(from);
        e.setToStage(to);
        e.setActorMemberId(app.getMarketerMemberId());
        e.setOccurredAt(Instant.now().minusSeconds(daysAgo * 86400L));
        em.persist(e);
        app.setStage(to);
        app.setStageChangedAt(e.getOccurredAt());
        em.persist(app);
    }

    private String url() {
        return "/api/orgs/" + a.getId() + "/applications";
    }

    private MvcResult read(String who, String path) throws Exception {
        return call(login(who), get(url() + path));
    }

    private MvcResult send(String who, org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder req, String body) throws Exception {
        return call(login(who), req, body, null, key());
    }

    // ---- reading ---------------------------------------------------------------------------------------------------------------

    @Test
    void theOwnerSeesEveryApplicationWithRealRowsAndTotals() throws Exception {
        MvcResult r = read("owner", "?size=10&sort=applied,desc");
        assertStatus(r, 200);
        JsonNode page = json(r);
        assertThat(page.path("total").asInt()).isEqualTo(3);
        assertThat(r.getResponse().getHeader("X-Total-Count")).isEqualTo("3");
        assertThat(ids(page)).containsExactly(app1.getId(), app2.getId(), app3.getId()); // applied 2, 10, 45 days ago
        JsonNode first = page.path("items").get(0);
        assertThat(first.path("jobTitle").asText()).isEqualTo("Data Engineer");
        assertThat(first.path("consultant").path("name").asText()).isEqualTo("Kara One");
        assertThat(first.path("client").path("initials").asText()).isEqualTo("IN");
        assertThat(first.path("marketer").path("name").asText()).isEqualTo("Sam Spec");
    }

    @Test
    void searchStageFilterSortAndPaginationAreServerSide() throws Exception {
        assertThat(ids(json(read("owner", "?q=kyle")))).containsExactly(app2.getId());
        assertThat(ids(json(read("owner", "?q=under review")))).containsExactly(app2.getId());
        assertThat(ids(json(read("owner", "?stage=OFFER,ASSIGNED")))).containsExactlyInAnyOrder(app1.getId(), app3.getId());
        assertThat(ids(json(read("owner", "?jobTitle=QA Lead")))).containsExactly(app3.getId());
        assertThat(ids(json(read("owner", "?marketerId=" + mktMgr.getId())))).containsExactly(app2.getId());
        assertThat(ids(json(read("owner", "?sort=consultant,asc")))).containsExactly(app1.getId(), app3.getId(), app2.getId()); // kara < kim < kyle
        JsonNode paged = json(read("owner", "?size=2&page=1&sort=job,asc"));
        assertThat(paged.path("items")).hasSize(1);
        assertThat(paged.path("total").asInt()).isEqualTo(3);
        assertThat(paged.path("hasNext").asBoolean()).isFalse();
    }

    @Test
    void badQueriesAreRefusedPlainly() throws Exception {
        assertCode(read("owner", "?sort=bogus,asc"), 400, "SORT_INVALID");
        assertStatus(read("owner", "?q=a"), 422);
        assertStatus(read("owner", "?size=101"), 422);
        assertStatus(read("owner", "?stage=NOPE"), 422);
    }

    @Test
    void kpiTilesComeFromTheHistoryWithHonestDeltas() throws Exception {
        JsonNode c = json(read("owner", "/counts"));
        assertThat(c.path("total").path("value").asInt()).isEqualTo(3);
        assertThat(c.path("total").path("previous").asInt()).as("only the 45 day old application existed 30 days ago").isEqualTo(1);
        assertThat(c.path("total").path("delta").asInt()).isEqualTo(2);
        assertThat(c.path("total").path("series")).hasSize(8);
        assertThat(c.path("inReview").path("value").asInt()).isEqualTo(1);
        assertThat(c.path("offers").path("value").asInt()).isEqualTo(1);
        assertThat(c.path("offers").path("previous").asInt()).as("it was Submitted then, not an offer").isZero();
        assertThat(c.path("interviewing").path("value").asInt()).isZero();
    }

    @Test
    void anOrganizationYoungerThanAMonthHasNoDeltaAtAll() throws Exception {
        em.createQuery("delete from TalentApplicationEvent e where e.orgId = :o and e.applicationId = :id").setParameter("o", a.getId()).setParameter("id", app3.getId()).executeUpdate();
        em.createQuery("delete from TalentApplication x where x.orgId = :o and x.id = :id").setParameter("o", a.getId()).setParameter("id", app3.getId()).executeUpdate();
        em.clear();
        JsonNode c = json(read("owner", "/counts"));
        assertThat(c.path("total").path("value").asInt()).isEqualTo(2);
        assertThat(c.path("total").path("previous").isNull()).isTrue();
        assertThat(c.path("total").path("delta").isNull()).isTrue();
        assertThat(c.path("total").path("deltaPercent").isNull()).isTrue();
    }

    @Test
    void filtersPipelineAndAnalyticsAreBuiltFromTheSameRows() throws Exception {
        JsonNode f = json(read("owner", "/filters"));
        assertThat(f.path("jobTitles")).hasSize(2);
        assertThat(f.path("clients")).hasSize(1);
        assertThat(f.path("marketers")).hasSize(3);
        assertThat(f.path("stages")).hasSize(6);

        JsonNode p = json(read("owner", "/pipeline"));
        assertThat(p.path("columns")).hasSize(6);
        assertThat(p.path("columns").get(0).path("count").asInt()).isEqualTo(1);
        assertThat(p.path("columns").get(2).path("items").get(0).path("id").asLong()).isEqualTo(app2.getId());
        assertThat(json(read("owner", "/pipeline?q=nobody")).path("columns").get(0).path("count").asInt()).isZero();

        JsonNode an = json(read("owner", "/analytics"));
        assertThat(an.path("total").asInt()).isEqualTo(3);
        assertThat(an.path("open").asInt()).isEqualTo(3);
        assertThat(an.path("perMonth")).hasSize(6);
        assertThat(an.path("reached").get(0).path("count").asInt()).isEqualTo(3);
        assertThat(an.path("topClients").get(0).path("label").asText()).isEqualTo("Initech");
    }

    @Test
    void theDetailCarriesTheStepperDatesTimelineAndWhatTheCallerMayDo() throws Exception {
        JsonNode d = json(read("owner", "/" + app2.getId()));
        assertThat(d.path("code").asText()).isEqualTo(app2.getCode());
        assertThat(d.path("steps")).hasSize(6);
        assertThat(d.path("steps").get(1).path("state").asText()).isEqualTo("DONE");
        assertThat(d.path("steps").get(1).path("reachedAt").isNull()).isFalse();
        assertThat(d.path("steps").get(2).path("state").asText()).isEqualTo("CURRENT");
        assertThat(d.path("steps").get(3).path("reachedAt").isNull()).isTrue();
        assertThat(d.path("timeline")).hasSize(3);
        assertThat(d.path("nextStages")).hasSize(3); // Interviewing, Offer, Closed
        assertThat(d.path("actions").path("moveStage").asBoolean()).isTrue();
        assertThat(d.path("actions").path("reassign").asBoolean()).isTrue();
    }

    // ---- scope and the generic 404 ---------------------------------------------------------------------------------------------

    @Test
    void anAssignedMarketerSeesOnlyTheirOwnApplications() throws Exception {
        JsonNode page = json(read("spec", ""));
        assertThat(ids(page)).containsExactly(app1.getId());
        assertThat(json(read("spec", "/counts")).path("total").path("value").asInt()).isEqualTo(1);
        assertGeneric404(read("spec", "/" + app2.getId()), "another marketer's application");
        assertGeneric404(read("spec", "/" + app3.getId()), "the owner's application");
        assertThat(json(read("spec", "/analytics")).path("total").asInt()).isEqualTo(1);
    }

    @Test
    void aTeamManagerSeesTheirTeamAndNotAnotherMarketersApplications() throws Exception {
        JsonNode page = json(read("mgr", ""));
        assertThat(ids(page)).contains(app2.getId()).doesNotContain(app1.getId(), app3.getId());
    }

    @Test
    void everyKindOfOutsiderGetsTheSameGeneric404() throws Exception {
        long before = auditCount(a);
        for (String who : List.of("plain", "hr", "c1")) {
            assertGeneric404(read(who, ""), who + " list");
            assertGeneric404(read(who, "/counts"), who + " counts");
            assertGeneric404(read(who, "/" + app1.getId()), who + " detail");
            assertGeneric404(send(who, post(url() + "/" + app1.getId() + "/stage"), "{\"stage\":\"SUBMITTED\"}"), who + " stage");
            assertGeneric404(send(who, post(url() + "/" + app1.getId() + "/notes"), "{\"body\":\"hi\"}"), who + " note");
            assertGeneric404(send(who, post(url()), "{\"requirementId\":" + job.getId() + ",\"consultantId\":" + spare.getId() + "}"), who + " create");
        }
        // B's owner, on A's id and on his own id with A's rows
        String bOwnerLogin = login("bowner");
        assertGeneric404(call(bOwnerLogin, get(url())), "B's owner on A's org");
        assertGeneric404(call(bOwnerLogin, get("/api/orgs/" + b.getId() + "/applications/" + app1.getId())), "A's application id inside B");
        assertGeneric404(call(bOwnerLogin, post("/api/orgs/" + b.getId() + "/applications"), "{\"requirementId\":" + job.getId() + ",\"consultantId\":" + spare.getId() + "}"), "A's job in B");
        assertThat(auditCount(a)).as("nothing was written").isEqualTo(before);
        assertThat(app1.getStage()).isEqualTo("ASSIGNED");
    }

    @Test
    void aReadOnlyRoleSeesTheBoardButCannotChangeIt() throws Exception {
        OrgMember viewer = extra(a, "viewer", OrgRole.MEMBER, "Vera", "Viewer");
        assign(viewer, "EXECUTIVE_VIEWER");
        assertStatus(read("viewer", ""), 200);
        JsonNode d = json(read("viewer", "/" + app1.getId()));
        assertThat(d.path("actions").path("edit").asBoolean()).isFalse();
        assertThat(d.path("actions").path("moveStage").asBoolean()).isFalse();
        assertThat(d.path("nextStages")).isEmpty();
        assertGeneric404(send("viewer", post(url() + "/" + app1.getId() + "/stage"), "{\"stage\":\"SUBMITTED\"}"), "viewer stage");
        assertGeneric404(send("viewer", patch(url() + "/" + app1.getId()), "{\"nextAction\":\"x\"}"), "viewer edit");
        assertGeneric404(read("viewer", "/pickers?kind=job"), "viewer pickers");
    }

    @Test
    void aMarketerCannotMoveSomeoneElsesApplication() throws Exception {
        assertGeneric404(send("spec", post(url() + "/" + app2.getId() + "/stage"), "{\"stage\":\"INTERVIEWING\"}"), "spec on mgr's application");
        MvcResult own = send("spec", post(url() + "/" + app1.getId() + "/stage"), "{\"stage\":\"SUBMITTED\"}");
        assertStatus(own, 200);
    }

    // ---- stage machine ---------------------------------------------------------------------------------------------------------

    @Test
    void aForwardMoveIsRecordedWithAnEventAndOneAuditRow() throws Exception {
        long before = auditCount(a, "APPLICATION_STAGE");
        MvcResult r = send("owner", post(url() + "/" + app1.getId() + "/stage"), "{\"stage\":\"SUBMITTED\"}");
        assertStatus(r, 200);
        JsonNode d = json(r);
        assertThat(d.path("stage").asText()).isEqualTo("SUBMITTED");
        assertThat(d.path("steps").get(1).path("state").asText()).isEqualTo("CURRENT");
        assertThat(d.path("undo").path("fromStage").asText()).isEqualTo("ASSIGNED");
        assertThat(auditCount(a, "APPLICATION_STAGE") - before).isEqualTo(1);
        assertThat(newestAudit(a).getAction()).isEqualTo("APPLICATION_STAGE");
        assertThat(d.path("timeline")).hasSize(2);
        assertThat(d.path("activity").get(0).path("type").asText()).isEqualTo("STAGE_CHANGE"); // newest first
    }

    @Test
    void backwardsAndSkippedAndClosedMovesAreRefusedWithTheAllowedStages() throws Exception {
        MvcResult back = send("owner", post(url() + "/" + app2.getId() + "/stage"), "{\"stage\":\"SUBMITTED\"}");
        assertCode(back, 422, "INVALID_TRANSITION");
        assertThat(back.getResponse().getContentAsString()).contains("INTERVIEWING");
        assertCode(send("owner", post(url() + "/" + app2.getId() + "/stage"), "{\"stage\":\"UNDER_REVIEW\"}"), 422, "INVALID_TRANSITION");
        assertStatus(send("owner", post(url() + "/" + app2.getId() + "/stage"), "{\"stage\":\"NOWHERE\"}"), 422);

        // closing needs a reason, a reason is only for closing
        assertStatus(send("owner", post(url() + "/" + app2.getId() + "/stage"), "{\"stage\":\"CLOSED\"}"), 422);
        assertStatus(send("owner", post(url() + "/" + app2.getId() + "/stage"), "{\"stage\":\"OFFER\",\"closedReason\":\"HIRED\"}"), 422);
        MvcResult closed = send("owner", post(url() + "/" + app2.getId() + "/stage"), "{\"stage\":\"CLOSED\",\"closedReason\":\"REJECTED\"}");
        assertStatus(closed, 200);
        assertThat(json(closed).path("closedReason").asText()).isEqualTo("REJECTED");
        // out of Closed there is no way, not even a "reopen"
        assertCode(send("owner", post(url() + "/" + app2.getId() + "/stage"), "{\"stage\":\"OFFER\"}"), 422, "INVALID_TRANSITION");
        assertThat(json(read("owner", "/" + app2.getId())).path("nextStages")).isEmpty();
    }

    @Test
    void undoRevertsTheCallersOwnLatestMoveAndKeepsBothEventsInTheHistory() throws Exception {
        JsonNode moved = json(send("owner", post(url() + "/" + app3.getId() + "/stage"), "{\"stage\":\"CLOSED\",\"closedReason\":\"HIRED\"}"));
        long eventId = moved.path("undo").path("eventId").asLong();
        assertThat(eventId).isPositive();

        // somebody else cannot undo it
        assertStatus(send("spec", post(url() + "/" + app3.getId() + "/stage"), "{\"undoEventId\":" + eventId + "}"), 404);
        long before = auditCount(a, "APPLICATION_STAGE_UNDO");
        MvcResult undone = send("owner", post(url() + "/" + app3.getId() + "/stage"), "{\"undoEventId\":" + eventId + "}");
        assertStatus(undone, 200);
        JsonNode d = json(undone);
        assertThat(d.path("stage").asText()).isEqualTo("OFFER");
        assertThat(d.path("closedReason").isNull()).isTrue();
        assertThat(d.path("steps").get(5).path("reachedAt").isNull()).as("the reverted Closed date is forgotten").isTrue();
        assertThat(d.path("activity").get(0).path("type").asText()).isEqualTo("STAGE_REVERT");
        assertThat(auditCount(a, "APPLICATION_STAGE_UNDO") - before).isEqualTo(1);
        // the same undo cannot be used twice, and a stale event id is refused
        assertCode(send("owner", post(url() + "/" + app3.getId() + "/stage"), "{\"undoEventId\":" + eventId + "}"), 422, "UNDO_NOT_AVAILABLE");
        // and the undo token is gone from the detail (the latest state event is now the revert)
        assertThat(d.path("undo").isNull()).isTrue();
    }

    // ---- create ----------------------------------------------------------------------------------------------------------------

    @Test
    void addingAnApplicationRecordsItAndNothingMore() throws Exception {
        MarketerAssignment ma = new MarketerAssignment();
        ma.setOrgId(a.getId());
        ma.setConsultantId(spare.getId());
        ma.setMarketerMemberId(mktSpec.getId());
        em.persist(ma);
        em.flush();
        long before = auditCount(a, "APPLICATION_CREATE");
        String body = "{\"requirementId\":" + job2.getId() + ",\"consultantId\":" + spare.getId() + ",\"source\":\"Referral\",\"nextAction\":\"Prepare application\"}";
        MvcResult r = send("owner", post(url()), body);
        assertStatus(r, 201);
        JsonNode d = json(r);
        assertThat(d.path("code").asText()).matches("APP-\\d{4}-\\d{3,}");
        assertThat(d.path("stage").asText()).isEqualTo("ASSIGNED");
        assertThat(d.path("marketer").path("name").asText()).as("the consultant's assigned marketer").isEqualTo("Sam Spec");
        assertThat(d.path("timeline")).hasSize(1);
        assertThat(d.path("timeline").get(0).path("type").asText()).isEqualTo("CREATED");
        assertThat(auditCount(a, "APPLICATION_CREATE") - before).isEqualTo(1);
        // a second application of the same pair is a conflict
        assertCode(send("owner", post(url()), body), 409, "DUPLICATE_APPLICATION");
    }

    @Test
    void anApplicationCanBeRecordedAsAlreadySubmittedByTheConsultant() throws Exception {
        MvcResult r = send("owner", post(url()), "{\"requirementId\":" + job2.getId() + ",\"consultantId\":" + spare.getId() + ",\"stage\":\"SUBMITTED\",\"marketerMemberId\":" + mktMgr.getId() + "}");
        assertStatus(r, 201);
        JsonNode d = json(r);
        assertThat(d.path("stage").asText()).isEqualTo("SUBMITTED");
        assertThat(d.path("timeline")).hasSize(2);
        assertStatus(send("owner", post(url()), "{\"requirementId\":" + job.getId() + ",\"consultantId\":" + spare.getId() + ",\"stage\":\"OFFER\"}"), 422);
    }

    @Test
    void creationValidatesItsInputsAndIsIdempotentWithAKey() throws Exception {
        assertStatus(send("owner", post(url()), "{\"consultantId\":" + spare.getId() + "}"), 422);
        assertGeneric404(send("owner", post(url()), "{\"requirementId\":999999,\"consultantId\":" + spare.getId() + "}"), "unknown job");
        assertCode(send("owner", post(url()), "{\"requirementId\":" + job2.getId() + ",\"consultantId\":" + spare.getId() + ",\"marketerMemberId\":" + plain.getId() + "}"), 422, "INVALID_MARKETER");
        assertStatus(send("owner", post(url()), "{\"requirementId\":" + job2.getId() + ",\"consultantId\":" + spare.getId() + ",\"nextAction\":\"SSN 123-45-6789\"}"), 422);

        String body = "{\"requirementId\":" + job2.getId() + ",\"consultantId\":" + spare.getId() + "}";
        String k = key();
        MvcResult first = call(login("owner"), post(url()), body, null, k);
        MvcResult replay = call(login("owner"), post(url()), body, null, k);
        assertStatus(first, 201);
        assertStatus(replay, 201);
        assertThat(replay.getResponse().getHeader("Idempotent-Replayed")).isEqualTo("true");
        assertThat(json(replay).path("id").asLong()).isEqualTo(json(first).path("id").asLong());
        assertThat(ids(json(read("owner", "?size=50")))).hasSize(4);
    }

    // ---- edit and notes --------------------------------------------------------------------------------------------------------

    @Test
    void editingTheNextActionWritesOneEventAndOneAuditRowAndANoOpWritesNone() throws Exception {
        long before = auditCount(a, "APPLICATION_UPDATE");
        MvcResult r = send("owner", patch(url() + "/" + app1.getId()), "{\"nextAction\":\"Call the client\",\"nextActionDue\":\"2030-01-15\"}");
        assertStatus(r, 200);
        JsonNode d = json(r);
        assertThat(d.path("nextAction").asText()).isEqualTo("Call the client");
        assertThat(d.path("nextActionDue").asText()).isEqualTo("2030-01-15");
        assertThat(d.path("activity").get(0).path("type").asText()).isEqualTo("UPDATE");
        assertThat(auditCount(a, "APPLICATION_UPDATE") - before).isEqualTo(1);

        assertStatus(send("owner", patch(url() + "/" + app1.getId()), "{\"nextAction\":\"Call the client\"}"), 200);
        assertThat(auditCount(a, "APPLICATION_UPDATE") - before).as("nothing changed").isEqualTo(1);

        // a JSON null clears; unknown fields, bad dates and PII are refused
        assertThat(json(send("owner", patch(url() + "/" + app1.getId()), "{\"nextActionDue\":null}")).path("nextActionDue").isNull()).isTrue();
        assertCode(send("owner", patch(url() + "/" + app1.getId()), "{\"stage\":\"OFFER\"}"), 422, "FIELD_UNKNOWN");
        assertStatus(send("owner", patch(url() + "/" + app1.getId()), "{\"nextActionDue\":\"tomorrow\"}"), 422);
        assertStatus(send("owner", patch(url() + "/" + app1.getId()), "{\"nextAction\":\"card 4111 1111 1111 1111\"}"), 422);
    }

    @Test
    void aClosedApplicationHasNoNextAction() throws Exception {
        send("owner", post(url() + "/" + app2.getId() + "/stage"), "{\"stage\":\"CLOSED\",\"closedReason\":\"WITHDRAWN\"}");
        assertCode(send("owner", patch(url() + "/" + app2.getId()), "{\"nextAction\":\"x\"}"), 422, "APPLICATION_CLOSED");
    }

    @Test
    void onlySomeoneWhoMayReassignCanChangeTheMarketer() throws Exception {
        assertGeneric404(send("spec", patch(url() + "/" + app1.getId()), "{\"marketerMemberId\":" + owner.getId() + "}"), "a specialist reassigning");
        MvcResult r = send("owner", patch(url() + "/" + app1.getId()), "{\"marketerMemberId\":" + mktMgr.getId() + "}");
        assertStatus(r, 200);
        assertThat(json(r).path("marketer").path("name").asText()).isEqualTo("Maria Lopez");
        assertCode(send("owner", patch(url() + "/" + app1.getId()), "{\"marketerMemberId\":" + plain.getId() + "}"), 422, "INVALID_MARKETER");
    }

    @Test
    void notesAreAddedWithAnEventAnAuditRowAndNoSensitiveIdentifiers() throws Exception {
        long before = auditCount(a, "APPLICATION_NOTE");
        MvcResult r = send("spec", post(url() + "/" + app1.getId() + "/notes"), "{\"body\":\"Client prefers a Friday call\"}");
        assertStatus(r, 201);
        JsonNode d = json(r);
        assertThat(d.path("notesCount").asInt()).isEqualTo(1);
        assertThat(d.path("notes").get(0).path("author").path("name").asText()).isEqualTo("Sam Spec");
        assertThat(d.path("activity").get(0).path("type").asText()).isEqualTo("NOTE");
        assertThat(auditCount(a, "APPLICATION_NOTE") - before).isEqualTo(1);
        assertThat(newestAudit(a).getDetails()).doesNotContain("Friday");

        assertStatus(send("spec", post(url() + "/" + app1.getId() + "/notes"), "{\"body\":\"  \"}"), 422);
        assertStatus(send("spec", post(url() + "/" + app1.getId() + "/notes"), "{\"body\":\"his SSN is 078-05-1120\"}"), 422);
        assertStatus(send("spec", post(url() + "/" + app1.getId() + "/notes"), "{\"body\":\"" + "x".repeat(1001) + "\"}"), 422);
        assertThat(json(read("spec", "/" + app1.getId())).path("notesCount").asInt()).isEqualTo(1);
    }

    @Test
    void pickersListWhatTheCallerMayAttach() throws Exception {
        assertThat(json(read("owner", "/pickers?kind=consultant&q=sky")).path("items")).hasSize(1);
        assertThat(json(read("owner", "/pickers?kind=job&q=qa")).path("items").get(0).path("sub").asText()).isEqualTo("Initech");
        assertThat(json(read("owner", "/pickers?kind=marketer")).path("items")).hasSize(3);
        assertStatus(read("owner", "/pickers?kind=nope"), 422);
        // a specialist sees only consultants assigned to them
        assertThat(json(read("spec", "/pickers?kind=consultant")).path("items")).isEmpty();
    }
}
