package com.dossier.api.web.rest.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.ent.mgmt.MktApprovalRequest;
import com.dossier.api.domain.ent.mkt.MktOpportunity;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.MarketerAssignment;
import com.dossier.api.domain.ent.talent.OrgResume;
import com.dossier.api.domain.ent.talent.RequirementMatch;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.ent.mgmt.MktApprovalRequestRepository;
import com.dossier.api.repository.ent.mkt.MktOpportunityRepository;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.MarketerAssignmentRepository;
import com.dossier.api.repository.ent.talent.OrgResumeRepository;
import com.dossier.api.repository.ent.talent.RequirementMatchRepository;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * The manager approvals through the real chain on real rows (MM-03): the manager's list is the team's (an organization-wide admin sees all), a request
 * outside the team is the generic 404, approve carries out the held step in the same transaction (a held resume goes to the consultant's own approval; a
 * held assignment becomes ASSIGNED through the same checks), reject needs a note, nobody decides their own request, a decided request is 409, and the
 * marketer's side opens (built from stored rows), lists and withdraws. Beta's rows never show in Acme and Acme's ids are the generic 404 for Beta.
 *
 * <p>World (on top of {@link MemberItSupport}): marketers mgr (Marketing Manager, TEAM, team T1), mia (Marketing Specialist in T1) and spec (Marketing
 * Specialist outside every team); consultants k1 (mia's) and k2 (spec's), each with an approved resume; one OPEN job with a SUGGESTED pair for k1.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class MgmtApprovalsIT extends MemberItSupport {

    @Autowired private JdbcTemplate jdbc;
    @Autowired private MktApprovalRequestRepository requests;
    @Autowired private ConsultantProfileRepository consultants;
    @Autowired private MarketerAssignmentRepository assignmentRows;
    @Autowired private ClientAccountRepository clients;
    @Autowired private ClientRequirementRepository jobs;
    @Autowired private RequirementMatchRepository matches;
    @Autowired private MktOpportunityRepository opportunities;
    @Autowired private OrgResumeRepository resumes;

    private OrgMember mia;
    private ConsultantProfile k1;
    private ConsultantProfile k2;
    private OrgResume resume1;
    private OrgResume resume2;
    private ClientRequirement job;
    private RequirementMatch pair;
    private MktOpportunity overlay;

    @BeforeEach
    void managerWorld() {
        settingRows.save(new AppSetting(EnterpriseSettingKeys.FLAG_MARKETING, "{\"on\":true}", WHO, Instant.now()));
        settingsCache.invalidate();
        mia = extra(a, "mia", OrgRole.MARKETER, "Mia", "Ng");
        assign(mia, "MARKETING_SPECIALIST");
        place(mia, d1, t1);
        k1 = consultant(a, "Kay One");
        k2 = consultant(a, "Kay Two");
        assigned(k1, mia);
        assigned(k2, mktSpec);
        resume1 = resume(a, k1);
        resume2 = resume(a, k2);
        ClientAccount client = new ClientAccount();
        client.setOrgId(a.getId());
        client.setName("Stripe");
        client = clients.saveAndFlush(client);
        job = new ClientRequirement();
        job.setOrgId(a.getId());
        job.setClientId(client.getId());
        job.setTitle("SWE II");
        job = jobs.saveAndFlush(job);
        pair = new RequirementMatch();
        pair.setOrgId(a.getId());
        pair.setRequirementId(job.getId());
        pair.setConsultantId(k1.getId());
        pair.setScore(80);
        pair.setStatus("SUGGESTED");
        pair = matches.saveAndFlush(pair);
        overlay = new MktOpportunity();
        overlay.setOrgId(a.getId());
        overlay.setMatchId(pair.getId());
        overlay.setOwnerMemberId(mia.getId());
        overlay = opportunities.save(overlay);
        flushIfInTransaction();
    }

    // ---- fixtures ---------------------------------------------------------------------------------------------------------------

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
        row.setAssignedAt(Instant.now());
        row.setLastActivityAt(Instant.now());
        assignmentRows.saveAndFlush(row);
    }

    private OrgResume resume(com.dossier.api.domain.org.Organization org, ConsultantProfile c) {
        OrgResume r = new OrgResume();
        r.setOrgId(org.getId());
        r.setConsultantId(c.getId());
        r.setName(c.getDisplayName() + " resume");
        r.setApprovalStatus("APPROVED");
        r.setApprovedAt(Instant.now());
        return resumes.saveAndFlush(r);
    }

    private MktApprovalRequest request(com.dossier.api.domain.org.Organization org, OrgMember by, ConsultantProfile c, String kind, String subjectType, Long subjectId, String payload) {
        MktApprovalRequest r = new MktApprovalRequest();
        r.setOrgId(org.getId());
        r.setKind(kind);
        r.setSubjectType(subjectType);
        r.setSubjectId(subjectId);
        r.setConsultantId(c.getId());
        r.setRequestedByMemberId(by.getId());
        r.setRequestedAt(Instant.now());
        r.setTitle(c.getDisplayName() + " to Stripe, SWE II");
        r.setPayloadJson(payload);
        r.setExpiresAt(Instant.now().plusSeconds(7 * 86400L));
        return requests.saveAndFlush(r);
    }

    private MktApprovalRequest releaseBy(OrgMember by, ConsultantProfile c, OrgResume r) {
        return request(a, by, c, "RESUME_RELEASE", "ORG_RESUME", r.getId(), "{\"resumeId\":" + r.getId() + ",\"consultantId\":" + c.getId() + "}");
    }

    private MktApprovalRequest assignBy(OrgMember by) {
        MktApprovalRequest r = request(
            a, by, k1, "OPPORTUNITY_ASSIGN", "MKT_OPPORTUNITY", overlay.getId(),
            "{\"jobId\":" + job.getId() + ",\"consultantId\":" + k1.getId() + ",\"matchId\":" + pair.getId() + ",\"ownerMemberId\":" + by.getId() + ",\"askInterest\":true,\"confirmDuplicate\":false}"
        );
        overlay.setApprovalRequestId(r.getId());
        opportunities.save(overlay);
        flushIfInTransaction();
        return r;
    }

    private static String base(com.dossier.api.domain.org.Organization o) {
        return "/api/orgs/" + o.getId() + "/mgmt/approvals";
    }

    private static String mine(com.dossier.api.domain.org.Organization o) {
        return "/api/orgs/" + o.getId() + "/mkt/approvals";
    }

    private JsonNode fetch(String login, String url) throws Exception {
        MvcResult r = call(login, get(url));
        assertStatus(r, 200);
        return json(r);
    }

    private long countOf(String sql, Object... args) {
        flushIfInTransaction();
        Long n = jdbc.queryForObject(sql, Long.class, args);
        return n == null ? 0 : n;
    }

    // ---- the manager's list ------------------------------------------------------------------------------------------------------

    @Test
    void theManagerSeesTheirTeamsRequestsAndAnAdminSeesEveryone() throws Exception {
        MktApprovalRequest byMia = releaseBy(mia, k1, resume1);
        MktApprovalRequest bySpec = releaseBy(mktSpec, k2, resume2);
        MktApprovalRequest byMgr = request(a, mktMgr, k1, "OPPORTUNITY_ASSIGN", "MKT_OPPORTUNITY", 99L, "{}");

        MvcResult team = call(login("mgr"), get(base(a)));
        assertStatus(team, 200);
        assertThat(team.getResponse().getHeader("X-Total-Count")).isEqualTo("2");
        assertThat(ids(json(team))).containsExactlyInAnyOrder(byMia.getId(), byMgr.getId());
        JsonNode first = json(team).path("items").get(0);
        assertThat(first.path("requestedBy").path("name").asText()).isNotBlank();
        assertThat(first.path("consultant").path("name").asText()).isEqualTo("Kay One");
        assertThat(first.path("status").asText()).isEqualTo("PENDING");

        assertThat(ids(fetch(login("owner"), base(a)))).containsExactlyInAnyOrder(byMia.getId(), bySpec.getId(), byMgr.getId());
        assertThat(ids(fetch(login("admin"), base(a)))).as("an organization-wide admin sees every marketer's").hasSize(3);
        assertThat(ids(fetch(login("mgr"), base(a) + "?marketer=" + mia.getId()))).containsExactly(byMia.getId());
        assertThat(ids(fetch(login("mgr"), base(a) + "?kind=OPPORTUNITY_ASSIGN"))).containsExactly(byMgr.getId());
        assertThat(fetch(login("mgr"), base(a) + "?status=DECIDED").path("items")).isEmpty();
        assertStatus(call(login("mgr"), get(base(a) + "?marketer=" + mktSpec.getId())), 404); // a marketer outside the team
        assertStatus(call(login("mgr"), get(base(a) + "?status=SOON")), 422);
        assertStatus(call(login("mgr"), get(base(a) + "?size=500")), 422);
    }

    @Test
    void everyoneWithoutTheKeyAndEveryoneOutsideTheOrganizationGetsTheGenericNotFound() throws Exception {
        MktApprovalRequest r = releaseBy(mia, k1, resume1);
        for (String who : List.of("spec", "plain", "hr", "c1")) {
            assertGeneric404(call(login(who), get(base(a))), who + " lists");
            assertGeneric404(call(login(who), get(base(a) + "/" + r.getId())), who + " reads one");
            assertGeneric404(call(login(who), post(base(a) + "/" + r.getId() + "/approve"), "{}", null, key()), who + " approves");
        }
        assertGeneric404(call(login("bowner"), get(base(a))), "B's owner lists A");
        assertGeneric404(call(login("bowner"), get(base(a) + "/" + r.getId())), "B's owner reads A's");
        assertGeneric404(call(login("bowner"), post(base(a) + "/" + r.getId() + "/approve"), "{}", null, key()), "B's owner approves A's");
        assertGeneric404(call(login("bowner"), get(base(b) + "/" + r.getId())), "B's owner names A's id in B");
        assertGeneric404(call(login("bowner"), post(base(b) + "/" + r.getId() + "/reject"), "{\"note\":\"no\"}", null, key()), "B's owner rejects A's id in B");
        assertGeneric404(call(login("mgr"), get(base(a) + "/999999999")), "an unknown id");
        assertThat(requests.findByOrgIdAndId(a.getId(), r.getId()).orElseThrow().getStatus()).isEqualTo("PENDING");
    }

    @Test
    void betasOwnRequestsNeverShowInAcmeAndAcmesDoNotShowInBeta() throws Exception {
        ConsultantProfile bk = consultant(b, "Bea One");
        flushIfInTransaction();
        MktApprovalRequest bReq = request(b, bOwner, bk, "RESUME_RELEASE", "ORG_RESUME", 1L, "{}");
        MktApprovalRequest aReq = releaseBy(mia, k1, resume1);
        assertThat(ids(fetch(login("owner"), base(a)))).containsExactly(aReq.getId());
        assertThat(ids(fetch(login("bowner"), base(b)))).containsExactly(bReq.getId());
        assertGeneric404(call(login("owner"), get(base(a) + "/" + bReq.getId())), "A's owner names B's id");
    }

    // ---- approve ----------------------------------------------------------------------------------------------------------------

    @Test
    void approvingAHeldResumeReleasesItToTheConsultantsOwnApprovalAndWritesOneAuditRow() throws Exception {
        MktApprovalRequest r = releaseBy(mia, k1, resume1);
        // the resume starts PENDING (a marketer made it); the manager's release records the review and keeps the consultant's request
        long auditBefore = auditCount(a);
        String k = key();
        MvcResult ok = call(login("mgr"), post(base(a) + "/" + r.getId() + "/approve"), "{\"note\":\"Looks right\"}", null, k);
        assertStatus(ok, 200);
        JsonNode body = json(ok);
        assertThat(body.path("status").asText()).isEqualTo("APPROVED");
        assertThat(body.path("decidedBy").path("name").asText()).isEqualTo("Maria Lopez");
        assertThat(body.path("decisionNote").asText()).isEqualTo("Looks right");
        assertThat(countOf("select count(*) from mkt_resume_event where org_id = ? and resume_id = ? and kind = 'MANAGER_REVIEWED'", a.getId(), resume1.getId())).isEqualTo(1L);
        assertThat(auditCount(a) - auditBefore).as("one audit row per decision").isEqualTo(1L);
        assertThat(auditCount(a, "MKT_APPROVAL_APPROVE")).isEqualTo(1L);

        MvcResult replay = call(login("mgr"), post(base(a) + "/" + r.getId() + "/approve"), "{\"note\":\"Looks right\"}", null, k);
        assertStatus(replay, 200);
        assertThat(replay.getResponse().getHeader("Idempotent-Replayed")).isEqualTo("true");
        assertThat(auditCount(a, "MKT_APPROVAL_APPROVE")).as("a replay does the work once").isEqualTo(1L);

        assertCode(call(login("mgr"), post(base(a) + "/" + r.getId() + "/approve"), "{}", null, key()), 409, "APPROVAL_NOT_PENDING");
        assertCode(call(login("mgr"), post(base(a) + "/" + r.getId() + "/reject"), "{\"note\":\"late\"}", null, key()), 409, "APPROVAL_NOT_PENDING");
    }

    @Test
    void approvingAHeldAssignmentMakesItAssignedThroughTheSameChecksAndFreesTheOpportunity() throws Exception {
        MktApprovalRequest r = assignBy(mia);
        MvcResult ok = call(login("mgr"), post(base(a) + "/" + r.getId() + "/approve"), "{}", null, key());
        assertStatus(ok, 200);
        assertThat(json(ok).path("status").asText()).isEqualTo("APPROVED");
        flushIfInTransaction();
        em.clear();
        assertThat(matches.findByOrgIdAndId(a.getId(), pair.getId()).orElseThrow().getStatus()).isEqualTo("ASSIGNED");
        MktOpportunity opp = opportunities.findByOrgIdAndId(a.getId(), overlay.getId()).orElseThrow();
        assertThat(opp.getApprovalRequestId()).as("nothing is held any more").isNull();
        assertThat(opp.getOwnerMemberId()).isEqualTo(mia.getId());
        assertThat(opp.getInterestRequestedAt()).as("the consultant was asked for their interest as the marketer meant").isNotNull();
        List<String> events = jdbc.queryForList("select text from mkt_opportunity_event where org_id = ? and opportunity_id = ? and kind = 'MANAGER_APPROVED'", String.class, a.getId(), overlay.getId());
        assertThat(events).containsExactly("Approved by Maria Lopez.");
        assertThat(auditCount(a, "MKT_APPROVAL_APPROVE")).isEqualTo(1L);
        assertThat(countOf("select count(*) from org_audit_event where org_id = ? and action = 'MARKETER_OPPORTUNITY_ASSIGN'", a.getId())).as("the step itself writes no second audit row").isZero();
    }

    @Test
    void ifTheHeldStepNoLongerWorksTheDecisionFailsAndTheRequestStaysPending() throws Exception {
        MktApprovalRequest r = assignBy(mia);
        jdbc.update("update consultant_profile set marketing_status = 'PAUSED' where org_id = ? and id = ?", a.getId(), k1.getId());
        flushIfInTransaction();
        em.clear();
        assertCode(call(login("mgr"), post(base(a) + "/" + r.getId() + "/approve"), "{}", null, key()), 409, "CONSULTANT_PAUSED");
        em.clear();
        assertThat(requests.findByOrgIdAndId(a.getId(), r.getId()).orElseThrow().getStatus()).isEqualTo("PENDING");
        assertThat(matches.findByOrgIdAndId(a.getId(), pair.getId()).orElseThrow().getStatus()).isEqualTo("SUGGESTED");
    }

    @Test
    void aRequestOutsideTheTeamIsTheGenericNotFoundAndStaysPending() throws Exception {
        MktApprovalRequest r = releaseBy(mktSpec, k2, resume2);
        assertGeneric404(call(login("mgr"), get(base(a) + "/" + r.getId())), "reading");
        assertGeneric404(call(login("mgr"), post(base(a) + "/" + r.getId() + "/approve"), "{}", null, key()), "approving");
        assertGeneric404(call(login("mgr"), post(base(a) + "/" + r.getId() + "/reject"), "{\"note\":\"no\"}", null, key()), "rejecting");
        assertThat(requests.findByOrgIdAndId(a.getId(), r.getId()).orElseThrow().getStatus()).isEqualTo("PENDING");
        assertStatus(call(login("owner"), post(base(a) + "/" + r.getId() + "/approve"), "{}", null, key()), 200); // an organization-wide caller reaches every marketer
    }

    @Test
    void nobodyDecidesTheirOwnRequestExceptAnOrganizationWideManager() throws Exception {
        MktApprovalRequest own = request(a, mktMgr, k1, "RESUME_RELEASE", "ORG_RESUME", resume1.getId(), "{}");
        assertCode(call(login("mgr"), post(base(a) + "/" + own.getId() + "/approve"), "{}", null, key()), 409, "SELF_APPROVAL");
        assertCode(call(login("mgr"), post(base(a) + "/" + own.getId() + "/reject"), "{\"note\":\"mine\"}", null, key()), 409, "SELF_APPROVAL");
        assertThat(requests.findByOrgIdAndId(a.getId(), own.getId()).orElseThrow().getStatus()).isEqualTo("PENDING");
        assertStatus(call(login("owner"), post(base(a) + "/" + own.getId() + "/reject"), "{\"note\":\"Not now\"}", null, key()), 200);
    }

    // ---- reject -----------------------------------------------------------------------------------------------------------------

    @Test
    void rejectingNeedsANoteAndChangesNothingButTheRequest() throws Exception {
        MktApprovalRequest r = assignBy(mia);
        assertStatus(call(login("mgr"), post(base(a) + "/" + r.getId() + "/reject"), "{}", null, key()), 422);
        assertStatus(call(login("mgr"), post(base(a) + "/" + r.getId() + "/reject"), "{\"note\":\"ssn 123-45-6789\"}", null, key()), 422);
        MvcResult ok = call(login("mgr"), post(base(a) + "/" + r.getId() + "/reject"), "{\"note\":\"Not this client\"}", null, key());
        assertStatus(ok, 200);
        assertThat(json(ok).path("status").asText()).isEqualTo("REJECTED");
        em.clear();
        assertThat(matches.findByOrgIdAndId(a.getId(), pair.getId()).orElseThrow().getStatus()).as("the pair stays suggested").isEqualTo("SUGGESTED");
        assertThat(opportunities.findByOrgIdAndId(a.getId(), overlay.getId()).orElseThrow().getApprovalRequestId()).isNull();
        assertThat(jdbc.queryForList("select text from mkt_opportunity_event where org_id = ? and kind = 'MANAGER_DECLINED'", String.class, a.getId())).containsExactly("Manager declined: Not this client");
        assertThat(auditCount(a, "MKT_APPROVAL_REJECT")).isEqualTo(1L);
    }

    @Test
    void aDecisionNeedsAnIdempotencyKeyOnlyAfterThePermissionWall() throws Exception {
        MktApprovalRequest r = releaseBy(mia, k1, resume1);
        assertCode(call(login("mgr"), post(base(a) + "/" + r.getId() + "/approve"), "{}", null, null), 400, "IDEMPOTENCY_KEY_MISSING");
        assertGeneric404(call(login("spec"), post(base(a) + "/" + r.getId() + "/approve"), "{}", null, null), "no key and no permission: the 404 comes first");
    }

    // ---- the marketer's side -----------------------------------------------------------------------------------------------------

    @Test
    void aMarketerAsksForAnApprovalBuiltFromStoredRowsListsItAndTakesItBack() throws Exception {
        MvcResult opened = call(login("mia"), post(mine(a)), "{\"kind\":\"OPPORTUNITY_ASSIGN\",\"subjectId\":" + pair.getId() + ",\"note\":\"Lead with Java\",\"payload\":{\"jobId\":1,\"consultantId\":2}}", null, key());
        assertStatus(opened, 200);
        JsonNode dto = json(opened);
        assertThat(dto.path("status").asText()).isEqualTo("PENDING");
        assertThat(dto.path("subjectId").asLong()).isEqualTo(overlay.getId());
        assertThat(dto.path("consultant").path("name").asText()).isEqualTo("Kay One");
        assertThat(dto.path("payload").path("jobId").asLong()).as("the arguments come from the stored rows, never from the body").isEqualTo(job.getId());
        assertThat(dto.path("title").asText()).isEqualTo("Kay One to Stripe, SWE II");
        flushIfInTransaction();
        em.clear();
        assertThat(opportunities.findByOrgIdAndId(a.getId(), overlay.getId()).orElseThrow().getApprovalRequestId()).isEqualTo(dto.path("id").asLong());
        assertThat(auditCount(a, "MKT_APPROVAL_OPEN")).isEqualTo(1L);

        MvcResult again = call(login("mia"), post(mine(a)), "{\"kind\":\"OPPORTUNITY_ASSIGN\",\"subjectId\":" + pair.getId() + "}", null, key());
        assertCode(again, 409, "APPROVAL_PENDING");
        assertThat(json(again).path("requestId").asLong()).isEqualTo(dto.path("id").asLong());

        assertThat(ids(fetch(login("mia"), mine(a) + "?mine=true"))).containsExactly(dto.path("id").asLong());
        assertThat(ids(fetch(login("mgr"), base(a)))).containsExactly(dto.path("id").asLong());

        assertGeneric404(call(login("mgr"), post(mine(a) + "/" + dto.path("id").asLong() + "/withdraw"), null, null, key()), "the manager is not the requester");
        MvcResult back = call(login("mia"), post(mine(a) + "/" + dto.path("id").asLong() + "/withdraw"), null, null, key());
        assertStatus(back, 200);
        assertThat(json(back).path("status").asText()).isEqualTo("WITHDRAWN");
        em.clear();
        assertThat(opportunities.findByOrgIdAndId(a.getId(), overlay.getId()).orElseThrow().getApprovalRequestId()).isNull();
        assertCode(call(login("mia"), post(mine(a) + "/" + dto.path("id").asLong() + "/withdraw"), null, null, key()), 409, "APPROVAL_NOT_PENDING");
        assertThat(fetch(login("mia"), mine(a)).path("items")).as("pending only by default").isEmpty();
        assertThat(ids(fetch(login("mia"), mine(a) + "?status=DECIDED"))).containsExactly(dto.path("id").asLong());
    }

    @Test
    void aMarketerCannotAskForAConsultantOutsideTheirScopeOrForWhatIsNotAskable() throws Exception {
        RequirementMatch other = new RequirementMatch();
        other.setOrgId(a.getId());
        other.setRequirementId(job.getId());
        other.setConsultantId(k2.getId());
        other.setScore(70);
        other.setStatus("SUGGESTED");
        other = matches.saveAndFlush(other);
        MktOpportunity otherOverlay = new MktOpportunity();
        otherOverlay.setOrgId(a.getId());
        otherOverlay.setMatchId(other.getId());
        opportunities.save(otherOverlay);
        flushIfInTransaction();
        assertGeneric404(call(login("mia"), post(mine(a)), "{\"kind\":\"OPPORTUNITY_ASSIGN\",\"subjectId\":" + other.getId() + "}", null, key()), "k2 is spec's");
        assertGeneric404(call(login("mia"), post(mine(a)), "{\"kind\":\"RESUME_RELEASE\",\"subjectId\":" + resume2.getId() + "}", null, key()), "k2's resume");
        assertStatus(call(login("mia"), post(mine(a)), "{\"kind\":\"DUPLICATE_OVERRIDE\",\"subjectId\":" + pair.getId() + "}", null, key()), 422);
        assertStatus(call(login("mia"), post(mine(a)), "{\"kind\":\"SUBMIT_IT\",\"subjectId\":" + pair.getId() + "}", null, key()), 422);
        pair.setStatus("ASSIGNED");
        matches.saveAndFlush(pair);
        assertCode(call(login("mia"), post(mine(a)), "{\"kind\":\"OPPORTUNITY_ASSIGN\",\"subjectId\":" + pair.getId() + "}", null, key()), 409, "NOT_SUGGESTED");
        assertGeneric404(call(login("hr"), post(mine(a)), "{\"kind\":\"RESUME_RELEASE\",\"subjectId\":" + resume1.getId() + "}", null, key()), "no marketing key");
        assertGeneric404(call(login("bowner"), post(mine(a)), "{\"kind\":\"RESUME_RELEASE\",\"subjectId\":" + resume1.getId() + "}", null, key()), "B's owner");
        MvcResult noKey = call(login("mia"), post(mine(a)), "{\"kind\":\"RESUME_RELEASE\",\"subjectId\":" + resume1.getId() + "}", null, null);
        assertCode(noKey, 400, "IDEMPOTENCY_KEY_MISSING");
    }

    @Test
    void aHeldResumeIsAskedForOnceAndTheManagerReleasesIt() throws Exception {
        MvcResult opened = call(login("mia"), post(mine(a)), "{\"kind\":\"RESUME_RELEASE\",\"subjectId\":" + resume1.getId() + "}", null, key());
        assertStatus(opened, 200);
        assertThat(json(opened).path("title").asText()).isEqualTo("Kay One, resume Kay One resume");
        assertCode(call(login("mia"), post(mine(a)), "{\"kind\":\"RESUME_RELEASE\",\"subjectId\":" + resume1.getId() + "}", null, key()), 409, "APPROVAL_PENDING");
        assertStatus(call(login("mgr"), post(base(a) + "/" + json(opened).path("id").asLong() + "/approve"), "{}", null, key()), 200);
    }
}
