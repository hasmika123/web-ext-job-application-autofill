package com.dossier.api.web.rest.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.ent.mgmt.MktApprovalRequest;
import com.dossier.api.domain.ent.mgmt.MktEscalation;
import com.dossier.api.domain.ent.mkt.MktFollowup;
import com.dossier.api.domain.ent.mkt.MktOpportunity;
import com.dossier.api.domain.ent.mkt.MktOpportunityEvent;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.MarketerAssignment;
import com.dossier.api.domain.ent.talent.MarketerCapacity;
import com.dossier.api.domain.ent.talent.RequirementMatch;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.ent.mgmt.MktApprovalRequestRepository;
import com.dossier.api.repository.ent.mgmt.MktEscalationRepository;
import com.dossier.api.repository.ent.mkt.MktFollowupRepository;
import com.dossier.api.repository.ent.mkt.MktOpportunityEventRepository;
import com.dossier.api.repository.ent.mkt.MktOpportunityRepository;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.MarketerAssignmentRepository;
import com.dossier.api.repository.ent.talent.MarketerCapacityRepository;
import com.dossier.api.repository.ent.talent.RequirementMatchRepository;
import com.dossier.api.service.ent.mkt.escalations.EscalationRulesJob;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Duration;
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
 * The escalations through the real chain on real rows (MM-05): the manager's list, detail and counts are the team's (an organization-wide admin sees all), the
 * actions are a small state machine with one trail line and one audit row each, anything outside the team is the generic 404, a closed row refuses the actions that
 * make no sense on it, a marketer escalates to their manager (built from stored rows, scanned), and the 15-minute rules job raises, deduplicates, escalates in severity,
 * clears and notifies on real data. Beta's rows never show in Acme and Acme's ids are the generic 404 for Beta.
 *
 * <p>World (on top of {@link MemberItSupport}): marketers mgr (Marketing Manager, TEAM, team T1), mia (Marketing Specialist in T1, capacity 2) and spec (Marketing
 * Specialist outside every team); consultants k1 (mia's) and k2 (spec's).
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class MgmtEscalationsIT extends MemberItSupport {

    @Autowired private JdbcTemplate jdbc;
    @Autowired private MktEscalationRepository escalations;
    @Autowired private MktApprovalRequestRepository approvalRows;
    @Autowired private ConsultantProfileRepository consultants;
    @Autowired private MarketerAssignmentRepository assignmentRows;
    @Autowired private MarketerCapacityRepository capacityRows;
    @Autowired private ClientAccountRepository clients;
    @Autowired private ClientRequirementRepository jobs;
    @Autowired private RequirementMatchRepository matches;
    @Autowired private MktOpportunityRepository opportunities;
    @Autowired private MktOpportunityEventRepository opportunityEvents;
    @Autowired private MktFollowupRepository followups;
    @Autowired private EscalationRulesJob job;

    private OrgMember mia;
    private ConsultantProfile k1;
    private ConsultantProfile k2;
    private ClientAccount client;

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
        client = new ClientAccount();
        client.setOrgId(a.getId());
        client.setName("Stripe");
        client = clients.saveAndFlush(client);
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

    private MktEscalation escalation(com.dossier.api.domain.org.Organization org, String severity, String status, Long marketer, Long consultant, String title) {
        MktEscalation e = new MktEscalation();
        e.setOrgId(org.getId());
        e.setKind("MANUAL");
        e.setSeverity(severity);
        e.setSubjectType("CONSULTANT");
        e.setSubjectId(consultant == null ? 1L : consultant);
        e.setConsultantId(consultant);
        e.setMarketerMemberId(marketer);
        e.setTitle(title);
        e.setStatus(status);
        e.setRaisedByMemberId(marketer);
        e.setRaisedAt(Instant.now().minus(Duration.ofHours(5)));
        return escalations.saveAndFlush(e);
    }

    private ClientRequirement job(String title) {
        ClientRequirement r = new ClientRequirement();
        r.setOrgId(a.getId());
        r.setClientId(client.getId());
        r.setTitle(title);
        return jobs.saveAndFlush(r);
    }

    /** An assigned pair of {@code c} and a new job, with its opportunity overlay in {@code state} created {@code daysOld} days ago. */
    private MktOpportunity pair(ConsultantProfile c, OrgMember owner, String jobTitle, String state, int daysOld) {
        RequirementMatch m = new RequirementMatch();
        m.setOrgId(a.getId());
        m.setRequirementId(job(jobTitle).getId());
        m.setConsultantId(c.getId());
        m.setScore(80);
        m.setStatus("ASSIGNED");
        m.setAssignedAt(Instant.now().minus(Duration.ofDays(daysOld)));
        m = matches.saveAndFlush(m);
        MktOpportunity o = new MktOpportunity();
        o.setOrgId(a.getId());
        o.setMatchId(m.getId());
        o.setOwnerMemberId(owner.getId());
        o.setState(state);
        o.setCreatedAt(Instant.now().minus(Duration.ofDays(daysOld)));
        return opportunities.save(o);
    }

    private static String base(com.dossier.api.domain.org.Organization o) {
        return "/api/orgs/" + o.getId() + "/mgmt/escalations";
    }

    private static String mine(com.dossier.api.domain.org.Organization o) {
        return "/api/orgs/" + o.getId() + "/mkt/escalations";
    }

    private JsonNode fetch(String login, String url) throws Exception {
        MvcResult r = call(login, get(url));
        assertStatus(r, 200);
        return json(r);
    }

    private MvcResult act(String login, long id, String action, String body) throws Exception {
        return call(login, post(base(a) + "/" + id + "/" + action), body, null, key());
    }

    private long count(String sql, Object... args) {
        flushIfInTransaction();
        Long n = jdbc.queryForObject(sql, Long.class, args);
        return n == null ? 0 : n;
    }

    // ---- the manager's reads -----------------------------------------------------------------------------------------------------

    @Test
    void theManagerSeesTheirTeamsEscalationsMostSevereFirstAndAnAdminSeesEveryone() throws Exception {
        MktEscalation low = escalation(a, "LOW", "OPEN", mia.getId(), k1.getId(), "Slow reply from Kay One");
        MktEscalation high = escalation(a, "HIGH", "OPEN", mia.getId(), k1.getId(), "Kay One is waiting");
        MktEscalation viaConsultant = escalation(a, "MEDIUM", "ACKNOWLEDGED", null, k1.getId(), "Kay One asked for a call"); // no marketer: the team's through the consultant
        MktEscalation outside = escalation(a, "HIGH", "OPEN", mktSpec.getId(), k2.getId(), "Kay Two is waiting");
        MktEscalation snoozed = escalation(a, "HIGH", "SNOOZED", mia.getId(), k1.getId(), "Snoozed one");
        MktEscalation closed = escalation(a, "HIGH", "RESOLVED", mia.getId(), k1.getId(), "Old one");

        MvcResult mgr = call(login("mgr"), get(base(a)));
        assertStatus(mgr, 200);
        assertThat(mgr.getResponse().getHeader("X-Total-Count")).isEqualTo("3");
        assertThat(ids(json(mgr))).as("open and acknowledged, most severe first").containsExactly(high.getId(), viaConsultant.getId(), low.getId());
        assertThat(json(mgr).path("items").get(0).path("consultant").path("name").asText()).isEqualTo("Kay One");
        assertThat(json(mgr).path("items").get(0).path("marketer").path("name").asText()).isEqualTo("Mia Ng");

        assertThat(ids(fetch(login("owner"), base(a)))).containsExactlyInAnyOrder(high.getId(), viaConsultant.getId(), low.getId(), outside.getId());
        assertThat(ids(fetch(login("admin"), base(a) + "?severity=HIGH"))).containsExactlyInAnyOrder(high.getId(), outside.getId());
        assertThat(ids(fetch(login("mgr"), base(a) + "?status=SNOOZED"))).containsExactly(snoozed.getId());
        assertThat(ids(fetch(login("mgr"), base(a) + "?status=RESOLVED"))).containsExactly(closed.getId());
        assertThat(ids(fetch(login("mgr"), base(a) + "?status=ALL"))).hasSize(5);
        assertThat(ids(fetch(login("mgr"), base(a) + "?q=waiting"))).containsExactly(high.getId());
        assertThat(ids(fetch(login("mgr"), base(a) + "?marketer=" + mia.getId() + "&kind=MANUAL"))).containsExactlyInAnyOrder(high.getId(), low.getId());
        assertThat(fetch(login("mgr"), base(a) + "?size=1").path("hasMore").asBoolean()).isTrue();
        assertStatus(call(login("mgr"), get(base(a) + "?marketer=" + mktSpec.getId())), 404); // a marketer outside the team
        assertStatus(call(login("mgr"), get(base(a) + "?consultant=" + k2.getId())), 404);
        assertStatus(call(login("mgr"), get(base(a) + "?status=SOON")), 422);
        assertStatus(call(login("mgr"), get(base(a) + "?severity=EXTREME")), 422);
        assertStatus(call(login("mgr"), get(base(a) + "?size=500")), 422);

        JsonNode counts = fetch(login("mgr"), base(a) + "/counts");
        assertThat(counts.path("open").asLong()).isEqualTo(3);
        assertThat(counts.path("high").asLong()).isEqualTo(1);
        assertThat(counts.path("medium").asLong()).isEqualTo(1);
        assertThat(counts.path("low").asLong()).isEqualTo(1);
        assertThat(counts.path("snoozed").asLong()).isEqualTo(1);
        assertThat(fetch(login("owner"), base(a) + "/counts").path("high").asLong()).isEqualTo(2);
    }

    @Test
    void oneEscalationComesWithItsTrailAndOutsideTheTeamItIsTheGenericNotFound() throws Exception {
        MktEscalation e = escalation(a, "HIGH", "OPEN", mia.getId(), k1.getId(), "Kay One is waiting");
        MktEscalation outside = escalation(a, "HIGH", "OPEN", mktSpec.getId(), k2.getId(), "Kay Two is waiting");
        assertStatus(act("mgr", e.getId(), "comment", "{\"note\":\"Called Mia\"}"), 200);
        JsonNode one = fetch(login("mgr"), base(a) + "/" + e.getId());
        assertThat(one.path("title").asText()).isEqualTo("Kay One is waiting");
        assertThat(one.path("events")).hasSize(1);
        assertThat(one.path("events").get(0).path("kind").asText()).isEqualTo("COMMENTED");
        assertThat(one.path("events").get(0).path("actor").path("name").asText()).isEqualTo("Maria Lopez");
        assertGeneric404(call(login("mgr"), get(base(a) + "/" + outside.getId())), "a row outside the team");
        assertGeneric404(call(login("mgr"), get(base(a) + "/999999999")), "an unknown id");
        for (String who : List.of("spec", "plain", "hr", "c1")) {
            assertGeneric404(call(login(who), get(base(a))), who + " lists");
            assertGeneric404(call(login(who), get(base(a) + "/counts")), who + " counts");
            assertGeneric404(call(login(who), get(base(a) + "/" + e.getId())), who + " reads one");
            assertGeneric404(act(who, e.getId(), "acknowledge", null), who + " acts");
        }
        assertGeneric404(call(login("bowner"), get(base(a))), "B's owner lists A");
        assertGeneric404(call(login("bowner"), get(base(b) + "/" + e.getId())), "B's owner names A's id in B");
    }

    @Test
    void betasEscalationsNeverShowInAcmeAndAcmesDoNotShowInBeta() throws Exception {
        ConsultantProfile bk = consultant(b, "Bea One");
        flushIfInTransaction();
        MktEscalation bRow = escalation(b, "HIGH", "OPEN", bMember.getId(), bk.getId(), "Bea is waiting");
        MktEscalation aRow = escalation(a, "HIGH", "OPEN", mia.getId(), k1.getId(), "Kay One is waiting");
        assertThat(ids(fetch(login("owner"), base(a)))).containsExactly(aRow.getId());
        assertThat(ids(fetch(login("bowner"), base(b)))).containsExactly(bRow.getId());
        assertGeneric404(call(login("owner"), get(base(a) + "/" + bRow.getId())), "A's owner names B's id");
        assertGeneric404(act("owner", bRow.getId(), "resolve", "{\"resolution\":\"x\"}"), "A's owner resolves B's");
        assertThat(escalations.findByOrgIdAndId(b.getId(), bRow.getId()).orElseThrow().getStatus()).isEqualTo("OPEN");
    }

    // ---- the manager's actions ---------------------------------------------------------------------------------------------------

    @Test
    void theActionsMoveAnEscalationThroughItsStatesWithOneTrailLineAndOneAuditRowEach() throws Exception {
        MktEscalation e = escalation(a, "HIGH", "OPEN", mia.getId(), k1.getId(), "Kay One is waiting");
        long auditBefore = auditCount(a);

        assertThat(json(act("mgr", e.getId(), "acknowledge", null)).path("status").asText()).isEqualTo("ACKNOWLEDGED");
        JsonNode assigned = json(act("mgr", e.getId(), "assign", "{\"memberId\":" + mia.getId() + "}"));
        assertThat(assigned.path("assignee").path("name").asText()).isEqualTo("Mia Ng");
        assertGeneric404(act("mgr", e.getId(), "assign", "{\"memberId\":" + mktSpec.getId() + "}"), "an assignee outside the team");
        Instant until = Instant.now().plus(Duration.ofDays(3));
        assertThat(json(act("mgr", e.getId(), "snooze", "{\"until\":\"" + until + "\"}")).path("status").asText()).isEqualTo("SNOOZED");
        assertStatus(act("mgr", e.getId(), "snooze", "{\"until\":\"" + Instant.now().minusSeconds(60) + "\"}"), 422);
        assertThat(json(act("mgr", e.getId(), "acknowledge", null)).path("status").asText()).as("acknowledging wakes a snoozed row").isEqualTo("ACKNOWLEDGED");
        assertStatus(act("mgr", e.getId(), "resolve", "{}"), 422);
        assertStatus(act("mgr", e.getId(), "resolve", "{\"resolution\":\"ssn 123-45-6789\"}"), 422);
        JsonNode resolved = json(act("mgr", e.getId(), "resolve", "{\"resolution\":\"Spoke to the client\"}"));
        assertThat(resolved.path("status").asText()).isEqualTo("RESOLVED");
        assertThat(resolved.path("resolvedBy").path("name").asText()).isEqualTo("Maria Lopez");

        assertCode(act("mgr", e.getId(), "acknowledge", null), 409, "ESCALATION_NOT_OPEN");
        assertCode(act("mgr", e.getId(), "dismiss", "{}"), 409, "ESCALATION_NOT_OPEN");
        assertCode(act("mgr", e.getId(), "snooze", "{\"until\":\"" + until + "\"}"), 409, "ESCALATION_NOT_OPEN");
        assertStatus(act("mgr", e.getId(), "comment", "{\"note\":\"After the fact\"}"), 200);

        JsonNode reopened = json(act("mgr", e.getId(), "reopen", null));
        assertThat(reopened.path("status").asText()).isEqualTo("OPEN");
        assertThat(reopened.path("resolution").asText("")).isEmpty();
        assertCode(act("mgr", e.getId(), "reopen", null), 409, "ESCALATION_ALREADY_OPEN");
        assertThat(json(act("mgr", e.getId(), "dismiss", "{\"note\":\"Not needed\"}")).path("status").asText()).isEqualTo("DISMISSED");

        List<String> kinds = jdbc.queryForList("select kind from mkt_escalation_event where org_id = ? and escalation_id = ? order by id", String.class, a.getId(), e.getId());
        assertThat(kinds).containsExactly("ACKNOWLEDGED", "ASSIGNED", "SNOOZED", "ACKNOWLEDGED", "RESOLVED", "COMMENTED", "REOPENED", "DISMISSED");
        assertThat(auditCount(a) - auditBefore).as("one audit row per change").isEqualTo(kinds.size());
        assertThat(auditCount(a, "MKT_ESCALATION_RESOLVE")).isEqualTo(1L);
    }

    @Test
    void anActionNeedsAKeyOnlyAfterThePermissionWallAndAReplayDoesTheWorkOnce() throws Exception {
        MktEscalation e = escalation(a, "HIGH", "OPEN", mia.getId(), k1.getId(), "Kay One is waiting");
        assertCode(call(login("mgr"), post(base(a) + "/" + e.getId() + "/acknowledge"), null, null, null), 400, "IDEMPOTENCY_KEY_MISSING");
        assertGeneric404(call(login("spec"), post(base(a) + "/" + e.getId() + "/acknowledge"), null, null, null), "no key and no permission: the 404 comes first");
        String k = key();
        assertStatus(call(login("mgr"), post(base(a) + "/" + e.getId() + "/comment"), "{\"note\":\"First\"}", null, k), 200);
        MvcResult replay = call(login("mgr"), post(base(a) + "/" + e.getId() + "/comment"), "{\"note\":\"First\"}", null, k);
        assertStatus(replay, 200);
        assertThat(replay.getResponse().getHeader("Idempotent-Replayed")).isEqualTo("true");
        assertThat(count("select count(*) from mkt_escalation_event where org_id = ? and escalation_id = ? and kind = 'COMMENTED'", a.getId(), e.getId())).isEqualTo(1L);
        assertCode(call(login("mgr"), post(base(a) + "/" + e.getId() + "/comment"), "{\"note\":\"Second\"}", null, k), 422, "IDEMPOTENCY_KEY_REUSED");
    }

    // ---- the marketer's side -----------------------------------------------------------------------------------------------------

    @Test
    void aMarketerEscalatesAnOpportunityOrAConsultantToTheirManager() throws Exception {
        MktOpportunity opp = pair(k1, mia, "SWE II", "ASSIGNED", 1);
        RequirementMatch match = matches.findByOrgIdAndId(a.getId(), opp.getMatchId()).orElseThrow();
        long auditBefore = auditCount(a);
        MvcResult onOpportunity = call(login("mia"), post(mine(a)), "{\"kind\":\"MANUAL\",\"severity\":\"HIGH\",\"subjectType\":\"MKT_OPPORTUNITY\",\"subjectId\":" + match.getId() + ",\"title\":\"Client went quiet\",\"detail\":\"No reply for a week.\"}", null, key());
        assertStatus(onOpportunity, 200);
        JsonNode dto = json(onOpportunity);
        assertThat(dto.path("kind").asText()).isEqualTo("MANUAL");
        assertThat(dto.path("severity").asText()).isEqualTo("HIGH");
        assertThat(dto.path("subjectId").asLong()).as("the stored subject is the opportunity row").isEqualTo(opp.getId());
        assertThat(dto.path("marketer").path("name").asText()).isEqualTo("Mia Ng");
        assertThat(dto.path("raisedBy").path("name").asText()).isEqualTo("Mia Ng");
        assertThat(dto.path("ruleKey").asText("")).isEmpty();
        assertThat(auditCount(a, "MKT_ESCALATION_RAISE")).isEqualTo(1L);
        assertThat(auditCount(a) - auditBefore).isEqualTo(1L);

        MvcResult onConsultant = call(login("mia"), post(mine(a)), "{\"subjectType\":\"CONSULTANT\",\"subjectId\":" + k1.getId() + ",\"title\":\"Please help with Kay\"}", null, key());
        assertStatus(onConsultant, 200);
        assertThat(json(onConsultant).path("severity").asText()).as("MEDIUM by default").isEqualTo("MEDIUM");
        assertThat(ids(fetch(login("mgr"), base(a)))).as("the manager of Mia's team sees both").contains(dto.path("id").asLong(), json(onConsultant).path("id").asLong());
        assertThat(ids(fetch(login("mgr"), base(a)))).hasSize(2);
        // a person raises the same thing again: another row, never merged
        assertStatus(call(login("mia"), post(mine(a)), "{\"subjectType\":\"CONSULTANT\",\"subjectId\":" + k1.getId() + ",\"title\":\"Please help with Kay\"}", null, key()), 200);
        assertThat(ids(fetch(login("mgr"), base(a)))).hasSize(3);
    }

    @Test
    void aMarketerCannotEscalateWhatIsNotTheirsOrWhatIsNotAMessageToAManager() throws Exception {
        assertGeneric404(call(login("mia"), post(mine(a)), "{\"subjectType\":\"CONSULTANT\",\"subjectId\":" + k2.getId() + ",\"title\":\"Not mine\"}", null, key()), "k2 is spec's");
        assertGeneric404(call(login("hr"), post(mine(a)), "{\"subjectType\":\"CONSULTANT\",\"subjectId\":" + k1.getId() + ",\"title\":\"No key\"}", null, key()), "no marketing key");
        assertGeneric404(call(login("bowner"), post(mine(a)), "{\"subjectType\":\"CONSULTANT\",\"subjectId\":" + k1.getId() + ",\"title\":\"Other org\"}", null, key()), "B's owner");
        assertStatus(call(login("mia"), post(mine(a)), "{\"kind\":\"STALLED_OPPORTUNITY\",\"subjectType\":\"CONSULTANT\",\"subjectId\":" + k1.getId() + ",\"title\":\"Rules raise these\"}", null, key()), 422);
        assertStatus(call(login("mia"), post(mine(a)), "{\"subjectType\":\"PLANET\",\"subjectId\":1,\"title\":\"x\"}", null, key()), 422);
        assertStatus(call(login("mia"), post(mine(a)), "{\"subjectType\":\"CONSULTANT\",\"subjectId\":" + k1.getId() + ",\"severity\":\"EXTREME\",\"title\":\"x\"}", null, key()), 422);
        assertStatus(call(login("mia"), post(mine(a)), "{\"subjectType\":\"CONSULTANT\",\"subjectId\":" + k1.getId() + ",\"title\":\"ssn 123-45-6789\"}", null, key()), 422);
        assertStatus(call(login("mia"), post(mine(a)), "{\"subjectType\":\"CONSULTANT\",\"subjectId\":" + k1.getId() + ",\"title\":\"x\",\"detail\":\"ssn 123-45-6789\"}", null, key()), 422);
        assertStatus(call(login("mia"), post(mine(a)), "{\"subjectType\":\"CONSULTANT\",\"subjectId\":" + k1.getId() + ",\"title\":\" \"}", null, key()), 422);
        assertCode(call(login("mia"), post(mine(a)), "{\"subjectType\":\"CONSULTANT\",\"subjectId\":" + k1.getId() + ",\"title\":\"x\"}", null, null), 400, "IDEMPOTENCY_KEY_MISSING");
        assertThat(count("select count(*) from mkt_escalation where org_id = ?", a.getId())).isZero();
    }

    // ---- the rules job on real data ------------------------------------------------------------------------------------------------

    @Test
    void theRulesJobRaisesOnceEscalatesClearsAndTellsTheManager() throws Exception {
        MktOpportunity stalled = pair(k1, mia, "SWE II", "ASSIGNED", 20); // no timeline line for 20 days: HIGH (twice the 7-day limit is 14)
        MktOpportunity asked = pair(k1, mia, "PM", "NEEDS_INFO", 10);
        asked.setInfoRequest("Is a W2 option available?");
        opportunities.save(asked);
        MktOpportunityEvent line = new MktOpportunityEvent();
        line.setOrgId(a.getId());
        line.setOpportunityId(asked.getId());
        line.setKind("INFO_REQUESTED");
        line.setText("asked a question");
        line.setOccurredAt(Instant.now().minus(Duration.ofHours(60))); // waiting 60 hours, past the 48-hour limit; the line also keeps this opportunity from counting as stalled
        opportunityEvents.save(line);
        MktFollowup due = new MktFollowup();
        due.setOrgId(a.getId());
        due.setConsultantId(k1.getId());
        due.setOwnerMemberId(mia.getId());
        due.setTitle("Call the recruiter");
        due.setDueAt(Instant.now().minus(Duration.ofDays(5)));
        due = followups.save(due);
        MktApprovalRequest waiting = new MktApprovalRequest();
        waiting.setOrgId(a.getId());
        waiting.setKind("RESUME_RELEASE");
        waiting.setSubjectType("ORG_RESUME");
        waiting.setSubjectId(1L);
        waiting.setConsultantId(k1.getId());
        waiting.setRequestedByMemberId(mia.getId());
        waiting.setRequestedAt(Instant.now().minus(Duration.ofHours(30)));
        waiting.setTitle("Kay One, resume v3");
        waiting.setExpiresAt(Instant.now().plus(Duration.ofDays(5)));
        approvalRows.saveAndFlush(waiting);
        MarketerCapacity cap = new MarketerCapacity();
        cap.setOrgId(a.getId());
        cap.setMemberId(mia.getId());
        cap.setCapacity(1); // mia carries k1: 100 percent
        cap.setStatus("ACTIVE");
        capacityRows.saveAndFlush(cap);
        flushIfInTransaction();
        em.clear();

        EscalationRulesJob.Result first = job.runOnce(Instant.now());
        assertThat(first.raised()).as("stalled, question, follow-up, approval (the overload waits for its third run)").isGreaterThanOrEqualTo(4);
        List<String> kinds = jdbc.queryForList("select kind from mkt_escalation where org_id = ? and rule_key is not null order by kind", String.class, a.getId());
        assertThat(kinds).containsExactly("APPROVAL_AGING", "OVERDUE_FOLLOWUP", "STALLED_OPPORTUNITY", "UNANSWERED_QUESTION");
        assertThat(jdbc.queryForObject("select severity from mkt_escalation where org_id = ? and kind = 'STALLED_OPPORTUNITY'", String.class, a.getId())).isEqualTo("HIGH");
        assertThat(jdbc.queryForObject("select severity from mkt_escalation where org_id = ? and kind = 'UNANSWERED_QUESTION'", String.class, a.getId())).isEqualTo("HIGH");
        assertThat(jdbc.queryForObject("select severity from mkt_escalation where org_id = ? and kind = 'OVERDUE_FOLLOWUP'", String.class, a.getId())).isEqualTo("LOW");

        job.runOnce(Instant.now());
        EscalationRulesJob.Result third = job.runOnce(Instant.now());
        assertThat(count("select count(*) from mkt_escalation where org_id = ? and kind = 'OVERLOADED_MARKETER' and status = 'OPEN'", a.getId())).as("raised on the third run, once").isEqualTo(1L);
        assertThat(count("select count(*) from mkt_escalation where org_id = ? and rule_key is not null", a.getId())).as("the open key: five rows, never duplicated").isEqualTo(5L);
        assertThat(third.resolved()).isZero();

        // the manager of Mia's team was told once about the new HIGH rows of the first run, in-app and with a stable key
        assertThat(count("select count(*) from notification where user_id = ? and kind = 'SYSTEM' and dedupe_key like 'escalation-digest:%'", mktMgr.getUserId())).isEqualTo(1L);
        assertThat(count("select count(*) from notification where user_id = ? and dedupe_key like 'escalation-digest:%'", mktSpec.getUserId())).isZero();

        // the manager's page shows them; the escalation stays one row while it is open
        assertThat(fetch(login("mgr"), base(a) + "/counts").path("open").asLong()).isEqualTo(5);

        // the conditions clear: the system resolves its own rows with "Cleared"
        asked.setInfoAnswer("Yes, a W2 option is available.");
        opportunities.save(asked);
        due.setStatus("COMPLETED");
        due.setCompletedAt(Instant.now());
        followups.save(due);
        stalledRefresh(stalled);
        flushIfInTransaction();
        em.clear();
        EscalationRulesJob.Result cleared = job.runOnce(Instant.now());
        assertThat(cleared.resolved()).isGreaterThanOrEqualTo(3);
        assertThat(jdbc.queryForList("select resolution from mkt_escalation where org_id = ? and kind in ('UNANSWERED_QUESTION', 'OVERDUE_FOLLOWUP', 'STALLED_OPPORTUNITY') order by kind", String.class, a.getId()))
            .allSatisfy(r -> assertThat(r).startsWith("Cleared: "));
        assertThat(count("select count(*) from mkt_escalation_event where org_id = ? and kind = 'RESOLVED' and actor_member_id is null", a.getId())).isGreaterThanOrEqualTo(3L);
    }

    /** A new timeline line on the stalled opportunity: it has activity again. */
    private void stalledRefresh(MktOpportunity o) {
        MktOpportunityEvent line = new MktOpportunityEvent();
        line.setOrgId(a.getId());
        line.setOpportunityId(o.getId());
        line.setKind("REVIEWED");
        line.setText("was reviewed");
        line.setOccurredAt(Instant.now());
        opportunityEvents.save(line);
    }

    @Test
    void anotherOrganizationsStalledWorkNeverBecomesThisOnesEscalation() throws Exception {
        MktOpportunity stalled = pair(k1, mia, "SWE II", "ASSIGNED", 20);
        flushIfInTransaction();
        em.clear();
        job.runOnce(Instant.now());
        assertThat(count("select count(*) from mkt_escalation where org_id = ? and kind = 'STALLED_OPPORTUNITY'", a.getId())).isEqualTo(1L);
        assertThat(count("select count(*) from mkt_escalation where org_id = ?", b.getId())).isZero();
        assertThat(ids(fetch(login("bowner"), base(b)))).isEmpty();
        assertThat(stalled.getId()).isNotNull();
    }
}
