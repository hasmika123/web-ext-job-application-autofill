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
import com.dossier.api.domain.ent.talent.MarketerAssignmentSchedule;
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
import com.dossier.api.repository.ent.talent.MarketerAssignmentScheduleRepository;
import com.dossier.api.repository.ent.talent.MarketerCapacityRepository;
import com.dossier.api.repository.ent.talent.RequirementMatchRepository;
import com.dossier.api.service.dto.ent.MemberActionDTO;
import com.dossier.api.service.ent.marketing.AssignmentScheduleJob;
import com.dossier.api.service.ent.marketing.MarketerOffboardingService;
import com.dossier.api.service.privacy.JobLeaseService;
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
 * Planned changes of a consultant's marketer through the real chain (Sprint 2 / H-assign): reassign now or on a future day, temporary cover that ends by
 * itself through the scheduled job, the preview of what a handover moves, the licence cap {@code consultants.max}, the lease that keeps two instances from
 * applying the same plan, offboarding a marketer through the same lifecycle, and the tenant wall around all of it.
 *
 * <p>World (on top of {@link MemberItSupport}): marketers sam (Marketing Specialist, ASSIGNED scope, capacity 5), mia and pat (extra specialists), one consultant
 * PROFILE that holds the seat c1 and one without a seat. The owner (ORG scope) makes the changes. The job is driven with an explicit clock ({@code runOnce(now)}),
 * so "next week" costs nothing.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class OrgAssignmentScheduleIT extends MemberItSupport {

    @Autowired private ConsultantProfileRepository consultants;
    @Autowired private MarketerAssignmentRepository assignmentRows;
    @Autowired private MarketerAssignmentEventRepository historyRows;
    @Autowired private MarketerAssignmentScheduleRepository scheduleRows;
    @Autowired private MarketerCapacityRepository capacityRows;
    @Autowired private MktTaskRepository tasks;
    @Autowired private MktFollowupRepository followups;
    @Autowired private MktOpportunityRepository opportunities;
    @Autowired private ClientAccountRepository clients;
    @Autowired private ClientRequirementRepository requirements;
    @Autowired private RequirementMatchRepository matches;
    @Autowired private OrgSettingRepository orgSettings;
    @Autowired private AssignmentScheduleJob job;
    @Autowired private JobLeaseService leases;
    @Autowired private MarketerOffboardingService offboarding;

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

    private void setting(String key, String value) {
        OrgSetting s = new OrgSetting();
        s.setOrgId(a.getId());
        s.setSettingKey(key);
        s.setValueJson(value);
        orgSettings.saveAndFlush(s);
    }

    private static String base(Organization o) {
        return "/api/orgs/" + o.getId() + "/marketing-assignments";
    }

    private static String iso(Duration fromNow) {
        return Instant.now().plus(fromNow).toString();
    }

    private MvcResult reassign(ConsultantProfile c, OrgMember to, Duration at, String reason) throws Exception {
        String body = "{\"consultantId\":" + c.getId() + ",\"newMarketerMemberId\":" + to.getId() + (at == null ? "" : ",\"effectiveAt\":\"" + iso(at) + "\"") + (reason == null ? "" : ",\"reason\":\"" + reason + "\"") + "}";
        return call(login("owner"), post(base(a) + "/reassign"), body, null, key());
    }

    private MvcResult delegate(ConsultantProfile c, OrgMember cover, Duration start, Duration end, String reason) throws Exception {
        String body = "{\"consultantId\":" + c.getId() + ",\"coverMarketerMemberId\":" + cover.getId() + (start == null ? "" : ",\"startsAt\":\"" + iso(start) + "\"") + (end == null ? "" : ",\"endsAt\":\"" + iso(end) + "\"")
            + (reason == null ? "" : ",\"reason\":\"" + reason + "\"") + "}";
        return call(login("owner"), post(base(a) + "/delegate"), body, null, key());
    }

    private MvcResult assignNow(ConsultantProfile c, OrgMember to) throws Exception {
        String body = "{\"consultantIds\":[" + c.getId() + "],\"marketerMemberId\":" + to.getId() + ",\"allowOverCapacity\":true}";
        return call(login("owner"), post(base(a) + "/assign"), body, null, key());
    }

    private MvcResult cancel(String login, Organization org, long scheduleId) throws Exception {
        return call(login, post(base(org) + "/schedules/" + scheduleId + "/cancel"), null, null, key());
    }

    private JsonNode history(ConsultantProfile c) throws Exception {
        MvcResult r = call(login("owner"), get(base(a) + "/consultants/" + c.getId() + "/history"));
        assertStatus(r, 200);
        return json(r).path("items");
    }

    private Long marketerOf(ConsultantProfile c) {
        em.flush();
        em.clear();
        return assignmentRows.findByOrgIdAndConsultantId(a.getId(), c.getId()).map(MarketerAssignment::getMarketerMemberId).orElse(null);
    }

    private MarketerAssignmentSchedule plan(long id) {
        em.flush();
        em.clear();
        return scheduleRows.findByOrgIdAndId(a.getId(), id).orElseThrow();
    }

    private MktTask fresh(MktTask t) {
        em.flush();
        em.clear();
        return tasks.findByOrgIdAndId(t.getOrgId(), t.getId()).orElseThrow();
    }

    private List<OrgAssignment> openPrimaries(OrgMember seat) {
        return assignments.findOpenByConsultantAndKind(a.getId(), seat.getId(), AssignmentKind.PRIMARY);
    }

    // ---- the preview ------------------------------------------------------------------------------------------------------------

    @Test
    void thePreviewCountsWhatWouldMoveAndTouchesNothing() throws Exception {
        marketedBy(unseated, sam);
        MktTask open = task(a, unseated, sam, "IN_PROGRESS");
        task(a, unseated, sam, "COMPLETED");
        task(a, unseated, pat, "PENDING");
        followup(a, unseated, sam, "PENDING");
        opportunity(a, unseated, sam, "INTERESTED");
        opportunity(a, unseated, sam, "DECLINED");
        marketedBy(seated, mia); // the new marketer already carries one consultant

        MvcResult r = call(login("owner"), get(base(a) + "/handover-preview?consultantId=" + unseated.getId() + "&toMemberId=" + mia.getId()));
        assertStatus(r, 200);
        JsonNode p = json(r);
        assertThat(p.path("opportunities").asInt()).isEqualTo(1);
        assertThat(p.path("tasks").asInt()).isEqualTo(1);
        assertThat(p.path("followups").asInt()).isEqualTo(1);
        assertThat(p.path("total").asInt()).isEqualTo(3);
        assertThat(p.path("handoverEnabled").asBoolean()).isTrue();
        assertThat(p.path("from").path("name").asText()).isEqualTo("Sam Spec");
        assertThat(p.path("to").path("name").asText()).isEqualTo("Mia Ng");
        assertThat(p.path("toAssigned").asInt()).isEqualTo(1);
        assertThat(p.path("toCapacity").asInt()).isEqualTo(5);
        assertThat(p.path("overCapacity").asBoolean()).isFalse();
        assertThat(p.path("licenceMax").isNull()).isTrue();
        assertThat(p.path("pending")).isEmpty();
        assertThat(fresh(open).getOwnerMemberId()).as("a preview moves nothing").isEqualTo(sam.getId());
        assertThat(historyRows.countByOrgId(a.getId())).isZero();
        assertThat(auditCount(a, "MARKETING_HANDOVER")).isZero();
    }

    @Test
    void thePreviewSaysNothingMovesWhenTheAdminSwitchIsOff() throws Exception {
        setting(EnterpriseSettingKeys.ORG_ASSIGNMENTS_HANDOVER_OPEN_WORK, "false");
        marketedBy(unseated, sam);
        task(a, unseated, sam, "PENDING");
        JsonNode p = json(call(login("owner"), get(base(a) + "/handover-preview?consultantId=" + unseated.getId() + "&toMemberId=" + mia.getId())));
        assertThat(p.path("handoverEnabled").asBoolean()).isFalse();
        assertThat(p.path("total").asInt()).isZero();
    }

    @Test
    void thePreviewForAnUnassignedConsultantHasNothingToMove() throws Exception {
        JsonNode p = json(call(login("owner"), get(base(a) + "/handover-preview?consultantId=" + unseated.getId())));
        assertThat(p.path("from").isNull()).isTrue();
        assertThat(p.path("total").asInt()).isZero();
    }

    // ---- reassign now / later -----------------------------------------------------------------------------------------------------

    @Test
    void aReassignWithoutADateIsTheSameChangeAsAssign() throws Exception {
        marketedBy(unseated, sam);
        MktTask open = task(a, unseated, sam, "PENDING");
        MvcResult r = reassign(unseated, mia, null, "Workload balance");
        assertStatus(r, 200);
        assertThat(json(r).path("status").asText()).isEqualTo("DONE");
        assertThat(json(r).path("applied").path("ok").asInt()).isEqualTo(1);
        assertThat(json(r).path("schedule").isNull()).isTrue();
        assertThat(marketerOf(unseated)).isEqualTo(mia.getId());
        assertThat(fresh(open).getOwnerMemberId()).isEqualTo(mia.getId());
        assertThat(history(unseated).get(0).path("action").asText()).isEqualTo("REASSIGN");
        assertThat(scheduleRows.countByOrgId(a.getId())).isZero();
    }

    @Test
    void aDateWithinAMinuteOfNowCountsAsNow() throws Exception {
        marketedBy(unseated, sam);
        MvcResult r = reassign(unseated, mia, Duration.ofSeconds(20), null);
        assertThat(json(r).path("status").asText()).isEqualTo("DONE");
        assertThat(marketerOf(unseated)).isEqualTo(mia.getId());
    }

    @Test
    void aFutureHandoverIsPlannedTheJobAppliesItOnTheDayAndRunningItAgainChangesNothing() throws Exception {
        marketedBy(seated, sam);
        MktTask open = task(a, seated, sam, "IN_PROGRESS");
        MktFollowup call = followup(a, seated, sam, "PENDING");
        MktOpportunity live = opportunity(a, seated, sam, "ASSIGNED");

        MvcResult r = reassign(seated, mia, Duration.ofDays(10), "Rotation");
        assertStatus(r, 200);
        JsonNode planned = json(r);
        assertThat(planned.path("status").asText()).isEqualTo("SCHEDULED");
        assertThat(planned.path("applied").isNull()).isTrue();
        long id = planned.path("schedule").path("id").asLong();
        assertThat(planned.path("schedule").path("newMarketer").path("name").asText()).isEqualTo("Mia Ng");
        assertThat(planned.path("schedule").path("currentMarketer").path("name").asText()).isEqualTo("Sam Spec");
        assertThat(auditCount(a, "MARKETING_SCHEDULE")).isEqualTo(1);

        // nothing happens today
        assertThat(marketerOf(seated)).isEqualTo(sam.getId());
        assertThat(historyRows.countByOrgId(a.getId())).isZero();
        assertThat(job.runOnce(Instant.now().plus(Duration.ofDays(5))).orElseThrow().total()).isZero();
        assertThat(marketerOf(seated)).isEqualTo(sam.getId());

        // on the day
        AssignmentScheduleJobResult day = new AssignmentScheduleJobResult(job.runOnce(Instant.now().plus(Duration.ofDays(11))).orElseThrow());
        assertThat(day.started).isEqualTo(1);
        assertThat(marketerOf(seated)).isEqualTo(mia.getId());
        assertThat(plan(id).getStatus()).isEqualTo(MarketerAssignmentSchedule.DONE);
        assertThat(plan(id).getOutcome()).isEqualTo("APPLIED");
        assertThat(fresh(open).getOwnerMemberId()).as("the open work moved with the consultant").isEqualTo(mia.getId());
        assertThat(followups.findByOrgIdAndId(a.getId(), call.getId()).orElseThrow().getOwnerMemberId()).isEqualTo(mia.getId());
        assertThat(opportunities.findByOrgIdAndId(a.getId(), live.getId()).orElseThrow().getOwnerMemberId()).isEqualTo(mia.getId());
        JsonNode line = history(seated).get(0);
        assertThat(line.path("action").asText()).isEqualTo("REASSIGN");
        assertThat(line.path("reason").asText()).isEqualTo("Rotation");
        assertThat(line.path("toMarketer").path("name").asText()).isEqualTo("Mia Ng");
        assertThat(line.path("handover").asText()).isEqualTo("1 opportunities, 1 tasks, 1 follow-ups moved");
        assertThat(auditCount(a, "MARKETING_REASSIGN")).isEqualTo(1);
        assertThat(auditCount(a, "MARKETING_HANDOVER")).isEqualTo(1);
        em.flush();
        assertThat(openPrimaries(c1)).extracting(OrgAssignment::getAssigneeMemberId).as("the specification table follows").containsExactly(mia.getId());

        // a second run finds nothing due
        assertThat(job.runOnce(Instant.now().plus(Duration.ofDays(12))).orElseThrow().total()).isZero();
        assertThat(historyRows.countByOrgId(a.getId())).isEqualTo(1);
    }

    /** Small readability wrapper for the job's answer. */
    private static final class AssignmentScheduleJobResult {
        final int started;

        AssignmentScheduleJobResult(com.dossier.api.service.ent.marketing.AssignmentScheduleService.RunResult r) {
            this.started = r.started();
        }
    }

    @Test
    void aHandoverCanBePlannedForAnUnassignedConsultantByAnOrganizationWideCaller() throws Exception {
        MvcResult r = reassign(unseated, mia, Duration.ofDays(3), null);
        assertThat(json(r).path("status").asText()).isEqualTo("SCHEDULED");
        job.runOnce(Instant.now().plus(Duration.ofDays(4)));
        assertThat(marketerOf(unseated)).isEqualTo(mia.getId());
        assertThat(history(unseated).get(0).path("action").asText()).isEqualTo("ASSIGN");
    }

    @Test
    void theDateRulesAreEnforced() throws Exception {
        marketedBy(unseated, sam);
        assertStatus(reassign(unseated, mia, Duration.ofDays(200), null), 422); // default: at most 180 days ahead
        setting(EnterpriseSettingKeys.ORG_ASSIGNMENTS_SCHEDULE_MAX_DAYS, "365");
        assertStatus(reassign(unseated, mia, Duration.ofDays(200), null), 200);
        assertCode(reassign(unseated, pat, Duration.ofDays(20), null), 409, "SCHEDULE_EXISTS"); // one waiting handover per consultant
        assertThat(scheduleRows.countByOrgId(a.getId())).isEqualTo(1);
    }

    @Test
    void thePlannedMarketerMustStillBeActiveWhenTheDayComes() throws Exception {
        marketedBy(unseated, sam);
        long id = json(reassign(unseated, mia, Duration.ofDays(2), null)).path("schedule").path("id").asLong();
        MarketerCapacity c = capacityRows.findByOrgIdAndMemberId(a.getId(), mia.getId()).orElseThrow();
        c.setStatus("PAUSED");
        capacityRows.saveAndFlush(c);
        assertThat(job.runOnce(Instant.now().plus(Duration.ofDays(3))).orElseThrow().failed()).isEqualTo(1);
        assertThat(plan(id).getStatus()).isEqualTo(MarketerAssignmentSchedule.FAILED);
        assertThat(plan(id).getOutcome()).isEqualTo("MARKETER_INVALID");
        assertThat(marketerOf(unseated)).isEqualTo(sam.getId());
        assertThat(auditCount(a, "MARKETING_SCHEDULE_FAILED")).isEqualTo(1);
    }

    @Test
    void cancellingAPlanStopsIt() throws Exception {
        marketedBy(unseated, sam);
        long id = json(reassign(unseated, mia, Duration.ofDays(5), null)).path("schedule").path("id").asLong();
        MvcResult r = cancel(login("owner"), a, id);
        assertStatus(r, 200);
        assertThat(json(r).path("status").asText()).isEqualTo("CANCELLED");
        assertThat(auditCount(a, "MARKETING_SCHEDULE_CANCEL")).isEqualTo(1);
        assertThat(job.runOnce(Instant.now().plus(Duration.ofDays(6))).orElseThrow().total()).isZero();
        assertThat(marketerOf(unseated)).isEqualTo(sam.getId());
        assertCode(cancel(login("owner"), a, id), 409, "NOT_PENDING");
    }

    @Test
    void unassigningTheConsultantCancelsWhatWaitedForThem() throws Exception {
        marketedBy(unseated, sam);
        long id = json(reassign(unseated, mia, Duration.ofDays(5), null)).path("schedule").path("id").asLong();
        assertStatus(call(login("owner"), post(base(a) + "/unassign"), "{\"consultantIds\":[" + unseated.getId() + "]}", null, key()), 200);
        assertThat(plan(id).getStatus()).isEqualTo(MarketerAssignmentSchedule.CANCELLED);
        assertThat(plan(id).getOutcome()).isEqualTo("CONSULTANT_UNASSIGNED");
    }

    // ---- temporary cover ----------------------------------------------------------------------------------------------------------

    @Test
    void coverMovesTheConsultantNowAndTheJobGivesThemBackWithTheWorkOnTheEndDate() throws Exception {
        marketedBy(seated, sam);
        MktTask open = task(a, seated, sam, "IN_PROGRESS");
        MktOpportunity live = opportunity(a, seated, sam, "INTERESTED");

        MvcResult r = delegate(seated, mia, null, Duration.ofDays(7), "On leave until the 12th");
        assertStatus(r, 200);
        JsonNode started = json(r);
        long id = started.path("id").asLong();
        assertThat(started.path("kind").asText()).isEqualTo("DELEGATE");
        assertThat(started.path("status").asText()).isEqualTo("ACTIVE");
        assertThat(started.path("returnMarketer").path("name").asText()).isEqualTo("Sam Spec");
        assertThat(marketerOf(seated)).isEqualTo(mia.getId());
        assertThat(fresh(open).getOwnerMemberId()).as("the cover takes the open work").isEqualTo(mia.getId());
        assertThat(opportunities.findByOrgIdAndId(a.getId(), live.getId()).orElseThrow().getOwnerMemberId()).isEqualTo(mia.getId());
        JsonNode first = history(seated).get(0);
        assertThat(first.path("action").asText()).isEqualTo("DELEGATE");
        assertThat(first.path("reason").asText()).isEqualTo("On leave until the 12th");
        assertThat(first.path("actor").path("name").asText()).isEqualTo("Olivia Owner");
        assertThat(auditCount(a, "MARKETING_SCHEDULE")).isEqualTo(1);
        assertThat(auditCount(a, "MARKETING_DELEGATE_START")).isEqualTo(1);
        em.flush();
        assertThat(openPrimaries(c1)).extracting(OrgAssignment::getAssigneeMemberId).containsExactly(mia.getId());

        // before the end date the job leaves the cover alone
        assertThat(job.runOnce(Instant.now().plus(Duration.ofDays(3))).orElseThrow().total()).isZero();
        assertThat(marketerOf(seated)).isEqualTo(mia.getId());

        // the cover creates work of its own meanwhile: it goes back with the consultant
        MktTask mine = task(a, seated, mia, "PENDING");
        var end = job.runOnce(Instant.now().plus(Duration.ofDays(8))).orElseThrow();
        assertThat(end.ended()).isEqualTo(1);
        assertThat(marketerOf(seated)).isEqualTo(sam.getId());
        assertThat(plan(id).getStatus()).isEqualTo(MarketerAssignmentSchedule.ENDED);
        assertThat(plan(id).getOutcome()).isEqualTo("RETURNED");
        assertThat(fresh(open).getOwnerMemberId()).isEqualTo(sam.getId());
        assertThat(fresh(mine).getOwnerMemberId()).isEqualTo(sam.getId());
        JsonNode back = history(seated).get(0);
        assertThat(back.path("action").asText()).isEqualTo("DELEGATE_END");
        assertThat(back.path("toMarketer").path("name").asText()).isEqualTo("Sam Spec");
        assertThat(auditCount(a, "MARKETING_DELEGATE_END")).isEqualTo(1);
        em.flush();
        em.clear();
        assertThat(openPrimaries(c1)).extracting(OrgAssignment::getAssigneeMemberId).containsExactly(sam.getId());

        // a second run is a no-op
        assertThat(job.runOnce(Instant.now().plus(Duration.ofDays(9))).orElseThrow().total()).isZero();
        assertThat(historyRows.countByOrgId(a.getId())).isEqualTo(2);
    }

    @Test
    void coverThatStartsLaterStartsAndEndsFromTheJob() throws Exception {
        marketedBy(unseated, sam);
        long id = json(delegate(unseated, mia, Duration.ofDays(3), Duration.ofDays(5), "Conference week")).path("id").asLong();
        assertThat(plan(id).getStatus()).isEqualTo(MarketerAssignmentSchedule.SCHEDULED);
        assertThat(marketerOf(unseated)).isEqualTo(sam.getId());
        assertThat(job.runOnce(Instant.now().plus(Duration.ofDays(4))).orElseThrow().started()).isEqualTo(1);
        assertThat(plan(id).getStatus()).isEqualTo(MarketerAssignmentSchedule.ACTIVE);
        assertThat(marketerOf(unseated)).isEqualTo(mia.getId());
        assertThat(plan(id).getReturnMarketerMemberId()).isEqualTo(sam.getId());
        assertThat(job.runOnce(Instant.now().plus(Duration.ofDays(6))).orElseThrow().ended()).isEqualTo(1);
        assertThat(marketerOf(unseated)).isEqualTo(sam.getId());
    }

    @Test
    void coverWhoseWholeWindowPassedWhileTheJobWasDownIsDroppedWithoutMovingAnyone() throws Exception {
        marketedBy(unseated, sam);
        long id = json(delegate(unseated, mia, Duration.ofDays(3), Duration.ofDays(5), "Conference week")).path("id").asLong();
        job.runOnce(Instant.now().plus(Duration.ofDays(30)));
        assertThat(plan(id).getStatus()).isEqualTo(MarketerAssignmentSchedule.CANCELLED);
        assertThat(plan(id).getOutcome()).isEqualTo("EXPIRED_BEFORE_START");
        assertThat(marketerOf(unseated)).isEqualTo(sam.getId());
        assertThat(historyRows.countByOrgId(a.getId())).isZero();
    }

    @Test
    void coverCanBeEndedEarlyAndTheConsultantGoesBack() throws Exception {
        marketedBy(unseated, sam);
        MktTask open = task(a, unseated, sam, "PENDING");
        long id = json(delegate(unseated, mia, null, Duration.ofDays(20), "Long leave")).path("id").asLong();
        assertThat(fresh(open).getOwnerMemberId()).isEqualTo(mia.getId());
        MvcResult r = cancel(login("owner"), a, id);
        assertStatus(r, 200);
        assertThat(json(r).path("status").asText()).isEqualTo("ENDED");
        assertThat(json(r).path("outcome").asText()).isEqualTo("ENDED_EARLY");
        assertThat(marketerOf(unseated)).isEqualTo(sam.getId());
        assertThat(fresh(open).getOwnerMemberId()).isEqualTo(sam.getId());
        assertThat(history(unseated).get(0).path("action").asText()).isEqualTo("DELEGATE_END");
    }

    @Test
    void aChangeByHandDuringCoverEndsTheCoverAndNothingIsGivenBackLater() throws Exception {
        marketedBy(unseated, sam);
        long id = json(delegate(unseated, mia, null, Duration.ofDays(7), "Leave")).path("id").asLong();
        assertStatus(assignNow(unseated, pat), 200);
        assertThat(plan(id).getStatus()).isEqualTo(MarketerAssignmentSchedule.ENDED);
        assertThat(plan(id).getOutcome()).isEqualTo("SUPERSEDED");
        job.runOnce(Instant.now().plus(Duration.ofDays(8)));
        assertThat(marketerOf(unseated)).as("what the administrator decided stays").isEqualTo(pat.getId());
    }

    @Test
    void ifTheMarketerToReturnToHasGoneTheCoverStaysAndTheOutcomeSaysSo() throws Exception {
        marketedBy(unseated, sam);
        long id = json(delegate(unseated, mia, null, Duration.ofDays(7), "Leave")).path("id").asLong();
        em.createQuery("delete from MarketerCapacity c where c.orgId = :o and c.memberId = :m").setParameter("o", a.getId()).setParameter("m", sam.getId()).executeUpdate();
        em.clear();
        job.runOnce(Instant.now().plus(Duration.ofDays(8)));
        assertThat(plan(id).getStatus()).isEqualTo(MarketerAssignmentSchedule.ENDED);
        assertThat(plan(id).getOutcome()).isEqualTo("RETURN_UNAVAILABLE");
        assertThat(marketerOf(unseated)).isEqualTo(mia.getId());
    }

    @Test
    void theCoverRulesAreEnforced() throws Exception {
        marketedBy(unseated, sam);
        assertStatus(delegate(unseated, mia, null, Duration.ofDays(5), null), 422); // a reason is required
        assertStatus(delegate(unseated, mia, null, Duration.ofDays(5), "ab"), 422);
        assertStatus(delegate(unseated, mia, null, null, "Leave"), 422); // an end date is required
        assertStatus(delegate(unseated, mia, Duration.ofDays(3), Duration.ofDays(2), "Leave"), 422); // ends before it starts
        assertStatus(delegate(unseated, mia, null, Duration.ofDays(100), "Leave"), 422); // default maximum 90 days
        assertCode(delegate(unseated, mia, null, Duration.ofDays(5), "ssn 123-45-6789"), 422, "SENSITIVE_CONTENT");
        assertCode(delegate(unseated, sam, null, Duration.ofDays(5), "Leave"), 409, "ALREADY_MARKETER");
        assertCode(delegate(seated, mia, null, Duration.ofDays(5), "Leave"), 422, "NOT_ASSIGNED"); // nobody to cover for
        MarketerCapacity paused = capacityRows.findByOrgIdAndMemberId(a.getId(), pat.getId()).orElseThrow();
        paused.setStatus("PAUSED");
        capacityRows.saveAndFlush(paused);
        assertCode(delegate(unseated, pat, null, Duration.ofDays(5), "Leave"), 422, "MARKETER_INVALID");
        assertThat(scheduleRows.countByOrgId(a.getId())).isZero();

        setting(EnterpriseSettingKeys.ORG_ASSIGNMENTS_DELEGATE_MAX_DAYS, "120");
        assertStatus(delegate(unseated, mia, null, Duration.ofDays(100), "Leave"), 200); // the organization's own maximum
        assertCode(delegate(unseated, sam, null, Duration.ofDays(5), "Leave"), 409, "SCHEDULE_EXISTS"); // one cover at a time
    }

    // ---- the licence cap ---------------------------------------------------------------------------------------------------------

    @Test
    void theLicenceCapStopsAnAssignmentAndNoAnywayBypassesIt() throws Exception {
        setting(EnterpriseSettingKeys.ORG_LICENSE_CONSULTANTS_MAX, "1");
        marketedBy(seated, mia); // mia already carries her one
        MvcResult r = assignNow(unseated, mia); // moveTo-style call, with allowOverCapacity true
        assertCode(r, 409, "CONSULTANTS_LIMIT");
        assertThat(json(r).path("max").asInt()).isEqualTo(1);
        assertThat(json(r).path("current").asInt()).isEqualTo(1);
        assertThat(json(r).path("projected").asInt()).isEqualTo(2);
        assertThat(marketerOf(unseated)).isNull();
        // the same through reassign, and through cover
        marketedBy(unseated, sam);
        MvcResult viaReassign = call(login("owner"), post(base(a) + "/reassign"), "{\"consultantId\":" + unseated.getId() + ",\"newMarketerMemberId\":" + mia.getId() + ",\"allowOverCapacity\":true}", null, key());
        assertCode(viaReassign, 409, "CONSULTANTS_LIMIT");
        assertCode(delegate(unseated, mia, null, Duration.ofDays(3), "Leave"), 409, "CONSULTANTS_LIMIT");
        // a marketer under the cap is fine
        assertStatus(reassign(unseated, pat, null, null), 200);
        // the preview tells the sheet before the click
        JsonNode preview = json(call(login("owner"), get(base(a) + "/handover-preview?consultantId=" + unseated.getId() + "&toMemberId=" + mia.getId())));
        assertThat(preview.path("licenceMax").asInt()).isEqualTo(1);
        assertThat(preview.path("overLicence").asBoolean()).isTrue();
    }

    @Test
    void withNoCapSetNothingIsLimitedByTheLicence() throws Exception {
        marketedBy(seated, mia);
        assertStatus(assignNow(unseated, mia), 200);
        assertThat(marketerOf(unseated)).isEqualTo(mia.getId());
    }

    @Test
    void aCapThatArrivesBeforeTheDayStopsThePlanAtTheDay() throws Exception {
        marketedBy(unseated, sam);
        marketedBy(seated, mia);
        long id = json(reassign(unseated, mia, Duration.ofDays(3), null)).path("schedule").path("id").asLong();
        setting(EnterpriseSettingKeys.ORG_LICENSE_CONSULTANTS_MAX, "1");
        assertThat(job.runOnce(Instant.now().plus(Duration.ofDays(4))).orElseThrow().failed()).isEqualTo(1);
        assertThat(plan(id).getStatus()).isEqualTo(MarketerAssignmentSchedule.FAILED);
        assertThat(plan(id).getOutcome()).isEqualTo("CONSULTANTS_LIMIT");
        assertThat(marketerOf(unseated)).isEqualTo(sam.getId());
    }

    // ---- the lease ---------------------------------------------------------------------------------------------------------------

    @Test
    void anInstanceThatDoesNotHoldTheLeaseDoesNotApplyAnything() throws Exception {
        marketedBy(unseated, sam);
        long id = json(reassign(unseated, mia, Duration.ofDays(2), null)).path("schedule").path("id").asLong();
        Instant later = Instant.now().plus(Duration.ofDays(3));
        assertThat(leases.tryAcquire(AssignmentScheduleJob.LEASE, "another-instance", Duration.ofMinutes(10), later)).isTrue();
        assertThat(job.runOnce(later)).as("the other instance holds the lease").isEmpty();
        assertThat(marketerOf(unseated)).isEqualTo(sam.getId());
        assertThat(plan(id).getStatus()).isEqualTo(MarketerAssignmentSchedule.SCHEDULED);
        leases.release(AssignmentScheduleJob.LEASE, "another-instance", "done", later);
        assertThat(job.runOnce(later).orElseThrow().started()).isEqualTo(1);
        assertThat(marketerOf(unseated)).isEqualTo(mia.getId());
    }

    // ---- offboarding a marketer ---------------------------------------------------------------------------------------------------

    @Test
    void offboardingAMarketerAppliesTheReassignmentsAndHandsTheRestToTheBackupOrNobody() throws Exception {
        marketedBy(seated, sam); // named in the request: goes to pat
        MarketerAssignment withBackup = marketedBy(unseated, sam); // not named, has a backup: the backup takes over
        withBackup.setBackupMemberId(mia.getId());
        assignmentRows.saveAndFlush(withBackup);
        ConsultantProfile third = profile(a, "Third Consultant", null);
        marketedBy(third, sam); // not named, no backup: nobody
        ConsultantProfile coveredBySam = profile(a, "Backed By Sam", null);
        MarketerAssignment backedBySam = marketedBy(coveredBySam, pat);
        backedBySam.setBackupMemberId(sam.getId());
        assignmentRows.saveAndFlush(backedBySam);
        MktTask seatedTask = task(a, seated, sam, "PENDING");
        MktTask unseatedTask = task(a, unseated, sam, "PENDING");

        var result = offboarding.apply(a.getId(), sam.getId(), login("owner"), "Left the company", List.of(new MemberActionDTO.Reassignment(c1.getId(), pat.getId())));
        assertThat(result.reassigned()).isEqualTo(1);
        assertThat(result.promotedBackup()).isEqualTo(1);
        assertThat(result.unassigned()).isEqualTo(1);
        assertThat(result.backupCleared()).isEqualTo(1);

        assertThat(marketerOf(seated)).isEqualTo(pat.getId());
        assertThat(marketerOf(unseated)).isEqualTo(mia.getId());
        assertThat(marketerOf(third)).isNull();
        assertThat(assignmentRows.findByOrgIdAndConsultantId(a.getId(), coveredBySam.getId()).orElseThrow().getBackupMemberId()).isNull();
        assertThat(capacityRows.findByOrgIdAndMemberId(a.getId(), sam.getId()).orElseThrow().getStatus()).as("nobody is assigned to them again").isEqualTo("PAUSED");
        assertThat(fresh(seatedTask).getOwnerMemberId()).as("the open work follows the named assignee").isEqualTo(pat.getId());
        assertThat(fresh(unseatedTask).getOwnerMemberId()).as("and the backup").isEqualTo(mia.getId());
        assertThat(history(seated).get(0).path("action").asText()).isEqualTo("REASSIGN");
        assertThat(history(unseated).get(0).path("toMarketer").path("name").asText()).isEqualTo("Mia Ng");
        assertThat(history(third).get(0).path("action").asText()).isEqualTo("UNASSIGN");
        assertThat(auditCount(a, MarketerOffboardingService.AUDIT_OFFBOARD)).isEqualTo(1);
        em.flush();
        assertThat(openPrimaries(c1)).extracting(OrgAssignment::getAssigneeMemberId).as("the specification table follows").containsExactly(pat.getId());
    }

    @Test
    void offboardingTheMarketerThroughTheRealEndpointRunsTheSameStep() throws Exception {
        marketedBy(seated, sam);
        String body = "{\"reason\":\"Left the company\",\"confirm\":\"Sam Spec\",\"reassignments\":[{\"consultantMemberId\":" + c1.getId() + ",\"newAssigneeMemberId\":" + pat.getId() + "}]}";
        JsonNode preview = json(call(login("owner"), get(memberUrl(a, sam) + "/offboard-preview")));
        List<String> kinds = new java.util.ArrayList<>();
        for (JsonNode l : preview.path("lines")) kinds.add(l.path("kind").asText());
        assertThat(kinds).as("the wizard says before anyone clicks that the consultants are affected").contains("MARKETER_CONSULTANTS");
        MvcResult r = call(login("owner"), post(memberUrl(a, sam) + "/offboard"), body, null, key());
        assertStatus(r, 200);
        assertThat(marketerOf(seated)).isEqualTo(pat.getId());
        assertThat(auditCount(a, MarketerOffboardingService.AUDIT_OFFBOARD)).isEqualTo(1);
    }

    @Test
    void offboardingEndsPlansThatInvolveThePerson() throws Exception {
        marketedBy(unseated, sam);
        marketedBy(seated, mia);
        long coverFromSam = json(delegate(unseated, pat, null, Duration.ofDays(9), "Leave")).path("id").asLong(); // pat covers sam's consultant
        long waitingForPat = json(reassign(seated, pat, Duration.ofDays(4), null)).path("schedule").path("id").asLong();
        offboarding.apply(a.getId(), pat.getId(), login("owner"), "Left", List.of());
        assertThat(plan(waitingForPat).getStatus()).isEqualTo(MarketerAssignmentSchedule.CANCELLED);
        assertThat(plan(waitingForPat).getOutcome()).isEqualTo("MEMBER_LEFT");
        assertThat(plan(coverFromSam).getStatus()).isEqualTo(MarketerAssignmentSchedule.ENDED);
        assertThat(marketerOf(unseated)).as("the consultant went back to the marketer the cover was taken from").isEqualTo(sam.getId());
    }

    // ---- the tenant wall ------------------------------------------------------------------------------------------------------------

    @Test
    void anotherOrganizationSeesNothingAndTouchesNothing() throws Exception {
        marketedBy(unseated, sam);
        long id = json(reassign(unseated, mia, Duration.ofDays(5), null)).path("schedule").path("id").asLong();
        ConsultantProfile theirs = profile(b, "Bea Consultant", null);

        assertGeneric404(cancel(login("bowner"), a, id), "foreign org path");
        assertGeneric404(cancel(login("bowner"), b, id), "foreign schedule id on own path");
        assertGeneric404(call(login("bowner"), get(base(a) + "/schedules")), "foreign list");
        assertGeneric404(call(login("bowner"), get(base(a) + "/handover-preview?consultantId=" + unseated.getId())), "foreign preview");
        assertGeneric404(call(login("bowner"), get(base(b) + "/handover-preview?consultantId=" + unseated.getId())), "foreign consultant id on own path");
        assertGeneric404(call(login("bowner"), get(base(b) + "/schedules?consultantId=" + unseated.getId())), "foreign consultant id on own list");
        assertGeneric404(call(login("owner"), post(base(a) + "/delegate"), "{\"consultantId\":" + theirs.getId() + ",\"coverMarketerMemberId\":" + mia.getId() + ",\"endsAt\":\"" + iso(Duration.ofDays(3)) + "\",\"reason\":\"Leave\"}", null, key()), "A's owner on B's consultant");
        assertThat(json(call(login("bowner"), get(base(b) + "/schedules"))).path("items")).as("B sees none of A's plans").isEmpty();
        assertThat(plan(id).getStatus()).isEqualTo(MarketerAssignmentSchedule.SCHEDULED);
        assertThat(scheduleRows.countByOrgId(b.getId())).isZero();
    }

    @Test
    void aCallerWithoutThePermissionGetsTheGeneric404OnEveryNewRoute() throws Exception {
        marketedBy(unseated, mia);
        long id = json(reassign(unseated, pat, Duration.ofDays(5), null)).path("schedule").path("id").asLong();
        // a specialist holds neither workload.view nor assignments.manage
        assertGeneric404(call(login("spec"), get(base(a) + "/schedules")), "list");
        assertGeneric404(call(login("spec"), get(base(a) + "/handover-preview?consultantId=" + unseated.getId())), "preview");
        assertGeneric404(call(login("spec"), post(base(a) + "/reassign"), "{\"consultantId\":" + unseated.getId() + ",\"newMarketerMemberId\":" + sam.getId() + "}", null, key()), "reassign");
        assertGeneric404(call(login("spec"), post(base(a) + "/delegate"), "{\"consultantId\":" + unseated.getId() + ",\"coverMarketerMemberId\":" + sam.getId() + ",\"endsAt\":\"" + iso(Duration.ofDays(3)) + "\",\"reason\":\"Leave\"}", null, key()), "delegate");
        assertGeneric404(cancel(login("spec"), a, id), "cancel");
        // and the write routes need an Idempotency-Key, after the permission wall
        assertCode(call(login("owner"), post(base(a) + "/reassign"), "{\"consultantId\":" + unseated.getId() + ",\"newMarketerMemberId\":" + sam.getId() + "}", null, null), 400, "IDEMPOTENCY_KEY_MISSING");
        assertThat(plan(id).getStatus()).isEqualTo(MarketerAssignmentSchedule.SCHEDULED);
    }

    @Test
    void theListShowsPlansWaitingAndRunningOnly() throws Exception {
        marketedBy(unseated, sam);
        marketedBy(seated, sam);
        long waiting = json(reassign(unseated, mia, Duration.ofDays(5), null)).path("schedule").path("id").asLong();
        long running = json(delegate(seated, pat, null, Duration.ofDays(5), "Leave")).path("id").asLong();
        long cancelled = json(reassign(seated, mia, Duration.ofDays(6), null)).path("schedule").path("id").asLong();
        cancel(login("owner"), a, cancelled); // over: not listed
        JsonNode items = json(call(login("owner"), get(base(a) + "/schedules"))).path("items");
        assertThat(items).hasSize(2);
        assertThat(items.get(0).path("id").asLong()).isEqualTo(running); // the one that started now comes first
        assertThat(items.get(1).path("id").asLong()).isEqualTo(waiting);
        assertThat(items.get(0).path("consultantName").asText()).isEqualTo("Anika Khan");
        JsonNode one = json(call(login("owner"), get(base(a) + "/schedules?consultantId=" + unseated.getId()))).path("items");
        assertThat(one).hasSize(1);
        assertThat(one.get(0).path("kind").asText()).isEqualTo("REASSIGN");
    }
}
