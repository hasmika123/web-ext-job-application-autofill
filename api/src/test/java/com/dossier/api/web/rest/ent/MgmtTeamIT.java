package com.dossier.api.web.rest.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.ent.mgmt.MktApprovalRequest;
import com.dossier.api.domain.ent.mgmt.MktEscalation;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.MarketerAssignment;
import com.dossier.api.domain.ent.talent.MarketerCapacity;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.ent.mgmt.MktApprovalRequestRepository;
import com.dossier.api.repository.ent.mgmt.MktEscalationRepository;
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
 * The Marketing Manager's Home and Team through the real chain on real rows (MM-06): the team is the manager's own (an organization-wide admin sees everyone), the
 * numbers are counts of real rows, the side sheet carries the marketer's consultants and open items, the edit is the admin board's with its audit row, and every
 * marketer outside the team, every caller without the key and every other organization is the generic 404.
 *
 * <p>World (on top of {@link MemberItSupport}): marketers mgr (Marketing Manager, TEAM, team T1, capacity 2), mia (Marketing Specialist in T1, capacity 4, carries
 * k1) and spec (Marketing Specialist outside every team, capacity 3, carries k2); one pending approval and one HIGH escalation of mia.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class MgmtTeamIT extends MemberItSupport {

    @Autowired private ConsultantProfileRepository consultants;
    @Autowired private MarketerAssignmentRepository assignmentRows;
    @Autowired private MarketerCapacityRepository capacityRows;
    @Autowired private MktApprovalRequestRepository approvalRows;
    @Autowired private MktEscalationRepository escalationRows;

    private OrgMember mia;
    private ConsultantProfile k1;
    private ConsultantProfile k2;
    private MktApprovalRequest approval;
    private MktEscalation escalation;

    @BeforeEach
    void managerWorld() {
        settingRows.save(new AppSetting(EnterpriseSettingKeys.FLAG_MARKETING, "{\"on\":true}", WHO, Instant.now()));
        settingsCache.invalidate();
        mia = extra(a, "mia", OrgRole.MARKETER, "Mia", "Ng");
        assign(mia, "MARKETING_SPECIALIST");
        place(mia, d1, t1);
        capacity(mktMgr, 2, "ACTIVE", "Marketing Manager");
        capacity(mia, 4, "ACTIVE", "Marketing Specialist");
        capacity(mktSpec, 3, "ACTIVE", "Marketing Specialist");
        k1 = consultant(a, "Kay One");
        k2 = consultant(a, "Kay Two");
        assigned(k1, mia);
        assigned(k2, mktSpec);
        approval = new MktApprovalRequest();
        approval.setOrgId(a.getId());
        approval.setKind("RESUME_RELEASE");
        approval.setSubjectType("ORG_RESUME");
        approval.setSubjectId(1L);
        approval.setConsultantId(k1.getId());
        approval.setRequestedByMemberId(mia.getId());
        approval.setTitle("Kay One, resume v3");
        approval.setExpiresAt(Instant.now().plusSeconds(86400L));
        approval = approvalRows.saveAndFlush(approval);
        escalation = new MktEscalation();
        escalation.setOrgId(a.getId());
        escalation.setKind("MANUAL");
        escalation.setSeverity("HIGH");
        escalation.setSubjectType("CONSULTANT");
        escalation.setSubjectId(k1.getId());
        escalation.setConsultantId(k1.getId());
        escalation.setMarketerMemberId(mia.getId());
        escalation.setTitle("Kay One is waiting");
        escalation = escalationRows.saveAndFlush(escalation);
        flushIfInTransaction();
    }

    // ---- fixtures ---------------------------------------------------------------------------------------------------------------

    private void capacity(OrgMember m, int cap, String status, String title) {
        MarketerCapacity c = new MarketerCapacity();
        c.setOrgId(m.getOrgId());
        c.setMemberId(m.getId());
        c.setCapacity(cap);
        c.setStatus(status);
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

    private void assigned(ConsultantProfile c, OrgMember marketer) {
        MarketerAssignment row = new MarketerAssignment();
        row.setOrgId(c.getOrgId());
        row.setConsultantId(c.getId());
        row.setMarketerMemberId(marketer.getId());
        row.setPriority("HIGH");
        row.setAssignedAt(Instant.now());
        row.setLastActivityAt(Instant.now());
        assignmentRows.saveAndFlush(row);
    }

    private static String base(com.dossier.api.domain.org.Organization o) {
        return "/api/orgs/" + o.getId() + "/mgmt/team";
    }

    private static String home(com.dossier.api.domain.org.Organization o) {
        return "/api/orgs/" + o.getId() + "/mgmt/home";
    }

    private JsonNode fetch(String login, String url) throws Exception {
        MvcResult r = call(login, get(url));
        assertStatus(r, 200);
        return json(r);
    }

    private static List<String> names(JsonNode page, String field) {
        List<String> out = new ArrayList<>();
        page.path("items").forEach(n -> out.add(n.path(field).asText()));
        return out;
    }

    // ---- the Team page -----------------------------------------------------------------------------------------------------------

    @Test
    void theManagerSeesTheirTeamWithLoadAndWhatWaitsOnEachAndAnAdminSeesEveryone() throws Exception {
        MvcResult team = call(login("mgr"), get(base(a)));
        assertStatus(team, 200);
        assertThat(team.getResponse().getHeader("X-Total-Count")).isEqualTo("2");
        JsonNode body = json(team);
        assertThat(names(body, "name")).containsExactly("Maria Lopez", "Mia Ng"); // by name; Sam Spec is outside the team
        JsonNode mine = body.path("items").get(1);
        assertThat(mine.path("memberId").asLong()).isEqualTo(mia.getId());
        assertThat(mine.path("title").asText()).isEqualTo("Marketing Specialist");
        assertThat(mine.path("status").asText()).isEqualTo("ACTIVE");
        assertThat(mine.path("capacity").asInt()).isEqualTo(4);
        assertThat(mine.path("assigned").asInt()).isEqualTo(1);
        assertThat(mine.path("percent").asInt()).isEqualTo(25);
        assertThat(mine.path("overloaded").asBoolean()).isFalse();
        assertThat(mine.path("openApprovals").asInt()).isEqualTo(1);
        assertThat(mine.path("openEscalations").asInt()).isEqualTo(1);
        assertThat(mine.path("lastActiveAt").asText()).isNotBlank();
        assertThat(mine.path("canManage").asBoolean()).isTrue();

        assertThat(names(fetch(login("owner"), base(a)), "name")).containsExactly("Maria Lopez", "Mia Ng", "Sam Spec");
        assertThat(names(fetch(login("admin"), base(a)), "name")).hasSize(3);
        assertThat(names(fetch(login("mgr"), base(a) + "?sort=approvals"), "name")).containsExactly("Mia Ng", "Maria Lopez");
        assertThat(names(fetch(login("mgr"), base(a) + "?sort=-name"), "name")).containsExactly("Mia Ng", "Maria Lopez");
        assertThat(names(fetch(login("mgr"), base(a) + "?q=specialist"), "name")).containsExactly("Mia Ng");
        assertThat(names(fetch(login("mgr"), base(a) + "?status=PAUSED"), "name")).isEmpty();
        assertThat(fetch(login("mgr"), base(a) + "?size=1&page=1").path("items")).hasSize(1);
        assertCode(call(login("mgr"), get(base(a) + "?sort=bogus")), 400, "SORT_INVALID");
        assertStatus(call(login("mgr"), get(base(a) + "?status=SOON")), 422);
        assertStatus(call(login("mgr"), get(base(a) + "?q=x")), 422);
        assertStatus(call(login("mgr"), get(base(a) + "?size=500")), 422);
    }

    @Test
    void oneMarketerComesWithTheirConsultantsEightWeeksAndOpenItems() throws Exception {
        JsonNode one = fetch(login("mgr"), base(a) + "/" + mia.getId());
        assertThat(one.path("row").path("name").asText()).isEqualTo("Mia Ng");
        assertThat(one.path("consultants")).hasSize(1);
        assertThat(one.path("consultants").get(0).path("name").asText()).isEqualTo("Kay One");
        assertThat(one.path("consultants").get(0).path("priority").asText()).isEqualTo("HIGH");
        assertThat(one.path("consultants").get(0).path("backup").asBoolean()).isFalse();
        assertThat(one.path("weeks")).hasSize(8);
        assertThat(one.path("weeks").get(0).path("weekStart").asText()).isNotBlank();
        assertThat(one.path("approvals")).hasSize(1);
        assertThat(one.path("approvals").get(0).path("id").asLong()).isEqualTo(approval.getId());
        assertThat(one.path("escalations")).hasSize(1);
        assertThat(one.path("escalations").get(0).path("id").asLong()).isEqualTo(escalation.getId());
    }

    @Test
    void aMarketerOutsideTheTeamAnUnknownIdAndEveryoneWithoutTheKeyAreTheGenericNotFound() throws Exception {
        assertGeneric404(call(login("mgr"), get(base(a) + "/" + mktSpec.getId())), "a marketer outside the team");
        assertGeneric404(call(login("mgr"), get(base(a) + "/999999999")), "an unknown id");
        assertGeneric404(call(login("mgr"), get(base(a) + "/" + plain.getId())), "a member who is not a marketer");
        for (String who : List.of("spec", "plain", "hr", "c1")) {
            assertGeneric404(call(login(who), get(base(a))), who + " lists");
            assertGeneric404(call(login(who), get(home(a))), who + " reads Home");
            assertGeneric404(call(login(who), get(base(a) + "/" + mia.getId())), who + " reads one");
        }
        assertGeneric404(call(login("bowner"), get(base(a))), "B's owner lists A");
        assertGeneric404(call(login("bowner"), get(home(a))), "B's owner reads A's Home");
        assertGeneric404(call(login("bowner"), get(base(b) + "/" + mia.getId())), "B's owner names A's marketer in B");
        assertThat(names(fetch(login("bowner"), base(b)), "name")).as("B has no marketer").isEmpty();
    }

    @Test
    void theManagerEditsAMarketerOfTheTeamThroughTheAdminBoardsOwnRulesAndAuditRow() throws Exception {
        long auditBefore = auditCount(a);
        String k = key();
        MvcResult ok = call(login("mgr"), patch(base(a) + "/" + mia.getId()), "{\"capacity\":6,\"status\":\"PAUSED\"}", null, k);
        assertStatus(ok, 200);
        JsonNode body = json(ok);
        assertThat(body.path("capacity").asInt()).isEqualTo(6);
        assertThat(body.path("status").asText()).isEqualTo("PAUSED");
        assertThat(auditCount(a) - auditBefore).isEqualTo(1L);
        assertThat(auditCount(a, "MARKETER_UPDATE")).isEqualTo(1L);
        MvcResult replay = call(login("mgr"), patch(base(a) + "/" + mia.getId()), "{\"capacity\":6,\"status\":\"PAUSED\"}", null, k);
        assertStatus(replay, 200);
        assertThat(replay.getResponse().getHeader("Idempotent-Replayed")).isEqualTo("true");
        assertThat(auditCount(a, "MARKETER_UPDATE")).isEqualTo(1L);
        assertThat(names(fetch(login("mgr"), base(a) + "?status=PAUSED"), "name")).containsExactly("Mia Ng");

        assertStatus(call(login("mgr"), patch(base(a) + "/" + mia.getId()), "{\"capacity\":0}", null, key()), 422);
        assertStatus(call(login("mgr"), patch(base(a) + "/" + mia.getId()), "{\"status\":\"GONE\"}", null, key()), 422);
        assertStatus(call(login("mgr"), patch(base(a) + "/" + mia.getId()), "{}", null, key()), 422);
        assertGeneric404(call(login("mgr"), patch(base(a) + "/" + mktSpec.getId()), "{\"capacity\":9}", null, key()), "a marketer outside the team");
        assertCode(call(login("mgr"), patch(base(a) + "/" + mia.getId()), "{\"capacity\":5}", null, null), 400, "IDEMPOTENCY_KEY_MISSING");
        assertGeneric404(call(login("spec"), patch(base(a) + "/" + mia.getId()), "{\"capacity\":5}", null, null), "no key and no permission: the 404 comes first");
        assertGeneric404(call(login("bowner"), patch(base(a) + "/" + mia.getId()), "{\"capacity\":5}", null, key()), "B's owner");
        assertThat(capacityRows.findByOrgIdAndMemberId(a.getId(), mktSpec.getId()).orElseThrow().getCapacity()).isEqualTo(3);
    }

    // ---- Home --------------------------------------------------------------------------------------------------------------------

    @Test
    void homeIsTheTeamsOwnCountsWithWhatNeedsTheManager() throws Exception {
        JsonNode dto = fetch(login("mgr"), home(a));
        assertThat(dto.path("empty").asBoolean()).isFalse();
        assertThat(dto.path("tiles").path("marketersActive").asLong()).as("Maria and Mia, not Sam").isEqualTo(2);
        assertThat(dto.path("tiles").path("marketersPaused").asLong()).isZero();
        assertThat(dto.path("tiles").path("consultantsCovered").asLong()).isEqualTo(1);
        assertThat(dto.path("tiles").path("approvalsWaiting").asLong()).isEqualTo(1);
        assertThat(dto.path("tiles").path("escalations").path("high").asLong()).isEqualTo(1);
        assertThat(dto.path("tiles").path("escalations").path("open").asLong()).isEqualTo(1);
        assertThat(dto.path("workload")).hasSize(2);
        assertThat(dto.path("workload").get(0).path("name").asText()).as("the most loaded first").isEqualTo("Mia Ng");
        assertThat(dto.path("workload").get(0).path("percent").asInt()).isEqualTo(25);
        List<String> types = new ArrayList<>();
        dto.path("needsYou").forEach(n -> types.add(n.path("type").asText()));
        assertThat(types).containsExactly("APPROVAL", "ESCALATION");
        assertThat(dto.path("needsYou").get(0).path("who").asText()).isEqualTo("Mia Ng");
        assertThat(dto.path("needsYou").get(1).path("severity").asText()).isEqualTo("HIGH");
        assertThat(dto.path("pipeline").has("assigned")).isTrue();
        assertThat(dto.path("activity").isArray()).isTrue();

        JsonNode everyone = fetch(login("owner"), home(a));
        assertThat(everyone.path("tiles").path("marketersActive").asLong()).isEqualTo(3);
        assertThat(everyone.path("tiles").path("consultantsCovered").asLong()).isEqualTo(2);
    }

    @Test
    void betasHomeNeverCountsAcmesRows() throws Exception {
        JsonNode beta = fetch(login("bowner"), home(b));
        assertThat(beta.path("tiles").path("marketersActive").asLong()).isZero();
        assertThat(beta.path("tiles").path("approvalsWaiting").asLong()).isZero();
        assertThat(beta.path("needsYou")).isEmpty();
    }
}
