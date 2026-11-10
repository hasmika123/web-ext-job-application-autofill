package com.dossier.api.web.rest.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.OrgMember;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * X4.3 bulk actions through the real chain: per-row results with partial failure, one audit row per change plus the summary, the last-owner,
 * self and ceiling guards, scope, and the Idempotency-Key contract of 40-api-specs.md section 6. Also the doc 42 negatives for bulk calls: member
 * ids of another organization, a body naming an organization or a status, an oversized or empty selection, and the permission wall that comes before
 * the header check.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class OrgMemberBulkIT extends MemberItSupport {

    private MvcResult bulkCall(String login, String action, String body, String idempotencyKey) throws Exception {
        return call(login, org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(membersUrl(a) + "/bulk/" + action), body, null, idempotencyKey);
    }

    private MvcResult bulkCall(String login, String action, String body) throws Exception {
        return bulkCall(login, action, body, key());
    }

    private static String idList(List<OrgMember> ms) {
        return ms.stream().map(m -> String.valueOf(m.getId())).collect(Collectors.joining(",", "[", "]"));
    }

    private static List<String> skippedReasons(JsonNode result) {
        List<String> out = new ArrayList<>();
        for (JsonNode s : result.path("skipped")) out.add(s.path("memberId").asLong() + ":" + s.path("reason").asText());
        return out;
    }

    // ---- roles ----------------------------------------------------------------------------------------------------------

    @Test
    void elevenMembersChangeAndTheLastOwnerIsSkippedWithTheRightAuditRows() throws Exception {
        OrgMember sup = superActor("sup");
        List<OrgMember> targets = new ArrayList<>();
        targets.add(owner);
        targets.add(plain);
        for (int i = 0; i < 10; i++) targets.add(extra(a, "e" + i, OrgRole.MEMBER, "Extra", "Number" + i));
        Long consultantRole = roleRepo.findSystemByRoleKey("CONSULTANT").orElseThrow().getId();
        Long ownerRole = roleRepo.findSystemByRoleKey("OWNER").orElseThrow().getId();
        long before = auditCount(a);

        MvcResult r = bulkCall(login("sup"), "roles", "{\"memberIds\":" + idList(targets) + ",\"add\":[" + consultantRole + "],\"remove\":[" + ownerRole + "]}");
        assertStatus(r, 200);
        JsonNode result = json(r);
        assertThat(result.path("requested").asInt()).isEqualTo(12);
        assertThat(result.path("ok").asInt()).isEqualTo(11);
        assertThat(skippedReasons(result)).containsExactly(owner.getId() + ":LAST_ADMIN");
        assertThat(result.path("results")).hasSize(12);

        // 11 role changes + one refused attempt on a person the caller reaches + the summary
        assertThat(auditCount(a) - before).isEqualTo(13);
        assertThat(auditCount(a, "ROLE_ASSIGN")).isEqualTo(11);
        assertThat(auditCount(a, "MEMBER_BULK_SKIP")).isEqualTo(1);
        assertThat(auditCount(a, "MEMBER_BULK")).isEqualTo(1);
        assertThat(newestAudit(a).getAction()).isEqualTo("MEMBER_BULK");
        assertThat(newestAudit(a).getDetails()).contains("\"requested\":12").contains("\"ok\":11").contains("\"skipped\":1");

        // the skipped Owner is untouched; the others gained the consultant role
        assertThat(reload(owner).getRole()).isEqualTo(OrgRole.OWNER);
        assertThat(roleKeys(plain)).contains("CONSULTANT", "MEMBER");
        // and previous carries what the web needs to undo: send the reverse for the eleven
        List<OrgMember> changed = targets.subList(1, targets.size());
        JsonNode first = result.path("results").get(1);
        assertThat(first.path("previous").path("roleIds")).isNotEmpty();
        MvcResult undo = bulkCall(login("sup"), "roles", "{\"memberIds\":" + idList(changed) + ",\"remove\":[" + consultantRole + "]}");
        assertThat(json(undo).path("ok").asInt()).isEqualTo(11);
        assertThat(roleKeys(plain)).containsExactly("MEMBER");
    }

    @Test
    void nobodyChangesTheirOwnRolesInABulkCallAndAnAdminCannotHandOutAdminRoles() throws Exception {
        Long orgAdminRole = roleRepo.findSystemByRoleKey("ORG_ADMIN").orElseThrow().getId();
        Long consultantRole = roleRepo.findSystemByRoleKey("CONSULTANT").orElseThrow().getId();
        // the owner names themself: skipped SELF
        JsonNode self = json(bulkCall(login("owner"), "roles", "{\"memberIds\":[" + owner.getId() + "," + plain.getId() + "],\"add\":[" + consultantRole + "]}"));
        assertThat(self.path("ok").asInt()).isEqualTo(1);
        assertThat(skippedReasons(self)).containsExactly(owner.getId() + ":SELF");
        // an Organization Admin's ceiling stops an admin role
        JsonNode capped = json(bulkCall(login("admin"), "roles", "{\"memberIds\":[" + c1.getId() + "],\"add\":[" + orgAdminRole + "]}"));
        assertThat(capped.path("ok").asInt()).isZero();
        assertThat(skippedReasons(capped)).hasSize(1);
        assertThat(skippedReasons(capped).get(0)).startsWith(c1.getId() + ":").matches(".*(ROLE_CEILING|ADMIN_ROLE)");
        assertThat(roleKeys(c1)).containsExactly("CONSULTANT");
    }

    @Test
    void aBulkRoleCallNamingNothingToDoIsRefused() throws Exception {
        assertCode(bulkCall(login("owner"), "roles", "{\"memberIds\":[" + plain.getId() + "]}"), 422, "ORG_INVALID");
        Long consultantRole = roleRepo.findSystemByRoleKey("CONSULTANT").orElseThrow().getId();
        assertCode(bulkCall(login("owner"), "roles", "{\"memberIds\":[" + plain.getId() + "],\"add\":[" + consultantRole + "],\"remove\":[" + consultantRole + "]}"), 422, "ORG_INVALID");
    }

    @Test
    void aRoleOfAnotherOrganizationIsASkippedRowNeverAnApplication() throws Exception {
        Long foreign = roleRepo.saveAndFlush(customRole(b, "FOREIGN")).getId();
        JsonNode r = json(bulkCall(login("owner"), "roles", "{\"memberIds\":[" + plain.getId() + "],\"add\":[" + foreign + "]}"));
        assertThat(r.path("ok").asInt()).isZero();
        assertThat(skippedReasons(r)).containsExactly(plain.getId() + ":NOT_FOUND");
        assertThat(roleKeys(plain)).containsExactly("MEMBER");
    }

    // ---- groups ---------------------------------------------------------------------------------------------------------

    @Test
    void movingPeopleToADepartmentSkipsWhoeverIsNotYours() throws Exception {
        long before = auditCount(a);
        MvcResult r = bulkCall(login("hr"), "groups", "{\"memberIds\":[" + c1.getId() + "," + c2.getId() + "," + plain.getId() + "," + bMember.getId() + ",999999999],\"departmentGroupId\":" + d2.getId() + ",\"teamGroupId\":null}");
        assertStatus(r, 200);
        JsonNode result = json(r);
        assertThat(result.path("ok").asInt()).isEqualTo(3);
        assertThat(skippedReasons(result)).containsExactlyInAnyOrder(bMember.getId() + ":NOT_FOUND", "999999999:NOT_FOUND");
        assertThat(reload(c1).getDepartmentGroupId()).isEqualTo(d2.getId());
        assertThat(reload(c1).getTeamGroupId()).isNull();
        assertThat(reload(bMember).getDepartmentGroupId()).as("another organization's member is untouched").isNull();
        // previous lets the web undo
        JsonNode prev = result.path("results").get(0).path("previous");
        assertThat(prev.path("departmentGroupId").asLong()).isEqualTo(d1.getId());
        assertThat(prev.path("teamGroupId").asLong()).isEqualTo(t1.getId());
        assertThat(auditCount(a, "MEMBER_GROUP")).isEqualTo(3);
        assertThat(auditCount(a) - before).as("3 changes + the summary; NOT_FOUND rows write nothing").isEqualTo(4);
    }

    @Test
    void aTeamOutsideTheDepartmentSkipsEveryRowAndAChangeNobodyNeededIsStillOk() throws Exception {
        JsonNode bad = json(bulkCall(login("hr"), "groups", "{\"memberIds\":[" + c1.getId() + "," + plain.getId() + "],\"departmentGroupId\":" + d2.getId() + ",\"teamGroupId\":" + t1.getId() + "}"));
        assertThat(bad.path("ok").asInt()).isZero();
        assertThat(skippedReasons(bad)).containsExactlyInAnyOrder(c1.getId() + ":TEAM_NOT_IN_DEPARTMENT", plain.getId() + ":TEAM_NOT_IN_DEPARTMENT");
        // a team alone brings its department
        JsonNode good = json(bulkCall(login("hr"), "groups", "{\"memberIds\":[" + plain.getId() + "],\"teamGroupId\":" + t2.getId() + "}"));
        assertThat(good.path("ok").asInt()).isEqualTo(1);
        assertThat(reload(plain).getDepartmentGroupId()).isEqualTo(d1.getId());
        // asking for what is already so changes nothing and writes no row of its own
        long before = auditCount(a, "MEMBER_GROUP");
        JsonNode same = json(bulkCall(login("hr"), "groups", "{\"memberIds\":[" + plain.getId() + "],\"teamGroupId\":" + t2.getId() + "}"));
        assertThat(same.path("ok").asInt()).isEqualTo(1);
        assertThat(same.path("results").get(0).path("reason").asText()).isEqualTo("UNCHANGED");
        assertThat(auditCount(a, "MEMBER_GROUP")).isEqualTo(before);
    }

    // ---- manager --------------------------------------------------------------------------------------------------------

    @Test
    void settingAManagerForManyStopsAtLoopsAndSelf() throws Exception {
        JsonNode r = json(bulkCall(login("hr"), "manager", "{\"memberIds\":[" + c1.getId() + "," + plain.getId() + "," + mktMgr.getId() + "],\"managerMemberId\":" + mktMgr.getId() + "}"));
        assertThat(r.path("ok").asInt()).isEqualTo(2);
        assertThat(skippedReasons(r)).containsExactly(mktMgr.getId() + ":MANAGER_CYCLE");
        assertThat(reload(c1).getManagerMemberId()).isEqualTo(mktMgr.getId());
        // now mktMgr cannot report to c1
        JsonNode loop = json(bulkCall(login("hr"), "manager", "{\"memberIds\":[" + mktMgr.getId() + "],\"managerMemberId\":" + c1.getId() + "}"));
        assertThat(skippedReasons(loop)).containsExactly(mktMgr.getId() + ":MANAGER_CYCLE");
        // clearing
        JsonNode clear = json(bulkCall(login("hr"), "manager", "{\"memberIds\":[" + c1.getId() + "],\"managerMemberId\":null}"));
        assertThat(clear.path("ok").asInt()).isEqualTo(1);
        assertThat(reload(c1).getManagerMemberId()).isNull();
        // a manager of another organization is a skipped row for everyone
        JsonNode foreign = json(bulkCall(login("hr"), "manager", "{\"memberIds\":[" + plain.getId() + "],\"managerMemberId\":" + bOwner.getId() + "}"));
        assertThat(skippedReasons(foreign)).containsExactly(plain.getId() + ":NOT_FOUND");
    }

    @Test
    void aTeamManagerMayOnlyBulkSetTheirOwnTeamsManagers() throws Exception {
        JsonNode r = json(bulkCall(login("mgr"), "manager", "{\"memberIds\":[" + c1.getId() + "," + c2.getId() + "],\"managerMemberId\":" + mktMgr.getId() + "}"));
        assertThat(r.path("ok").asInt()).isEqualTo(1);
        assertThat(skippedReasons(r)).containsExactly(c2.getId() + ":NOT_FOUND");
        assertThat(reload(c2).getManagerMemberId()).isNull();
    }

    // ---- status ---------------------------------------------------------------------------------------------------------

    @Test
    void suspendingNeedsAReasonAndSkipsYourselfYourBetterAndTheLastOwner() throws Exception {
        assertCode(bulkCall(login("admin"), "status", "{\"memberIds\":[" + plain.getId() + "],\"action\":\"SUSPEND\"}"), 422, "ORG_INVALID");
        assertCode(bulkCall(login("admin"), "status", "{\"memberIds\":[" + plain.getId() + "],\"action\":\"SUSPEND\",\"reason\":\"short\"}"), 422, "ORG_INVALID");
        assertCode(bulkCall(login("admin"), "status", "{\"memberIds\":[" + plain.getId() + "],\"action\":\"FREEZE\",\"reason\":\"A long enough reason\"}"), 422, "ORG_INVALID");
        assertThat(reload(plain).getStatus()).isEqualTo(OrgMemberStatus.ACTIVE);

        long before = auditCount(a);
        JsonNode r = json(bulkCall(login("admin"), "status", "{\"memberIds\":[" + plain.getId() + "," + admin.getId() + "," + owner.getId() + "," + c1.getId() + "],\"action\":\"SUSPEND\",\"reason\":\"Pending an access review\"}"));
        assertThat(r.path("ok").asInt()).isEqualTo(2);
        assertThat(skippedReasons(r)).containsExactlyInAnyOrder(admin.getId() + ":SELF", owner.getId() + ":TARGET_RANK");
        assertThat(reload(plain).getStatus()).isEqualTo(OrgMemberStatus.SUSPENDED);
        assertThat(reload(owner).getStatus()).isEqualTo(OrgMemberStatus.ACTIVE);
        assertThat(auditCount(a, "MEMBER_SUSPEND")).isEqualTo(2);
        assertThat(auditCount(a, "MEMBER_BULK_SKIP")).isEqualTo(2);
        assertThat(auditCount(a) - before).isEqualTo(5);
        assertThat(r.path("results").get(0).path("previous").path("status").asText()).isEqualTo("ACTIVE");
        // the suspended person is out at the next call
        assertGeneric404(call(login("plain"), org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/orgs/" + a.getId())), "a suspended member");
        // reinstate is the undo
        JsonNode back = json(bulkCall(login("admin"), "status", "{\"memberIds\":[" + plain.getId() + "," + c1.getId() + "],\"action\":\"REINSTATE\"}"));
        assertThat(back.path("ok").asInt()).isEqualTo(2);
        assertThat(reload(plain).getStatus()).isEqualTo(OrgMemberStatus.ACTIVE);
    }

    @Test
    void theLastAdministratorInServiceCannotBeSuspendedInABulkCall() throws Exception {
        superActor("sup");
        owner.setStatus(OrgMemberStatus.SUSPENDED); // the only other administrator-level seat is out of service
        members.saveAndFlush(owner);
        JsonNode r = json(bulkCall(login("sup"), "status", "{\"memberIds\":[" + admin.getId() + "," + plain.getId() + "],\"action\":\"SUSPEND\",\"reason\":\"Trying to lock the org out\"}"));
        assertThat(r.path("ok").asInt()).isEqualTo(1);
        assertThat(skippedReasons(r)).containsExactly(admin.getId() + ":LAST_ADMIN");
        assertThat(reload(admin).getStatus()).isEqualTo(OrgMemberStatus.ACTIVE);
    }

    @Test
    void aSecondTransitionOnTheSamePersonInOneCallIsAnInvalidTransition() throws Exception {
        assertStatus(bulkCall(login("hr"), "status", "{\"memberIds\":[" + plain.getId() + "],\"action\":\"SUSPEND\",\"reason\":\"First suspension\"}"), 200);
        JsonNode again = json(bulkCall(login("hr"), "status", "{\"memberIds\":[" + plain.getId() + "],\"action\":\"SUSPEND\",\"reason\":\"Second suspension\"}"));
        assertThat(skippedReasons(again)).containsExactly(plain.getId() + ":INVALID_TRANSITION");
    }

    // ---- idempotency and the wall ------------------------------------------------------------------------------------------

    @Test
    void theHeaderIsRequiredAfterThePermissionWall() throws Exception {
        String body = "{\"memberIds\":[" + plain.getId() + "],\"action\":\"SUSPEND\",\"reason\":\"No key was sent\"}";
        MvcResult noKey = bulkCall(login("owner"), "status", body, null);
        assertCode(noKey, 400, "IDEMPOTENCY_KEY_MISSING");
        assertThat(reload(plain).getStatus()).isEqualTo(OrgMemberStatus.ACTIVE);
        assertCode(bulkCall(login("owner"), "status", body, "short"), 400, "IDEMPOTENCY_KEY_INVALID");
        // someone who may not do this gets the 404 whether or not the header is there
        assertGeneric404(bulkCall(login("mgr"), "status", body, null), "a manager without members.suspend, no key");
        assertGeneric404(bulkCall(login("mgr"), "status", body, key()), "a manager without members.suspend, with a key");
        assertGeneric404(bulkCall(login("plain"), "roles", body, null), "a member");
        assertGeneric404(bulkCall(login("bowner"), "status", body, null), "another organization's owner");
    }

    @Test
    void theSameKeyAndBodyReplaysTheFirstAnswerWithoutDoingTheWorkAgain() throws Exception {
        String body = "{\"memberIds\":[" + plain.getId() + "," + c1.getId() + "],\"action\":\"SUSPEND\",\"reason\":\"Pending an access review\"}";
        String k = key();
        MvcResult first = bulkCall(login("owner"), "status", body, k);
        assertStatus(first, 200);
        assertThat(first.getResponse().getHeader("Idempotent-Replayed")).isNull();
        long audits = auditCount(a);
        MvcResult second = bulkCall(login("owner"), "status", body, k);
        assertStatus(second, 200);
        assertThat(second.getResponse().getHeader("Idempotent-Replayed")).isEqualTo("true");
        assertThat(json(second)).isEqualTo(json(first));
        assertThat(auditCount(a)).as("the replay wrote nothing").isEqualTo(audits);
        assertThat(auditCount(a, "MEMBER_SUSPEND")).isEqualTo(2);
    }

    @Test
    void theSameKeyForADifferentRequestIs422() throws Exception {
        String k = key();
        assertStatus(bulkCall(login("owner"), "status", "{\"memberIds\":[" + plain.getId() + "],\"action\":\"SUSPEND\",\"reason\":\"Pending an access review\"}", k), 200);
        assertCode(bulkCall(login("owner"), "status", "{\"memberIds\":[" + c1.getId() + "],\"action\":\"SUSPEND\",\"reason\":\"Pending an access review\"}", k), 422, "IDEMPOTENCY_KEY_REUSED");
        assertCode(bulkCall(login("owner"), "manager", "{\"memberIds\":[" + plain.getId() + "],\"managerMemberId\":null}", k), 422, "IDEMPOTENCY_KEY_REUSED");
        assertThat(reload(c1).getStatus()).isEqualTo(OrgMemberStatus.ACTIVE);
    }

    @Test
    void aKeyIsPrivateToItsCallerAndItsOrganization() throws Exception {
        String k = key();
        assertStatus(bulkCall(login("owner"), "manager", "{\"memberIds\":[" + plain.getId() + "],\"managerMemberId\":" + mktMgr.getId() + "}", k), 200);
        // another caller of the same organization using the same key does the work (a key is per actor)
        JsonNode other = json(bulkCall(login("hr"), "manager", "{\"memberIds\":[" + c1.getId() + "],\"managerMemberId\":" + mktMgr.getId() + "}", k));
        assertThat(other.path("ok").asInt()).isEqualTo(1);
        // and B's owner using it on B's own people is unaffected
        MvcResult b1 = call(login("bowner"), post(membersUrl(b) + "/bulk/manager"), "{\"memberIds\":[" + bMember.getId() + "],\"managerMemberId\":" + bOwner.getId() + "}", null, k);
        assertStatus(b1, 200);
        assertThat(b1.getResponse().getHeader("Idempotent-Replayed")).isNull();
        assertThat(reload(bMember).getManagerMemberId()).isEqualTo(bOwner.getId());
    }

    // ---- input limits and the other tenant ---------------------------------------------------------------------------------

    @Test
    void theSelectionIsBounded() throws Exception {
        assertCode(bulkCall(login("owner"), "status", "{\"memberIds\":[],\"action\":\"REINSTATE\"}"), 422, "ORG_INVALID");
        assertCode(bulkCall(login("owner"), "status", "{\"action\":\"REINSTATE\"}"), 422, "ORG_INVALID");
        assertCode(bulkCall(login("owner"), "manager", "{\"memberIds\":[null],\"managerMemberId\":null}"), 422, "ORG_INVALID");
        assertCode(bulkCall(login("owner"), "manager", "{\"memberIds\":[-3],\"managerMemberId\":null}"), 422, "ORG_INVALID");
        StringBuilder many = new StringBuilder("[");
        for (int i = 1; i <= 501; i++) many.append(i == 1 ? "" : ",").append(i);
        many.append("]");
        assertCode(bulkCall(login("owner"), "manager", "{\"memberIds\":" + many + ",\"managerMemberId\":null}"), 422, "ORG_INVALID");
        JsonNode dup = json(bulkCall(login("owner"), "manager", "{\"memberIds\":[" + plain.getId() + "," + plain.getId() + "],\"managerMemberId\":" + mktMgr.getId() + "}"));
        assertThat(dup.path("requested").asInt()).as("a repeated id is one member").isEqualTo(1);
    }

    @Test
    void memberIdsOfAnotherOrganizationNeverChangeAnythingThere() throws Exception {
        for (String action : List.of("groups", "manager", "status", "roles")) {
            String body = switch (action) {
                case "groups" -> "{\"memberIds\":[" + bMember.getId() + "," + bOwner.getId() + "],\"departmentGroupId\":" + d1.getId() + "}";
                case "manager" -> "{\"memberIds\":[" + bMember.getId() + "],\"managerMemberId\":" + owner.getId() + "}";
                case "status" -> "{\"memberIds\":[" + bMember.getId() + "],\"action\":\"SUSPEND\",\"reason\":\"Cross tenant attempt\"}";
                default -> "{\"memberIds\":[" + bMember.getId() + "],\"add\":[" + roleRepo.findSystemByRoleKey("CONSULTANT").orElseThrow().getId() + "]}";
            };
            JsonNode r = json(bulkCall(login("owner"), action, body));
            assertThat(r.path("ok").asInt()).as(action).isZero();
            for (JsonNode s : r.path("skipped")) assertThat(s.path("reason").asText()).as(action).isEqualTo("NOT_FOUND");
        }
        OrgMember b = reload(bMember);
        assertThat(b.getStatus()).isEqualTo(OrgMemberStatus.ACTIVE);
        assertThat(b.getManagerMemberId()).isNull();
        assertThat(b.getDepartmentGroupId()).isNull();
        assertThat(auditCount(this.b)).as("nothing was written in the other organization").isZero();
        // and B's owner cannot use A's path at all
        assertGeneric404(call(login("bowner"), post(membersUrl(a) + "/bulk/status"), "{\"memberIds\":[" + plain.getId() + "],\"action\":\"SUSPEND\",\"reason\":\"Cross tenant attempt\"}", null, key()), "B's owner on A");
    }

    @Test
    void aBodyCannotNameAnOrganizationOrASeatStatus() throws Exception {
        String body = "{\"memberIds\":[" + bMember.getId() + "," + plain.getId() + "],\"orgId\":" + b.getId() + ",\"status\":\"ACTIVE\",\"role\":\"OWNER\",\"managerMemberId\":" + mktMgr.getId() + "}";
        JsonNode r = json(bulkCall(login("owner"), "manager", body));
        assertThat(r.path("ok").asInt()).isEqualTo(1);
        assertThat(skippedReasons(r)).containsExactly(bMember.getId() + ":NOT_FOUND");
        assertThat(reload(plain).getManagerMemberId()).isEqualTo(mktMgr.getId());
        assertThat(reload(plain).getOrgId()).isEqualTo(a.getId());
        assertThat(reload(bMember).getManagerMemberId()).isNull();
    }

    @Test
    void aSuspendedOrganizationRefusesPeopleActions() throws Exception {
        a.setStatus(OrgStatus.SUSPENDED);
        orgs.saveAndFlush(a);
        assertGeneric404(bulkCall(login("owner"), "manager", "{\"memberIds\":[" + plain.getId() + "],\"managerMemberId\":null}"), "a suspended organization");
    }

    // ---- helpers ---------------------------------------------------------------------------------------------------------------

    private List<String> roleKeys(OrgMember m) {
        em.flush();
        List<String> out = new ArrayList<>();
        for (var row : memberRoleRepo.findLiveByOrgIdAndMemberId(m.getOrgId(), m.getId())) {
            out.add(roleRepo.findVisibleByOrgIdAndId(m.getOrgId(), row.getRoleId()).orElseThrow().getRoleKey());
        }
        return out;
    }

    private com.dossier.api.domain.ent.OrgRoleDefinition customRole(com.dossier.api.domain.org.Organization org, String key) {
        com.dossier.api.domain.ent.OrgRoleDefinition d = new com.dossier.api.domain.ent.OrgRoleDefinition();
        d.setOrgId(org.getId());
        d.setRoleKey("CUSTOM_" + key + "_" + p.toUpperCase());
        d.setName(key + " " + p);
        return d;
    }
}
