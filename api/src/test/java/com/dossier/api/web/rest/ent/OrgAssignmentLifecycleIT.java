package com.dossier.api.web.rest.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.ent.OrgAssignment;
import com.dossier.api.domain.ent.OrgSetting;
import com.dossier.api.domain.ent.mkt.MktFollowup;
import com.dossier.api.domain.ent.mkt.MktOpportunity;
import com.dossier.api.domain.ent.mkt.MktTask;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.MarketerAssignment;
import com.dossier.api.domain.ent.talent.MarketerCapacity;
import com.dossier.api.domain.ent.talent.RequirementMatch;
import com.dossier.api.domain.enumeration.AssignmentKind;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.OrgSettingRepository;
import com.dossier.api.repository.ent.mkt.MktFollowupRepository;
import com.dossier.api.repository.ent.mkt.MktOpportunityRepository;
import com.dossier.api.repository.ent.mkt.MktTaskRepository;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.MarketerAssignmentEventRepository;
import com.dossier.api.repository.ent.talent.MarketerAssignmentRepository;
import com.dossier.api.repository.ent.talent.MarketerCapacityRepository;
import com.dossier.api.repository.ent.talent.RequirementMatchRepository;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * The marketer assignment lifecycle through the real chain (Sprint 2 / B1): every change writes a history line (who, when, why), a reassignment hands the
 * open opportunities, tasks and follow-ups the previous marketer owned for that consultant to the new one (and only those), the org_assignment projection
 * is chained (old row ended REASSIGNED, new row opened, replaced_by set), undo is a RESTORE line, the admin switch turns the handover off, and another
 * organization sees none of it (generic 404).
 *
 * <p>World (on top of {@link MemberItSupport}): marketers sam (Marketing Specialist, ASSIGNED scope, capacity 5), mia and pat (extra Marketing Specialists),
 * one consultant PROFILE that holds the seat c1, one profile without a seat. The owner (ORG scope) makes the changes.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class OrgAssignmentLifecycleIT extends MemberItSupport {

    @Autowired private ConsultantProfileRepository consultants;
    @Autowired private MarketerAssignmentRepository assignmentRows;
    @Autowired private MarketerAssignmentEventRepository historyRows;
    @Autowired private MarketerCapacityRepository capacityRows;
    @Autowired private MktTaskRepository tasks;
    @Autowired private MktFollowupRepository followups;
    @Autowired private MktOpportunityRepository opportunities;
    @Autowired private ClientAccountRepository clients;
    @Autowired private ClientRequirementRepository requirements;
    @Autowired private RequirementMatchRepository matches;
    @Autowired private OrgSettingRepository orgSettings;

    private OrgMember sam;
    private OrgMember mia;
    private OrgMember pat;
    private ConsultantProfile seated;
    private ConsultantProfile unseated;

    @BeforeEach
    void world() {
        sam = mktSpec;
        mia = extra(a, "mia", OrgRole.MARKETER, "Mia", "Ng");
        assign(mia, "MARKETING_SPECIALIST");
        pat = extra(a, "pat", OrgRole.MARKETER, "Pat", "Quinn");
        assign(pat, "MARKETING_SPECIALIST");
        for (OrgMember m : List.of(sam, mia, pat)) capacity(m);
        seated = profile(a, "Anika Khan", c1.getId());
        unseated = profile(a, "Kay Unseated", null);
        em.flush();
    }

    // ---- fixtures ---------------------------------------------------------------------------------------------------------

    private void capacity(OrgMember m) {
        MarketerCapacity c = new MarketerCapacity();
        c.setOrgId(m.getOrgId());
        c.setMemberId(m.getId());
        c.setCapacity(5);
        c.setStatus("ACTIVE");
        c.setTitleLabel("Marketing Specialist");
        c.setCreatedAt(Instant.now().minus(Duration.ofDays(90)));
        capacityRows.saveAndFlush(c);
    }

    private ConsultantProfile profile(Organization org, String name, Long memberId) {
        ConsultantProfile c = new ConsultantProfile();
        c.setOrgId(org.getId());
        c.setDisplayName(name);
        c.setEmail(name.toLowerCase().replace(' ', '.') + "@example.org");
        c.setStatus("ACTIVE");
        c.setJobTitle("Engineer");
        c.setMemberId(memberId);
        c.setCreatedAt(Instant.now().minus(Duration.ofDays(90)));
        return consultants.saveAndFlush(c);
    }

    private MarketerAssignment marketedBy(ConsultantProfile c, OrgMember marketer) {
        MarketerAssignment row = new MarketerAssignment();
        row.setOrgId(c.getOrgId());
        row.setConsultantId(c.getId());
        row.setMarketerMemberId(marketer.getId());
        row.setAssignedAt(Instant.now().minus(Duration.ofDays(5)));
        return assignmentRows.saveAndFlush(row);
    }

    private MktTask task(Organization org, ConsultantProfile c, OrgMember owner, String status) {
        MktTask t = new MktTask();
        t.setOrgId(org.getId());
        t.setConsultantId(c.getId());
        t.setTitle("Call the recruiter");
        t.setStatus(status);
        t.setOwnerMemberId(owner.getId());
        t.setDueAt(Instant.now().plus(Duration.ofDays(1)));
        tasks.save(t);
        em.flush();
        return t;
    }

    private MktFollowup followup(Organization org, ConsultantProfile c, OrgMember owner, String status) {
        MktFollowup f = new MktFollowup();
        f.setOrgId(org.getId());
        f.setConsultantId(c.getId());
        f.setTitle("Ask about the rate");
        f.setStatus(status);
        f.setOwnerMemberId(owner.getId());
        f.setDueAt(Instant.now().plus(Duration.ofDays(1)));
        followups.save(f);
        em.flush();
        return f;
    }

    private MktOpportunity opportunity(Organization org, ConsultantProfile c, OrgMember owner, String state) {
        ClientAccount client = new ClientAccount();
        client.setOrgId(org.getId());
        client.setName("Globex " + System.nanoTime());
        client = clients.saveAndFlush(client);
        ClientRequirement job = new ClientRequirement();
        job.setOrgId(org.getId());
        job.setClientId(client.getId());
        job.setTitle("Java Developer");
        job.setLocation("Austin, TX");
        job = requirements.saveAndFlush(job);
        RequirementMatch m = new RequirementMatch();
        m.setOrgId(org.getId());
        m.setRequirementId(job.getId());
        m.setConsultantId(c.getId());
        m.setScore(80);
        m.setReason("test");
        m.setStatus("ASSIGNED");
        m.setAssignedAt(Instant.now());
        m = matches.saveAndFlush(m);
        MktOpportunity o = new MktOpportunity();
        o.setOrgId(org.getId());
        o.setMatchId(m.getId());
        o.setOwnerMemberId(owner.getId());
        o.setState(state);
        opportunities.save(o);
        em.flush();
        return o;
    }

    private static String base(Organization o) {
        return "/api/orgs/" + o.getId() + "/marketing-assignments";
    }

    private MvcResult moveTo(ConsultantProfile c, OrgMember marketer, String reason) throws Exception {
        String body = "{\"consultantIds\":[" + c.getId() + "],\"marketerMemberId\":" + marketer.getId() + ",\"allowOverCapacity\":true" + (reason == null ? "" : ",\"reason\":\"" + reason + "\"") + "}";
        return call(login("owner"), post(base(a) + "/assign"), body, null, key());
    }

    private JsonNode history(String login, Organization org, ConsultantProfile c) throws Exception {
        MvcResult r = call(login, get(base(org) + "/consultants/" + c.getId() + "/history"));
        assertStatus(r, 200);
        return json(r);
    }

    private MktTask fresh(MktTask t) {
        em.flush();
        em.clear();
        return tasks.findByOrgIdAndId(t.getOrgId(), t.getId()).orElseThrow();
    }

    // ---- history ----------------------------------------------------------------------------------------------------------------

    @Test
    void everyChangeWritesAHistoryLineWithWhoWhenAndWhy() throws Exception {
        assertStatus(moveTo(unseated, sam, "New to the bench"), 200);
        assertStatus(moveTo(unseated, mia, "Sam is on leave"), 200);
        call(login("owner"), post(base(a) + "/unassign"), "{\"consultantIds\":[" + unseated.getId() + "],\"reason\":\"Back on a project\"}", null, key());
        JsonNode h = history(login("owner"), a, unseated);
        assertThat(h.path("consultantName").asText()).isEqualTo("Kay Unseated");
        JsonNode items = h.path("items");
        assertThat(items).hasSize(3);
        assertThat(items.get(0).path("action").asText()).isEqualTo("UNASSIGN");
        assertThat(items.get(0).path("reason").asText()).isEqualTo("Back on a project");
        assertThat(items.get(0).path("fromMarketer").path("name").asText()).isEqualTo("Mia Ng");
        assertThat(items.get(1).path("action").asText()).isEqualTo("REASSIGN");
        assertThat(items.get(1).path("fromMarketer").path("name").asText()).isEqualTo("Sam Spec");
        assertThat(items.get(1).path("toMarketer").path("name").asText()).isEqualTo("Mia Ng");
        assertThat(items.get(1).path("reason").asText()).isEqualTo("Sam is on leave");
        assertThat(items.get(1).path("actor").path("name").asText()).isEqualTo("Olivia Owner");
        assertThat(items.get(2).path("action").asText()).isEqualTo("ASSIGN");
        assertThat(items.get(2).path("at").asText()).isNotBlank();
        assertThat(h.path("currentMarketer").isNull()).isTrue();
    }

    @Test
    void aChangeThatChangesNothingWritesNoHistoryLine() throws Exception {
        assertStatus(moveTo(unseated, sam, null), 200);
        assertStatus(moveTo(unseated, sam, null), 200);
        assertThat(history(login("owner"), a, unseated).path("items")).hasSize(1);
    }

    @Test
    void theReasonIsLimitedAndScannedForSensitiveData() throws Exception {
        MvcResult r = moveTo(unseated, sam, "x".repeat(201));
        assertStatus(r, 422);
        MvcResult pii = moveTo(unseated, sam, "ssn 123-45-6789");
        assertCode(pii, 422, "SENSITIVE_CONTENT");
        assertThat(historyRows.countByOrgId(a.getId())).isZero();
    }

    // ---- handover ---------------------------------------------------------------------------------------------------------------

    @Test
    void aReassignmentMovesTheOpenWorkOfThatConsultantAndNothingElse() throws Exception {
        marketedBy(unseated, sam);
        MktTask open = task(a, unseated, sam, "IN_PROGRESS");
        MktTask done = task(a, unseated, sam, "COMPLETED");
        MktTask third = task(a, unseated, pat, "PENDING"); // someone else took this one on purpose
        MktTask otherConsultant = task(a, seated, sam, "PENDING");
        MktFollowup call = followup(a, unseated, sam, "PENDING");
        MktOpportunity live = opportunity(a, unseated, sam, "INTERESTED");
        MktOpportunity declined = opportunity(a, unseated, sam, "DECLINED");

        MvcResult r = moveTo(unseated, mia, "Sam is on leave");
        assertStatus(r, 200);

        assertThat(fresh(open).getOwnerMemberId()).isEqualTo(mia.getId());
        assertThat(fresh(done).getOwnerMemberId()).as("a finished task stays").isEqualTo(sam.getId());
        assertThat(fresh(third).getOwnerMemberId()).as("work owned by a third person stays").isEqualTo(pat.getId());
        assertThat(fresh(otherConsultant).getOwnerMemberId()).as("another consultant's work stays").isEqualTo(sam.getId());
        assertThat(followups.findByOrgIdAndId(a.getId(), call.getId()).orElseThrow().getOwnerMemberId()).isEqualTo(mia.getId());
        assertThat(opportunities.findByOrgIdAndId(a.getId(), live.getId()).orElseThrow().getOwnerMemberId()).isEqualTo(mia.getId());
        assertThat(opportunities.findByOrgIdAndId(a.getId(), declined.getId()).orElseThrow().getOwnerMemberId()).as("a declined opportunity is not open").isEqualTo(sam.getId());

        JsonNode line = history(login("owner"), a, unseated).path("items").get(0);
        assertThat(line.path("handover").asText()).isEqualTo("1 opportunities, 1 tasks, 1 follow-ups moved");
        assertThat(auditCount(a, "MARKETING_HANDOVER")).isEqualTo(1);
    }

    @Test
    void undoGivesTheWorkBackAndIsARestoreLine() throws Exception {
        marketedBy(unseated, sam);
        MktTask open = task(a, unseated, sam, "PENDING");
        MvcResult moved = moveTo(unseated, mia, null);
        assertStatus(moved, 200);
        JsonNode previous = json(moved).path("results").get(0).path("previous");
        String body = "{\"rows\":[{\"consultantId\":" + unseated.getId() + ",\"marketerMemberId\":" + previous.path("marketerMemberId").asLong()
            + ",\"priority\":\"" + previous.path("priority").asText() + "\",\"status\":\"" + previous.path("status").asText() + "\"}]}";
        assertStatus(call(login("owner"), post(base(a) + "/restore"), body, null, key()), 200);
        assertThat(fresh(open).getOwnerMemberId()).isEqualTo(sam.getId());
        JsonNode items = history(login("owner"), a, unseated).path("items");
        assertThat(items.get(0).path("action").asText()).isEqualTo("RESTORE");
        assertThat(items.get(1).path("action").asText()).isEqualTo("REASSIGN");
    }

    @Test
    void theAdminSwitchTurnsTheHandoverOffButTheHistoryStays() throws Exception {
        OrgSetting off = new OrgSetting();
        off.setOrgId(a.getId());
        off.setSettingKey(EnterpriseSettingKeys.ORG_ASSIGNMENTS_HANDOVER_OPEN_WORK);
        off.setValueJson("false");
        orgSettings.saveAndFlush(off);
        marketedBy(unseated, sam);
        MktTask open = task(a, unseated, sam, "PENDING");
        assertStatus(moveTo(unseated, mia, null), 200);
        assertThat(fresh(open).getOwnerMemberId()).isEqualTo(sam.getId());
        assertThat(history(login("owner"), a, unseated).path("items").get(0).path("action").asText()).isEqualTo("REASSIGN");
    }

    // ---- the org_assignment projection --------------------------------------------------------------------------------------------

    @Test
    void forAConsultantWithASeatTheSpecificationTableFollowsAndIsChained() throws Exception {
        assertStatus(moveTo(seated, sam, null), 200);
        em.flush();
        long samRow = openPrimaries(c1).get(0).getId();
        assertThat(openPrimaries(c1)).extracting(OrgAssignment::getAssigneeMemberId).containsExactly(sam.getId());

        assertStatus(moveTo(seated, mia, "Workload balance"), 200);
        em.flush();
        em.clear();
        List<OrgAssignment> open = openPrimaries(c1);
        assertThat(open).hasSize(1);
        assertThat(open.get(0).getAssigneeMemberId()).isEqualTo(mia.getId());
        assertThat(open.get(0).getReason()).isEqualTo("Workload balance");
        OrgAssignment ended = assignments.findByConsultant(a.getId(), c1.getId()).stream().filter(x -> x.getId() == samRow).findFirst().orElseThrow();
        assertThat(ended.getEndsAt()).isNotNull();
        assertThat(ended.getEndReason()).isEqualTo("REASSIGNED");
        assertThat(ended.getReplacedByAssignmentId()).isEqualTo(open.get(0).getId());
    }

    @Test
    void theBackupAndUnassignAreProjectedToo() throws Exception {
        assertStatus(moveTo(seated, sam, null), 200);
        assertStatus(call(login("owner"), post(base(a) + "/update"), "{\"consultantIds\":[" + seated.getId() + "],\"backupMemberId\":" + pat.getId() + "}", null, key()), 200);
        em.flush();
        assertThat(assignments.findOpenByConsultantAndKind(a.getId(), c1.getId(), AssignmentKind.BACKUP)).extracting(OrgAssignment::getAssigneeMemberId).containsExactly(pat.getId());
        assertStatus(call(login("owner"), post(base(a) + "/unassign"), "{\"consultantIds\":[" + seated.getId() + "]}", null, key()), 200);
        em.flush();
        assertThat(openPrimaries(c1)).isEmpty();
        assertThat(assignments.findOpenByConsultantAndKind(a.getId(), c1.getId(), AssignmentKind.BACKUP)).isEmpty();
    }

    @Test
    void aPausedAssignmentGrantsNothingInTheProjection() throws Exception {
        assertStatus(moveTo(seated, sam, null), 200);
        assertStatus(call(login("owner"), post(base(a) + "/update"), "{\"consultantIds\":[" + seated.getId() + "],\"status\":\"PAUSED\"}", null, key()), 200);
        em.flush();
        assertThat(openPrimaries(c1)).isEmpty();
        assertStatus(call(login("owner"), post(base(a) + "/update"), "{\"consultantIds\":[" + seated.getId() + "],\"status\":\"ACTIVE\"}", null, key()), 200);
        em.flush();
        assertThat(openPrimaries(c1)).extracting(OrgAssignment::getAssigneeMemberId).containsExactly(sam.getId());
    }

    private List<OrgAssignment> openPrimaries(OrgMember seat) {
        return assignments.findOpenByConsultantAndKind(a.getId(), seat.getId(), AssignmentKind.PRIMARY);
    }

    // ---- the tenant wall --------------------------------------------------------------------------------------------------------

    @Test
    void anotherOrganizationSeesNothingAndTouchesNothing() throws Exception {
        marketedBy(unseated, sam);
        MktTask mine = task(a, unseated, sam, "PENDING");
        ConsultantProfile theirs = profile(b, "Bea Consultant", null);
        MktTask theirTask = task(b, theirs, bOwner, "PENDING");
        assertStatus(moveTo(unseated, mia, "internal"), 200);

        // B's owner cannot read A's history, on A's path or on its own path with A's consultant id
        assertGeneric404(call(login("bowner"), get(base(a) + "/consultants/" + unseated.getId() + "/history")), "foreign org path");
        assertGeneric404(call(login("bowner"), get(base(b) + "/consultants/" + unseated.getId() + "/history")), "foreign consultant id on own path");
        // A's owner cannot read B's
        assertGeneric404(call(login("owner"), get(base(b) + "/consultants/" + theirs.getId() + "/history")), "A owner on B");
        // and B's work is untouched by A's handover
        assertThat(fresh(theirTask).getOwnerMemberId()).isEqualTo(bOwner.getId());
        assertThat(fresh(mine).getOwnerMemberId()).isEqualTo(mia.getId());
        assertThat(historyRows.countByOrgId(b.getId())).isZero();
    }

    @Test
    void aCallerWhoDoesNotSeeTheCurrentMarketerGetsTheGeneric404() throws Exception {
        marketedBy(unseated, mia);
        // sam (a specialist: no assignments.manage or workload.view) and the TEAM-scoped manager outside mia's team
        assertGeneric404(call(login("spec"), get(base(a) + "/consultants/" + unseated.getId() + "/history")), "specialist");
        assertGeneric404(call(login("mgr"), get(base(a) + "/consultants/" + unseated.getId() + "/history")), "manager outside the team");
        assertGeneric404(call(login("owner"), get(base(a) + "/consultants/99999999/history")), "no such consultant");
    }
}
