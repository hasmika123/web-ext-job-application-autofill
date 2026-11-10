package com.dossier.api.web.rest.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.Bio;
import com.dossier.api.domain.User;
import com.dossier.api.domain.ent.OrgMemberOffboarding;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.enumeration.ShareScope;
import com.dossier.api.domain.org.OrgAuditEvent;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.ent.OrgMemberOffboardingRepository;
import com.dossier.api.repository.org.DataShareRepository;
import com.dossier.api.service.ent.members.OrgOffboardingService;
import com.dossier.api.service.org.DataShareService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgShareConsent;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * X4.4 through the real chain: suspend, reinstate and offboard (now, scheduled, cancelled), the preview of the wizard, every guard (not yourself, rank,
 * the last owner and administrator, an owner must transfer), typed confirmation, idempotency, one audit row per transition with its risk, records kept
 * (the person's own data untouched), and the doc 42 negatives.
 *
 * <p>Tests that run the scheduled job do so before any refused call: a refusal thrown through a transactional service marks the test's own
 * surrounding transaction rollback-only, and the job's per-row savepoint cannot be opened inside one (production requests each have their own).
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class OrgMemberLifecycleIT extends MemberItSupport {

    @Autowired private OrgOffboardingService offboardingService;
    @Autowired private OrgMemberOffboardingRepository offboardingRows;
    @Autowired private DataShareService dataShare;
    @Autowired private DataShareRepository shares;

    private static final String REASON = "Left the company after notice";

    private MvcResult suspend(String login, OrgMember m, String body) throws Exception {
        return call(login, post(memberUrl(a, m) + "/suspend"), body, null, null);
    }

    private MvcResult reinstate(String login, OrgMember m, String body) throws Exception {
        return call(login, post(memberUrl(a, m) + "/reinstate"), body, null, null);
    }

    private MvcResult offboard(String login, OrgMember m, String body) throws Exception {
        return call(login, post(memberUrl(a, m) + "/offboard"), body, null, key());
    }

    private String confirmBody(String name) {
        return "{\"reason\":\"" + REASON + "\",\"confirm\":\"" + name + "\"}";
    }

    private OrgMembership me(OrgMember seat) {
        return new OrgMembership(a.getId(), seat.getId(), seat.getUserId(), users.findById(seat.getUserId()).orElseThrow().getLogin(), seat.getRole(), seat.getStatus(), a.getStatus());
    }

    // ---- suspend and reinstate ----------------------------------------------------------------------------------------

    @Test
    void suspendingKeepsTheSeatAndStopsTheNextCall() throws Exception {
        long before = auditCount(a);
        MvcResult r = suspend(login("hr"), plain, "{\"reason\":\"Pending an access review\"}");
        assertStatus(r, 200);
        JsonNode res = json(r);
        assertThat(res.path("action").asText()).isEqualTo("SUSPEND");
        assertThat(res.path("previousStatus").asText()).isEqualTo("ACTIVE");
        assertThat(res.path("status").asText()).isEqualTo("SUSPENDED");
        assertThat(reload(plain).getStatus()).isEqualTo(OrgMemberStatus.SUSPENDED);
        assertThat(auditCount(a) - before).isEqualTo(1);
        OrgAuditEvent e = newestAudit(a);
        assertThat(e.getAction()).isEqualTo("MEMBER_SUSPEND");
        assertThat(e.getRisk()).isEqualTo("HIGH");
        assertThat(e.getDetails()).contains("Pending an access review");
        assertThat(e.getTargetId()).isEqualTo(String.valueOf(plain.getId()));
        assertThat(e.getActorLogin()).isEqualTo(login("hr"));
        // the roles and the seat stay; the person is out at the next call
        assertThat(roleKeysOf(plain)).containsExactly("MEMBER");
        assertGeneric404(call(login("plain"), get("/api/orgs/" + a.getId())), "a suspended member's next call");
        // the board shows it
        JsonNode sheet = json(call(login("owner"), get(memberUrl(a, plain))));
        assertThat(sheet.path("status").asText()).isEqualTo("SUSPENDED");
        assertThat(sheet.path("actions").path("reinstate").asBoolean()).isTrue();
        assertThat(sheet.path("recentActivity").get(0).path("action").asText()).isEqualTo("MEMBER_SUSPEND");
    }

    @Test
    void reinstatingBringsThemBack() throws Exception {
        assertStatus(suspend(login("hr"), plain, "{\"reason\":\"Pending an access review\"}"), 200);
        long before = auditCount(a);
        MvcResult r = reinstate(login("hr"), plain, "{\"reason\":\"Review closed with no findings\"}");
        assertStatus(r, 200);
        assertThat(json(r).path("status").asText()).isEqualTo("ACTIVE");
        assertThat(auditCount(a) - before).isEqualTo(1);
        assertThat(newestAudit(a).getAction()).isEqualTo("MEMBER_REINSTATE");
        assertThat(newestAudit(a).getRisk()).isEqualTo("MEDIUM");
        assertStatus(call(login("plain"), get("/api/orgs/" + a.getId())), 200);
        // the reason is optional, and so is the body
        assertStatus(suspend(login("hr"), plain, "{\"reason\":\"Second review needed\"}"), 200);
        assertStatus(call(login("hr"), post(memberUrl(a, plain) + "/reinstate")), 200);
    }

    @Test
    void suspendingNeedsAReasonOfTenToFiveHundredCharacters() throws Exception {
        assertCode(suspend(login("hr"), plain, null), 422, "ORG_INVALID");
        assertCode(suspend(login("hr"), plain, "{}"), 422, "ORG_INVALID");
        assertCode(suspend(login("hr"), plain, "{\"reason\":\"too short\"}"), 422, "ORG_INVALID");
        assertCode(suspend(login("hr"), plain, "{\"reason\":\"" + "r".repeat(501) + "\"}"), 422, "ORG_INVALID");
        assertCode(suspend(login("hr"), plain, "{\"reason\":\"<script>alert(1)</script> reason\"}"), 422, "ORG_INVALID");
        assertStatus(suspend(login("hr"), plain, "{\"reason\":\"" + "r".repeat(500) + "\"}"), 200);
    }

    @Test
    void aReasonMayNotCarryDataThePlatformNeverCollects() throws Exception {
        MvcResult r = suspend(login("hr"), plain, "{\"reason\":\"Social security number 123-45-6789 on file\"}");
        assertThat(r.getResponse().getStatus()).isEqualTo(422);
        assertThat(r.getResponse().getContentAsString()).doesNotContain("123-45-6789");
        assertThat(reload(plain).getStatus()).isEqualTo(OrgMemberStatus.ACTIVE);
    }

    @Test
    void theGuardsOfSuspend() throws Exception {
        long before = auditCount(a);
        assertCode(suspend(login("owner"), owner, "{\"reason\":\"Suspending myself\"}"), 409, "SELF");
        assertCode(suspend(login("hr"), hr, "{\"reason\":\"Suspending myself\"}"), 409, "SELF");
        MvcResult rank = suspend(login("hr"), admin, "{\"reason\":\"People ops above their rank\"}");
        assertCode(rank, 422, "ROLE_CEILING");
        assertThat(rank.getResponse().getContentAsString()).contains("TARGET_RANK");
        assertCode(suspend(login("admin"), owner, "{\"reason\":\"An admin above their rank\"}"), 422, "ROLE_CEILING");
        assertCode(reinstate(login("hr"), plain, null), 409, "INVALID_TRANSITION");
        assertThat(auditCount(a)).as("a refusal writes nothing").isEqualTo(before);
        for (OrgMember m : List.of(owner, hr, admin, plain)) assertThat(reload(m).getStatus()).isEqualTo(OrgMemberStatus.ACTIVE);
        // an owner may suspend an administrator
        assertStatus(suspend(login("owner"), admin, "{\"reason\":\"Admin on leave of absence\"}"), 200);
    }

    @Test
    void suspendingTwiceIsAnInvalidTransitionThatNamesWhatIsAllowed() throws Exception {
        assertStatus(suspend(login("hr"), plain, "{\"reason\":\"Pending an access review\"}"), 200);
        MvcResult r = suspend(login("hr"), plain, "{\"reason\":\"Pending an access review\"}");
        assertCode(r, 409, "INVALID_TRANSITION");
        assertThat(json(r).path("from").asText()).isEqualTo("SUSPENDED");
        assertThat(json(r).path("to").asText()).isEqualTo("SUSPENDED");
        assertThat(json(r).path("allowed").get(0).asText()).isEqualTo("ACTIVE");
    }

    @Test
    void aCallerWhoIsNotAnOwnerCannotSuspendTheOwnerHoweverMuchTheyHold() throws Exception {
        superActor("sup");
        MvcResult r = suspend(login("sup"), owner, "{\"reason\":\"Trying to lock the org out\"}");
        assertCode(r, 422, "ROLE_CEILING");
        assertThat(r.getResponse().getContentAsString()).contains("TARGET_RANK");
        assertThat(reload(owner).getStatus()).isEqualTo(OrgMemberStatus.ACTIVE);
    }

    @Test
    void theLastAdministratorInServiceCannotBeSuspended() throws Exception {
        superActor("sup");
        owner.setStatus(OrgMemberStatus.SUSPENDED); // the only other administrator-level seat is out of service
        members.saveAndFlush(owner);
        assertCode(suspend(login("sup"), admin, "{\"reason\":\"Trying to lock the org out\"}"), 409, "LAST_ADMIN");
        assertThat(reload(admin).getStatus()).isEqualTo(OrgMemberStatus.ACTIVE);
    }

    @Test
    void withASecondOwnerTheFirstMayBeSuspended() throws Exception {
        extra(a, "owner2", OrgRole.OWNER, "Second", "Owner");
        assertStatus(suspend(login("owner2"), owner, "{\"reason\":\"First owner on leave of absence\"}"), 200);
        assertThat(reload(owner).getStatus()).isEqualTo(OrgMemberStatus.SUSPENDED);
    }

    @Test
    void peopleWhoMayNotSuspendGetTheGenericNotFound() throws Exception {
        for (String who : List.of("mgr", "spec", "plain", "c1")) assertGeneric404(suspend(login(who), c2, "{\"reason\":\"Pending an access review\"}"), who);
        assertGeneric404(suspend(login("hr"), bMember, "{\"reason\":\"Another organization's member\"}"), "another organization's member by id");
        assertGeneric404(suspend(login("bowner"), c1, "{\"reason\":\"Another organization's owner\"}"), "B's owner on A's member through A's path");
        assertGeneric404(call(login("bowner"), post(memberUrl(b, c1) + "/suspend"), "{\"reason\":\"Another organization's owner\"}"), "B's owner with B's org id and A's member id");
        assertGeneric404(suspend(login("hr"), new OrgMemberRef(999999999L), "{\"reason\":\"A member that does not exist\"}"), "missing");
        assertThat(reload(c1).getStatus()).isEqualTo(OrgMemberStatus.ACTIVE);
        assertThat(reload(bMember).getStatus()).isEqualTo(OrgMemberStatus.ACTIVE);
    }

    @Test
    void aSuspendedOrganizationRefusesPeopleTransitions() throws Exception {
        a.setStatus(OrgStatus.SUSPENDED);
        orgs.saveAndFlush(a);
        assertGeneric404(suspend(login("owner"), plain, "{\"reason\":\"Pending an access review\"}"), "suspend");
        assertGeneric404(offboard(login("owner"), plain, confirmBody("Pat Plain")), "offboard");
    }

    @Test
    void anIdempotencyKeyOnSuspendReplaysWithoutASecondRow() throws Exception {
        String k = key();
        MvcResult first = call(login("hr"), post(memberUrl(a, plain) + "/suspend"), "{\"reason\":\"Pending an access review\"}", null, k);
        assertStatus(first, 200);
        long audits = auditCount(a);
        MvcResult replay = call(login("hr"), post(memberUrl(a, plain) + "/suspend"), "{\"reason\":\"Pending an access review\"}", null, k);
        assertStatus(replay, 200);
        assertThat(replay.getResponse().getHeader("Idempotent-Replayed")).isEqualTo("true");
        assertThat(auditCount(a)).isEqualTo(audits);
        assertCode(call(login("hr"), post(memberUrl(a, c1) + "/suspend"), "{\"reason\":\"Pending an access review\"}", null, k), 422, "IDEMPOTENCY_KEY_REUSED");
    }

    // ---- the offboarding wizard ----------------------------------------------------------------------------------------

    @Test
    void thePreviewListsEveryEffectInTheOrderTheyRun() throws Exception {
        dataShare.grant(me(c2), ShareScope.SUMMARY, null, OrgShareConsent.CURRENT, DataShareService.ShareContext.EMPTY);
        MvcResult r = call(login("owner"), get(memberUrl(a, c2) + "/offboard-preview"));
        assertStatus(r, 200);
        JsonNode p = json(r);
        assertThat(p.path("name").asText()).isEqualTo("Anita Rao");
        assertThat(p.path("status").asText()).isEqualTo("ACTIVE");
        assertThat(p.path("blockers")).isEmpty();
        assertThat(p.path("rolesEnded")).extracting(JsonNode::asText).containsExactly("Consultant");
        assertThat(p.path("consentScope").asText()).isEqualTo("SUMMARY");
        assertThat(p.path("licenseNotice").asText()).isEqualTo("License ends now; the paid period isn't refunded");
        assertThat(p.path("recordsKept")).isNotEmpty();
        List<String> hooks = new ArrayList<>();
        for (JsonNode l : p.path("lines")) hooks.add(l.path("hook").asText());
        assertThat(hooks).containsExactly("sessions", "assignments", "consent");
        assertThat(p.path("lines").get(1).path("text").asText()).contains("assignment");
        assertThat(p.path("lines").get(2).path("text").asText()).contains("SUMMARY");
    }

    @Test
    void thePreviewReportsBlockersInsteadOfFailing() throws Exception {
        JsonNode self = json(call(login("owner"), get(memberUrl(a, owner) + "/offboard-preview")));
        assertThat(codes(self)).contains("SELF", "OWNER_MUST_TRANSFER");
        JsonNode adminOnOwner = json(call(login("admin"), get(memberUrl(a, owner) + "/offboard-preview")));
        assertThat(codes(adminOnOwner)).contains("ROLE_CEILING", "OWNER_MUST_TRANSFER");
        OrgMember removed = seatWithStatus(a, "gone", OrgRole.MEMBER, OrgMemberStatus.REMOVED);
        assertThat(codes(json(call(login("owner"), get(memberUrl(a, removed) + "/offboard-preview"))))).contains("INVALID_TRANSITION");
        assertGeneric404(call(login("hr"), get(memberUrl(a, c1) + "/offboard-preview")), "HR holds members.suspend, not members.remove");
        assertGeneric404(call(login("bowner"), get(memberUrl(a, c1) + "/offboard-preview")), "another organization's owner");
    }

    @Test
    void offboardingNowEndsTheSeatAndKeepsEveryRecord() throws Exception {
        User user = users.findById(c2.getUserId()).orElseThrow();
        Bio bio = new Bio();
        bio.setPayload("{\"summary\":\"Anita's own profile\"}");
        bio.setUpdatedAt(Instant.now());
        bio.setUser(user);
        em.persist(bio);
        dataShare.grant(me(c2), ShareScope.SUMMARY, null, OrgShareConsent.CURRENT, DataShareService.ShareContext.EMPTY);
        long before = auditCount(a);

        MvcResult r = offboard(login("owner"), c2, confirmBody("anita RAO "));
        assertStatus(r, 200);
        JsonNode res = json(r);
        assertThat(res.path("action").asText()).isEqualTo("OFFBOARD");
        assertThat(res.path("previousStatus").asText()).isEqualTo("ACTIVE");
        assertThat(res.path("status").asText()).isEqualTo("REMOVED");
        assertThat(res.path("scheduled").isNull()).isTrue();
        assertThat(res.path("lines")).hasSizeGreaterThanOrEqualTo(3);

        OrgMember gone = reload(c2);
        assertThat(gone.getStatus()).isEqualTo(OrgMemberStatus.REMOVED);
        assertThat(gone.getLeftAt()).isNotNull();
        assertThat(gone.getUserId()).as("the seat row keeps its history").isEqualTo(user.getId());
        assertThat(memberRoleRepo.findLiveByOrgIdAndMemberId(a.getId(), c2.getId())).as("roles ended, rows kept").isEmpty();
        assertThat(shares.findByOrgIdAndMemberId(a.getId(), c2.getId()).orElseThrow().getScope()).as("consent ended").isEqualTo(ShareScope.NONE);
        assertThat(auditCount(a) - before).isEqualTo(1);
        OrgAuditEvent e = newestAudit(a);
        assertThat(e.getAction()).isEqualTo("MEMBER_REMOVE");
        assertThat(e.getRisk()).isEqualTo("HIGH");
        assertThat(e.getDetails()).contains(REASON).contains("\"mode\":\"IMMEDIATE\"").contains("sessions").contains("assignments").contains("consent");
        // her next call is refused, and what she owns personally is untouched
        assertGeneric404(call(login("c2"), get("/api/orgs/" + a.getId())), "a removed member's next call");
        User still = users.findById(user.getId()).orElseThrow();
        assertThat(still.isActivated()).isTrue();
        assertThat(em.find(Bio.class, bio.getId()).getPayload()).isEqualTo("{\"summary\":\"Anita's own profile\"}");
        // the board: gone from the default list, there under REMOVED, the sheet still opens
        assertThat(ids(json(call(login("owner"), get(membersUrl(a) + "?size=100"))))).doesNotContain(c2.getId());
        assertThat(ids(json(call(login("owner"), get(membersUrl(a) + "?status=REMOVED"))))).containsExactly(c2.getId());
        assertThat(json(call(login("owner"), get(memberUrl(a, c2)))).path("status").asText()).isEqualTo("REMOVED");
        // a removed person is re-invited as a new seat: the old row frees the account slot
        OrgMember fresh = fx.seat(a, login("c2"), OrgRole.MEMBER, OrgMemberStatus.ACTIVE);
        assertThat(fresh.getId()).isNotEqualTo(c2.getId());
        assertThat(reload(c2).getStatus()).isEqualTo(OrgMemberStatus.REMOVED);
    }

    @Test
    void anAssignmentOfThePersonIsNotTouchedUntilTheAssignmentsModuleOwnsIt() throws Exception {
        assertStatus(offboard(login("owner"), mktSpec, confirmBody("Sam Spec")), 200);
        // the stub hook is an extension point: the assignment row is still there for X4.7 to end properly
        em.flush();
        assertThat(assignments.countByOrgId(a.getId())).isEqualTo(1);
    }

    @Test
    void theTypedConfirmationAndTheReasonAreRequired() throws Exception {
        assertCode(offboard(login("owner"), c2, "{\"reason\":\"" + REASON + "\"}"), 422, "CONFIRM_MISMATCH");
        assertCode(offboard(login("owner"), c2, confirmBody("Somebody Else")), 422, "CONFIRM_MISMATCH");
        assertCode(offboard(login("owner"), c2, "{\"confirm\":\"Anita Rao\"}"), 422, "ORG_INVALID");
        assertCode(offboard(login("owner"), c2, "{\"reason\":\"too short\",\"confirm\":\"Anita Rao\"}"), 422, "ORG_INVALID");
        assertCode(offboard(login("owner"), c2, "{\"reason\":\"" + REASON + "\",\"confirm\":\"Anita Rao\",\"effectiveAt\":\"2099-01-01T00:00:00Z\"}"), 422, "ORG_INVALID");
        assertCode(offboard(login("owner"), c2, "{\"reason\":\"" + REASON + "\",\"confirm\":\"Anita Rao\",\"reassignments\":[{\"consultantMemberId\":null,\"newAssigneeMemberId\":1}]}"), 422, "ORG_INVALID");
        assertThat(reload(c2).getStatus()).isEqualTo(OrgMemberStatus.ACTIVE);
    }

    @Test
    void theGuardsOfOffboarding() throws Exception {
        long before = auditCount(a);
        assertCode(offboard(login("owner"), owner, confirmBody("Olivia Owner")), 409, "SELF");
        assertCode(offboard(login("owner"), plain, confirmBody("Wrong Name")), 422, "CONFIRM_MISMATCH");
        assertCode(offboard(login("admin"), owner, confirmBody("Olivia Owner")), 422, "ROLE_CEILING");
        assertGeneric404(offboard(login("hr"), c1, confirmBody("Anika Khan")), "HR may suspend but not remove");
        assertGeneric404(offboard(login("mgr"), c1, confirmBody("Anika Khan")), "a team manager");
        assertGeneric404(offboard(login("plain"), c1, confirmBody("Anika Khan")), "a member");
        assertThat(reload(owner).getStatus()).isEqualTo(OrgMemberStatus.ACTIVE);
        assertThat(reload(plain).getStatus()).isEqualTo(OrgMemberStatus.ACTIVE);
        assertThat(auditCount(a)).as("every refusal wrote nothing").isEqualTo(before);
    }

    @Test
    void anOwnerMustTransferBeforeTheyCanBeOffboarded() throws Exception {
        OrgMember second = extra(a, "owner2", OrgRole.OWNER, "Second", "Owner");
        MvcResult r = offboard(login("owner2"), owner, confirmBody("Olivia Owner"));
        assertCode(r, 409, "OWNER_MUST_TRANSFER");
        assertThat(reload(owner).getStatus()).isEqualTo(OrgMemberStatus.ACTIVE);
        // once the Owner role has moved away from the person (the roles API), the former owner can be offboarded
        assign(owner, "ORG_ADMIN");
        assertStatus(offboard(login("owner2"), owner, confirmBody("Olivia Owner")), 200);
        assertThat(reload(owner).getStatus()).isEqualTo(OrgMemberStatus.REMOVED);
        assertThat(reload(second).getStatus()).isEqualTo(OrgMemberStatus.ACTIVE);
    }

    @Test
    void theLastAdministratorCannotBeOffboarded() throws Exception {
        superActor("sup");
        owner.setStatus(OrgMemberStatus.SUSPENDED); // the only other administrator-level seat is out of service
        members.saveAndFlush(owner);
        assertCode(offboard(login("sup"), admin, confirmBody("Adam Admin")), 409, "LAST_ADMIN");
        assertThat(reload(admin).getStatus()).isEqualTo(OrgMemberStatus.ACTIVE);
    }

    @Test
    void aSeatThatIsNotActiveOrSuspendedCannotBeOffboarded() throws Exception {
        OrgMember invited = seatWithStatus(a, "inv", OrgRole.MEMBER, OrgMemberStatus.INVITED);
        assertCode(offboard(login("owner"), invited, confirmBody("inv")), 409, "INVALID_TRANSITION");
        assertStatus(offboard(login("owner"), plain, confirmBody("Pat Plain")), 200);
        MvcResult again = offboard(login("owner"), plain, confirmBody("Pat Plain"));
        assertCode(again, 409, "INVALID_TRANSITION");
        assertThat(json(again).path("from").asText()).isEqualTo("REMOVED");
    }

    @Test
    void aSuspendedPersonCanBeOffboarded() throws Exception {
        assertStatus(suspend(login("hr"), plain, "{\"reason\":\"Pending an access review\"}"), 200);
        MvcResult r = offboard(login("owner"), plain, confirmBody("Pat Plain"));
        assertStatus(r, 200);
        assertThat(json(r).path("previousStatus").asText()).isEqualTo("SUSPENDED");
    }

    @Test
    void offboardingNeedsAnIdempotencyKeyAfterThePermissionWall() throws Exception {
        assertCode(call(login("owner"), post(memberUrl(a, c2) + "/offboard"), confirmBody("Anita Rao"), null, null), 400, "IDEMPOTENCY_KEY_MISSING");
        assertGeneric404(call(login("plain"), post(memberUrl(a, c2) + "/offboard"), confirmBody("Anita Rao"), null, null), "no permission, no key");
        assertGeneric404(call(login("bowner"), post(memberUrl(a, c2) + "/offboard"), confirmBody("Anita Rao"), null, null), "another organization, no key");
        assertThat(reload(c2).getStatus()).isEqualTo(OrgMemberStatus.ACTIVE);
    }

    @Test
    void aReplayedOffboardDoesNotWriteASecondRow() throws Exception {
        String k = key();
        MvcResult first = call(login("owner"), post(memberUrl(a, c2) + "/offboard"), confirmBody("Anita Rao"), null, k);
        assertStatus(first, 200);
        long audits = auditCount(a);
        MvcResult replay = call(login("owner"), post(memberUrl(a, c2) + "/offboard"), confirmBody("Anita Rao"), null, k);
        assertStatus(replay, 200);
        assertThat(replay.getResponse().getHeader("Idempotent-Replayed")).isEqualTo("true");
        assertThat(json(replay)).isEqualTo(json(first));
        assertThat(auditCount(a)).isEqualTo(audits);
        assertThat(auditCount(a, "MEMBER_REMOVE")).isEqualTo(1);
    }

    @Test
    void anotherOrganizationsOwnerCannotOffboardOurPeopleByAnyPath() throws Exception {
        assertGeneric404(call(login("bowner"), post(memberUrl(a, c2) + "/offboard"), confirmBody("Anita Rao"), null, key()), "through A's path");
        assertGeneric404(call(login("bowner"), post(memberUrl(b, c2) + "/offboard"), confirmBody("Anita Rao"), null, key()), "B's org id with A's member id");
        assertGeneric404(call(login("owner"), post(memberUrl(a, bMember) + "/offboard"), confirmBody("Bea Member"), null, key()), "A's org id with B's member id");
        assertThat(reload(c2).getStatus()).isEqualTo(OrgMemberStatus.ACTIVE);
        assertThat(reload(bMember).getStatus()).isEqualTo(OrgMemberStatus.ACTIVE);
        assertThat(auditCount(b)).isZero();
    }

    // ---- scheduled last days ---------------------------------------------------------------------------------------------

    @Test
    void aFutureLastDaySchedulesAndTheSeatStaysAsItIs() throws Exception {
        Instant day = Instant.now().plus(10, ChronoUnit.DAYS);
        long before = auditCount(a);
        MvcResult r = call(login("owner"), post(memberUrl(a, c2) + "/offboard"), "{\"reason\":\"" + REASON + "\",\"confirm\":\"Anita Rao\",\"effectiveAt\":\"" + day + "\"}", null, key());
        assertStatus(r, 200);
        JsonNode res = json(r);
        assertThat(res.path("status").asText()).isEqualTo("ACTIVE");
        assertThat(res.path("scheduled").path("id").asLong()).isPositive();
        assertThat(Instant.parse(res.path("scheduled").path("effectiveAt").asText())).isEqualTo(day);
        assertThat(reload(c2).getStatus()).isEqualTo(OrgMemberStatus.ACTIVE);
        assertThat(auditCount(a) - before).isEqualTo(1);
        assertThat(newestAudit(a).getAction()).isEqualTo("MEMBER_OFFBOARD_SCHEDULED");
        // listed, and on the sheet
        JsonNode list = json(call(login("owner"), get(membersUrl(a) + "/offboarding")));
        assertThat(list.path("items")).hasSize(1);
        assertThat(list.path("items").get(0).path("name").asText()).isEqualTo("Anita Rao");
        assertThat(json(call(login("owner"), get(memberUrl(a, c2)))).path("scheduledOffboarding").path("reason").asText()).isEqualTo(REASON);
        // a second schedule for the same person is refused; so is anyone who may not offboard
        assertCode(call(login("owner"), post(memberUrl(a, c2) + "/offboard"), "{\"reason\":\"" + REASON + "\",\"confirm\":\"Anita Rao\",\"effectiveAt\":\"" + day.plus(1, ChronoUnit.DAYS) + "\"}", null, key()), 409, "OFFBOARDING_PENDING");
    }

    @Test
    void cancellingAScheduledDayLeavesNoEffect() throws Exception {
        Instant day = Instant.now().plus(10, ChronoUnit.DAYS);
        MvcResult r = call(login("owner"), post(memberUrl(a, c2) + "/offboard"), "{\"reason\":\"" + REASON + "\",\"confirm\":\"Anita Rao\",\"effectiveAt\":\"" + day + "\"}", null, key());
        long id = json(r).path("scheduled").path("id").asLong();
        long before = auditCount(a);
        assertStatus(call(login("owner"), delete(membersUrl(a) + "/offboarding/" + id)), 204);
        assertThat(auditCount(a) - before).isEqualTo(1);
        assertThat(newestAudit(a).getAction()).isEqualTo("MEMBER_OFFBOARD_CANCELLED");
        assertThat(json(call(login("owner"), get(membersUrl(a) + "/offboarding"))).path("items")).isEmpty();
        assertThat(offboardingService.runDue(day.plus(1, ChronoUnit.DAYS))).as("a cancelled day never runs").isZero();
        assertThat(reload(c2).getStatus()).isEqualTo(OrgMemberStatus.ACTIVE);
        assertCode(call(login("owner"), delete(membersUrl(a) + "/offboarding/" + id)), 409, "INVALID_TRANSITION");
        // and the person can be scheduled again
        assertStatus(call(login("owner"), post(memberUrl(a, c2) + "/offboard"), "{\"reason\":\"" + REASON + "\",\"confirm\":\"Anita Rao\",\"effectiveAt\":\"" + day + "\"}", null, key()), 200);
    }

    @Test
    void theJobAppliesOnlyWhenTheDayArrives() throws Exception {
        Instant day = Instant.now().plus(10, ChronoUnit.DAYS);
        MvcResult r = call(login("owner"), post(memberUrl(a, c2) + "/offboard"), "{\"reason\":\"" + REASON + "\",\"confirm\":\"Anita Rao\",\"effectiveAt\":\"" + day + "\"}", null, key());
        long id = json(r).path("scheduled").path("id").asLong();
        dataShare.grant(me(c2), ShareScope.SUMMARY, null, OrgShareConsent.CURRENT, DataShareService.ShareContext.EMPTY);
        assertThat(offboardingService.runDue(day.minus(1, ChronoUnit.HOURS))).as("a day before it arrives").isZero();
        assertThat(reload(c2).getStatus()).isEqualTo(OrgMemberStatus.ACTIVE);
        long before = auditCount(a);
        assertThat(offboardingService.runDue(day.plus(1, ChronoUnit.MINUTES))).isEqualTo(1);
        OrgMember gone = reload(c2);
        assertThat(gone.getStatus()).isEqualTo(OrgMemberStatus.REMOVED);
        assertThat(gone.getLeftAt()).isNotNull();
        assertThat(memberRoleRepo.findLiveByOrgIdAndMemberId(a.getId(), c2.getId())).isEmpty();
        assertThat(shares.findByOrgIdAndMemberId(a.getId(), c2.getId()).orElseThrow().getScope()).isEqualTo(ShareScope.NONE);
        OrgMemberOffboarding row = offboardingRows.findByOrgIdAndId(a.getId(), id).orElseThrow();
        assertThat(row.getStatus()).isEqualTo("DONE");
        assertThat(row.getOutcome()).isEqualTo("APPLIED");
        assertThat(auditCount(a) - before).isEqualTo(1);
        OrgAuditEvent e = newestAudit(a);
        assertThat(e.getAction()).isEqualTo("MEMBER_REMOVE");
        assertThat(e.getActorLogin()).isEqualTo("system");
        assertThat(e.getDetails()).contains("\"mode\":\"SCHEDULED\"");
        assertThat(offboardingService.runDue(day.plus(2, ChronoUnit.DAYS))).as("it runs once").isZero();
    }

    @Test
    void theJobRefusesALastDayThatNoLongerAllowsTheRemoval() throws Exception {
        Instant day = Instant.now().plus(10, ChronoUnit.DAYS);
        superActor("sup");
        MvcResult r = call(login("sup"), post(memberUrl(a, admin) + "/offboard"), "{\"reason\":\"" + REASON + "\",\"confirm\":\"Adam Admin\",\"effectiveAt\":\"" + day + "\"}", null, key());
        assertStatus(r, 200);
        long id = json(r).path("scheduled").path("id").asLong();
        owner.setStatus(OrgMemberStatus.SUSPENDED); // by the day, the administrator is the only one left in service
        members.saveAndFlush(owner);
        assertThat(offboardingService.runDue(day.plus(1, ChronoUnit.HOURS))).isZero();
        assertThat(reload(admin).getStatus()).isEqualTo(OrgMemberStatus.ACTIVE);
        OrgMemberOffboarding row = offboardingRows.findByOrgIdAndId(a.getId(), id).orElseThrow();
        assertThat(row.getStatus()).isEqualTo("FAILED");
        assertThat(row.getOutcome()).isEqualTo("LAST_ADMIN");
    }

    @Test
    void anImmediateOffboardOvertakesAnEarlierSchedule() throws Exception {
        Instant day = Instant.now().plus(10, ChronoUnit.DAYS);
        MvcResult r = call(login("owner"), post(memberUrl(a, c2) + "/offboard"), "{\"reason\":\"" + REASON + "\",\"confirm\":\"Anita Rao\",\"effectiveAt\":\"" + day + "\"}", null, key());
        long id = json(r).path("scheduled").path("id").asLong();
        assertStatus(offboard(login("owner"), c2, confirmBody("Anita Rao")), 200);
        OrgMemberOffboarding row = offboardingRows.findByOrgIdAndId(a.getId(), id).orElseThrow();
        assertThat(row.getStatus()).isEqualTo("DONE");
        assertThat(row.getOutcome()).isEqualTo("SUPERSEDED");
        assertThat(json(call(login("owner"), get(membersUrl(a) + "/offboarding"))).path("items")).isEmpty();
    }

    @Test
    void aPastOrNearlyNowLastDayIsImmediate() throws Exception {
        MvcResult r = call(login("owner"), post(memberUrl(a, c2) + "/offboard"), "{\"reason\":\"" + REASON + "\",\"confirm\":\"Anita Rao\",\"effectiveAt\":\"" + Instant.now().minus(3, ChronoUnit.DAYS) + "\"}", null, key());
        assertStatus(r, 200);
        assertThat(json(r).path("status").asText()).isEqualTo("REMOVED");
    }

    @Test
    void anotherOrganizationCannotSeeOrCancelOurScheduledDays() throws Exception {
        Instant day = Instant.now().plus(10, ChronoUnit.DAYS);
        MvcResult r = call(login("owner"), post(memberUrl(a, c2) + "/offboard"), "{\"reason\":\"" + REASON + "\",\"confirm\":\"Anita Rao\",\"effectiveAt\":\"" + day + "\"}", null, key());
        long id = json(r).path("scheduled").path("id").asLong();
        assertThat(json(call(login("bowner"), get(membersUrl(b) + "/offboarding"))).path("items")).isEmpty();
        assertGeneric404(call(login("bowner"), delete(membersUrl(b) + "/offboarding/" + id)), "B's owner cancels A's row through B");
        assertGeneric404(call(login("bowner"), delete(membersUrl(a) + "/offboarding/" + id)), "B's owner through A's path");
        assertGeneric404(call(login("plain"), delete(membersUrl(a) + "/offboarding/" + id)), "a member");
        assertGeneric404(call(login("hr"), delete(membersUrl(a) + "/offboarding/" + id)), "HR may not remove");
        assertThat(offboardingRows.findByOrgIdAndId(a.getId(), id).orElseThrow().getStatus()).isEqualTo("PENDING");
    }

    // ---- helpers ------------------------------------------------------------------------------------------------------------

    private List<String> codes(JsonNode preview) {
        List<String> out = new ArrayList<>();
        for (JsonNode b : preview.path("blockers")) out.add(b.path("code").asText());
        return out;
    }

    private List<String> roleKeysOf(OrgMember m) {
        em.flush();
        List<String> out = new ArrayList<>();
        for (var row : memberRoleRepo.findLiveByOrgIdAndMemberId(m.getOrgId(), m.getId())) out.add(roleRepo.findVisibleByOrgIdAndId(m.getOrgId(), row.getRoleId()).orElseThrow().getRoleKey());
        return out;
    }

    /** A member id that names nobody: only its id is read. */
    private static final class OrgMemberRef extends OrgMember {

        OrgMemberRef(Long id) {
            setId(id);
        }
    }

    private MvcResult suspend(String login, OrgMemberRef ref, String body) throws Exception {
        return call(login, post(membersUrl(a) + "/" + ref.getId() + "/suspend"), body, null, null);
    }
}
