package com.dossier.api.web.rest.ent.consultant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.ent.OrgMemberRole;
import com.dossier.api.domain.ent.OrgRoleDefinition;
import com.dossier.api.domain.ent.OrgRolePermission;
import com.dossier.api.domain.ent.mkt.MktOpportunity;
import com.dossier.api.domain.ent.prepare.PrepareSession;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.RequirementMatch;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.OrgMemberRoleRepository;
import com.dossier.api.repository.ent.OrgRolePermissionRepository;
import com.dossier.api.repository.ent.OrgRoleRepository;
import com.dossier.api.repository.ent.mkt.MktOpportunityRepository;
import com.dossier.api.repository.ent.prepare.PrepareSessionRepository;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.RequirementMatchRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import com.dossier.api.web.rest.org.OrgFixtures;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

/**
 * Prepare selected openings through the real chain (docs/enterprise-v2/63): the feature switch, the consultant gate, ownership of every match, the skipped
 * reasons, the admin-set caps, idempotency, the event trail and the guarantee that SUBMIT_DETECTED never moves an opportunity to APPLIED by itself.
 * Every refusal is the same generic 404.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class ConPrepareIT {

    private static final String WHO = "con-prepare-it";

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper om;
    @Autowired private EntityManager em;
    @Autowired private UserRepository users;
    @Autowired private OrganizationRepository orgs;
    @Autowired private OrgMemberRepository members;
    @Autowired private OrgRoleRepository roleRows;
    @Autowired private OrgRolePermissionRepository permissionRows;
    @Autowired private OrgMemberRoleRepository memberRoles;
    @Autowired private AppSettingRepository settingRows;
    @Autowired private ResumeBuilderSettings cache;
    @Autowired private ConsultantProfileRepository consultants;
    @Autowired private ClientAccountRepository clients;
    @Autowired private ClientRequirementRepository requirements;
    @Autowired private RequirementMatchRepository matches;
    @Autowired private MktOpportunityRepository opportunities;
    @Autowired private PrepareSessionRepository sessions;

    private OrgFixtures fx;
    private Organization a;
    private Organization b;
    private ConsultantProfile anika;
    private ConsultantProfile ben;
    private RequirementMatch mine;
    private RequirementMatch mine2;
    private RequirementMatch declined;
    private RequirementMatch noUrl;
    private RequirementMatch closedJob;
    private RequirementMatch bens;
    private int roleSeq = 0;

    @BeforeEach
    void seed() {
        fx = new OrgFixtures(users, orgs, members);
        String n = String.valueOf(System.nanoTime());
        a = fx.org("con-prep-a-" + n, OrgStatus.ACTIVE);
        b = fx.org("con-prep-b-" + n, OrgStatus.ACTIVE);
        settings(true, null);

        OrgMember anikaSeat = actor(a, "prep-anika", new String[][] { { "opportunities.respond", "OWN" } });
        OrgMember benSeat = actor(a, "prep-ben", new String[][] { { "opportunities.respond", "OWN" } });
        actor(a, "prep-marketer", new String[][] { { "opportunities.manage", "ASSIGNED" } });
        actor(b, "prep-b-consultant", new String[][] { { "opportunities.respond", "OWN" } });
        anika = consultant(a, "Anika Rao", anikaSeat.getId());
        ben = consultant(a, "Ben Cole", benSeat.getId());
        ClientAccount client = client(a, "TechCorp");
        mine = match(client, anika, "Java Developer", "https://boards.greenhouse.io/techcorp/jobs/101", "OPEN", "ASSIGNED");
        mine2 = match(client, anika, "Kotlin Developer", "https://boards.greenhouse.io/techcorp/jobs/102", "IN_REVIEW", "INTERESTED");
        declined = match(client, anika, "Go Developer", "https://boards.greenhouse.io/techcorp/jobs/103", "OPEN", "DECLINED");
        noUrl = match(client, anika, "Rust Developer", null, "OPEN", "ASSIGNED");
        closedJob = match(client, anika, "COBOL Developer", "https://boards.greenhouse.io/techcorp/jobs/105", "CLOSED", "ASSIGNED");
        bens = match(client, ben, "Python Developer", "https://boards.greenhouse.io/techcorp/jobs/106", "OPEN", "ASSIGNED");
        em.flush();
    }

    @AfterEach
    void clean() {
        for (AppSetting s : settingRows.findAll()) if (WHO.equals(s.getUpdatedBy())) settingRows.delete(s);
        cache.invalidate();
    }

    /** Enterprise flags on; the prepare switch as given; an optional extra setting key=value ("key=value"). */
    private void settings(boolean prepareOn, String extra) {
        for (AppSetting s : settingRows.findAll()) if (WHO.equals(s.getUpdatedBy())) settingRows.delete(s);
        put(EnterpriseSettingKeys.FLAG_ENTERPRISE, "{\"on\":true}");
        put(EnterpriseSettingKeys.FLAG_ROLES, "{\"on\":true}");
        put(EnterpriseSettingKeys.FLAG_MARKETING, "{\"on\":true}");
        put(EnterpriseSettingKeys.FLAG_CONSULTANT_JOBS, "{\"on\":true}");
        put(EnterpriseSettingKeys.PREPARE_ENABLED, String.valueOf(prepareOn));
        if (extra != null) put(extra.substring(0, extra.indexOf('=')), extra.substring(extra.indexOf('=') + 1));
        cache.invalidate();
    }

    private void put(String key, String value) {
        settingRows.save(new AppSetting(key, value, WHO, Instant.now()));
    }

    // ---- fixtures ---------------------------------------------------------------------------------------------------

    private OrgMember actor(Organization org, String login, String[][] keys) {
        OrgMember m = fx.active(org, login, OrgRole.MEMBER);
        OrgRoleDefinition def = new OrgRoleDefinition();
        def.setOrgId(org.getId());
        def.setRoleKey("CUSTOM_PREP_" + (roleSeq++) + "_" + (System.nanoTime() % 100000));
        def.setName("Prepare test role");
        def = roleRows.saveAndFlush(def);
        for (String[] k : keys) permissionRows.saveAndFlush(new OrgRolePermission(def.getId(), k[0], PermissionScope.valueOf(k[1]), null, null));
        OrgMemberRole row = new OrgMemberRole();
        row.setOrgId(org.getId());
        row.setMemberId(m.getId());
        row.setRoleId(def.getId());
        row.setPrimary(true);
        row.setGrantedAt(Instant.now());
        memberRoles.saveAndFlush(row);
        m.setPrimaryRoleId(def.getId());
        members.saveAndFlush(m);
        return m;
    }

    private ClientAccount client(Organization org, String name) {
        ClientAccount c = new ClientAccount();
        c.setOrgId(org.getId());
        c.setName(name);
        return clients.saveAndFlush(c);
    }

    private ConsultantProfile consultant(Organization org, String name, Long memberId) {
        ConsultantProfile c = new ConsultantProfile();
        c.setOrgId(org.getId());
        c.setDisplayName(name);
        c.setEmail(name.toLowerCase().replace(' ', '.') + "@example.test");
        c.setMemberId(memberId);
        return consultants.saveAndFlush(c);
    }

    /** An ASSIGNED match for a job in the given status with a link (or none); its opportunity overlay is in {@code oppState}. */
    private RequirementMatch match(ClientAccount client, ConsultantProfile c, String title, String url, String jobStatus, String oppState) {
        ClientRequirement r = new ClientRequirement();
        r.setOrgId(a.getId());
        r.setClientId(client.getId());
        r.setTitle(title);
        r.setStatus(jobStatus);
        r.setJobUrl(url);
        r = requirements.saveAndFlush(r);
        RequirementMatch m = new RequirementMatch();
        m.setOrgId(a.getId());
        m.setRequirementId(r.getId());
        m.setConsultantId(c.getId());
        m.setScore(80);
        m.setReason("IT");
        m.setSource("MANUAL");
        m.setStatus("ASSIGNED");
        m.setAssignedAt(Instant.now());
        m = matches.saveAndFlush(m);
        MktOpportunity o = new MktOpportunity();
        o.setOrgId(a.getId());
        o.setMatchId(m.getId());
        o.setState(oppState);
        opportunities.save(o);
        return m;
    }

    private MvcResult call(String login, MockHttpServletRequestBuilder req) throws Exception {
        return mockMvc.perform(req.with(user(login)).contentType(MediaType.APPLICATION_JSON)).andReturn();
    }

    private static String base(Organization org) {
        return "/api/orgs/" + org.getId() + "/con/prepare";
    }

    private static String ids(RequirementMatch... ms) {
        StringBuilder sb = new StringBuilder("{\"matchIds\":[");
        for (int i = 0; i < ms.length; i++) sb.append(i == 0 ? "" : ",").append(ms[i].getId());
        return sb.append("]}").toString();
    }

    private void assertGeneric404(MvcResult r, String what) throws Exception {
        String body = r.getResponse().getContentAsString();
        assertThat(r.getResponse().getStatus()).as(what + " -> " + body).isEqualTo(404);
        assertThat(body.toLowerCase()).as(what).contains("\"code\":\"not_found\"").doesNotContain("forbidden").doesNotContain("permission");
    }

    private JsonNode json(MvcResult r, int status) throws Exception {
        assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(status);
        String body = r.getResponse().getContentAsString();
        return body.isEmpty() ? om.createObjectNode() : om.readTree(body);
    }

    private long prepared(MockHttpServletRequestBuilder req) throws Exception {
        return json(call("prep-anika", req), 200).path("sessionId").asLong();
    }

    // ---- the gate ---------------------------------------------------------------------------------------------------

    @Test
    void withTheSwitchOffEverythingIsTheGeneric404AndTheStatusSaysOff() throws Exception {
        settings(false, null);
        assertGeneric404(call("prep-anika", post(base(a)).content(ids(mine))), "prepare, switch off");
        assertGeneric404(call("prep-anika", post(base(a) + "/1/events").content("{\"matchId\":1,\"event\":\"OPENED\"}")), "events, switch off");
        assertGeneric404(call("prep-anika", get(base(a) + "/1")), "session, switch off");
        JsonNode status = json(call("prep-anika", get(base(a) + "/status")), 200);
        assertThat(status.path("enabled").asBoolean()).isFalse();
        assertThat(sessions.findLive(a.getId(), anika.getId(), Instant.now())).isEmpty();
    }

    @Test
    void onlyTheOwningConsultantOfTheOrganizationGetsIn() throws Exception {
        assertGeneric404(call("prep-marketer", post(base(a)).content(ids(mine))), "a marketer");
        assertGeneric404(call("prep-marketer", get(base(a) + "/status")), "a marketer's status");
        assertGeneric404(call("prep-anika", post(base(b)).content(ids(mine))), "another tenant's path");
        assertGeneric404(call("prep-b-consultant", post(base(a)).content(ids(mine))), "the other tenant's consultant");
        assertGeneric404(call("prep-anika", post(base(a)).content(ids(bens))), "another consultant's match");
        assertGeneric404(call("prep-anika", post(base(a)).content(ids(mine, bens))), "one foreign match spoils the whole call");
        assertGeneric404(call("prep-anika", post(base(a)).content("{\"matchIds\":[999999999]}")), "a match nobody has");
        assertThat(sessions.findLive(a.getId(), anika.getId(), Instant.now())).isEmpty();
    }

    // ---- prepare ----------------------------------------------------------------------------------------------------

    @Test
    void preparesTheEligibleOpeningsAndListsTheOthersWithAReason() throws Exception {
        JsonNode d = json(call("prep-anika", post(base(a)).content(ids(mine, mine2, declined, noUrl, closedJob))), 200);
        assertThat(d.path("sessionId").asLong()).isPositive();
        assertThat(d.path("expiresAt").asText()).isNotBlank();
        assertThat(d.path("jobs")).hasSize(2);
        assertThat(d.path("jobs").get(0).path("matchId").asLong()).isEqualTo(mine.getId());
        assertThat(d.path("jobs").get(0).path("url").asText()).isEqualTo("https://boards.greenhouse.io/techcorp/jobs/101");
        assertThat(d.path("jobs").get(0).path("title").asText()).isEqualTo("Java Developer");
        assertThat(d.path("jobs").get(0).path("company").asText()).isEqualTo("TechCorp");
        assertThat(d.path("skipped").toString()).contains("NOT_ELIGIBLE").contains("NO_URL").contains("JOB_NOT_OPEN");
        assertThat(d.path("skipped")).hasSize(3);
        assertThat(d.path("remainingToday").asInt()).isEqualTo(28);
        assertThat(d.path("remainingMonth").asInt()).isEqualTo(298);
        JsonNode status = json(call("prep-anika", get(base(a) + "/status")), 200);
        assertThat(status.path("enabled").asBoolean()).isTrue();
        assertThat(status.path("remainingToday").asInt()).isEqualTo(28);
        assertThat(status.path("maxBatch").asInt()).isEqualTo(10);
    }

    @Test
    void theSameRequestWhileTheSessionIsLiveIsTheSameSessionAndCostsNothing() throws Exception {
        long first = prepared(post(base(a)).content(ids(mine, mine2)));
        JsonNode again = json(call("prep-anika", post(base(a)).content(ids(mine2, mine))), 200);
        assertThat(again.path("sessionId").asLong()).isEqualTo(first);
        assertThat(again.path("remainingToday").asInt()).isEqualTo(28);
        assertThat(json(call("prep-anika", get(base(a) + "/status")), 200).path("remainingToday").asInt()).isEqualTo(28);
    }

    @Test
    void nothingEligibleIsA200WithoutASessionAndNothingCharged() throws Exception {
        JsonNode d = json(call("prep-anika", post(base(a)).content(ids(declined, noUrl))), 200);
        assertThat(d.path("sessionId").isNull()).isTrue();
        assertThat(d.path("jobs")).isEmpty();
        assertThat(d.path("skipped")).hasSize(2);
        assertThat(d.path("remainingToday").asInt()).isEqualTo(30);
    }

    @Test
    void anEmptyOrTooBigBatchIs400() throws Exception {
        assertThat(json(call("prep-anika", post(base(a)).content("{\"matchIds\":[]}")), 400).toString()).contains("VALIDATION");
        assertThat(json(call("prep-anika", post(base(a)).content("{}")), 400).toString()).contains("VALIDATION");
        settings(true, EnterpriseSettingKeys.PREPARE_MAX_BATCH + "=1");
        assertThat(json(call("prep-anika", post(base(a)).content(ids(mine, mine2))), 400).toString()).contains("PREPARE_BATCH_TOO_LARGE");
        assertThat(json(call("prep-anika", get(base(a) + "/status")), 200).path("maxBatch").asInt()).isEqualTo(1);
    }

    @Test
    void theDailyCapIsEnforcedAndNothingIsCreatedWhenItWouldBeExceeded() throws Exception {
        settings(true, EnterpriseSettingKeys.PREPARE_DAILY_CAP + "=2");
        long s = prepared(post(base(a)).content(ids(mine)));
        assertThat(s).isPositive();
        JsonNode over = json(call("prep-anika", post(base(a)).content(ids(mine2, mine))), 409);
        assertThat(over.toString()).contains("PREPARE_CAP_REACHED");
        assertThat(over.path("remainingToday").asInt()).isEqualTo(1);
        assertThat(sessions.findLive(a.getId(), anika.getId(), Instant.now())).hasSize(1);
        assertThat(json(call("prep-anika", post(base(a)).content(ids(mine2))), 200).path("remainingToday").asInt()).isZero();
        assertThat(json(call("prep-anika", post(base(a)).content(ids(declined, mine2))), 200).path("jobs")).as("the cap is spent, but the same live session is returned").hasSize(1);
    }

    @Test
    void theMonthlyCapIsEnforcedToo() throws Exception {
        settings(true, EnterpriseSettingKeys.PREPARE_MONTHLY_CAP + "=1");
        assertThat(prepared(post(base(a)).content(ids(mine)))).isPositive();
        assertThat(json(call("prep-anika", post(base(a)).content(ids(mine2))), 409).path("remainingMonth").asInt()).isZero();
    }

    // ---- events and the session view --------------------------------------------------------------------------------

    @Test
    void theExtensionReportsProgressAndASubmitDetectedNeverMarksAnythingApplied() throws Exception {
        long s = prepared(post(base(a)).content(ids(mine, mine2)));
        String ev = base(a) + "/" + s + "/events";
        assertThat(call("prep-anika", post(ev).content("{\"matchId\":" + mine.getId() + ",\"event\":\"OPENED\"}")).getResponse().getStatus()).isEqualTo(204);
        assertThat(call("prep-anika", post(ev).content("{\"matchId\":" + mine.getId() + ",\"event\":\"PREFILLED\"}")).getResponse().getStatus()).isEqualTo(204);
        assertThat(call("prep-anika", post(ev).content("{\"matchId\":" + mine2.getId() + ",\"event\":\"NEEDS_INPUT\",\"detail\":\"2 required fields are empty\"}")).getResponse().getStatus()).isEqualTo(204);
        JsonNode view = json(call("prep-anika", get(base(a) + "/" + s)), 200);
        assertThat(view.path("items").get(0).path("state").asText()).isEqualTo("FILLED");
        assertThat(view.path("items").get(1).path("state").asText()).isEqualTo("NEEDS_INPUT");
        assertThat(view.path("items").get(1).path("detail").asText()).isEqualTo("2 required fields are empty");

        assertThat(call("prep-anika", post(ev).content("{\"matchId\":" + mine.getId() + ",\"event\":\"SUBMIT_DETECTED\"}")).getResponse().getStatus()).isEqualTo(204);
        assertThat(call("prep-anika", post(ev).content("{\"matchId\":" + mine.getId() + ",\"event\":\"CLOSED\"}")).getResponse().getStatus()).isEqualTo(204);
        JsonNode after = json(call("prep-anika", get(base(a) + "/" + s)), 200);
        assertThat(after.path("items").get(0).path("state").asText()).as("Submitted stays Submitted after the tab is closed").isEqualTo("SUBMITTED");
        assertThat(after.path("items").get(0).path("applied").asBoolean()).as("only the existing linker may mark it applied").isFalse();
        em.clear();
        assertThat(opportunities.findByOrgIdAndMatchId(a.getId(), mine.getId()).orElseThrow().getState()).isEqualTo("ASSIGNED");
        assertThat(opportunities.findByOrgIdAndMatchId(a.getId(), mine2.getId()).orElseThrow().getState()).isEqualTo("INTERESTED");
    }

    @Test
    void anEventIsValidatedScannedAndScopedToTheCallersOwnSession() throws Exception {
        long s = prepared(post(base(a)).content(ids(mine)));
        String ev = base(a) + "/" + s + "/events";
        assertThat(json(call("prep-anika", post(ev).content("{\"matchId\":" + mine.getId() + ",\"event\":\"CLICKED_SUBMIT\"}")), 400).toString()).contains("VALIDATION");
        assertThat(json(call("prep-anika", post(ev).content("{\"matchId\":" + mine.getId() + ",\"event\":\"FAILED\",\"detail\":\"" + "x".repeat(201) + "\"}")), 400).toString()).contains("VALIDATION");
        assertThat(json(call("prep-anika", post(ev).content("{\"matchId\":" + mine.getId() + ",\"event\":\"FAILED\",\"detail\":\"my ssn is 123-45-6789\"}")), 422).toString()).contains("SENSITIVE_CONTENT");
        assertGeneric404(call("prep-anika", post(ev).content("{\"matchId\":" + mine2.getId() + ",\"event\":\"OPENED\"}")), "a match that is not in the session");
        assertGeneric404(call("prep-anika", post(base(a) + "/999999999/events").content("{\"matchId\":" + mine.getId() + ",\"event\":\"OPENED\"}")), "no such session");
        // another consultant of the same organization can neither report on nor read Anika's session
        assertGeneric404(call("prep-ben", post(ev).content("{\"matchId\":" + mine.getId() + ",\"event\":\"OPENED\"}")), "ben reporting on anika's session");
        assertGeneric404(call("prep-ben", get(base(a) + "/" + s)), "ben reading anika's session");
        assertGeneric404(call("prep-b-consultant", get(base(b) + "/" + s)), "another tenant reading it");
    }

    @Test
    void anExpiredSessionRefusesEventsWith409() throws Exception {
        long s = prepared(post(base(a)).content(ids(mine)));
        PrepareSession live = sessions.findByOrgIdAndConsultantIdAndId(a.getId(), anika.getId(), s).orElseThrow();
        live.setExpiresAt(Instant.now().minus(1, ChronoUnit.MINUTES));
        sessions.save(live);
        em.flush();
        assertThat(json(call("prep-anika", post(base(a) + "/" + s + "/events").content("{\"matchId\":" + mine.getId() + ",\"event\":\"OPENED\"}")), 409).toString()).contains("PREPARE_SESSION_EXPIRED");
        assertThat(json(call("prep-anika", get(base(a) + "/" + s)), 200).path("items")).as("the session can still be read").hasSize(1);
    }

    @Test
    void anOrganizationCanSwitchItOffForItself() throws Exception {
        com.dossier.api.domain.ent.OrgSetting off = new com.dossier.api.domain.ent.OrgSetting();
        off.setOrgId(a.getId());
        off.setSettingKey(EnterpriseSettingKeys.PREPARE_ENABLED);
        off.setValueJson("false");
        off.setUpdatedBy(WHO);
        em.persist(off);
        em.flush();
        assertGeneric404(call("prep-anika", post(base(a)).content(ids(mine))), "organization switched it off");
    }
}
