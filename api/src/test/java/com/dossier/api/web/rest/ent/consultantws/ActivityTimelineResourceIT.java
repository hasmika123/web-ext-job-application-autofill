package com.dossier.api.web.rest.ent.consultantws;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.ent.OrgMemberRole;
import com.dossier.api.domain.ent.consultantws.CwsAvailabilityHistory;
import com.dossier.api.domain.ent.consultantws.CwsCertification;
import com.dossier.api.domain.ent.consultantws.CwsInterviewFeedback;
import com.dossier.api.domain.ent.consultantws.CwsOffer;
import com.dossier.api.domain.ent.consultantws.CwsOfferEvent;
import com.dossier.api.domain.ent.consultantws.CwsSubmission;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.OrgResume;
import com.dossier.api.domain.ent.talent.RequirementMatch;
import com.dossier.api.domain.ent.talent.TalentApplication;
import com.dossier.api.domain.ent.talent.TalentApplicationEvent;
import com.dossier.api.domain.ent.talent.TalentInterview;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.OrgMemberRoleRepository;
import com.dossier.api.repository.ent.OrgRoleRepository;
import com.dossier.api.repository.ent.consultantws.CwsApplicationEventRepository;
import com.dossier.api.repository.ent.consultantws.CwsAvailabilityHistoryRepository;
import com.dossier.api.repository.ent.consultantws.CwsCertificationRepository;
import com.dossier.api.repository.ent.consultantws.CwsInterviewFeedbackRepository;
import com.dossier.api.repository.ent.consultantws.CwsOfferEventRepository;
import com.dossier.api.repository.ent.consultantws.CwsOfferRepository;
import com.dossier.api.repository.ent.consultantws.CwsSubmissionRepository;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.OrgResumeRepository;
import com.dossier.api.repository.ent.talent.RequirementMatchRepository;
import com.dossier.api.repository.ent.talent.TalentApplicationRepository;
import com.dossier.api.repository.ent.talent.TalentInterviewRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ent.LegacyRoleMirror;
import com.dossier.api.service.ent.OrgRoleService;
import com.dossier.api.service.ent.RoleTemplates;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import com.dossier.api.web.rest.org.OrgFixtures;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
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
 * The Consultant workspace Activity Timeline through the real chain on real rows: {@code /api/orgs/{orgId}/me-workspace/activity-timeline}.
 * The feed is derived and read-only, so the checks are: own events only (a second consultant's events never appear), application NOTE events
 * never appear, the merge order and the cursor are stable (also across events with the same time), the period and type filters, the tile math,
 * the milestone checklist, every refusal is the generic 404, and an empty consultant gets an honest empty page.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class ActivityTimelineResourceIT {

    private static final String WHO = "cws-timeline-it";

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper om;
    @Autowired private UserRepository users;
    @Autowired private OrganizationRepository orgs;
    @Autowired private OrgMemberRepository members;
    @Autowired private OrgRoleRepository roleRows;
    @Autowired private OrgMemberRoleRepository memberRoles;
    @Autowired private OrgRoleService roleService;
    @Autowired private AppSettingRepository settingRows;
    @Autowired private ResumeBuilderSettings cache;
    @Autowired private ConsultantProfileRepository profiles;
    @Autowired private ClientAccountRepository clients;
    @Autowired private ClientRequirementRepository requirements;
    @Autowired private OrgResumeRepository resumes;
    @Autowired private RequirementMatchRepository matches;
    @Autowired private TalentApplicationRepository applications;
    @Autowired private CwsApplicationEventRepository appEvents;
    @Autowired private CwsSubmissionRepository submissions;
    @Autowired private TalentInterviewRepository interviews;
    @Autowired private CwsInterviewFeedbackRepository feedback;
    @Autowired private CwsOfferRepository offers;
    @Autowired private CwsOfferEventRepository offerEvents;
    @Autowired private CwsAvailabilityHistoryRepository history;
    @Autowired private CwsCertificationRepository certs;

    private OrgFixtures fx;
    private Organization a;
    private Organization b;
    private final Instant now = Instant.now();
    private ConsultantProfile c1;
    private ConsultantProfile c2;
    private ConsultantProfile c3; // consultant of org a with no rows at all
    private ClientAccount acme;
    private Instant tie;

    @BeforeEach
    void seed() {
        fx = new OrgFixtures(users, orgs, members);
        String n = String.valueOf(System.nanoTime());
        a = fx.org("cws-t-a-" + n, OrgStatus.ACTIVE);
        b = fx.org("cws-t-b-" + n, OrgStatus.ACTIVE);
        flags(true, true);
        staff(a, "cws-t-a-owner", OrgRole.OWNER);
        staff(a, "cws-t-a-admin", OrgRole.ADMIN);
        staff(a, "cws-t-a-marketer", OrgRole.MARKETER);
        staff(b, "cws-t-b-owner", OrgRole.OWNER);
        c1 = consultant(a, "cws-t-a-c1", "Casey One", true);
        c2 = consultant(a, "cws-t-a-c2", "Robin Two", true);
        c3 = consultant(a, "cws-t-a-c3", "Empty Three", true);
        consultant(a, "cws-t-a-noprofile", "Nobody", false);
        consultant(b, "cws-t-b-c1", "Bee Consultant", true);
        acme = client(a, "Acme Corp");
    }

    @AfterEach
    void clean() {
        for (AppSetting s : settingRows.findAll()) if (WHO.equals(s.getUpdatedBy())) settingRows.delete(s);
        cache.invalidate();
    }

    private void flags(boolean master, boolean rolesOn) {
        for (AppSetting s : settingRows.findAll()) if (WHO.equals(s.getUpdatedBy())) settingRows.delete(s);
        settingRows.save(new AppSetting(EnterpriseSettingKeys.FLAG_ENTERPRISE, "{\"on\":" + master + "}", WHO, Instant.now()));
        settingRows.save(new AppSetting(EnterpriseSettingKeys.FLAG_ROLES, "{\"on\":" + rolesOn + "}", WHO, Instant.now()));
        cache.invalidate();
    }

    // ---- fixtures -------------------------------------------------------------------------------------------------

    private OrgMember staff(Organization org, String login, OrgRole role) {
        OrgMember m = fx.active(org, login, role);
        m.setJoinedAt(now.minus(Duration.ofDays(100)));
        members.saveAndFlush(m);
        roleService.syncFromLegacy(m);
        return m;
    }

    private ConsultantProfile consultant(Organization org, String login, String name, boolean withProfile) {
        OrgMember m = fx.seat(org, login, LegacyRoleMirror.toEnum(RoleTemplates.CONSULTANT).orElse(OrgRole.MEMBER), OrgMemberStatus.ACTIVE);
        m.setJoinedAt(now.minus(Duration.ofDays(100)));
        members.saveAndFlush(m);
        OrgMemberRole row = new OrgMemberRole();
        row.setOrgId(org.getId());
        row.setMemberId(m.getId());
        row.setRoleId(roleRows.findSystemByRoleKey(RoleTemplates.CONSULTANT).orElseThrow().getId());
        row.setPrimary(true);
        row.setGrantedAt(Instant.now());
        memberRoles.saveAndFlush(row);
        m.setPrimaryRoleId(row.getRoleId());
        members.saveAndFlush(m);
        if (!withProfile) return null;
        ConsultantProfile p = new ConsultantProfile();
        p.setOrgId(org.getId());
        p.setMemberId(m.getId());
        p.setDisplayName(name);
        p.setEmail(login + "@example.org");
        p.setJobTitle("Senior Engineer");
        return profiles.saveAndFlush(p);
    }

    private ClientAccount client(Organization org, String name) {
        ClientAccount c = new ClientAccount();
        c.setOrgId(org.getId());
        c.setName(name);
        return clients.saveAndFlush(c);
    }

    private ClientRequirement requirement(Organization org, String title) {
        ClientRequirement r = new ClientRequirement();
        r.setOrgId(org.getId());
        r.setClientId(acme.getId());
        r.setTitle(title);
        r.setLocation("Austin, TX");
        r.setWorkMode("HYBRID");
        r.setPostedAt(now.minus(Duration.ofDays(2)));
        return requirements.saveAndFlush(r);
    }

    private int seq = 0;

    private TalentApplication app(ConsultantProfile c, ClientRequirement r) {
        TalentApplication x = new TalentApplication();
        x.setOrgId(c.getOrgId());
        x.setCode("CWS-TL-" + System.nanoTime() + "-" + seq++);
        x.setRequirementId(r.getId());
        x.setConsultantId(c.getId());
        x.setClientId(acme.getId());
        x.setStage("UNDER_REVIEW");
        x.setAppliedOn(LocalDate.now(ZoneOffset.UTC).minusDays(10));
        x.setStageChangedAt(now.minus(Duration.ofDays(5)));
        return applications.saveAndFlush(x);
    }

    private TalentApplicationEvent appEvent(TalentApplication x, String type, String to, Duration ago, String detail) {
        TalentApplicationEvent e = new TalentApplicationEvent();
        e.setOrgId(x.getOrgId());
        e.setApplicationId(x.getId());
        e.setEventType(type);
        e.setToStage(to);
        e.setDetail(detail);
        e.setOccurredAt(now.minus(ago));
        return appEvents.saveAndFlush(e);
    }

    private CwsOffer offer(ConsultantProfile c, String company, String role) {
        CwsOffer o = new CwsOffer();
        o.setOrgId(c.getOrgId());
        o.setConsultantId(c.getId());
        o.setClientName(company);
        o.setRoleTitle(role);
        o.setPackageSummary("$145K base");
        o.setBaseSalaryMinor(14_500_000L);
        o.setTotalCompMinor(16_000_000L);
        o.setWorkMode("REMOTE");
        o.setStartDate(LocalDate.now(ZoneOffset.UTC).plusDays(60));
        o.setOfferDeadline(LocalDate.now(ZoneOffset.UTC).plusDays(10));
        o.setStatus(CwsOffer.ACCEPTED);
        o.setCreatedAt(now.minus(Duration.ofDays(4)));
        o.setUpdatedAt(o.getCreatedAt());
        return offers.saveAndFlush(o);
    }

    /**
     * c1 (all times before "now" in the test): resume updated 2d ago; job assigned 3d; application CREATED 20d, SUBMITTED 10d, a NOTE 9d (must never
     * show), UNDER_REVIEW 5d and an old UNDER_REVIEW 45d (only the 90-day period and the "previous" tile window); submission decided 8d, sent 6d,
     * marketer note created 12d; one interview booked 15d ago and completed 1d ago with feedback 12h ago; an offer with RECEIVED and UPDATED at the
     * same instant (4d) and ACCEPTED 1d; an availability row and a certification (both created now). 17 events in 90 days, 16 in 30 days.
     */
    private void seedC1() {
        ClientRequirement r1 = requirement(a, "Senior Java Developer");
        ClientRequirement r2 = requirement(a, "Platform Engineer");

        OrgResume resume = new OrgResume();
        resume.setOrgId(a.getId());
        resume.setConsultantId(c1.getId());
        resume.setMemberId(c1.getMemberId());
        resume.setName("Senior Java Developer Resume");
        resume.setFileName("Senior Java Developer Resume.pdf");
        resume.setCreatedAt(now.minus(Duration.ofDays(40)));
        resume.setUpdatedAt(now.minus(Duration.ofDays(2)));
        resumes.saveAndFlush(resume);

        RequirementMatch m = new RequirementMatch();
        m.setOrgId(a.getId());
        m.setConsultantId(c1.getId());
        m.setRequirementId(r1.getId());
        m.setScore(90);
        m.setStatus("ASSIGNED");
        m.setCreatedAt(now.minus(Duration.ofDays(20)));
        m.setAssignedAt(now.minus(Duration.ofDays(3)));
        matches.saveAndFlush(m);

        TalentApplication app = app(c1, r1);
        appEvent(app, "CREATED", "ASSIGNED", Duration.ofDays(20), null);
        appEvent(app, "STAGE_CHANGE", "SUBMITTED", Duration.ofDays(10), null);
        appEvent(app, "NOTE", null, Duration.ofDays(9), "Marketer private note: hidden-from-consultant");
        appEvent(app, "STAGE_CHANGE", "UNDER_REVIEW", Duration.ofDays(5), null);
        appEvent(app, "STAGE_CHANGE", "UNDER_REVIEW", Duration.ofDays(45), null);

        CwsSubmission s = new CwsSubmission();
        s.setOrgId(a.getId());
        s.setConsultantId(c1.getId());
        s.setRequirementId(r1.getId());
        s.setStatus(CwsSubmission.SUBMITTED);
        s.setMarketerNote("Please approve");
        s.setCreatedAt(now.minus(Duration.ofDays(12)));
        s.setUpdatedAt(s.getCreatedAt());
        s.setDecidedAt(now.minus(Duration.ofDays(8)));
        s.setSubmittedOn(now.minus(Duration.ofDays(6)));
        submissions.saveAndFlush(s);

        TalentInterview iv = new TalentInterview();
        iv.setOrgId(a.getId());
        iv.setApplicationId(app.getId());
        iv.setConsultantId(c1.getId());
        iv.setClientId(acme.getId());
        iv.setScheduledAt(now.minus(Duration.ofDays(1)));
        iv.setDurationMinutes(60);
        iv.setStatus("COMPLETED");
        iv.setRoundLabel("Technical");
        iv.setCreatedAt(now.minus(Duration.ofDays(15)));
        iv.setUpdatedAt(iv.getCreatedAt());
        interviews.saveAndFlush(iv);
        CwsInterviewFeedback f = new CwsInterviewFeedback();
        f.setOrgId(a.getId());
        f.setInterviewId(iv.getId());
        f.setConsultantId(c1.getId());
        f.setOutcome("POSITIVE");
        f.setSummary("Went well");
        f.setCreatedAt(now.minus(Duration.ofHours(12)));
        f.setUpdatedAt(f.getCreatedAt());
        feedback.saveAndFlush(f);

        CwsOffer o = offer(c1, "FinServe Inc.", "Senior Java Developer");
        tie = now.minus(Duration.ofDays(4));
        offerEvents.saveAndFlush(CwsOfferEvent.of(o, "RECEIVED", "Offer received", tie));
        offerEvents.saveAndFlush(CwsOfferEvent.of(o, "UPDATED", "Offer updated", tie));
        offerEvents.saveAndFlush(CwsOfferEvent.of(o, "ACCEPTED", "Offer accepted", now.minus(Duration.ofDays(1))));

        CwsAvailabilityHistory h = new CwsAvailabilityHistory();
        h.setOrgId(a.getId());
        h.setConsultantId(c1.getId());
        h.setEffectiveDate(LocalDate.now(ZoneOffset.UTC));
        h.setAvailabilityStatus("AVAILABLE");
        h.setAvailableFrom(LocalDate.now(ZoneOffset.UTC).plusDays(30));
        h.setWorkMode("HYBRID");
        h.setCreatedAt(now.minus(Duration.ofHours(1)));
        history.saveAndFlush(h);

        CwsCertification cert = new CwsCertification();
        cert.setOrgId(a.getId());
        cert.setConsultantId(c1.getId());
        cert.setName("AWS Solutions Architect");
        cert.setIssuer("AWS");
        cert.setIssuedOn(LocalDate.now(ZoneOffset.UTC).minusDays(100));
        cert.setCreatedAt(now.minus(Duration.ofMinutes(30)));
        certs.saveAndFlush(cert);

        // r2 is assigned only to the second consultant below (their data must never leak into c1's feed)
        seedC2(r2);
    }

    private void seedC2(ClientRequirement r2) {
        RequirementMatch m = new RequirementMatch();
        m.setOrgId(a.getId());
        m.setConsultantId(c2.getId());
        m.setRequirementId(r2.getId());
        m.setScore(80);
        m.setStatus("ASSIGNED");
        m.setCreatedAt(now.minus(Duration.ofDays(5)));
        m.setAssignedAt(now.minus(Duration.ofHours(2)));
        matches.saveAndFlush(m);
        CwsOffer o = offer(c2, "Hidden Systems", "Hidden Secret Role");
        offerEvents.saveAndFlush(CwsOfferEvent.of(o, "RECEIVED", "Offer received", now.minus(Duration.ofHours(3))));
        TalentApplication app = app(c2, r2);
        appEvent(app, "STAGE_CHANGE", "SUBMITTED", Duration.ofHours(4), null);
    }

    // ---- calls ----------------------------------------------------------------------------------------------------

    private static String path(long orgId, String query) {
        return "/api/orgs/" + orgId + "/me-workspace/activity-timeline" + query;
    }

    private MvcResult send(MockHttpServletRequestBuilder req, String login) throws Exception {
        return mockMvc.perform(req.with(user(login)).contentType(MediaType.APPLICATION_JSON)).andReturn();
    }

    private JsonNode page(String login, Organization org, String query) throws Exception {
        MvcResult r = send(get(path(org.getId(), query)), login);
        String body = r.getResponse().getContentAsString();
        assertThat(r.getResponse().getStatus()).as(login + " " + query + " -> " + body).isEqualTo(200);
        return om.readTree(body);
    }

    private void assertGeneric404(MvcResult r, String what) throws Exception {
        String body = r.getResponse().getContentAsString();
        assertThat(r.getResponse().getStatus()).as(what + " -> " + body).isEqualTo(404);
        assertThat(body.toLowerCase()).as(what).contains("\"code\":\"not_found\"").doesNotContain("forbidden").doesNotContain("permission").doesNotContain("not a member").doesNotContain("denied");
    }

    private static List<String> texts(JsonNode array, String field) {
        List<String> out = new ArrayList<>();
        for (JsonNode n : array) out.add(n.path(field).asText());
        return out;
    }

    // ---- own events -----------------------------------------------------------------------------------------------

    @Test
    void aConsultantGetsTheirOwnMergedEventsNewestFirstAndNothingElse() throws Exception {
        seedC1();
        JsonNode p = page("cws-t-a-c1", a, "");
        assertThat(p.path("orgId").asLong()).isEqualTo(a.getId());
        assertThat(p.path("consultantName").asText()).isEqualTo("Casey One");
        assertThat(p.path("days").asInt()).isEqualTo(30);
        assertThat(p.path("type").asText()).isEqualTo("ALL");
        assertThat(p.path("total").asLong()).as("17 events in total, 16 inside 30 days (the 45-day-old one is outside)").isEqualTo(16);
        JsonNode events = p.path("events");
        assertThat(events).hasSize(16);

        // newest first, ties broken by the key (descending)
        for (int i = 1; i < events.size(); i++) {
            Instant prev = Instant.parse(events.get(i - 1).path("at").asText());
            Instant cur = Instant.parse(events.get(i).path("at").asText());
            assertThat(prev).as("order at " + i).isAfterOrEqualTo(cur);
            if (prev.equals(cur)) assertThat(events.get(i - 1).path("key").asText()).isGreaterThan(events.get(i).path("key").asText());
        }
        List<String> types = texts(events, "type");
        assertThat(types).containsExactlyInAnyOrder(
            "AVAILABILITY_UPDATED", "PROFILE_UPDATED", "FEEDBACK_RECEIVED", "INTERVIEW_COMPLETED", "OFFER_ACCEPTED", "RESUME_UPDATED", "JOB_ASSIGNED", "OFFER_RECEIVED", "OFFER_UPDATED",
            "APPLICATION_UPDATED", "SUBMISSION_SENT", "SUBMISSION_APPROVED", "APPLICATION_SUBMITTED", "MARKETER_NOTE", "INTERVIEW_SCHEDULED", "APPLICATION_CREATED"
        );

        // each row carries its chip and its owning page
        JsonNode resume = byType(events, "RESUME_UPDATED");
        assertThat(resume.path("chip").path("kind").asText()).isEqualTo("FILE");
        assertThat(resume.path("chip").path("primary").asText()).isEqualTo("Senior Java Developer Resume.pdf");
        assertThat(resume.path("target").asText()).isEqualTo("resumes");
        assertThat(resume.path("actionLabel").asText()).isEqualTo("View Resume");
        JsonNode job = byType(events, "JOB_ASSIGNED");
        assertThat(job.path("chip").path("primary").asText()).isEqualTo("Senior Java Developer");
        assertThat(job.path("chip").path("company").asText()).isEqualTo("Acme Corp");
        assertThat(job.path("target").asText()).isEqualTo("opportunities");
        assertThat(byType(events, "INTERVIEW_COMPLETED").path("chip").path("kind").asText()).isEqualTo("DATES");
        assertThat(byType(events, "AVAILABILITY_UPDATED").path("chip").path("primary").asText()).isEqualTo("Available");
        assertThat(byType(events, "PROFILE_UPDATED").path("chip").path("primary").asText()).isEqualTo("Added 1 certification");
        assertThat(byType(events, "OFFER_ACCEPTED").path("target").asText()).isEqualTo("offers");

        // never another consultant's rows, never an application NOTE
        String all = events.toString();
        assertThat(all).doesNotContain("Hidden").doesNotContain("hidden-from-consultant").doesNotContain("Marketer private note");
        assertThat(texts(events, "type")).doesNotContain("APPLICATION_NOTE");
        long appRows = texts(events, "key").stream().filter(k -> k.startsWith("app-event:")).count();
        assertThat(appRows).as("CREATED, SUBMITTED and the 5-day UNDER_REVIEW only; the NOTE is skipped and the 45-day one is outside").isEqualTo(3);
        assertThat(p.path("nextCursor").isNull()).isTrue();
    }

    private static JsonNode byType(JsonNode events, String type) {
        for (JsonNode e : events) if (type.equals(e.path("type").asText())) return e;
        throw new AssertionError("no event of type " + type);
    }

    @Test
    void theSecondConsultantOnlySeesTheirOwnEvents() throws Exception {
        seedC1();
        JsonNode p = page("cws-t-a-c2", a, "");
        assertThat(p.path("consultantName").asText()).isEqualTo("Robin Two");
        assertThat(texts(p.path("events"), "type")).containsExactlyInAnyOrder("OFFER_RECEIVED", "JOB_ASSIGNED", "APPLICATION_SUBMITTED");
        String all = p.path("events").toString();
        assertThat(all).contains("Hidden Systems").doesNotContain("FinServe").doesNotContain("Senior Java Developer Resume");
        assertThat(p.path("total").asLong()).isEqualTo(3);
    }

    // ---- ordering and pagination ----------------------------------------------------------------------------------

    @Test
    void theCursorWalksTheWholeFeedWithoutRepeatingOrSkippingEvenAcrossTiedTimes() throws Exception {
        seedC1();
        List<String> full = texts(page("cws-t-a-c1", a, "?size=50").path("events"), "key");
        assertThat(full).hasSize(16).doesNotHaveDuplicates();

        for (int size : new int[] { 1, 3, 5, 7 }) {
            List<String> walked = new ArrayList<>();
            String cursor = null;
            int guard = 0;
            do {
                JsonNode p = page("cws-t-a-c1", a, "?size=" + size + (cursor == null ? "" : "&cursor=" + cursor));
                assertThat(p.path("events").size()).isLessThanOrEqualTo(size);
                walked.addAll(texts(p.path("events"), "key"));
                cursor = p.path("nextCursor").isNull() ? null : p.path("nextCursor").asText();
                assertThat(p.path("total").asLong()).as("total is the count for the filter, not the page").isEqualTo(16);
                assertThat(++guard).isLessThan(40);
            } while (cursor != null);
            assertThat(walked).as("size " + size).containsExactlyElementsOf(full);
        }
        // the two offer events that share one instant are both there, in key order
        List<String> keys = full.stream().filter(k -> k.startsWith("offer-event:")).toList();
        assertThat(keys).hasSize(3);
    }

    @Test
    void badCursorAndSizeAreValidationErrors() throws Exception {
        seedC1();
        assertThat(send(get(path(a.getId(), "?cursor=not-a-cursor!!")), "cws-t-a-c1").getResponse().getStatus()).isEqualTo(422);
        assertThat(send(get(path(a.getId(), "?cursor=Zm9v")), "cws-t-a-c1").getResponse().getStatus()).as("decodes to 'foo' (no separator)").isEqualTo(422);
        assertThat(send(get(path(a.getId(), "?size=0")), "cws-t-a-c1").getResponse().getStatus()).isEqualTo(422);
        assertThat(send(get(path(a.getId(), "?size=51")), "cws-t-a-c1").getResponse().getStatus()).isEqualTo(422);
        assertThat(send(get(path(a.getId(), "?days=15")), "cws-t-a-c1").getResponse().getStatus()).isEqualTo(422);
        assertThat(send(get(path(a.getId(), "?type=NOPE")), "cws-t-a-c1").getResponse().getStatus()).isEqualTo(422);
    }

    // ---- filters --------------------------------------------------------------------------------------------------

    @Test
    void thePeriodFilterKeepsOnlyEventsInsideTheWindow() throws Exception {
        seedC1();
        JsonNode d7 = page("cws-t-a-c1", a, "?days=7&size=50");
        Instant since7 = Instant.now().minus(Duration.ofDays(7));
        for (JsonNode e : d7.path("events")) assertThat(Instant.parse(e.path("at").asText())).isAfter(since7.minusSeconds(5));
        assertThat(d7.path("days").asInt()).isEqualTo(7);
        assertThat(texts(d7.path("events"), "type")).doesNotContain("APPLICATION_SUBMITTED", "SUBMISSION_APPROVED", "APPLICATION_CREATED", "MARKETER_NOTE", "INTERVIEW_SCHEDULED");
        assertThat(d7.path("total").asLong()).as("10 in the last week plus the sent submission").isEqualTo(11);

        JsonNode d90 = page("cws-t-a-c1", a, "?days=90&size=50");
        assertThat(d90.path("total").asLong()).isEqualTo(17);
        assertThat(d90.path("events")).hasSize(17);
    }

    @Test
    void theTypeFilterKeepsOnlyThatGroup() throws Exception {
        seedC1();
        JsonNode offersOnly = page("cws-t-a-c1", a, "?type=OFFER");
        assertThat(offersOnly.path("total").asLong()).isEqualTo(3);
        assertThat(texts(offersOnly.path("events"), "group")).containsOnly("OFFER");
        assertThat(offersOnly.path("type").asText()).isEqualTo("OFFER");
        JsonNode apps = page("cws-t-a-c1", a, "?type=application");
        assertThat(texts(apps.path("events"), "group")).containsOnly("APPLICATION");
        assertThat(apps.path("total").asLong()).isEqualTo(3);
        assertThat(page("cws-t-a-c1", a, "?type=ALL").path("total").asLong()).isEqualTo(16);
    }

    // ---- tiles and milestones -------------------------------------------------------------------------------------

    @Test
    void theTilesAreTheCountsInTheLastWindowAgainstTheWindowBefore() throws Exception {
        seedC1();
        JsonNode t = page("cws-t-a-c1", a, "").path("tiles");
        JsonNode total = t.path("total");
        assertThat(total.path("value").asLong()).isEqualTo(16);
        assertThat(total.path("previous").asLong()).as("only the 45-day-old event is in the month before").isEqualTo(1);
        assertThat(total.path("deltaPct").asDouble()).isEqualTo(1500.0);
        assertThat(total.path("vs").asText()).isEqualTo("month");
        assertThat(total.path("sparkline")).hasSize(6);

        JsonNode week = t.path("thisWeek");
        assertThat(week.path("value").asLong()).isEqualTo(11);
        assertThat(week.path("previous").asLong()).as("SUBMITTED 10d, submission decided 8d, marketer note 12d").isEqualTo(3);
        assertThat(week.path("vs").asText()).isEqualTo("week");

        JsonNode apps = t.path("applications");
        assertThat(apps.path("value").asLong()).as("3 application events + submission approved + submission sent").isEqualTo(5);
        assertThat(apps.path("previous").asLong()).isEqualTo(1);
        assertThat(apps.path("deltaPct").asDouble()).isEqualTo(400.0);

        JsonNode iv = t.path("interviews");
        assertThat(iv.path("value").asLong()).as("scheduled, completed, feedback").isEqualTo(3);
        assertThat(iv.path("previous").asLong()).isZero();
        assertThat(iv.path("deltaPct").isNull()).as("no delta when the earlier count is 0").isTrue();

        JsonNode profile = t.path("profile");
        assertThat(profile.path("value").asLong()).as("resume updated, availability, profile").isEqualTo(3);
        assertThat(profile.path("deltaPct").isNull()).isTrue();
    }

    @Test
    void theMilestonesAreReachedFromRealRowsAndOpenOtherwise() throws Exception {
        seedC1();
        JsonNode ms = page("cws-t-a-c1", a, "").path("milestones");
        assertThat(texts(ms, "label")).containsExactly("Application Submitted", "Submission Approved", "Interview Completed", "Offer Received", "Offer Accepted", "Project Start Date");
        assertThat(ms.get(0).path("reached").asBoolean()).isTrue();
        assertThat(ms.get(0).path("on").asText()).isNotBlank();
        assertThat(ms.get(1).path("reached").asBoolean()).isTrue();
        assertThat(ms.get(2).path("reached").asBoolean()).isTrue();
        assertThat(ms.get(3).path("reached").asBoolean()).isTrue();
        assertThat(ms.get(4).path("reached").asBoolean()).isTrue();
        assertThat(ms.get(5).path("reached").asBoolean()).as("no placement row").isFalse();
        assertThat(ms.get(5).path("on").isNull()).isTrue();
    }

    @Test
    void anEmptyConsultantGetsAnHonestEmptyPage() throws Exception {
        seedC1();
        JsonNode p = page("cws-t-a-c3", a, "");
        assertThat(p.path("events")).isEmpty();
        assertThat(p.path("total").asLong()).isZero();
        assertThat(p.path("nextCursor").isNull()).isTrue();
        for (String k : new String[] { "total", "thisWeek", "applications", "interviews", "profile" }) {
            assertThat(p.path("tiles").path(k).path("value").asLong()).isZero();
            assertThat(p.path("tiles").path(k).path("deltaPct").isNull()).isTrue();
        }
        for (JsonNode m : p.path("milestones")) assertThat(m.path("reached").asBoolean()).isFalse();
    }

    // ---- gates ----------------------------------------------------------------------------------------------------

    @Test
    void everyoneWhoIsNotAConsultantOfThisOrganizationGetsTheGeneric404() throws Exception {
        seedC1();
        assertGeneric404(send(get(path(a.getId(), "")), "cws-t-a-owner"), "owner");
        assertGeneric404(send(get(path(a.getId(), "")), "cws-t-a-admin"), "admin");
        assertGeneric404(send(get(path(a.getId(), "")), "cws-t-a-marketer"), "marketer");
        assertGeneric404(send(get(path(a.getId(), "")), "cws-t-a-noprofile"), "consultant without a profile row");
        assertGeneric404(send(get(path(b.getId(), "")), "cws-t-a-c1"), "another organization");
        assertGeneric404(send(get(path(a.getId(), "")), "cws-t-b-c1"), "a consultant of another organization");
    }

    @Test
    void withTheFlagsOffThePageIsTheGeneric404() throws Exception {
        seedC1();
        flags(false, false);
        assertGeneric404(send(get(path(a.getId(), "")), "cws-t-a-c1"), "master flag off");
        flags(true, false);
        assertGeneric404(send(get(path(a.getId(), "")), "cws-t-a-c1"), "roles flag off");
    }

    @Test
    void thePageIsReadOnly() throws Exception {
        seedC1();
        int before = (int) offerEvents.count();
        MvcResult r = send(post(path(a.getId(), "")).content("{}"), "cws-t-a-c1");
        assertThat(r.getResponse().getStatus()).isIn(404, 405);
        assertThat((int) offerEvents.count()).isEqualTo(before);
    }
}
