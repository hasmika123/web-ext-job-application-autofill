package com.dossier.api.web.rest.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.ShareScope;
import com.dossier.api.domain.org.OrgAuditEvent;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.service.org.DataShareService;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgShareConsent;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * X4.3 / X4.6 reads through the real chain on real rows: the table (paging, search, filters, sort, scope), the KPI tiles with their last-month deltas
 * rebuilt from real history (and null where history does not exist), the detail sheet and the activity feed. Cross-tenant, scope and
 * summary-projection negatives of 42-threat-model.md are asserted next to the happy paths.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class OrgMemberQueryIT extends MemberItSupport {

    @Autowired private DataShareService dataShare;

    // ---- the table ----------------------------------------------------------------------------------------------------

    @Test
    void theOwnerListsEveryoneWithPagingHeadersAndTotals() throws Exception {
        MvcResult all = call(login("owner"), get(membersUrl(a) + "?size=100&sort=name,asc"));
        assertStatus(all, 200);
        JsonNode page = json(all);
        assertThat(page.path("total").asInt()).isEqualTo(8);
        assertThat(all.getResponse().getHeader("X-Total-Count")).isEqualTo("8");
        assertThat(names(page)).containsExactly("Adam Admin", "Anika Khan", "Anita Rao", "Hannah Hart", "Maria Lopez", "Olivia Owner", "Pat Plain", "Sam Spec");

        MvcResult first = call(login("owner"), get(membersUrl(a) + "?size=3&page=0&sort=name,asc"));
        JsonNode p0 = json(first);
        assertThat(p0.path("items")).hasSize(3);
        assertThat(p0.path("hasNext").asBoolean()).isTrue();
        assertThat(p0.path("page").asInt()).isZero();
        assertThat(p0.path("size").asInt()).isEqualTo(3);
        JsonNode p2 = json(call(login("owner"), get(membersUrl(a) + "?size=3&page=2&sort=name,asc")));
        assertThat(p2.path("items")).hasSize(2);
        assertThat(p2.path("hasNext").asBoolean()).isFalse();
        JsonNode beyond = json(call(login("owner"), get(membersUrl(a) + "?size=3&page=9&sort=name,asc")));
        assertThat(beyond.path("items")).isEmpty();
        assertThat(beyond.path("total").asInt()).isEqualTo(8);
    }

    @Test
    void aRowCarriesRolesDepartmentTeamManagerAndTheCallerSeesItInFull() throws Exception {
        c1.setManagerMemberId(mktMgr.getId());
        c1.setTitle("Senior consultant");
        members.saveAndFlush(c1);
        JsonNode row = rowOf(json(call(login("owner"), get(membersUrl(a) + "?q=anika"))), c1);
        assertThat(row.path("name").asText()).isEqualTo("Anika Khan");
        assertThat(row.path("initials").asText()).isEqualTo("AK");
        assertThat(row.path("status").asText()).isEqualTo("ACTIVE");
        assertThat(row.path("title").asText()).isEqualTo("Senior consultant");
        assertThat(row.path("roles").get(0).path("key").asText()).isEqualTo("CONSULTANT");
        assertThat(row.path("roles").get(0).path("primary").asBoolean()).isTrue();
        assertThat(row.path("department").path("name").asText()).isEqualTo("Delivery");
        assertThat(row.path("team").path("name").asText()).isEqualTo("Bench NY");
        assertThat(row.path("manager").path("name").asText()).isEqualTo("Maria Lopez");
        assertThat(row.path("manager").path("memberId").asLong()).isEqualTo(mktMgr.getId());
        assertThat(row.path("workEmail").asText()).isEqualTo(login("c1") + "@example.com");
        assertThat(row.path("summaryOnly").asBoolean()).isFalse();
        assertThat(row.path("consentScope").asText()).isEqualTo("NONE");
        assertThat(row.has("phone")).as("the table never carries a phone").isFalse();
    }

    @Test
    void statusFilterAndTheDefaultStates() throws Exception {
        OrgMember invited = seatWithStatus(a, "invited", OrgRole.MEMBER, OrgMemberStatus.INVITED);
        invited.setInviteEmail("new.hire@example.com");
        invited.setInviteExpiresAt(Instant.now().plus(3, ChronoUnit.DAYS));
        members.saveAndFlush(invited);
        OrgMember suspended = seatWithStatus(a, "susp", OrgRole.MEMBER, OrgMemberStatus.SUSPENDED);
        OrgMember removed = seatWithStatus(a, "gone", OrgRole.MEMBER, OrgMemberStatus.REMOVED);

        JsonNode def = json(call(login("owner"), get(membersUrl(a) + "?size=100")));
        assertThat(ids(def)).contains(invited.getId(), suspended.getId()).doesNotContain(removed.getId());
        assertThat(def.path("total").asInt()).isEqualTo(10);

        JsonNode onlyInvited = json(call(login("owner"), get(membersUrl(a) + "?status=INVITED")));
        assertThat(ids(onlyInvited)).containsExactly(invited.getId());
        JsonNode inv = onlyInvited.path("items").get(0);
        assertThat(inv.path("invite").path("expired").asBoolean()).isFalse();
        assertThat(inv.path("workEmail").asText()).isEqualTo(login("invited") + "@example.com");

        assertThat(ids(json(call(login("owner"), get(membersUrl(a) + "?status=SUSPENDED&status=INVITED"))))).containsExactlyInAnyOrder(invited.getId(), suspended.getId());
        assertThat(ids(json(call(login("owner"), get(membersUrl(a) + "?status=SUSPENDED,INVITED"))))).as("comma separated works too").containsExactlyInAnyOrder(invited.getId(), suspended.getId());
        assertThat(ids(json(call(login("owner"), get(membersUrl(a) + "?status=REMOVED"))))).containsExactly(removed.getId());
        assertCode(call(login("owner"), get(membersUrl(a) + "?status=ERASED")), 400, "FILTER_INVALID");
        assertCode(call(login("owner"), get(membersUrl(a) + "?status=bogus")), 400, "FILTER_INVALID");
    }

    @Test
    void searchFindsByNameEmailTitleRoleAndDepartment() throws Exception {
        User u = users.findById(c1.getUserId()).orElseThrow();
        u.setEmail("anika@acme-test.example");
        users.saveAndFlush(u);
        plain.setTitle("Recruiter");
        members.saveAndFlush(plain);

        // "ani" also matches the role name "Organization Admin": the search spans name, email, title, role and department by design
        assertThat(ids(json(call(login("owner"), get(membersUrl(a) + "?q=ani"))))).as("by name").contains(c1.getId(), c2.getId()).doesNotContain(plain.getId(), mktSpec.getId());
        assertThat(ids(json(call(login("owner"), get(membersUrl(a) + "?q=anik"))))).as("by a name prefix").containsExactly(c1.getId());
        assertThat(ids(json(call(login("owner"), get(membersUrl(a) + "?q=anika@"))))).as("by email").containsExactly(c1.getId());
        assertThat(ids(json(call(login("owner"), get(membersUrl(a) + "?q=ANIKA KHAN"))))).as("case-insensitive, full name").containsExactly(c1.getId());
        assertThat(ids(json(call(login("owner"), get(membersUrl(a) + "?q=recruit"))))).as("by title").containsExactly(plain.getId());
        assertThat(ids(json(call(login("owner"), get(membersUrl(a) + "?q=marketing manager"))))).as("by role name").containsExactly(mktMgr.getId());
        assertThat(ids(json(call(login("owner"), get(membersUrl(a) + "?q=delivery"))))).as("by department name").containsExactlyInAnyOrder(mktMgr.getId(), c1.getId(), c2.getId());
        assertThat(ids(json(call(login("owner"), get(membersUrl(a) + "?q=bench ny"))))).as("by team name").containsExactlyInAnyOrder(mktMgr.getId(), c1.getId());
        assertThat(json(call(login("owner"), get(membersUrl(a) + "?q=nobody-by-that-name"))).path("total").asInt()).isZero();
    }

    @Test
    void searchTreatsWildcardsAsPlainText() throws Exception {
        assertThat(json(call(login("owner"), get(membersUrl(a) + "?q=%%"))).path("total").asInt()).as("%% is not a match-all").isZero();
        assertThat(json(call(login("owner"), get(membersUrl(a) + "?q=a_"))).path("total").asInt()).as("_ is not a one-character wildcard").isZero();
        assertCode(call(login("owner"), get(membersUrl(a) + "?q=a")), 400, "FILTER_INVALID");
        assertCode(call(login("owner"), get(membersUrl(a) + "?q=" + "x".repeat(81))), 400, "FILTER_INVALID");
    }

    @Test
    void filtersByRoleDepartmentTeamAndManager() throws Exception {
        c1.setManagerMemberId(mktMgr.getId());
        members.saveAndFlush(c1);
        Long consultantRole = roleRepo.findSystemByRoleKey("CONSULTANT").orElseThrow().getId();
        assertThat(ids(json(call(login("owner"), get(membersUrl(a) + "?roleId=" + consultantRole))))).containsExactlyInAnyOrder(c1.getId(), c2.getId());
        assertThat(ids(json(call(login("owner"), get(membersUrl(a) + "?departmentId=" + d1.getId()))))).containsExactlyInAnyOrder(mktMgr.getId(), c1.getId(), c2.getId());
        assertThat(ids(json(call(login("owner"), get(membersUrl(a) + "?teamId=" + t1.getId()))))).containsExactlyInAnyOrder(mktMgr.getId(), c1.getId());
        assertThat(ids(json(call(login("owner"), get(membersUrl(a) + "?managerId=" + mktMgr.getId()))))).containsExactly(c1.getId());
        assertThat(ids(json(call(login("owner"), get(membersUrl(a) + "?roleId=" + consultantRole + "&teamId=" + t1.getId()))))).as("filters combine").containsExactly(c1.getId());
        assertThat(json(call(login("owner"), get(membersUrl(a) + "?departmentId=" + d2.getId() + "&teamId=" + t1.getId()))).path("total").asInt()).isZero();
    }

    @Test
    void sortingByNameJoinedAndAnUnknownFieldIsRefused() throws Exception {
        assertThat(names(json(call(login("owner"), get(membersUrl(a) + "?size=3&sort=name,desc"))))).containsExactly("Sam Spec", "Pat Plain", "Olivia Owner");
        c1.setJoinedAt(Instant.now().minus(400, ChronoUnit.DAYS));
        members.saveAndFlush(c1);
        assertThat(names(json(call(login("owner"), get(membersUrl(a) + "?size=1&sort=joined,asc"))))).containsExactly("Anika Khan");
        assertThat(names(json(call(login("owner"), get(membersUrl(a) + "?size=1&sort=joined,desc")))).get(0)).isNotEqualTo("Anika Khan");
        MvcResult bad = call(login("owner"), get(membersUrl(a) + "?sort=password,asc"));
        assertCode(bad, 400, "SORT_INVALID");
        assertThat(bad.getResponse().getContentAsString()).contains("allowed").contains("name").contains("joined");
        assertCode(call(login("owner"), get(membersUrl(a) + "?sort=name,sideways")), 400, "SORT_INVALID");
        assertCode(call(login("owner"), get(membersUrl(a) + "?sort=name,asc,extra")), 400, "SORT_INVALID");
    }

    @Test
    void pagingParametersAreBounded() throws Exception {
        assertCode(call(login("owner"), get(membersUrl(a) + "?size=0")), 400, "FILTER_INVALID");
        assertCode(call(login("owner"), get(membersUrl(a) + "?size=101")), 400, "FILTER_INVALID");
        assertCode(call(login("owner"), get(membersUrl(a) + "?page=-1")), 400, "FILTER_INVALID");
        assertStatus(call(login("owner"), get(membersUrl(a) + "?size=100")), 200);
    }

    // ---- scope ----------------------------------------------------------------------------------------------------------

    @Test
    void aTeamScopedManagerSeesOnlyTheirTeam() throws Exception {
        JsonNode page = json(call(login("mgr"), get(membersUrl(a) + "?size=100")));
        assertThat(ids(page)).containsExactlyInAnyOrder(mktMgr.getId(), c1.getId());
        for (JsonNode row : page.path("items")) assertThat(row.path("summaryOnly").asBoolean()).as("the manager administers the team rows").isFalse();
        assertThat(page.path("total").asInt()).isEqualTo(2);
        // filters cannot widen it
        assertThat(ids(json(call(login("mgr"), get(membersUrl(a) + "?teamId=" + t2.getId()))))).isEmpty();
        assertThat(ids(json(call(login("mgr"), get(membersUrl(a) + "?q=anita"))))).as("c2 is in team T2, not theirs").isEmpty();
        assertThat(ids(json(call(login("mgr"), get(membersUrl(a) + "?q=anika"))))).containsExactly(c1.getId());
        assertThat(json(call(login("mgr"), get(membersUrl(a) + "/counts"))).path("total").path("value").asInt()).as("tiles count the same rows").isEqualTo(2);
    }

    @Test
    void aSummaryScopedMarketerSeesOnlyTheirAssignedConsultantAsASummary() throws Exception {
        JsonNode page = json(call(login("spec"), get(membersUrl(a) + "?size=100")));
        assertThat(ids(page)).containsExactlyInAnyOrder(mktSpec.getId(), c2.getId());
        for (JsonNode row : page.path("items")) {
            assertThat(row.path("summaryOnly").asBoolean()).isTrue();
            assertThat(row.path("workEmail").isNull()).as("no contact detail through a summary scope").isTrue();
            assertThat(row.path("manager").isNull()).isTrue();
            assertThat(row.path("consentScope").isNull()).isTrue();
            assertThat(row.path("name").asText()).isNotBlank();
        }
    }

    @Test
    void anHrSpecialistSeesEveryoneInFull() throws Exception {
        JsonNode page = json(call(login("hr"), get(membersUrl(a) + "?size=100")));
        assertThat(page.path("total").asInt()).isEqualTo(8);
        for (JsonNode row : page.path("items")) assertThat(row.path("summaryOnly").asBoolean()).isFalse();
    }

    @Test
    void peopleWithNoPeopleKeyGetTheGeneric404() throws Exception {
        for (String who : List.of("plain", "c1", "c2")) assertGeneric404(call(login(who), get(membersUrl(a))), who + " lists");
        assertGeneric404(call(login("plain"), get(membersUrl(a) + "/counts")), "plain counts");
        assertGeneric404(call(login("c1"), get(memberUrl(a, c2))), "a consultant opens a colleague");
        seatWithStatus(a, "susp", OrgRole.ADMIN, OrgMemberStatus.SUSPENDED);
        assertGeneric404(call(login("susp"), get(membersUrl(a))), "a suspended administrator");
        assertGeneric404(call(login("nobody-at-all"), get(membersUrl(a))), "a login that does not exist");
    }

    @Test
    void anotherOrganizationNeverSeesOrCountsOurPeople() throws Exception {
        assertGeneric404(call(login("bowner"), get(membersUrl(a))), "B's owner lists A");
        assertGeneric404(call(login("bowner"), get(membersUrl(a) + "/counts")), "B's owner counts A");
        assertGeneric404(call(login("bowner"), get(memberUrl(a, c1))), "B's owner opens A's member");
        assertGeneric404(call(login("bowner"), get(memberUrl(b, c1))), "B's owner names A's member id inside B");
        assertGeneric404(call(login("bowner"), get(memberUrl(b, c1) + "/activity")), "activity of A's member through B");
        JsonNode own = json(call(login("bowner"), get(membersUrl(b) + "?size=100")));
        assertThat(ids(own)).containsExactlyInAnyOrder(bOwner.getId(), bMember.getId());
        // A's ids used as filters inside B reach nothing
        assertThat(json(call(login("bowner"), get(membersUrl(b) + "?departmentId=" + d1.getId()))).path("total").asInt()).isZero();
        assertThat(json(call(login("bowner"), get(membersUrl(b) + "?teamId=" + t1.getId()))).path("total").asInt()).isZero();
        assertThat(json(call(login("bowner"), get(membersUrl(b) + "?managerId=" + owner.getId()))).path("total").asInt()).isZero();
        Long consultantRole = roleRepo.findSystemByRoleKey("CONSULTANT").orElseThrow().getId();
        assertThat(json(call(login("bowner"), get(membersUrl(b) + "?roleId=" + consultantRole))).path("total").asInt()).as("B has no consultants").isZero();
    }

    @Test
    void anOrganizationWithoutTheEnterpriseFlagStillListsThroughTheLegacyRoles() throws Exception {
        flags(false, false);
        JsonNode page = json(call(login("owner"), get(membersUrl(a) + "?size=100")));
        assertThat(page.path("total").asInt()).isEqualTo(8);
        assertGeneric404(call(login("plain"), get(membersUrl(a))), "a member");
    }

    @Test
    void anAdmittedMemberGetsALastActiveTimeAtMostOncePerHour() throws Exception {
        assertThat(reload(hr).getLastActiveAt()).isNull();
        assertStatus(call(login("hr"), get(membersUrl(a) + "?size=1")), 200);
        Instant first = reload(hr).getLastActiveAt();
        assertThat(first).as("the first admitted call stamps the time").isNotNull();
        assertStatus(call(login("hr"), get(membersUrl(a) + "?size=1")), 200);
        assertThat(reload(hr).getLastActiveAt()).as("a second call inside the hour does not move it").isEqualTo(first);
        JsonNode row = rowOf(json(call(login("owner"), get(membersUrl(a) + "?q=hannah"))), hr);
        assertThat(Instant.parse(row.path("lastActiveAt").asText())).isEqualTo(first);
        // a call that never gets into the organization stamps nothing
        assertGeneric404(call(login("bowner"), get(membersUrl(a))), "another organization's owner");
        assertThat(reload(bOwner).getLastActiveAt()).isNull();
        assertThat(reload(plain).getLastActiveAt()).as("nobody of A who made no call").isNull();
    }

    // ---- tiles ----------------------------------------------------------------------------------------------------------

    @Test
    void aYoungOrganizationHasTheFiguresButNoLastMonthBaseline() throws Exception {
        seatWithStatus(a, "invited", OrgRole.MEMBER, OrgMemberStatus.INVITED);
        seatWithStatus(a, "susp", OrgRole.MEMBER, OrgMemberStatus.SUSPENDED);
        JsonNode c = json(call(login("owner"), get(membersUrl(a) + "/counts")));
        assertThat(c.path("total").path("value").asInt()).isEqualTo(10);
        assertThat(c.path("active").path("value").asInt()).isEqualTo(8);
        assertThat(c.path("invited").path("value").asInt()).isEqualTo(1);
        assertThat(c.path("suspended").path("value").asInt()).isEqualTo(1);
        assertThat(c.path("departments").path("value").asInt()).isEqualTo(2);
        assertThat(c.path("teams").path("value").asInt()).isEqualTo(3);
        assertThat(c.path("scope").asText()).isEqualTo("ORG");
        for (String tile : List.of("total", "active", "invited", "suspended", "departments", "teams")) {
            assertThat(c.path(tile).path("previous").isNull()).as(tile + " has no month-old figure for an organization created just now").isTrue();
            assertThat(c.path(tile).path("delta").isNull()).as(tile + " delta is null, not zero").isTrue();
            assertThat(c.path(tile).path("deltaPercent").isNull()).isTrue();
        }
        assertThat(Instant.parse(c.path("asOf").asText())).isBefore(Instant.now().minus(27, ChronoUnit.DAYS));
    }

    @Test
    void deltasAreRebuiltFromRealSeatTimestampsAndTheAuditTrail() throws Exception {
        Instant now = Instant.now();
        a.setCreatedAt(now.minus(60, ChronoUnit.DAYS));
        orgs.saveAndFlush(a);
        for (OrgMember m : List.of(owner, admin, hr, mktMgr, mktSpec, c1, c2, plain)) back(m, 60, 59);
        OrgMember s2 = extra(a, "s2", OrgRole.MEMBER, "Sue", "Two");
        back(s2, 12, 10); // joined 10 days ago: not here a month ago
        OrgMember s3 = seatWithStatus(a, "s3", OrgRole.MEMBER, OrgMemberStatus.INVITED);
        back(s3, 5, 0);
        s3.setJoinedAt(null);
        members.saveAndFlush(s3);
        OrgMember s4 = seatWithStatus(a, "s4", OrgRole.MEMBER, OrgMemberStatus.SUSPENDED);
        back(s4, 45, 44); // suspended three days ago: a month ago they were active
        audit(MEMBER_SUSPEND, s4, now.minus(3, ChronoUnit.DAYS));
        OrgMember s5 = seatWithStatus(a, "s5", OrgRole.MEMBER, OrgMemberStatus.REMOVED);
        back(s5, 40, 39);
        s5.setLeftAt(now.minus(5, ChronoUnit.DAYS)); // left five days ago: a month ago they were here
        members.saveAndFlush(s5);
        d1.setCreatedAt(now.minus(60, ChronoUnit.DAYS));
        t1.setCreatedAt(now.minus(60, ChronoUnit.DAYS));
        t2.setCreatedAt(now.minus(60, ChronoUnit.DAYS));
        d2.setCreatedAt(now.minus(2, ChronoUnit.DAYS));
        t3.setCreatedAt(now.minus(1, ChronoUnit.DAYS));
        for (var g : List.of(d1, d2, t1, t2, t3)) groups.saveAndFlush(g);

        JsonNode c = json(call(login("owner"), get(membersUrl(a) + "/counts")));
        // now: active 9 (the eight plus s2), invited 1, suspended 1 -> 11. A month ago: the eight plus s4 plus s5 active -> 10.
        assertTile(c, "total", 11, 10L, 1L, 10.0);
        assertTile(c, "active", 9, 10L, -1L, -10.0);
        assertTile(c, "invited", 1, 0L, 1L, null);
        assertTile(c, "suspended", 1, 0L, 1L, null);
        assertTile(c, "departments", 2, 1L, 1L, 100.0);
        assertTile(c, "teams", 3, 2L, 1L, 50.0);
    }

    @Test
    void aSuspensionNobodyAuditedMakesTheActiveAndSuspendedFiguresUnknownButNotTheTotal() throws Exception {
        Instant now = Instant.now();
        a.setCreatedAt(now.minus(60, ChronoUnit.DAYS));
        orgs.saveAndFlush(a);
        for (OrgMember m : List.of(owner, admin, hr, mktMgr, mktSpec, c1, c2, plain)) back(m, 60, 59);
        OrgMember s4 = seatWithStatus(a, "s4", OrgRole.MEMBER, OrgMemberStatus.SUSPENDED);
        back(s4, 45, 44); // suspended with no audit row at all: since when is unknowable
        JsonNode c = json(call(login("owner"), get(membersUrl(a) + "/counts")));
        assertThat(c.path("total").path("previous").asLong()).isEqualTo(9);
        assertThat(c.path("invited").path("previous").asLong()).isZero();
        assertThat(c.path("active").path("previous").isNull()).isTrue();
        assertThat(c.path("active").path("delta").isNull()).isTrue();
        assertThat(c.path("suspended").path("previous").isNull()).isTrue();
    }

    @Test
    void aSeatThatEndedWithNoRecordedTimeMakesTheTotalsUnknown() throws Exception {
        Instant now = Instant.now();
        a.setCreatedAt(now.minus(60, ChronoUnit.DAYS));
        orgs.saveAndFlush(a);
        for (OrgMember m : List.of(owner, admin, hr, mktMgr, mktSpec, c1, c2, plain)) back(m, 60, 59);
        OrgMember gone = seatWithStatus(a, "gone", OrgRole.MEMBER, OrgMemberStatus.REMOVED);
        back(gone, 40, 39); // removed, left_at null, no audit row: when did they leave?
        JsonNode c = json(call(login("owner"), get(membersUrl(a) + "/counts")));
        assertThat(c.path("total").path("value").asInt()).isEqualTo(8);
        assertThat(c.path("total").path("previous").isNull()).isTrue();
        assertThat(c.path("invited").path("previous").isNull()).isTrue();
        assertThat(c.path("active").path("previous").isNull()).isTrue();
        // an audited end is enough
        audit("MEMBER_REMOVE", gone, now.minus(5, ChronoUnit.DAYS));
        JsonNode known = json(call(login("owner"), get(membersUrl(a) + "/counts")));
        assertThat(known.path("total").path("previous").asLong()).isEqualTo(9);
    }

    @Test
    void aGroupDeletedSinceLastMonthMakesTheGroupHistoryUnknown() throws Exception {
        Instant now = Instant.now();
        a.setCreatedAt(now.minus(60, ChronoUnit.DAYS));
        orgs.saveAndFlush(a);
        OrgAuditEvent e = new OrgAuditEvent();
        e.setOrgId(a.getId());
        e.setActorLogin(login("owner"));
        e.setActorRole("OWNER");
        e.setAction(OrgAuditService.GROUP_DELETE);
        e.setTargetType(OrgAuditService.TARGET_GROUP);
        e.setTargetId("999");
        e.setCreatedAt(now.minus(2, ChronoUnit.DAYS));
        audit.save(e);
        JsonNode c = json(call(login("owner"), get(membersUrl(a) + "/counts")));
        assertThat(c.path("departments").path("value").asInt()).isEqualTo(2);
        assertThat(c.path("departments").path("previous").isNull()).as("a deleted group leaves no row to count").isTrue();
        assertThat(c.path("teams").path("previous").isNull()).isTrue();
    }

    // ---- the detail sheet -------------------------------------------------------------------------------------------------

    @Test
    void theSheetShowsTheSeatTheRolesTheGroupsAndWhatTheCallerMayDo() throws Exception {
        c1.setManagerMemberId(mktMgr.getId());
        c1.setTitle("Senior consultant");
        members.saveAndFlush(c1);
        dataShare.grant(me(c1), ShareScope.SUMMARY, null, OrgShareConsent.CURRENT, DataShareService.ShareContext.EMPTY);
        MvcResult r = call(login("owner"), get(memberUrl(a, c1)));
        assertStatus(r, 200);
        JsonNode d = json(r);
        assertThat(d.path("id").asLong()).isEqualTo(c1.getId());
        assertThat(d.path("name").asText()).isEqualTo("Anika Khan");
        assertThat(d.path("workEmail").asText()).isEqualTo(login("c1") + "@example.com");
        assertThat(d.path("status").asText()).isEqualTo("ACTIVE");
        assertThat(d.path("title").asText()).isEqualTo("Senior consultant");
        assertThat(d.path("primaryRoleKey").asText()).isEqualTo("CONSULTANT");
        assertThat(d.path("department").path("name").asText()).isEqualTo("Delivery");
        assertThat(d.path("team").path("name").asText()).isEqualTo("Bench NY");
        assertThat(d.path("manager").path("name").asText()).isEqualTo("Maria Lopez");
        assertThat(d.path("consentScope").asText()).isEqualTo("SUMMARY");
        assertThat(d.path("summaryOnly").asBoolean()).isFalse();
        assertThat(d.path("phone").isNull()).as("the platform stores no phone for a member: null, never invented").isTrue();
        assertThat(d.path("location").isNull()).isTrue();
        assertThat(d.path("timezone").isNull()).isTrue();
        assertThat(d.path("joinedAt").isNull()).isFalse();
        JsonNode actions = d.path("actions");
        assertThat(actions.path("edit").asBoolean()).isTrue();
        assertThat(actions.path("manageRoles").asBoolean()).isTrue();
        assertThat(actions.path("suspend").asBoolean()).isTrue();
        assertThat(actions.path("reinstate").asBoolean()).isFalse();
        assertThat(actions.path("offboard").asBoolean()).isTrue();
        assertThat(r.getResponse().getHeader("ETag")).isEqualTo(d.path("version").asText()).startsWith("W/\"");
        // nothing a person owns personally is on the sheet
        String raw = r.getResponse().getContentAsString().toLowerCase();
        assertThat(raw).doesNotContain("resume").doesNotContain("application").doesNotContain("dateofbirth").doesNotContain("ssn").doesNotContain("password");

        JsonNode mgr = json(call(login("owner"), get(memberUrl(a, mktMgr))));
        assertThat(mgr.path("directReports")).hasSize(1);
        assertThat(mgr.path("directReports").get(0).path("name").asText()).isEqualTo("Anika Khan");
    }

    @Test
    void theCallersOwnSheetCannotBeSuspendedOrOffboardedByThem() throws Exception {
        JsonNode d = json(call(login("owner"), get(memberUrl(a, owner))));
        assertThat(d.path("actions").path("suspend").asBoolean()).isFalse();
        assertThat(d.path("actions").path("offboard").asBoolean()).isFalse();
        assertThat(d.path("actions").path("manageRoles").asBoolean()).as("nobody changes their own roles").isFalse();
    }

    @Test
    void aSuspendedPersonShowsReinstateNotSuspend() throws Exception {
        OrgMember s = seatWithStatus(a, "susp", OrgRole.MEMBER, OrgMemberStatus.SUSPENDED);
        JsonNode d = json(call(login("owner"), get(memberUrl(a, s))));
        assertThat(d.path("status").asText()).isEqualTo("SUSPENDED");
        assertThat(d.path("actions").path("suspend").asBoolean()).isFalse();
        assertThat(d.path("actions").path("reinstate").asBoolean()).isTrue();
    }

    @Test
    void aSummaryScopeSeesASummarySheetAndNothingOutsideItsScope() throws Exception {
        MvcResult r = call(login("spec"), get(memberUrl(a, c2)));
        assertStatus(r, 200);
        JsonNode d = json(r);
        assertThat(d.path("summaryOnly").asBoolean()).isTrue();
        assertThat(d.path("workEmail").isNull()).isTrue();
        assertThat(d.path("manager").isNull()).isTrue();
        assertThat(d.path("phone").isNull()).isTrue();
        assertThat(d.path("recentActivity")).isEmpty();
        assertThat(d.path("directReports")).isEmpty();
        assertThat(d.path("actions").path("edit").asBoolean()).isFalse();
        assertThat(d.path("actions").path("suspend").asBoolean()).isFalse();
        assertThat(d.path("actions").path("offboard").asBoolean()).isFalse();
        assertThat(d.path("name").asText()).isEqualTo("Anita Rao");
        assertGeneric404(call(login("spec"), get(memberUrl(a, c1))), "a consultant not assigned to the marketer");
        assertGeneric404(call(login("spec"), get(memberUrl(a, owner))), "the owner's sheet");
        assertGeneric404(call(login("mgr"), get(memberUrl(a, c2))), "a consultant of another team");
        assertStatus(call(login("mgr"), get(memberUrl(a, c1))), 200);
    }

    @Test
    void anErasedOrForeignOrMissingSeatIsTheSame404() throws Exception {
        OrgMember erased = seatWithStatus(a, "erased", OrgRole.MEMBER, OrgMemberStatus.ERASED);
        assertGeneric404(call(login("owner"), get(memberUrl(a, erased))), "erased");
        assertGeneric404(call(login("owner"), get(memberUrl(a, bMember))), "another organization's member id");
        assertGeneric404(call(login("owner"), get(membersUrl(a) + "/999999999")), "missing");
        assertGeneric404(call(login("owner"), get(membersUrl(a) + "/0")), "zero");
    }

    // ---- activity ---------------------------------------------------------------------------------------------------------

    @Test
    void activityListsRowsAboutAMemberAndRowsByThem() throws Exception {
        audit("MEMBER_SUSPEND", c1, Instant.now().minus(3, ChronoUnit.HOURS));
        audit("MEMBER_REINSTATE", c1, Instant.now().minus(2, ChronoUnit.HOURS));
        OrgAuditEvent byC1 = new OrgAuditEvent();
        byC1.setOrgId(a.getId());
        byC1.setActorLogin(login("c1"));
        byC1.setActorRole("MEMBER");
        byC1.setAction(OrgAuditService.SHARE_SCOPE_CHANGED);
        byC1.setTargetType(OrgAuditService.TARGET_MEMBER);
        byC1.setTargetId(String.valueOf(c1.getId()));
        audit.save(byC1);

        JsonNode on = json(call(login("owner"), get(memberUrl(a, c1) + "/activity")));
        assertThat(on.path("direction").asText()).isEqualTo("on");
        assertThat(on.path("total").asInt()).isEqualTo(3);
        assertThat(on.path("items").get(0).path("action").asText()).as("newest first").isEqualTo(OrgAuditService.SHARE_SCOPE_CHANGED);
        assertThat(on.path("items").get(1).path("action").asText()).isEqualTo("MEMBER_REINSTATE");
        assertThat(on.path("items").get(0).path("actor").path("name").asText()).isEqualTo("Anika Khan");

        JsonNode by = json(call(login("owner"), get(memberUrl(a, c1) + "/activity?direction=by")));
        assertThat(by.path("total").asInt()).isEqualTo(1);

        JsonNode paged = json(call(login("owner"), get(memberUrl(a, c1) + "/activity?size=1&page=1")));
        assertThat(paged.path("items")).hasSize(1);
        assertThat(paged.path("hasNext").asBoolean()).isTrue();
        assertThat(paged.path("total").asInt()).isEqualTo(3);

        assertCode(call(login("owner"), get(memberUrl(a, c1) + "/activity?direction=sideways")), 400, "FILTER_INVALID");
        assertCode(call(login("owner"), get(memberUrl(a, c1) + "/activity?size=500")), 400, "FILTER_INVALID");
        assertStatus(call(login("hr"), get(memberUrl(a, c1) + "/activity")), 200);
        assertGeneric404(call(login("mgr"), get(memberUrl(a, c1) + "/activity")), "a manager without audit.view or hr.view");
        assertGeneric404(call(login("spec"), get(memberUrl(a, c2) + "/activity")), "a marketer");
    }

    @Test
    void theSheetCarriesTheMostRecentActivityForThoseWhoMayReadIt() throws Exception {
        audit("MEMBER_SUSPEND", c1, Instant.now().minus(3, ChronoUnit.HOURS));
        JsonNode d = json(call(login("owner"), get(memberUrl(a, c1))));
        assertThat(d.path("recentActivity")).hasSize(1);
        assertThat(d.path("recentActivity").get(0).path("action").asText()).isEqualTo("MEMBER_SUSPEND");
        JsonNode forManager = json(call(login("mgr"), get(memberUrl(a, c1))));
        assertThat(forManager.path("recentActivity")).as("a manager has neither audit.view nor hr.view").isEmpty();
    }

    // ---- helpers ------------------------------------------------------------------------------------------------------------

    private static final String MEMBER_SUSPEND = "MEMBER_SUSPEND";

    private JsonNode rowOf(JsonNode page, OrgMember m) {
        for (JsonNode n : page.path("items")) if (n.path("id").asLong() == m.getId()) return n;
        throw new AssertionError("member " + m.getId() + " is not on the page " + ids(page));
    }

    private void back(OrgMember m, int createdDaysAgo, int joinedDaysAgo) {
        Instant now = Instant.now();
        m.setCreatedAt(now.minus(createdDaysAgo, ChronoUnit.DAYS));
        m.setJoinedAt(now.minus(joinedDaysAgo, ChronoUnit.DAYS));
        members.saveAndFlush(m);
    }

    private void audit(String action, OrgMember target, Instant at) {
        OrgAuditEvent e = new OrgAuditEvent();
        e.setOrgId(a.getId());
        e.setActorLogin(login("owner"));
        e.setActorRole("OWNER");
        e.setAction(action);
        e.setTargetType(OrgAuditService.TARGET_MEMBER);
        e.setTargetId(String.valueOf(target.getId()));
        e.setCreatedAt(at);
        audit.save(e);
    }

    private OrgMembership me(OrgMember seat) {
        return new OrgMembership(a.getId(), seat.getId(), seat.getUserId(), users.findById(seat.getUserId()).orElseThrow().getLogin(), seat.getRole(), seat.getStatus(), a.getStatus());
    }

    private static void assertTile(JsonNode counts, String tile, long value, Long previous, Long delta, Double pct) {
        JsonNode t = counts.path(tile);
        assertThat(t.path("value").asLong()).as(tile + " value").isEqualTo(value);
        assertThat(t.path("previous").asLong()).as(tile + " previous").isEqualTo(previous);
        assertThat(t.path("delta").asLong()).as(tile + " delta").isEqualTo(delta);
        if (pct == null) assertThat(t.path("deltaPercent").isNull()).as(tile + " percent undefined against zero").isTrue();
        else assertThat(t.path("deltaPercent").asDouble()).as(tile + " percent").isEqualTo(pct);
    }
}
