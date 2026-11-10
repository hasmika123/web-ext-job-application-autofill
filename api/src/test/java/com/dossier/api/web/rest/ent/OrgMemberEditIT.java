package com.dossier.api.web.rest.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.enumeration.OrgGroupKind;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.OrgGroup;
import com.dossier.api.domain.org.OrgMember;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * X4.3 single edits ({@code PATCH /members/{id}}): the org-set title, department, team and reporting manager, with If-Match, the
 * team-in-department and no-loop rules, one audit row per change, the permission and scope per field, and the doc 42 negatives (mass assignment,
 * a group or manager of another organization named in the body, a closed organization).
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class OrgMemberEditIT extends MemberItSupport {

    private String version(String login, OrgMember m) throws Exception {
        return call(login, get(memberUrl(a, m))).getResponse().getHeader("ETag");
    }

    private MvcResult patchAs(String login, OrgMember m, String body) throws Exception {
        return call(login, patch(memberUrl(a, m)), body, version(login, m), null);
    }

    // ---- title, department, team ---------------------------------------------------------------------------------------

    @Test
    void theOwnerSetsATitleAndItIsAuditedOnce() throws Exception {
        long before = auditCount(a);
        MvcResult r = patchAs(login("owner"), c1, "{\"title\":\"  Senior   consultant \"}");
        assertStatus(r, 200);
        assertThat(json(r).path("title").asText()).as("whitespace is normalised").isEqualTo("Senior consultant");
        assertThat(r.getResponse().getHeader("ETag")).isNotNull();
        assertThat(auditCount(a) - before).isEqualTo(1);
        assertThat(newestAudit(a).getAction()).isEqualTo("MEMBER_UPDATE");
        assertThat(newestAudit(a).getTargetId()).isEqualTo(String.valueOf(c1.getId()));
        assertThat(reload(c1).getTitle()).isEqualTo("Senior consultant");
    }

    @Test
    void aNullClearsAndARequestThatChangesNothingWritesNothing() throws Exception {
        assertStatus(patchAs(login("owner"), c1, "{\"title\":\"Lead\"}"), 200);
        long before = auditCount(a);
        assertStatus(patchAs(login("owner"), c1, "{\"title\":\"Lead\"}"), 200);
        assertThat(auditCount(a)).as("same value: no audit row").isEqualTo(before);
        assertStatus(patchAs(login("owner"), c1, "{\"title\":null}"), 200);
        assertThat(reload(c1).getTitle()).isNull();
        assertStatus(patchAs(login("owner"), c1, "{\"title\":\"   \"}"), 200);
        assertThat(reload(c1).getTitle()).isNull();
    }

    @Test
    void aTeamBringsItsDepartmentAlong() throws Exception {
        MvcResult r = patchAs(login("hr"), plain, "{\"teamGroupId\":" + t2.getId() + "}");
        assertStatus(r, 200);
        assertThat(json(r).path("team").path("name").asText()).isEqualTo("Bench TX");
        assertThat(json(r).path("department").path("name").asText()).isEqualTo("Delivery");
        OrgMember reloaded = reload(plain);
        assertThat(reloaded.getTeamGroupId()).isEqualTo(t2.getId());
        assertThat(reloaded.getDepartmentGroupId()).isEqualTo(d1.getId());
        assertThat(newestAudit(a).getAction()).isEqualTo("MEMBER_GROUP");
    }

    @Test
    void aTeamOutsideTheChosenDepartmentIs422() throws Exception {
        assertCode(patchAs(login("owner"), plain, "{\"departmentGroupId\":" + d2.getId() + ",\"teamGroupId\":" + t1.getId() + "}"), 422, "TEAM_NOT_IN_DEPARTMENT");
        assertCode(patchAs(login("owner"), plain, "{\"departmentGroupId\":" + d1.getId() + ",\"teamGroupId\":" + t3.getId() + "}"), 422, "TEAM_NOT_IN_DEPARTMENT");
        // moving only the department while the old team stays is the same mistake
        assertCode(patchAs(login("owner"), c1, "{\"departmentGroupId\":" + d2.getId() + "}"), 422, "TEAM_NOT_IN_DEPARTMENT");
        OrgMember untouched = reload(c1);
        assertThat(untouched.getDepartmentGroupId()).isEqualTo(d1.getId());
        assertThat(untouched.getTeamGroupId()).isEqualTo(t1.getId());
        // moving both works, and so does a team that sits under no department when no department is chosen
        assertStatus(patchAs(login("owner"), c1, "{\"departmentGroupId\":" + d2.getId() + ",\"teamGroupId\":null}"), 200);
        assertStatus(patchAs(login("owner"), plain, "{\"teamGroupId\":" + t3.getId() + "}"), 200);
        assertThat(reload(plain).getDepartmentGroupId()).isNull();
    }

    @Test
    void aDepartmentAndATeamMustBeOfTheRightKind() throws Exception {
        assertCode(patchAs(login("owner"), plain, "{\"departmentGroupId\":" + t1.getId() + "}"), 422, "ORG_INVALID");
        assertCode(patchAs(login("owner"), plain, "{\"teamGroupId\":" + d1.getId() + "}"), 422, "ORG_INVALID");
    }

    // ---- manager ----------------------------------------------------------------------------------------------------------

    @Test
    void settingAndClearingTheManagerWritesOneAuditRowEach() throws Exception {
        long before = auditCount(a);
        MvcResult r = patchAs(login("owner"), c1, "{\"managerMemberId\":" + mktMgr.getId() + "}");
        assertStatus(r, 200);
        assertThat(json(r).path("manager").path("memberId").asLong()).isEqualTo(mktMgr.getId());
        assertThat(newestAudit(a).getAction()).isEqualTo("MEMBER_MANAGER");
        assertStatus(patchAs(login("owner"), c1, "{\"managerMemberId\":null}"), 200);
        assertThat(reload(c1).getManagerMemberId()).isNull();
        assertThat(auditCount(a) - before).isEqualTo(2);
    }

    @Test
    void aLoopInTheReportingLineIs422AndNothingChanges() throws Exception {
        assertStatus(patchAs(login("owner"), c1, "{\"managerMemberId\":" + mktMgr.getId() + "}"), 200);
        assertCode(patchAs(login("owner"), mktMgr, "{\"managerMemberId\":" + c1.getId() + "}"), 422, "MANAGER_CYCLE");
        assertCode(patchAs(login("owner"), mktMgr, "{\"managerMemberId\":" + mktMgr.getId() + "}"), 422, "MANAGER_CYCLE");
        // a longer chain: plain -> c1 -> mktMgr; making mktMgr report to plain closes it
        assertStatus(patchAs(login("owner"), plain, "{\"managerMemberId\":" + c1.getId() + "}"), 200);
        assertCode(patchAs(login("owner"), mktMgr, "{\"managerMemberId\":" + plain.getId() + "}"), 422, "MANAGER_CYCLE");
        assertThat(reload(mktMgr).getManagerMemberId()).isNull();
    }

    @Test
    void aManagerMustBeActive() throws Exception {
        OrgMember susp = seatWithStatus(a, "susp", OrgRole.MEMBER, OrgMemberStatus.SUSPENDED);
        assertCode(patchAs(login("owner"), c1, "{\"managerMemberId\":" + susp.getId() + "}"), 422, "MANAGER_INVALID");
        OrgMember invited = seatWithStatus(a, "inv", OrgRole.MEMBER, OrgMemberStatus.INVITED);
        assertCode(patchAs(login("owner"), c1, "{\"managerMemberId\":" + invited.getId() + "}"), 422, "MANAGER_INVALID");
    }

    // ---- versions -----------------------------------------------------------------------------------------------------------

    @Test
    void ifMatchIsRequiredAndAStaleVersionIs412() throws Exception {
        assertCode(call(login("owner"), patch(memberUrl(a, c1)), "{\"title\":\"x\"}"), 428, "PRECONDITION_REQUIRED");
        String stale = version(login("owner"), c1);
        assertStatus(call(login("owner"), patch(memberUrl(a, c1)), "{\"title\":\"First\"}", stale, null), 200);
        MvcResult r = call(login("hr"), patch(memberUrl(a, c1)), "{\"title\":\"Second\"}", stale, null);
        assertCode(r, 412, "PRECONDITION_FAILED");
        assertThat(r.getResponse().getContentAsString()).contains("currentVersion");
        assertThat(reload(c1).getTitle()).isEqualTo("First");
    }

    @Test
    void aVersionFromAnotherMembersSheetDoesNotMatch() throws Exception {
        String other = version(login("owner"), c2);
        assertCode(call(login("owner"), patch(memberUrl(a, c1)), "{\"title\":\"x\"}", other, null), 412, "PRECONDITION_FAILED");
    }

    // ---- mass assignment and bad bodies ------------------------------------------------------------------------------------

    @Test
    void onlyTheFourEditableFieldsAreEverBound() throws Exception {
        String before = snapshot(c1);
        for (String body : new String[] {
            "{\"status\":\"REMOVED\"}",
            "{\"role\":\"OWNER\"}",
            "{\"orgId\":" + b.getId() + "}",
            "{\"userId\":" + bOwner.getUserId() + "}",
            "{\"primaryRoleId\":1}",
            "{\"id\":" + plain.getId() + "}",
            "{\"title\":\"ok\",\"status\":\"SUSPENDED\"}",
            "{\"joinedAt\":\"2020-01-01T00:00:00Z\"}",
        }) {
            assertCode(patchAs(login("owner"), c1, body), 422, "ORG_INVALID");
        }
        assertThat(snapshot(c1)).as("nothing of the person changed, not even the valid field next to an invalid one").isEqualTo(before);
        assertThat(reload(c1).getOrgId()).isEqualTo(a.getId());
    }

    @Test
    void emptyAndMistypedBodiesAreRefused() throws Exception {
        assertCode(patchAs(login("owner"), c1, "{}"), 422, "ORG_INVALID");
        assertCode(patchAs(login("owner"), c1, "{\"teamGroupId\":\"" + t1.getId() + "\"}"), 422, "ORG_INVALID");
        assertCode(patchAs(login("owner"), c1, "{\"managerMemberId\":-4}"), 422, "ORG_INVALID");
        assertCode(patchAs(login("owner"), c1, "{\"title\":" + "7" + "}"), 422, "ORG_INVALID");
        assertCode(patchAs(login("owner"), c1, "{\"title\":\"<script>\"}"), 422, "ORG_INVALID");
        assertCode(patchAs(login("owner"), c1, "{\"title\":\"" + "t".repeat(121) + "\"}"), 422, "ORG_INVALID");
        assertStatus(call(login("owner"), patch(memberUrl(a, c1)), "not json", version(login("owner"), c1), null), 400);
    }

    // ---- who may -----------------------------------------------------------------------------------------------------------

    @Test
    void aTeamManagerMaySetTheManagerOfTheirTeamAndNothingElse() throws Exception {
        assertStatus(patchAs(login("mgr"), c1, "{\"managerMemberId\":" + mktMgr.getId() + "}"), 200);
        assertGeneric404(patchAs(login("mgr"), c1, "{\"title\":\"Boss\"}"), "a manager sets a title: needs members.group.set");
        assertGeneric404(patchAs(login("mgr"), c1, "{\"teamGroupId\":" + t2.getId() + "}"), "a manager moves a person");
        assertGeneric404(patchAs(login("mgr"), c2, "{\"managerMemberId\":" + mktMgr.getId() + "}"), "a person outside the manager's team");
    }

    @Test
    void peopleWithoutThePermissionOrTheScopeGetTheGeneric404() throws Exception {
        String v = version(login("owner"), c1);
        for (String who : new String[] {"spec", "plain", "c1", "c2"}) {
            assertGeneric404(call(login(who), patch(memberUrl(a, c1)), "{\"title\":\"x\"}", v, null), who + " edits");
        }
        assertThat(reload(c1).getTitle()).isNull();
        assertStatus(call(login("admin"), patch(memberUrl(a, c1)), "{\"title\":\"By admin\"}", v, null), 200);
    }

    @Test
    void aSuspendedOrClosedOrganizationRefusesPeopleEdits() throws Exception {
        String v = version(login("owner"), c1);
        a.setStatus(OrgStatus.SUSPENDED);
        orgs.saveAndFlush(a);
        assertGeneric404(call(login("owner"), patch(memberUrl(a, c1)), "{\"title\":\"x\"}", v, null), "a suspended organization");
        assertThat(reload(c1).getTitle()).isNull();
    }

    @Test
    void aPersonWhoLeftCannotBeEdited() throws Exception {
        OrgMember gone = seatWithStatus(a, "gone", OrgRole.MEMBER, OrgMemberStatus.REMOVED);
        MvcResult r = patchAs(login("owner"), gone, "{\"title\":\"x\"}");
        assertCode(r, 409, "SEAT_STATE");
    }

    // ---- other organizations --------------------------------------------------------------------------------------------------

    @Test
    void aGroupOrManagerOfAnotherOrganizationNamedInTheBodyIsTheGeneric404AndChangesNothing() throws Exception {
        OrgGroup foreignDept = group(b, "B Delivery", OrgGroupKind.DEPARTMENT, null);
        OrgGroup foreignTeam = group(b, "B Team", OrgGroupKind.TEAM, foreignDept);
        String before = snapshot(c1);
        assertGeneric404(patchAs(login("owner"), c1, "{\"departmentGroupId\":" + foreignDept.getId() + "}"), "a foreign department");
        assertGeneric404(patchAs(login("owner"), c1, "{\"teamGroupId\":" + foreignTeam.getId() + "}"), "a foreign team");
        assertGeneric404(patchAs(login("owner"), c1, "{\"managerMemberId\":" + bOwner.getId() + "}"), "a foreign manager");
        assertGeneric404(patchAs(login("owner"), c1, "{\"managerMemberId\":999999999}"), "a missing manager is indistinguishable");
        assertThat(snapshot(c1)).isEqualTo(before);
    }

    @Test
    void theOtherOrganizationsOwnerCannotEditOurPeopleByAnyPath() throws Exception {
        String v = version(login("owner"), c1);
        assertGeneric404(call(login("bowner"), patch(memberUrl(a, c1)), "{\"title\":\"x\"}", v, null), "B's owner through A's path");
        assertGeneric404(call(login("bowner"), patch(memberUrl(b, c1)), "{\"title\":\"x\"}", v, null), "B's owner with B's org id and A's member id");
        assertGeneric404(call(login("owner"), patch(memberUrl(a, bMember)), "{\"title\":\"x\"}", v, null), "A's owner with A's org id and B's member id");
        assertThat(reload(bMember).getTitle()).isNull();
        assertThat(reload(c1).getTitle()).isNull();
    }

    private String snapshot(OrgMember m) {
        OrgMember r = reload(m);
        return r.getId() + "|" + r.getOrgId() + "|" + r.getRole() + "|" + r.getStatus() + "|" + r.getTitle() + "|" + r.getDepartmentGroupId() + "|" + r.getTeamGroupId() + "|" + r.getManagerMemberId() + "|" + r.getUserId() + "|" + r.getJoinedAt();
    }
}
