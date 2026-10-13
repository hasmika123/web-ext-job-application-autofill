package com.dossier.api.web.rest.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.MarketerAssignment;
import com.dossier.api.domain.ent.talent.MarketerCapacity;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.MarketerAssignmentRepository;
import com.dossier.api.repository.ent.talent.MarketerCapacityRepository;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Duration;
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
 * The Marketing Assignments API through the real chain on real rows: the board's lists and tiles, assign / reassign / update / unassign / restore with
 * capacity, idempotency and audit, the marketer admin routes, scope (a team-scoped manager sees and edits only their team), and the generic 404 for
 * everyone else (no key, another organization, ids of another organization).
 *
 * <p>World (on top of {@link MemberItSupport}): marketers mgr (Marketing Manager, TEAM, team T1, capacity 3), mia (Marketing Specialist in T1, capacity 5) and
 * spec (Marketing Specialist outside every team, capacity 2); six consultants (profiles, none of them seats): k1..k6.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class OrgMarketingAssignmentsIT extends MemberItSupport {

    @Autowired private ConsultantProfileRepository consultants;
    @Autowired private MarketerAssignmentRepository assignmentRows;
    @Autowired private MarketerCapacityRepository capacityRows;

    private OrgMember mia;
    private final List<ConsultantProfile> k = new ArrayList<>();

    @BeforeEach
    void marketingWorld() {
        mia = extra(a, "mia", OrgRole.MARKETER, "Mia", "Ng");
        assign(mia, "MARKETING_SPECIALIST");
        place(mia, d1, t1);
        capacity(mktMgr, 3, "ACTIVE", "Marketing Manager");
        capacity(mia, 5, "ACTIVE", "Marketing Specialist");
        capacity(mktSpec, 2, "ACTIVE", "Marketing Specialist");
        for (int i = 1; i <= 6; i++) k.add(consultant(a, "Kay " + i, "kay" + i + "@example.org", "ACTIVE", Instant.now().minus(Duration.ofDays(90))));
        em.flush();
    }

    // ---- fixtures -------------------------------------------------------------------------------------------------------

    private MarketerCapacity capacity(OrgMember m, int cap, String status, String title) {
        MarketerCapacity c = new MarketerCapacity();
        c.setOrgId(m.getOrgId());
        c.setMemberId(m.getId());
        c.setCapacity(cap);
        c.setStatus(status);
        c.setTitleLabel(title);
        c.setCreatedAt(Instant.now().minus(Duration.ofDays(90)));
        return capacityRows.saveAndFlush(c);
    }

    private ConsultantProfile consultant(com.dossier.api.domain.org.Organization org, String name, String email, String status, Instant created) {
        ConsultantProfile c = new ConsultantProfile();
        c.setOrgId(org.getId());
        c.setDisplayName(name);
        c.setEmail(email);
        c.setStatus(status);
        c.setJobTitle("Engineer");
        c.setCreatedAt(created);
        return consultants.saveAndFlush(c);
    }

    private MarketerAssignment assigned(ConsultantProfile c, OrgMember marketer, String priority, Instant at) {
        MarketerAssignment row = new MarketerAssignment();
        row.setOrgId(c.getOrgId());
        row.setConsultantId(c.getId());
        row.setMarketerMemberId(marketer.getId());
        row.setPriority(priority);
        row.setAssignedAt(at);
        row.setLastActivityAt(at);
        return assignmentRows.saveAndFlush(row);
    }

    private static String base(com.dossier.api.domain.org.Organization o) {
        return "/api/orgs/" + o.getId() + "/marketing-assignments";
    }

    private static String ids(ConsultantProfile... cs) {
        StringBuilder b = new StringBuilder("[");
        for (int i = 0; i < cs.length; i++) b.append(i == 0 ? "" : ",").append(cs[i].getId());
        return b.append("]").toString();
    }

    private MvcResult assignCall(String login, com.dossier.api.domain.org.Organization org, String body) throws Exception {
        return call(login, post(base(org) + "/assign"), body, null, key());
    }

    private JsonNode fetch(String login, String url) throws Exception {
        MvcResult r = call(login, get(url));
        assertStatus(r, 200);
        return json(r);
    }

    private MarketerAssignment row(ConsultantProfile c) {
        em.flush();
        em.clear();
        return assignmentRows.findByOrgIdAndConsultantId(a.getId(), c.getId()).orElse(null);
    }

    // ---- the lists ------------------------------------------------------------------------------------------------------

    @Test
    void ownerSeesEveryMarketerWithWorkloadSortedByLoad() throws Exception {
        assigned(k.get(0), mktSpec, "HIGH", Instant.now().minus(Duration.ofDays(5)));
        assigned(k.get(1), mktSpec, "MEDIUM", Instant.now().minus(Duration.ofDays(4)));
        assigned(k.get(2), mia, "LOW", Instant.now().minus(Duration.ofDays(3)));
        JsonNode list = fetch(login("owner"), base(a) + "/marketers");
        assertThat(list.path("items")).hasSize(3);
        assertThat(list.path("items").get(0).path("name").asText()).isEqualTo("Sam Spec");
        assertThat(list.path("items").get(0).path("assigned").asInt()).isEqualTo(2);
        assertThat(list.path("items").get(0).path("percent").asInt()).isEqualTo(100);
        assertThat(list.path("items").get(0).path("overloaded").asBoolean()).isTrue();
        assertThat(list.path("items").get(1).path("percent").asInt()).isEqualTo(20);
        assertThat(list.path("summary").path("marketers").asInt()).isEqualTo(3);
        assertThat(list.path("summary").path("totalAssigned").asInt()).isEqualTo(3);
        assertThat(list.path("summary").path("avgPerMarketer").asDouble()).isEqualTo(1.0);
        assertThat(list.path("summary").path("overloaded").asInt()).isEqualTo(1);
        assertThat(list.path("summary").path("unassigned").asInt()).isEqualTo(3);
        assertThat(list.path("canManage").asBoolean()).isTrue();

        assertThat(fetch(login("owner"), base(a) + "/marketers?q=mia").path("items")).hasSize(1);
        assertThat(fetch(login("owner"), base(a) + "/marketers?status=PAUSED").path("items")).isEmpty();
    }

    @Test
    void aTeamScopedManagerSeesOnlyTheirTeam() throws Exception {
        assigned(k.get(0), mktSpec, "HIGH", Instant.now());
        assigned(k.get(1), mia, "LOW", Instant.now());
        JsonNode list = fetch(login("mgr"), base(a) + "/marketers");
        List<String> names = new ArrayList<>();
        list.path("items").forEach(n -> names.add(n.path("name").asText()));
        assertThat(names).containsExactlyInAnyOrder("Maria Lopez", "Mia Ng");
        // the table never shows the consultants of a marketer outside the team
        JsonNode table = fetch(login("mgr"), base(a) + "/consultants");
        assertThat(table.path("total").asInt()).isEqualTo(1);
        assertThat(table.path("items").get(0).path("name").asText()).isEqualTo("Kay 2");
        assertStatus(call(login("mgr"), get(base(a) + "/consultants?marketerId=" + mktSpec.getId())), 404);
    }

    @Test
    void theConsultantsTableFiltersSortsAndPages() throws Exception {
        assigned(k.get(0), mia, "HIGH", Instant.now().minus(Duration.ofDays(5)));
        MarketerAssignment two = assigned(k.get(1), mia, "LOW", Instant.now().minus(Duration.ofDays(4)));
        two.setStatus("PAUSED");
        assignmentRows.saveAndFlush(two);
        assigned(k.get(2), mia, "MEDIUM", Instant.now().minus(Duration.ofDays(1)));
        assigned(k.get(3), mktSpec, "MEDIUM", Instant.now());
        String u = base(a) + "/consultants?marketerId=" + mia.getId();
        JsonNode all = fetch(login("owner"), u);
        assertThat(all.path("total").asInt()).isEqualTo(3);
        assertThat(all.path("items").get(0).path("name").asText()).isEqualTo("Kay 3"); // newest activity first
        assertThat(all.path("items").get(0).path("marketer").path("name").asText()).isEqualTo("Mia Ng");
        assertThat(fetch(login("owner"), u + "&status=PAUSED").path("total").asInt()).isEqualTo(1);
        assertThat(fetch(login("owner"), u + "&priority=HIGH").path("items").get(0).path("name").asText()).isEqualTo("Kay 1");
        assertThat(fetch(login("owner"), u + "&q=kay 2").path("total").asInt()).isEqualTo(1);
        assertThat(fetch(login("owner"), u + "&sort=name,asc").path("items").get(0).path("name").asText()).isEqualTo("Kay 1");
        JsonNode p2 = fetch(login("owner"), u + "&size=2&page=1&sort=name,asc");
        assertThat(p2.path("items")).hasSize(1);
        assertThat(p2.path("hasMore").asBoolean()).isFalse();
        assertThat(p2.path("total").asInt()).isEqualTo(3);
        assertThat(fetch(login("owner"), u + "&noBackup=true").path("total").asInt()).isEqualTo(3);
        JsonNode un = fetch(login("owner"), base(a) + "/consultants?unassigned=true&size=50");
        assertThat(un.path("total").asInt()).isEqualTo(2);
        assertThat(un.path("items").get(0).path("marketer").isNull()).isTrue();
        assertCode(call(login("owner"), get(u + "&sort=bogus,asc")), 400, "SORT_INVALID");
        assertStatus(call(login("owner"), get(u + "&priority=URGENT")), 422);
        assertStatus(call(login("owner"), get(base(a) + "/consultants?marketerId=999999")), 404);
    }

    @Test
    void theTilesAreRebuiltFromRowTimestampsWithAnHonestDelta() throws Exception {
        assigned(k.get(0), mia, "LOW", Instant.now().minus(Duration.ofDays(60)));
        assigned(k.get(1), mia, "LOW", Instant.now().minus(Duration.ofDays(40)));
        assigned(k.get(2), mia, "LOW", Instant.now().minus(Duration.ofDays(2)));
        JsonNode kpis = fetch(login("owner"), base(a) + "/kpis");
        JsonNode tiles = kpis.path("tiles");
        assertThat(tiles).hasSize(4);
        JsonNode assignedTile = tiles.get(0);
        assertThat(assignedTile.path("key").asText()).isEqualTo("assigned");
        assertThat(assignedTile.path("current").asInt()).isEqualTo(3);
        assertThat(assignedTile.path("previous").asInt()).isEqualTo(2);
        assertThat(assignedTile.path("delta").asInt()).isEqualTo(1);
        assertThat(assignedTile.path("deltaPct").asDouble()).isEqualTo(0.5);
        assertThat(assignedTile.path("series")).hasSize(8);
        assertThat(assignedTile.path("series").get(7).asInt()).isEqualTo(3);
        assertThat(tiles.get(1).path("key").asText()).isEqualTo("marketers");
        assertThat(tiles.get(1).path("current").asInt()).isEqualTo(3);
        assertThat(tiles.get(1).path("delta").asInt()).isEqualTo(0);
        assertThat(tiles.get(2).path("key").asText()).isEqualTo("unassigned");
        assertThat(tiles.get(2).path("current").asInt()).isEqualTo(3);
        assertThat(tiles.get(2).path("previous").asInt()).isEqualTo(4);
        assertThat(tiles.get(3).path("key").asText()).isEqualTo("overloaded");
        assertThat(tiles.get(3).path("current").asInt()).isEqualTo(0);
        assertThat(kpis.path("note").asText()).isNotBlank();
    }

    @Test
    void theWorkloadReportCountsPriorityPausedBackupAndOpenWork() throws Exception {
        assigned(k.get(0), mia, "HIGH", Instant.now());
        MarketerAssignment b = assigned(k.get(1), mia, "LOW", Instant.now());
        b.setBackupMemberId(mktSpec.getId());
        b.setStatus("PAUSED");
        assignmentRows.saveAndFlush(b);
        JsonNode report = fetch(login("owner"), base(a) + "/workload");
        JsonNode miaRow = null, specRow = null;
        for (JsonNode n : report.path("items")) {
            if (n.path("memberId").asLong() == mia.getId()) miaRow = n;
            if (n.path("memberId").asLong() == mktSpec.getId()) specRow = n;
        }
        assertThat(miaRow.path("assigned").asInt()).isEqualTo(2);
        assertThat(miaRow.path("highPriority").asInt()).isEqualTo(1);
        assertThat(miaRow.path("paused").asInt()).isEqualTo(1);
        assertThat(miaRow.path("withoutBackup").asInt()).isEqualTo(1);
        assertThat(specRow.path("backupFor").asInt()).isEqualTo(1);
        assertThat(report.path("summary").path("totalAssigned").asInt()).isEqualTo(2);
    }

    // ---- assign / reassign / update / unassign / restore -------------------------------------------------------------------

    @Test
    void assignWritesOneAuditRowPerConsultantPlusTheSummaryAndReplaysIdempotently() throws Exception {
        long before = auditCount(a);
        String body = "{\"consultantIds\":" + ids(k.get(0), k.get(1)) + ",\"marketerMemberId\":" + mia.getId() + ",\"priority\":\"HIGH\"}";
        String key = key();
        MvcResult r = call(login("owner"), post(base(a) + "/assign"), body, null, key);
        assertStatus(r, 200);
        JsonNode res = json(r);
        assertThat(res.path("ok").asInt()).isEqualTo(2);
        assertThat(res.path("results").get(0).path("previous").size()).isZero();
        assertThat(row(k.get(0)).getMarketerMemberId()).isEqualTo(mia.getId());
        assertThat(row(k.get(0)).getPriority()).isEqualTo("HIGH");
        assertThat(auditCount(a) - before).isEqualTo(3);
        assertThat(auditCount(a, "MARKETING_ASSIGN")).isEqualTo(2);
        assertThat(newestAudit(a).getAction()).isEqualTo("MARKETING_BULK");

        MvcResult again = call(login("owner"), post(base(a) + "/assign"), body, null, key);
        assertStatus(again, 200);
        assertThat(again.getResponse().getHeader("Idempotent-Replayed")).isEqualTo("true");
        assertThat(auditCount(a) - before).isEqualTo(3);
        // the same key with another body is refused
        assertCode(call(login("owner"), post(base(a) + "/assign"), "{\"consultantIds\":" + ids(k.get(2)) + ",\"marketerMemberId\":" + mia.getId() + "}", null, key), 422, "IDEMPOTENCY_KEY_REUSED");
        // a repeat with a fresh key changes nothing
        MvcResult noop = assignCall(login("owner"), a, body);
        assertThat(json(noop).path("results").get(0).path("reason").asText()).isEqualTo("UNCHANGED");
    }

    @Test
    void anOverCapacityAssignmentIsRefusedUntilTheCallerOverridesAndTheOverrideIsAudited() throws Exception {
        String three = ids(k.get(0), k.get(1), k.get(2));
        long before = auditCount(a);
        MvcResult refused = assignCall(login("owner"), a, "{\"consultantIds\":" + three + ",\"marketerMemberId\":" + mktSpec.getId() + "}");
        assertCode(refused, 409, "OVER_CAPACITY");
        String text = refused.getResponse().getContentAsString();
        assertThat(text).contains("\"capacity\":2").contains("\"current\":0").contains("\"adding\":3").contains("\"projected\":3");
        assertThat(row(k.get(0))).isNull();
        assertThat(auditCount(a)).isEqualTo(before);

        MvcResult ok = assignCall(login("owner"), a, "{\"consultantIds\":" + three + ",\"marketerMemberId\":" + mktSpec.getId() + ",\"allowOverCapacity\":true}");
        assertStatus(ok, 200);
        assertThat(newestAudit(a).getRisk()).isEqualTo("MEDIUM");
        assertThat(newestAudit(a).getDetails()).contains("overCapacity");
        // a paused marketer takes nobody
        MarketerCapacity c = capacityRows.findByOrgIdAndMemberId(a.getId(), mia.getId()).orElseThrow();
        c.setStatus("PAUSED");
        capacityRows.saveAndFlush(c);
        assertCode(assignCall(login("owner"), a, "{\"consultantIds\":" + ids(k.get(3)) + ",\"marketerMemberId\":" + mia.getId() + "}"), 422, "MARKETER_INVALID");
    }

    @Test
    void reassignThenRestoreRestoresTheOldMarketerAndUnassignRestoreBringsTheRowBack() throws Exception {
        assigned(k.get(0), mia, "HIGH", Instant.now().minus(Duration.ofDays(3)));
        MvcResult moved = assignCall(login("owner"), a, "{\"consultantIds\":" + ids(k.get(0)) + ",\"marketerMemberId\":" + mktSpec.getId() + "}");
        assertStatus(moved, 200);
        JsonNode previous = json(moved).path("results").get(0).path("previous");
        assertThat(previous.path("marketerMemberId").asLong()).isEqualTo(mia.getId());
        assertThat(row(k.get(0)).getMarketerMemberId()).isEqualTo(mktSpec.getId());
        assertThat(auditCount(a, "MARKETING_REASSIGN")).isEqualTo(1);

        String undo = "{\"rows\":[{\"consultantId\":" + k.get(0).getId() + ",\"marketerMemberId\":" + previous.path("marketerMemberId").asLong()
            + ",\"backupMemberId\":null,\"priority\":\"" + previous.path("priority").asText() + "\",\"status\":\"" + previous.path("status").asText() + "\"}]}";
        assertStatus(call(login("owner"), post(base(a) + "/restore"), undo, null, key()), 200);
        MarketerAssignment back = row(k.get(0));
        assertThat(back.getMarketerMemberId()).isEqualTo(mia.getId());
        assertThat(back.getPriority()).isEqualTo("HIGH");

        MvcResult gone = call(login("owner"), post(base(a) + "/unassign"), "{\"consultantIds\":" + ids(k.get(0)) + "}", null, key());
        assertStatus(gone, 200);
        assertThat(row(k.get(0))).isNull();
        JsonNode prev2 = json(gone).path("results").get(0).path("previous");
        String undo2 = "{\"rows\":[{\"consultantId\":" + k.get(0).getId() + ",\"marketerMemberId\":" + prev2.path("marketerMemberId").asLong() + ",\"backupMemberId\":null,\"priority\":\"HIGH\",\"status\":\"ACTIVE\"}]}";
        assertStatus(call(login("owner"), post(base(a) + "/restore"), undo2, null, key()), 200);
        assertThat(row(k.get(0)).getMarketerMemberId()).isEqualTo(mia.getId());
        // and the undo of a first-time assignment removes it
        MvcResult fresh = assignCall(login("owner"), a, "{\"consultantIds\":" + ids(k.get(1)) + ",\"marketerMemberId\":" + mia.getId() + "}");
        assertThat(json(fresh).path("results").get(0).path("previous").size()).isZero();
        String undo3 = "{\"rows\":[{\"consultantId\":" + k.get(1).getId() + ",\"marketerMemberId\":null}]}";
        assertStatus(call(login("owner"), post(base(a) + "/restore"), undo3, null, key()), 200);
        assertThat(row(k.get(1))).isNull();
    }

    @Test
    void updateSetsPriorityStatusAndBackupAndRefusesTheMarketerAsTheirOwnBackup() throws Exception {
        assigned(k.get(0), mia, "LOW", Instant.now().minus(Duration.ofDays(3)));
        assigned(k.get(1), mia, "LOW", Instant.now().minus(Duration.ofDays(3)));
        MvcResult r = call(login("owner"), post(base(a) + "/update"), "{\"consultantIds\":" + ids(k.get(0), k.get(1)) + ",\"priority\":\"HIGH\"}", null, key());
        assertStatus(r, 200);
        assertThat(json(r).path("ok").asInt()).isEqualTo(2);
        assertThat(json(r).path("results").get(0).path("previous").path("priority").asText()).isEqualTo("LOW");
        assertThat(row(k.get(0)).getPriority()).isEqualTo("HIGH");
        assertThat(auditCount(a, "MARKETING_UPDATE")).isEqualTo(2);

        assertStatus(call(login("owner"), post(base(a) + "/update"), "{\"consultantIds\":" + ids(k.get(0)) + ",\"status\":\"PAUSED\"}", null, key()), 200);
        assertThat(row(k.get(0)).getStatus()).isEqualTo("PAUSED");
        assertStatus(call(login("owner"), post(base(a) + "/update"), "{\"consultantIds\":" + ids(k.get(0)) + ",\"backupMemberId\":" + mktSpec.getId() + "}", null, key()), 200);
        assertThat(row(k.get(0)).getBackupMemberId()).isEqualTo(mktSpec.getId());
        JsonNode same = json(call(login("owner"), post(base(a) + "/update"), "{\"consultantIds\":" + ids(k.get(0)) + ",\"backupMemberId\":" + mia.getId() + "}", null, key()));
        assertThat(same.path("skipped").get(0).path("reason").asText()).isEqualTo("BACKUP_SAME_AS_MARKETER");
        assertStatus(call(login("owner"), post(base(a) + "/update"), "{\"consultantIds\":" + ids(k.get(0)) + ",\"clearBackup\":true}", null, key()), 200);
        assertThat(row(k.get(0)).getBackupMemberId()).isNull();
        // exactly one field
        assertStatus(call(login("owner"), post(base(a) + "/update"), "{\"consultantIds\":" + ids(k.get(0)) + ",\"priority\":\"LOW\",\"status\":\"ACTIVE\"}", null, key()), 422);
        // an unassigned consultant cannot be updated
        JsonNode none = json(call(login("owner"), post(base(a) + "/update"), "{\"consultantIds\":" + ids(k.get(5)) + ",\"priority\":\"LOW\"}", null, key()));
        assertThat(none.path("skipped").get(0).path("reason").asText()).isEqualTo("NOT_ASSIGNED");
    }

    @Test
    void aTeamScopedManagerCannotTouchAMarketerOutsideTheTeamNorTheirConsultants() throws Exception {
        assigned(k.get(0), mktSpec, "LOW", Instant.now());
        // to a marketer outside the team: the generic 404
        assertGeneric404(assignCall(login("mgr"), a, "{\"consultantIds\":" + ids(k.get(1)) + ",\"marketerMemberId\":" + mktSpec.getId() + "}"), "mgr to spec");
        // a consultant of an out-of-scope marketer is skipped as if it did not exist
        JsonNode res = json(assignCall(login("mgr"), a, "{\"consultantIds\":" + ids(k.get(0), k.get(1)) + ",\"marketerMemberId\":" + mia.getId() + "}"));
        assertThat(res.path("ok").asInt()).isEqualTo(1);
        assertThat(res.path("skipped").get(0).path("reason").asText()).isEqualTo("NOT_FOUND");
        assertThat(row(k.get(0)).getMarketerMemberId()).isEqualTo(mktSpec.getId());
        // unassign / update on it: skipped too
        assertThat(json(call(login("mgr"), post(base(a) + "/unassign"), "{\"consultantIds\":" + ids(k.get(0)) + "}", null, key())).path("skipped")).hasSize(1);
        assertThat(row(k.get(0))).isNotNull();
    }

    @Test
    void badBodiesAreRefusedWithNothingWritten() throws Exception {
        long before = auditCount(a);
        assertCode(call(login("owner"), post(base(a) + "/assign"), "{\"consultantIds\":[1],\"marketerMemberId\":" + mia.getId() + "}", null, null), 400, "IDEMPOTENCY_KEY_MISSING");
        assertStatus(assignCall(login("owner"), a, "{\"consultantIds\":[],\"marketerMemberId\":" + mia.getId() + "}"), 422);
        assertStatus(assignCall(login("owner"), a, "{\"consultantIds\":" + ids(k.get(0)) + "}"), 422);
        assertStatus(assignCall(login("owner"), a, "{\"consultantIds\":" + ids(k.get(0)) + ",\"marketerMemberId\":" + mia.getId() + ",\"priority\":\"URGENT\"}"), 422);
        assertStatus(assignCall(login("owner"), a, "{\"consultantIds\":" + ids(k.get(0)) + ",\"marketerMemberId\":" + mia.getId() + ",\"backupMemberId\":" + mia.getId() + "}"), 422);
        // not a marketer (no capacity row): the generic 404
        assertGeneric404(assignCall(login("owner"), a, "{\"consultantIds\":" + ids(k.get(0)) + ",\"marketerMemberId\":" + plain.getId() + "}"), "not a marketer");
        assertThat(auditCount(a)).isEqualTo(before);
    }

    // ---- the marketer admin routes --------------------------------------------------------------------------------------------

    @Test
    void addingAMarketerPromotesAnExistingMarketingMemberOnly() throws Exception {
        OrgMember newbie = extra(a, "newbie", OrgRole.MARKETER, "Nia", "Brooks");
        assign(newbie, "MARKETING_SPECIALIST");
        JsonNode cands = fetch(login("owner"), base(a) + "/marketers/candidates");
        List<Long> ids = new ArrayList<>();
        cands.path("items").forEach(n -> ids.add(n.path("id").asLong()));
        assertThat(ids).contains(newbie.getId()).doesNotContain(mia.getId(), plain.getId());

        long before = auditCount(a);
        MvcResult added = call(login("owner"), post(base(a) + "/marketers"), "{\"memberId\":" + newbie.getId() + ",\"capacity\":12,\"title\":\"Senior Marketer\"}");
        assertStatus(added, 201);
        assertThat(json(added).path("capacity").asInt()).isEqualTo(12);
        assertThat(json(added).path("name").asText()).isEqualTo("Nia Brooks");
        assertThat(auditCount(a) - before).isEqualTo(1);
        assertThat(newestAudit(a).getAction()).isEqualTo("MARKETER_ADD");
        assertCode(call(login("owner"), post(base(a) + "/marketers"), "{\"memberId\":" + newbie.getId() + "}"), 409, "ALREADY_MARKETER");
        assertCode(call(login("owner"), post(base(a) + "/marketers"), "{\"memberId\":" + plain.getId() + "}"), 422, "MARKETER_INVALID");
        assertStatus(call(login("owner"), post(base(a) + "/marketers"), "{\"memberId\":" + c1.getId() + ",\"capacity\":0}"), 422);
        // only ORG scope promotes: the team-scoped manager gets the generic 404
        OrgMember other = extra(a, "other", OrgRole.MARKETER, "Otto", "Vale");
        assign(other, "MARKETING_SPECIALIST");
        assertGeneric404(call(login("mgr"), post(base(a) + "/marketers"), "{\"memberId\":" + other.getId() + "}"), "mgr adds marketer");
        assertGeneric404(call(login("mgr"), get(base(a) + "/marketers/candidates")), "mgr candidates");
    }

    @Test
    void capacityStatusAndTitleCanBeChangedAndAreAudited() throws Exception {
        long before = auditCount(a);
        MvcResult r = call(login("owner"), patch(base(a) + "/marketers/" + mia.getId()), "{\"capacity\":1,\"status\":\"PAUSED\",\"title\":\"Lead\"}");
        assertStatus(r, 200);
        assertThat(json(r).path("capacity").asInt()).isEqualTo(1);
        assertThat(json(r).path("status").asText()).isEqualTo("PAUSED");
        assertThat(auditCount(a) - before).isEqualTo(1);
        assertThat(newestAudit(a).getAction()).isEqualTo("MARKETER_UPDATE");
        assertStatus(call(login("owner"), patch(base(a) + "/marketers/" + mia.getId()), "{\"capacity\":1000}"), 422);
        assertStatus(call(login("owner"), patch(base(a) + "/marketers/" + mia.getId()), "{}"), 422);
        assertGeneric404(call(login("owner"), patch(base(a) + "/marketers/" + plain.getId()), "{\"capacity\":4}"), "not a marketer");
        // the manager may edit a teammate but not a marketer outside the team
        assertStatus(call(login("mgr"), patch(base(a) + "/marketers/" + mktMgr.getId()), "{\"capacity\":4}"), 200);
        assertGeneric404(call(login("mgr"), patch(base(a) + "/marketers/" + mktSpec.getId()), "{\"capacity\":4}"), "mgr edits spec");
        assertThat(capacityRows.findByOrgIdAndMemberId(a.getId(), mktSpec.getId()).orElseThrow().getCapacity()).isEqualTo(2);
    }

    // ---- isolation and permission walls -----------------------------------------------------------------------------------------

    @Test
    void everyoneWithoutTheKeysAndEveryOutsiderGetsTheGenericNotFound() throws Exception {
        String[] reads = { "/marketers", "/marketers/candidates", "/consultants", "/filters", "/kpis", "/workload" };
        for (String who : new String[] { "spec", "hr", "plain", "c1" }) {
            for (String path : reads) assertGeneric404(call(login(who), get(base(a) + path)), who + " " + path);
            assertGeneric404(call(login(who), post(base(a) + "/assign"), "{\"consultantIds\":[1],\"marketerMemberId\":1}", null, key()), who + " assign");
            assertGeneric404(call(login(who), post(base(a) + "/assign"), "{\"consultantIds\":[1],\"marketerMemberId\":1}", null, null), who + " assign without a key");
        }
        // another tenant's owner, with A's org id and with their own
        for (String path : reads) assertGeneric404(call(login("bowner"), get(base(a) + path)), "B owner " + path);
        assertGeneric404(call(login("bowner"), post(base(a) + "/unassign"), "{\"consultantIds\":[1]}", null, key()), "B owner unassign in A");
        assigned(k.get(0), mia, "LOW", Instant.now());
        // B's own org, A's consultant ids: skipped as NOT_FOUND, nothing of A changes
        OrgMember bMarketer = extra(b, "bmkt", OrgRole.MARKETER, "Bo", "Marketer");
        assign(bMarketer, "MARKETING_SPECIALIST");
        MarketerCapacity bc = new MarketerCapacity();
        bc.setOrgId(b.getId());
        bc.setMemberId(bMarketer.getId());
        bc.setCapacity(5);
        capacityRows.saveAndFlush(bc);
        JsonNode res = json(call(login("bowner"), post(base(b) + "/assign"), "{\"consultantIds\":" + ids(k.get(0)) + ",\"marketerMemberId\":" + bMarketer.getId() + "}", null, key()));
        assertThat(res.path("ok").asInt()).isZero();
        assertThat(res.path("skipped").get(0).path("reason").asText()).isEqualTo("NOT_FOUND");
        assertThat(row(k.get(0)).getMarketerMemberId()).isEqualTo(mia.getId());
        // A's marketer id in B's org is not a marketer there
        assertGeneric404(call(login("bowner"), post(base(b) + "/assign"), "{\"consultantIds\":[1],\"marketerMemberId\":" + mia.getId() + "}", null, key()), "A marketer in B");
        // B sees none of A's marketers
        JsonNode bList = fetch(login("bowner"), base(b) + "/marketers");
        assertThat(bList.path("items")).hasSize(1);
        assertThat(fetch(login("bowner"), base(b) + "/consultants?unassigned=true").path("total").asInt()).isZero();
    }

    @Test
    void whenTheFlagsAreOffTheBoardIsNotThere() throws Exception {
        flags(true, false);
        assertGeneric404(call(login("owner"), get(base(a) + "/marketers")), "roles flag off");
        flags(false, false);
        assertGeneric404(call(login("owner"), get(base(a) + "/kpis")), "master flag off");
    }

    @Test
    void identityDocumentsInATitleAreRefused() throws Exception {
        MvcResult r = call(login("owner"), patch(base(a) + "/marketers/" + mia.getId()), "{\"title\":\"SSN 123-45-6789\"}");
        assertThat(r.getResponse().getStatus()).isBetween(400, 422);
        assertThat(capacityRows.findByOrgIdAndMemberId(a.getId(), mia.getId()).orElseThrow().getTitleLabel()).isEqualTo("Marketing Specialist");
    }
}
