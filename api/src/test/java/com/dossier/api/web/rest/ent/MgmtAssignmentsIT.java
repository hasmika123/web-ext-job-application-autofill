package com.dossier.api.web.rest.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.MarketerAssignment;
import com.dossier.api.domain.ent.talent.MarketerCapacity;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.MarketerAssignmentRepository;
import com.dossier.api.repository.ent.talent.MarketerCapacityRepository;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Marketing Manager's Consultant Assignments and Workload through the real chain on real rows (MM-07): the admin board's own writer behind the team wall.
 * A marketer outside the team is the generic 404, a consultant carried outside the team is skipped NOT_FOUND, the capacity rule and the audit rows are the admin
 * board's, the rebalance is one call with one bulk audit row and a {@code previous} that Undo sends back to /restore.
 *
 * <p>World (on top of {@link MemberItSupport}): mgr (Marketing Manager, TEAM, team T1, capacity 2, carries nothing), mia (Marketing Specialist in T1, capacity 4, carries
 * k1, k4 and k5), spec (Marketing Specialist outside every team, capacity 3, carries k2) and k3 (nobody carries it).
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class MgmtAssignmentsIT extends MemberItSupport {

    @Autowired private ConsultantProfileRepository consultants;
    @Autowired private MarketerAssignmentRepository assignmentRows;
    @Autowired private MarketerCapacityRepository capacityRows;

    private OrgMember mia;
    private ConsultantProfile k1;
    private ConsultantProfile k2;
    private ConsultantProfile k3;
    private ConsultantProfile k4;
    private ConsultantProfile k5;

    @BeforeEach
    void managerWorld() {
        settingRows.save(new AppSetting(EnterpriseSettingKeys.FLAG_MARKETING, "{\"on\":true}", WHO, Instant.now()));
        settingsCache.invalidate();
        mia = extra(a, "mia", OrgRole.MARKETER, "Mia", "Ng");
        assign(mia, "MARKETING_SPECIALIST");
        place(mia, d1, t1);
        capacity(mktMgr, 2, "Marketing Manager");
        capacity(mia, 4, "Marketing Specialist");
        capacity(mktSpec, 3, "Marketing Specialist");
        k1 = consultant(a, "Kay One");
        k2 = consultant(a, "Kay Two");
        k3 = consultant(a, "Kay Three");
        k4 = consultant(a, "Kay Four");
        k5 = consultant(a, "Kay Five");
        carried(k1, mia);
        carried(k2, mktSpec);
        carried(k4, mia);
        carried(k5, mia);
        flushIfInTransaction();
    }

    // ---- fixtures ---------------------------------------------------------------------------------------------------------------

    private void capacity(OrgMember m, int cap, String title) {
        MarketerCapacity c = new MarketerCapacity();
        c.setOrgId(m.getOrgId());
        c.setMemberId(m.getId());
        c.setCapacity(cap);
        c.setStatus("ACTIVE");
        c.setTitleLabel(title);
        c.setCreatedAt(Instant.now());
        capacityRows.saveAndFlush(c);
    }

    private ConsultantProfile consultant(com.dossier.api.domain.org.Organization org, String name) {
        ConsultantProfile c = new ConsultantProfile();
        c.setOrgId(org.getId());
        c.setDisplayName(name);
        c.setEmail(name.toLowerCase().replace(' ', '.') + "@example.org");
        c.setStatus("ACTIVE");
        c.setJobTitle("Engineer");
        c.setCreatedAt(Instant.now());
        return consultants.saveAndFlush(c);
    }

    private void carried(ConsultantProfile c, OrgMember marketer) {
        MarketerAssignment row = new MarketerAssignment();
        row.setOrgId(c.getOrgId());
        row.setConsultantId(c.getId());
        row.setMarketerMemberId(marketer.getId());
        row.setPriority("MEDIUM");
        row.setAssignedAt(Instant.now());
        row.setLastActivityAt(Instant.now());
        assignmentRows.saveAndFlush(row);
    }

    private Long marketerOf(ConsultantProfile c) {
        flushIfInTransaction();
        em.clear();
        return assignmentRows.findByOrgIdAndConsultantId(a.getId(), c.getId()).map(MarketerAssignment::getMarketerMemberId).orElse(null);
    }

    private static String base(com.dossier.api.domain.org.Organization o) {
        return "/api/orgs/" + o.getId() + "/mgmt";
    }

    private JsonNode fetch(String login, String url) throws Exception {
        MvcResult r = call(login, get(url));
        assertStatus(r, 200);
        return json(r);
    }

    private MvcResult send(String login, String path, String body) throws Exception {
        return call(login, post(base(a) + path), body, null, key());
    }

    private static List<String> names(JsonNode page, String field) {
        List<String> out = new ArrayList<>();
        page.path("items").forEach(n -> out.add(n.path(field).asText()));
        return out;
    }

    private static JsonNode resultOf(JsonNode bulk, long consultantId) {
        for (JsonNode r : bulk.path("results")) if (r.path("consultantId").asLong() == consultantId) return r;
        throw new AssertionError("no result for consultant " + consultantId + " in " + bulk);
    }

    // ---- reads -------------------------------------------------------------------------------------------------------------------

    @Test
    void theConsultantsTableIsTheTeamsOwnAndAnAdminSeesEveryone() throws Exception {
        MvcResult mine = call(login("mgr"), get(base(a) + "/assignments?sort=name"));
        assertStatus(mine, 200);
        assertThat(names(json(mine), "name")).containsExactly("Kay Five", "Kay Four", "Kay One"); // Kay Two is spec's, outside the team
        assertThat(mine.getResponse().getHeader("X-Total-Count")).isEqualTo("3");
        assertThat(names(fetch(login("mgr"), base(a) + "/assignments?unassigned=true"), "name")).containsExactly("Kay Three");
        assertThat(names(fetch(login("mgr"), base(a) + "/assignments?marketerId=" + mia.getId() + "&priority=MEDIUM&sort=name"), "name")).containsExactly("Kay Five", "Kay Four", "Kay One");
        assertThat(names(fetch(login("owner"), base(a) + "/assignments?sort=name"), "name")).containsExactly("Kay Five", "Kay Four", "Kay One", "Kay Two");
        assertGeneric404(call(login("mgr"), get(base(a) + "/assignments?marketerId=" + mktSpec.getId())), "a marketer outside the team");
        assertStatus(call(login("mgr"), get(base(a) + "/assignments?priority=URGENT")), 422);
    }

    @Test
    void aConsultantsHistoryIsReadableOnlyInsideTheTeam() throws Exception {
        assertThat(fetch(login("mgr"), base(a) + "/assignments/consultants/" + k1.getId() + "/history").path("consultantName").asText()).isEqualTo("Kay One");
        assertGeneric404(call(login("mgr"), get(base(a) + "/assignments/consultants/" + k2.getId() + "/history")), "a consultant carried outside the team");
        assertGeneric404(call(login("mgr"), get(base(a) + "/assignments/consultants/" + k3.getId() + "/history")), "an unassigned consultant is nobody's of the team");
        assertGeneric404(call(login("mgr"), get(base(a) + "/assignments/consultants/999999999/history")), "an unknown id");
        assertStatus(call(login("owner"), get(base(a) + "/assignments/consultants/" + k2.getId() + "/history")), 200);
        assertStatus(call(login("owner"), get(base(a) + "/assignments/consultants/" + k3.getId() + "/history")), 200);
    }

    @Test
    void everyoneWithoutTheKeysAndEveryOtherOrganizationGetsTheGenericNotFound() throws Exception {
        List<String> reads = List.of("/assignments", "/assignments/consultants/" + 1 + "/history", "/workload");
        for (String who : List.of("spec", "plain", "hr", "c1")) {
            for (String path : reads) assertGeneric404(call(login(who), get(base(a) + path)), who + " reads " + path);
            for (String path : List.of("/assignments/assign", "/assignments/update", "/assignments/unassign", "/assignments/restore", "/workload/rebalance")) {
                assertGeneric404(call(login(who), post(base(a) + path), "{}", null, null), who + " writes " + path + " (no key: the 404 comes first)");
            }
        }
        for (String path : reads) assertGeneric404(call(login("bowner"), get(base(a) + path)), "B's owner reads A's " + path);
        assertGeneric404(send("bowner", "/assignments/assign", "{\"consultantIds\":[" + k3.getId() + "],\"marketerMemberId\":" + mia.getId() + "}"), "B's owner assigns in A");
        assertThat(names(fetch(login("bowner"), base(b) + "/assignments"), "name")).as("B has nothing of A's").isEmpty();
        assertThat(fetch(login("bowner"), base(b) + "/workload").path("items")).isEmpty();
    }

    // ---- writes: the admin board's own, behind the team wall ------------------------------------------------------------------------

    @Test
    void theManagerAssignsAnUnassignedConsultantToAMarketerOfTheTeamWithTheAdminBoardsAuditAndUndo() throws Exception {
        long before = auditCount(a);
        String k = key();
        String body = "{\"consultantIds\":[" + k3.getId() + "],\"marketerMemberId\":" + mia.getId() + ",\"reason\":\"Skills match\"}";
        MvcResult ok = call(login("mgr"), post(base(a) + "/assignments/assign"), body, null, k);
        assertStatus(ok, 200);
        JsonNode done = json(ok);
        assertThat(done.path("ok").asInt()).isEqualTo(1);
        assertThat(marketerOf(k3)).isEqualTo(mia.getId());
        assertThat(auditCount(a) - before).isEqualTo(2L); // MARKETING_ASSIGN + MARKETING_BULK, as on the admin board
        assertThat(auditCount(a, "MARKETING_ASSIGN")).isEqualTo(1L);
        assertThat(newestAudit(a).getAction()).isEqualTo("MARKETING_BULK");
        MvcResult replay = call(login("mgr"), post(base(a) + "/assignments/assign"), body, null, k);
        assertThat(replay.getResponse().getHeader("Idempotent-Replayed")).isEqualTo("true");
        assertThat(auditCount(a, "MARKETING_ASSIGN")).isEqualTo(1L);
        assertThat(fetch(login("mgr"), base(a) + "/assignments/consultants/" + k3.getId() + "/history").path("items").get(0).path("action").asText()).isEqualTo("ASSIGN");

        MvcResult undo = send("mgr", "/assignments/restore", "{\"rows\":[{\"consultantId\":" + k3.getId() + ",\"marketerMemberId\":null}]}");
        assertStatus(undo, 200);
        assertThat(marketerOf(k3)).isNull();
    }

    @Test
    void aMarketerOutsideTheTeamIsNotFoundAndAConsultantCarriedOutsideItIsSkipped() throws Exception {
        assertGeneric404(send("mgr", "/assignments/assign", "{\"consultantIds\":[" + k3.getId() + "],\"marketerMemberId\":" + mktSpec.getId() + "}"), "a marketer outside the team");
        assertGeneric404(send("mgr", "/assignments/assign", "{\"consultantIds\":[" + k3.getId() + "],\"marketerMemberId\":" + mia.getId() + ",\"backupMemberId\":" + mktSpec.getId() + "}"), "a backup outside the team");
        long before = auditCount(a);
        MvcResult skipped = send("mgr", "/assignments/assign", "{\"consultantIds\":[" + k2.getId() + "],\"marketerMemberId\":" + mia.getId() + "}");
        assertStatus(skipped, 200);
        assertThat(json(skipped).path("ok").asInt()).isZero();
        assertThat(resultOf(json(skipped), k2.getId()).path("reason").asText()).isEqualTo("NOT_FOUND");
        assertThat(marketerOf(k2)).isEqualTo(mktSpec.getId());
        assertThat(auditCount(a)).as("nothing reachable: nothing written").isEqualTo(before);

        MvcResult mixed = send("mgr", "/assignments/assign", "{\"consultantIds\":[" + k2.getId() + "," + k3.getId() + "],\"marketerMemberId\":" + mia.getId() + "}");
        assertStatus(mixed, 200);
        assertThat(json(mixed).path("ok").asInt()).isEqualTo(1);
        assertThat(json(mixed).path("requested").asInt()).isEqualTo(2);
        assertThat(json(mixed).path("skipped")).hasSize(1);
        assertThat(marketerOf(k3)).isEqualTo(mia.getId());
        assertThat(marketerOf(k2)).isEqualTo(mktSpec.getId());

        for (String path : List.of("/assignments/update", "/assignments/unassign")) {
            String bodyFor = path.endsWith("update") ? "{\"consultantIds\":[" + k2.getId() + "],\"priority\":\"HIGH\"}" : "{\"consultantIds\":[" + k2.getId() + "]}";
            MvcResult r = send("mgr", path, bodyFor);
            assertStatus(r, 200);
            assertThat(json(r).path("ok").asInt()).as(path).isZero();
            assertThat(marketerOf(k2)).as(path).isEqualTo(mktSpec.getId());
        }
        MvcResult restore = send("mgr", "/assignments/restore", "{\"rows\":[{\"consultantId\":" + k2.getId() + ",\"marketerMemberId\":null}]}");
        assertThat(json(restore).path("ok").asInt()).isZero();
        assertThat(marketerOf(k2)).isEqualTo(mktSpec.getId());
    }

    @Test
    void theCapacityRuleAndTheBodyChecksAreTheAdminBoards() throws Exception {
        MvcResult over = send("mgr", "/assignments/assign", "{\"consultantIds\":[" + k1.getId() + "," + k3.getId() + "," + k4.getId() + "],\"marketerMemberId\":" + mktMgr.getId() + "}");
        assertCode(over, 409, "OVER_CAPACITY");
        assertThat(over.getResponse().getContentAsString()).contains("\"projected\":3").contains("\"capacity\":2");
        assertThat(marketerOf(k1)).isEqualTo(mia.getId());
        assertThat(auditCount(a, "MARKETING_BULK")).isZero();
        assertStatus(send("mgr", "/assignments/assign", "{\"consultantIds\":[" + k3.getId() + "],\"marketerMemberId\":" + mia.getId() + ",\"reason\":\"ssn 123-45-6789\"}"), 422);
        assertStatus(send("mgr", "/assignments/assign", "{\"consultantIds\":[],\"marketerMemberId\":" + mia.getId() + "}"), 422);
        assertStatus(send("mgr", "/assignments/update", "{\"consultantIds\":[" + k1.getId() + "],\"priority\":\"URGENT\"}"), 422);
        assertCode(call(login("mgr"), post(base(a) + "/assignments/unassign"), "{\"consultantIds\":[" + k1.getId() + "]}", null, null), 400, "IDEMPOTENCY_KEY_MISSING");
        MvcResult update = send("mgr", "/assignments/update", "{\"consultantIds\":[" + k1.getId() + "],\"priority\":\"HIGH\"}");
        assertStatus(update, 200);
        assertThat(json(update).path("ok").asInt()).isEqualTo(1);
        assertThat(resultOf(json(update), k1.getId()).path("previous").path("priority").asText()).isEqualTo("MEDIUM");
    }

    // ---- the rebalance -------------------------------------------------------------------------------------------------------------

    @Test
    void aRebalanceMovesConsultantsInOneCallWithOneBulkAuditRowAndAPreviousThatUndoSendsBack() throws Exception {
        long before = auditCount(a);
        String reason = "Mia is out next week";
        MvcResult ok = send("mgr", "/workload/rebalance", "{\"moves\":[{\"consultantId\":" + k1.getId() + ",\"toMarketerMemberId\":" + mktMgr.getId() + "},{\"consultantId\":" + k4.getId() + ",\"toMarketerMemberId\":" + mktMgr.getId() + "}],\"reason\":\"" + reason + "\"}");
        assertStatus(ok, 200);
        JsonNode done = json(ok);
        assertThat(done.path("action").asText()).isEqualTo("REBALANCE");
        assertThat(done.path("requested").asInt()).isEqualTo(2);
        assertThat(done.path("ok").asInt()).isEqualTo(2);
        assertThat(marketerOf(k1)).isEqualTo(mktMgr.getId());
        assertThat(marketerOf(k4)).isEqualTo(mktMgr.getId());
        assertThat(marketerOf(k5)).isEqualTo(mia.getId());
        assertThat(auditCount(a) - before).isEqualTo(3L); // one MARKETING_REASSIGN per consultant and ONE MARKETING_BULK
        assertThat(auditCount(a, "MARKETING_REASSIGN")).isEqualTo(2L);
        assertThat(auditCount(a, "MARKETING_BULK")).isEqualTo(1L);
        JsonNode history = fetch(login("mgr"), base(a) + "/assignments/consultants/" + k1.getId() + "/history");
        assertThat(history.path("items").get(0).path("action").asText()).isEqualTo("REASSIGN");
        assertThat(history.path("items").get(0).path("reason").asText()).isEqualTo(reason);
        assertThat(history.path("items").get(0).path("toMarketer").path("memberId").asLong()).isEqualTo(mktMgr.getId());

        // Undo: what the answer called previous goes back to /restore
        List<String> rows = new ArrayList<>();
        for (JsonNode r : done.path("results")) {
            JsonNode prev = r.path("previous");
            rows.add("{\"consultantId\":" + r.path("consultantId").asLong() + ",\"marketerMemberId\":" + prev.path("marketerMemberId").asLong() + ",\"priority\":\"" + prev.path("priority").asText() + "\",\"status\":\"" + prev.path("status").asText() + "\"}");
        }
        assertStatus(send("mgr", "/assignments/restore", "{\"rows\":[" + String.join(",", rows) + "]}"), 200);
        assertThat(marketerOf(k1)).isEqualTo(mia.getId());
        assertThat(marketerOf(k4)).isEqualTo(mia.getId());
    }

    @Test
    void aRebalanceRefusesWhatTheWallsAndTheCapacityRefuseAndChangesNothing() throws Exception {
        assertCode(send("mgr", "/workload/rebalance", moves(k1, mktMgr, k4, mktMgr, k5, mktMgr)), 409, "OVER_CAPACITY");
        assertThat(marketerOf(k1)).isEqualTo(mia.getId());
        assertThat(marketerOf(k5)).isEqualTo(mia.getId());
        assertGeneric404(send("mgr", "/workload/rebalance", moves(k1, mktSpec)), "a target outside the team");
        assertThat(marketerOf(k1)).isEqualTo(mia.getId());
        assertGeneric404(send("mgr", "/workload/rebalance", "{\"moves\":[{\"consultantId\":" + k1.getId() + ",\"toMarketerMemberId\":999999999}]}"), "an unknown target");
        assertStatus(send("mgr", "/workload/rebalance", "{\"moves\":[]}"), 422);
        assertStatus(send("mgr", "/workload/rebalance", "{\"moves\":[{\"consultantId\":" + k1.getId() + "}]}"), 422);
        assertStatus(send("mgr", "/workload/rebalance", "{\"moves\":[{\"consultantId\":" + k1.getId() + ",\"toMarketerMemberId\":" + mktMgr.getId() + "}],\"reason\":\"ssn 123-45-6789\"}"), 422);
        assertCode(call(login("mgr"), post(base(a) + "/workload/rebalance"), moves(k1, mktMgr), null, null), 400, "IDEMPOTENCY_KEY_MISSING");
        assertThat(auditCount(a, "MARKETING_BULK")).isZero();

        MvcResult mixed = send("mgr", "/workload/rebalance", moves(k2, mktMgr, k3, mktMgr, k1, mia));
        assertStatus(mixed, 200);
        JsonNode body = json(mixed);
        assertThat(body.path("ok").asInt()).as("only the unchanged k1 counts as ok").isEqualTo(1);
        assertThat(resultOf(body, k2.getId()).path("reason").asText()).isEqualTo("NOT_FOUND"); // carried outside the team
        assertThat(resultOf(body, k3.getId()).path("reason").asText()).isEqualTo("NOT_ASSIGNED"); // nobody carries it: this is a move, not an assign
        assertThat(resultOf(body, k1.getId()).path("reason").asText()).isEqualTo("UNCHANGED");
        assertThat(marketerOf(k2)).isEqualTo(mktSpec.getId());
        assertThat(marketerOf(k3)).isNull();
    }

    @Test
    void aPausedMarketerTakesNoRebalance() throws Exception {
        MarketerCapacity c = capacityRows.findByOrgIdAndMemberId(a.getId(), mktMgr.getId()).orElseThrow();
        c.setStatus("PAUSED");
        capacityRows.saveAndFlush(c);
        assertCode(send("mgr", "/workload/rebalance", moves(k1, mktMgr)), 422, "MARKETER_INVALID");
        assertThat(marketerOf(k1)).isEqualTo(mia.getId());
    }

    private String moves(Object... pairs) {
        List<String> out = new ArrayList<>();
        for (int i = 0; i < pairs.length; i += 2) {
            ConsultantProfile c = (ConsultantProfile) pairs[i];
            OrgMember to = (OrgMember) pairs[i + 1];
            out.add("{\"consultantId\":" + c.getId() + ",\"toMarketerMemberId\":" + to.getId() + "}");
        }
        return "{\"moves\":[" + String.join(",", out) + "]}";
    }

    // ---- the workload ---------------------------------------------------------------------------------------------------------------

    @Test
    void theWorkloadIsTheTeamsOwnWithEightWeeklyPointsRebuiltFromTheHistory() throws Exception {
        JsonNode before = fetch(login("mgr"), base(a) + "/workload");
        List<Long> teamIds = new ArrayList<>();
        before.path("items").forEach(n -> teamIds.add(n.path("marketer").path("memberId").asLong()));
        assertThat(teamIds).containsExactlyInAnyOrder(mktMgr.getId(), mia.getId()); // Sam is outside the team
        assertThat(before.path("weekEnds")).hasSize(8);
        JsonNode miaRow = rowOf(before, mia);
        assertThat(miaRow.path("marketer").path("assigned").asInt()).isEqualTo(3);
        assertThat(miaRow.path("marketer").path("capacity").asInt()).isEqualTo(4);
        assertThat(miaRow.path("series")).hasSize(8);
        assertThat(miaRow.path("series").get(7).asInt()).as("the last point is now").isEqualTo(3);
        assertThat(before.path("summary").path("marketers").asInt()).isEqualTo(2);

        assertStatus(send("mgr", "/workload/rebalance", moves(k1, mktMgr)), 200);
        JsonNode after = fetch(login("mgr"), base(a) + "/workload");
        assertThat(rowOf(after, mia).path("marketer").path("assigned").asInt()).isEqualTo(2);
        assertThat(rowOf(after, mktMgr).path("marketer").path("assigned").asInt()).isEqualTo(1);
        List<Integer> miaSeries = ints(rowOf(after, mia).path("series"));
        List<Integer> mgrSeries = ints(rowOf(after, mktMgr).path("series"));
        assertThat(miaSeries).as("Mia carried one more before the move").containsExactly(3, 3, 3, 3, 3, 3, 3, 2);
        assertThat(mgrSeries).containsExactly(0, 0, 0, 0, 0, 0, 0, 1);

        assertThat(fetch(login("owner"), base(a) + "/workload").path("items")).hasSize(3);
    }

    private static JsonNode rowOf(JsonNode workload, OrgMember m) {
        for (JsonNode n : workload.path("items")) if (n.path("marketer").path("memberId").asLong() == m.getId()) return n;
        throw new AssertionError("no workload row for member " + m.getId());
    }

    private static List<Integer> ints(JsonNode array) {
        List<Integer> out = new ArrayList<>();
        array.forEach(n -> out.add(n.asInt()));
        return out;
    }
}
