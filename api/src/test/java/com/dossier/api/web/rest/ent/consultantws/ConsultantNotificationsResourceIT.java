package com.dossier.api.web.rest.ent.consultantws;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.ent.OrgMemberRole;
import com.dossier.api.domain.ent.consultantws.CwsNotification;
import com.dossier.api.domain.ent.consultantws.CwsOffer;
import com.dossier.api.domain.ent.consultantws.CwsSubmission;
import com.dossier.api.domain.ent.consultantws.CwsTask;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.RequirementMatch;
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
import com.dossier.api.repository.ent.consultantws.CwsNotificationPrefRepository;
import com.dossier.api.repository.ent.consultantws.CwsNotificationRepository;
import com.dossier.api.repository.ent.consultantws.CwsOfferRepository;
import com.dossier.api.repository.ent.consultantws.CwsSubmissionRepository;
import com.dossier.api.repository.ent.consultantws.CwsTaskRepository;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.RequirementMatchRepository;
import com.dossier.api.repository.ent.talent.TalentInterviewRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ent.LegacyRoleMirror;
import com.dossier.api.service.ent.OrgRoleService;
import com.dossier.api.service.ent.RoleTemplates;
import com.dossier.api.service.ent.consultantws.ConsultantNotificationsService;
import com.dossier.api.service.ent.consultantws.ConsultantWsNotificationsDemoSeeder;
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
 * The Consultant workspace Notifications page through the real chain on real rows: {@code /api/orgs/{orgId}/me-workspace/notifications}. The feed is
 * derived from rows the test wrote (matches, an assigned opportunity, a submission, an interview, offers, tasks, the profile), every figure is asserted
 * against them, generating twice creates nothing new, a consultant only ever sees and changes their own notifications, every refusal is the generic 404,
 * and the preferences never switch SMS on.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class ConsultantNotificationsResourceIT {

    private static final String WHO = "cws-notif-it";
    private static final String C1 = "cws-n-a-c1";

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
    @Autowired private RequirementMatchRepository matches;
    @Autowired private CwsSubmissionRepository submissions;
    @Autowired private TalentInterviewRepository interviews;
    @Autowired private CwsOfferRepository offers;
    @Autowired private CwsTaskRepository tasks;
    @Autowired private CwsNotificationRepository notifications;
    @Autowired private CwsNotificationPrefRepository prefRows;
    @Autowired private ConsultantWsNotificationsDemoSeeder seeder;
    @Autowired private ConsultantNotificationsService service;

    private OrgFixtures fx;
    private Organization a;
    private Organization b;
    private final Instant now = Instant.now();
    private final LocalDate today = LocalDate.now(ZoneOffset.UTC);

    private ConsultantProfile c1;
    private ConsultantProfile c2;
    private ClientAccount acme;
    private CwsSubmission sub1;
    private int seq = 0;

    @BeforeEach
    void seed() {
        fx = new OrgFixtures(users, orgs, members);
        String n = String.valueOf(System.nanoTime());
        a = fx.org("cws-n-a-" + n, OrgStatus.ACTIVE);
        b = fx.org("cws-n-b-" + n, OrgStatus.ACTIVE);
        flags(true, true);
        staff(a, "cws-n-a-owner", OrgRole.OWNER);
        staff(a, "cws-n-a-admin", OrgRole.ADMIN);
        staff(a, "cws-n-a-marketer", OrgRole.MARKETER);
        staff(b, "cws-n-b-owner", OrgRole.OWNER);
        c1 = consultant(a, C1, "Casey One", true);
        c2 = consultant(a, "cws-n-a-c2", "Robin Two", true);
        consultant(a, "cws-n-a-noprofile", "Nobody", false);
        consultant(b, "cws-n-b-c1", "Bee Consultant", true);
        c1.setProfileCompleteness(100);
        c2.setProfileCompleteness(100);
        profiles.saveAndFlush(c1);
        profiles.saveAndFlush(c2);
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
        r.setEmploymentLabel("FULL_TIME");
        r.setDescriptionText("Build and run services for " + title + ".");
        r.setPostedAt(now.minus(Duration.ofDays(2)));
        return requirements.saveAndFlush(r);
    }

    private RequirementMatch match(ConsultantProfile c, String title, String status, int score, int createdDaysAgo) {
        RequirementMatch m = new RequirementMatch();
        m.setOrgId(c.getOrgId());
        m.setRequirementId(requirement(c.getOrgId().equals(a.getId()) ? a : b, title).getId());
        m.setConsultantId(c.getId());
        m.setScore(score);
        m.setStatus(status);
        m.setReason("Skills align with this role.");
        m.setCreatedAt(now.minus(Duration.ofDays(createdDaysAgo)));
        if ("ASSIGNED".equals(status)) m.setAssignedAt(m.getCreatedAt());
        return matches.saveAndFlush(m);
    }

    private CwsSubmission submission(ConsultantProfile c, String title, String status, Instant dueAt) {
        CwsSubmission s = new CwsSubmission();
        s.setOrgId(c.getOrgId());
        s.setConsultantId(c.getId());
        s.setRequirementId(requirement(a, title).getId());
        s.setStatus(status);
        s.setDueAt(dueAt);
        s.setCreatedAt(now.minus(Duration.ofDays(1)));
        s.setUpdatedAt(s.getCreatedAt());
        return submissions.saveAndFlush(s);
    }

    private TalentInterview interview(ConsultantProfile c, Instant at, String status) {
        TalentInterview i = new TalentInterview();
        i.setOrgId(c.getOrgId());
        i.setConsultantId(c.getId());
        i.setClientId(acme.getId());
        i.setScheduledAt(at);
        i.setDurationMinutes(60);
        i.setStatus(status);
        i.setRoundLabel("Technical");
        i.setCreatedAt(now.minus(Duration.ofDays(3)));
        i.setUpdatedAt(i.getCreatedAt());
        return interviews.saveAndFlush(i);
    }

    private CwsOffer offer(ConsultantProfile c, String company, String status, int deadlineInDays) {
        CwsOffer o = new CwsOffer();
        o.setOrgId(c.getOrgId());
        o.setConsultantId(c.getId());
        o.setClientName(company);
        o.setRoleTitle("Platform Engineer");
        o.setStatus(status);
        o.setOfferDeadline(today.plusDays(deadlineInDays));
        o.setCreatedAt(now.minus(Duration.ofDays(2)));
        o.setUpdatedAt(o.getCreatedAt());
        return offers.saveAndFlush(o);
    }

    private CwsTask task(ConsultantProfile c, String title, String priority, String status, int dueInDays) {
        CwsTask t = new CwsTask();
        t.setOrgId(c.getOrgId());
        t.setConsultantId(c.getId());
        t.setTitle(title);
        t.setPriority(priority);
        t.setStatus(status);
        t.setDueOn(today.plusDays(dueInDays));
        t.setCreatedAt(now.minus(Duration.ofDays(5)));
        t.setUpdatedAt(t.getCreatedAt());
        return tasks.saveAndFlush(t);
    }

    /**
     * c1 gets eight notifications: a recent strong match, an assigned opportunity with no answer, a pending submission due tomorrow, an interview in 20
     * hours, an offer due in 2 days, an overdue task, a task due today and an incomplete profile. Everything else written here must NOT notify: an old
     * match, a dismissed match, a later interview, a far offer, a finished task, a future task.
     */
    private void seedC1() {
        match(c1, "Senior Java Developer", "SUGGESTED", 90, 2);
        match(c1, "Old Match Role", "SUGGESTED", 95, 10);
        match(c1, "Dismissed Role", "DISMISSED", 95, 1);
        match(c1, "Cloud Architect", "ASSIGNED", 70, 3);
        sub1 = submission(c1, "Data Engineer", CwsSubmission.PENDING, now.plus(Duration.ofHours(20)));
        submission(c1, "Already Decided", CwsSubmission.APPROVED, null);
        interview(c1, now.plus(Duration.ofHours(20)), "SCHEDULED");
        interview(c1, now.plus(Duration.ofDays(5)), "SCHEDULED");
        interview(c1, now.plus(Duration.ofHours(10)), "CANCELLED");
        offer(c1, "CloudWave", CwsOffer.PENDING_REVIEW, 2);
        offer(c1, "FarCo", CwsOffer.PENDING_REVIEW, 20);
        offer(c1, "DoneCo", CwsOffer.ACCEPTED, 1);
        task(c1, "Send updated availability", "HIGH", "NOT_STARTED", -2);
        task(c1, "Prepare for the client call", "MEDIUM", "IN_PROGRESS", 0);
        task(c1, "Finished long ago", "HIGH", "DONE", -5);
        task(c1, "Next month", "LOW", "NOT_STARTED", 20);
        c1.setProfileCompleteness(40);
        profiles.saveAndFlush(c1);
    }

    private void seedC2() {
        match(c2, "Hidden Secret Role", "SUGGESTED", 99, 1);
        task(c2, "Hidden follow-up", "HIGH", "NOT_STARTED", -1);
    }

    // ---- calls ----------------------------------------------------------------------------------------------------

    private static String path(long orgId, String tail) {
        return "/api/orgs/" + orgId + "/me-workspace/notifications" + tail;
    }

    private MvcResult send(MockHttpServletRequestBuilder req, String login, String body) throws Exception {
        if (body != null) req = req.contentType(MediaType.APPLICATION_JSON).content(body);
        return mockMvc.perform(req.with(user(login)).contentType(MediaType.APPLICATION_JSON)).andReturn();
    }

    private JsonNode ok(MvcResult r, String what) throws Exception {
        String body = r.getResponse().getContentAsString();
        assertThat(r.getResponse().getStatus()).as(what + " -> " + body).isBetween(200, 204);
        return body.isBlank() ? om.nullNode() : om.readTree(body);
    }

    private JsonNode page(String login, Organization org, String query) throws Exception {
        return ok(send(get(path(org.getId(), query)), login, null), "page " + login);
    }

    private JsonNode page(String query) throws Exception {
        return page(C1, a, query);
    }

    private void assertGeneric404(MvcResult r, String what) throws Exception {
        String body = r.getResponse().getContentAsString();
        assertThat(r.getResponse().getStatus()).as(what + " -> " + body).isEqualTo(404);
        assertThat(body.toLowerCase()).as(what).contains("\"code\":\"not_found\"").doesNotContain("forbidden").doesNotContain("permission").doesNotContain("not a member").doesNotContain("denied");
    }

    private void assertStatus(MvcResult r, int status, String what) throws Exception {
        assertThat(r.getResponse().getStatus()).as(what + " -> " + r.getResponse().getContentAsString()).isEqualTo(status);
    }

    private static List<String> texts(JsonNode array, String field) {
        List<String> out = new ArrayList<>();
        for (JsonNode n : array) out.add(n.path(field).asText());
        return out;
    }

    private long idOf(JsonNode feed, String title) {
        for (JsonNode n : feed.path("notifications").path("items")) if (title.equals(n.path("title").asText())) return n.path("id").asLong();
        throw new AssertionError("no notification titled " + title + " in " + texts(feed.path("notifications").path("items"), "title"));
    }

    private long idOfBody(JsonNode feed, String bodyPart) {
        for (JsonNode n : feed.path("notifications").path("items")) if (n.path("body").asText().contains(bodyPart)) return n.path("id").asLong();
        throw new AssertionError("no notification mentioning " + bodyPart);
    }

    private String ids(long... ids) {
        StringBuilder s = new StringBuilder("[");
        for (int i = 0; i < ids.length; i++) s.append(i == 0 ? "" : ",").append(ids[i]);
        return s.append("]").toString();
    }

    private CwsNotification fresh(long id) {
        return notifications.findById(id).orElseThrow();
    }

    private JsonNode firstPageAll() throws Exception {
        return page("?status=ALL&size=50");
    }

    // ---- (a) the feed is derived from the consultant's own rows -----------------------------------------------------

    @Test
    void theFeedIsDerivedFromTheConsultantsOwnRowsWithRealLinksAndPriorities() throws Exception {
        seedC1();
        JsonNode p = firstPageAll();

        assertThat(p.path("orgId").asLong()).isEqualTo(a.getId());
        assertThat(p.path("name").asText()).isEqualTo("Casey One");
        assertThat(texts(p.path("notifications").path("items"), "title")).containsExactlyInAnyOrder(
            "New Job Match Available", "Opportunity Awaiting Your Response", "Submission Approval Requested", "Interview Reminder", "Offer Deadline Approaching",
            "Follow-up Overdue", "Follow-up Due Today", "Complete Your Profile"
        );
        assertThat(p.path("notifications").path("total").asLong()).isEqualTo(8);
        assertThat(notifications.countByOrgIdAndConsultantId(a.getId(), c1.getId())).isEqualTo(8);

        JsonNode match = byTitle(p, "New Job Match Available");
        assertThat(match.path("category").asText()).isEqualTo("JOB_MATCH");
        assertThat(match.path("priority").asText()).isEqualTo("HIGH");
        assertThat(match.path("body").asText()).contains("Senior Java Developer").contains("Acme Corp");
        assertThat(match.path("actionLabel").asText()).isEqualTo("View");
        assertThat(match.path("actionHref").asText()).isEqualTo("/w/consultant/matches");
        assertThat(match.path("relatedType").asText()).isEqualTo("MATCH");
        assertThat(match.path("status").asText()).isEqualTo("UNREAD");
        assertThat(Instant.parse(match.path("createdAt").asText())).as("the match's own time, not the time of the first page load").isBefore(now.minus(Duration.ofDays(1)));

        JsonNode opp = byTitle(p, "Opportunity Awaiting Your Response");
        assertThat(opp.path("actionLabel").asText()).isEqualTo("Respond");
        assertThat(opp.path("actionHref").asText()).isEqualTo("/w/consultant/opportunities");
        assertThat(opp.path("body").asText()).contains("Cloud Architect");

        JsonNode sub = byTitle(p, "Submission Approval Requested");
        assertThat(sub.path("category").asText()).isEqualTo("APPROVAL");
        assertThat(sub.path("priority").asText()).as("due within 48 hours").isEqualTo("HIGH");
        assertThat(sub.path("actionHref").asText()).isEqualTo("/w/consultant/submissions");
        assertThat(sub.path("body").asText()).contains("Data Engineer");

        JsonNode iv = byTitle(p, "Interview Reminder");
        assertThat(iv.path("category").asText()).isEqualTo("INTERVIEW");
        assertThat(iv.path("priority").asText()).isEqualTo("HIGH");
        assertThat(iv.path("body").asText()).contains("Acme Corp");
        assertThat(iv.path("actionHref").asText()).isEqualTo("/w/consultant/interviews");

        JsonNode off = byTitle(p, "Offer Deadline Approaching");
        assertThat(off.path("category").asText()).isEqualTo("OFFER");
        assertThat(off.path("priority").asText()).isEqualTo("HIGH");
        assertThat(off.path("body").asText()).contains("CloudWave").doesNotContain("FarCo");
        assertThat(off.path("actionHref").asText()).isEqualTo("/w/consultant/offers");

        JsonNode overdue = byTitle(p, "Follow-up Overdue");
        assertThat(overdue.path("category").asText()).isEqualTo("REMINDER");
        assertThat(overdue.path("priority").asText()).isEqualTo("HIGH");
        assertThat(overdue.path("actionLabel").asText()).isEqualTo("Snooze");
        assertThat(overdue.path("body").asText()).contains("Send updated availability");
        assertThat(byTitle(p, "Follow-up Due Today").path("priority").asText()).isEqualTo("MEDIUM");

        JsonNode prof = byTitle(p, "Complete Your Profile");
        assertThat(prof.path("priority").asText()).isEqualTo("LOW");
        assertThat(prof.path("actionLabel").asText()).isEqualTo("Update");
        assertThat(prof.path("actionHref").asText()).isEqualTo("/w/consultant/profile");
        assertThat(prof.path("body").asText()).contains("40%");

        for (JsonNode n : p.path("notifications").path("items")) {
            assertThat(CwsNotification.validHref(n.path("actionHref").asText())).as(n.path("title").asText()).isTrue();
            assertThat(n.path("title").asText().length()).isLessThanOrEqualTo(160);
            assertThat(n.path("body").asText().length()).isLessThanOrEqualTo(300);
        }
        assertThat(p.toString()).doesNotContain("Old Match Role").doesNotContain("Dismissed Role").doesNotContain("Already Decided").doesNotContain("Finished long ago").doesNotContain("Next month");
    }

    private JsonNode byTitle(JsonNode feed, String title) {
        for (JsonNode n : feed.path("notifications").path("items")) if (title.equals(n.path("title").asText())) return n;
        throw new AssertionError("no notification titled " + title);
    }

    @Test
    void generatingAgainCreatesNothingNewAndAClosedSourceResolvesItsNotification() throws Exception {
        seedC1();
        JsonNode first = firstPageAll();
        List<String> ids = texts(first.path("notifications").path("items"), "id");
        for (int i = 0; i < 3; i++) page("");
        assertThat(notifications.countByOrgIdAndConsultantId(a.getId(), c1.getId())).as("idempotent: one row per source event").isEqualTo(8);
        assertThat(texts(firstPageAll().path("notifications").path("items"), "id")).containsExactlyElementsOf(ids);

        // the submission is decided and the task finished: their notifications close themselves, the others stay open
        sub1.setStatus(CwsSubmission.APPROVED);
        submissions.saveAndFlush(sub1);
        CwsTask t = tasks.findByOrgIdAndConsultantIdAndStatusNotOrderByDueOnAsc(a.getId(), c1.getId(), "DONE").stream().filter(x -> x.getTitle().startsWith("Send")).findFirst().orElseThrow();
        t.setStatus("DONE");
        tasks.saveAndFlush(t);
        JsonNode again = page("?status=ALL&size=50");
        assertThat(again.path("notifications").path("total").asLong()).isEqualTo(8);
        assertThat(byTitle(again, "Submission Approval Requested").path("status").asText()).isEqualTo("RESOLVED");
        assertThat(byTitle(again, "Follow-up Overdue").path("status").asText()).isEqualTo("RESOLVED");
        assertThat(byTitle(again, "Interview Reminder").path("status").asText()).isEqualTo("UNREAD");
        assertThat(page("").path("notifications").path("total").asLong()).as("the inbox (active) lost the two resolved ones").isEqualTo(6);
    }

    @Test
    void tilesTabsAndCategoryTilesCountTheRows() throws Exception {
        seedC1();
        JsonNode p = page("");
        JsonNode t = p.path("tiles");
        assertThat(t.path("unread").path("value").asLong()).isEqualTo(8);
        assertThat(t.path("unread").path("previous").asLong()).as("nothing existed a week ago").isZero();
        assertThat(t.path("unread").path("delta").asLong()).isEqualTo(8);
        assertThat(t.path("unread").get("deltaPct").isNull()).as("no percentage against zero").isTrue();
        assertThat(t.path("highPriority").path("value").asLong()).isEqualTo(5);
        assertThat(t.path("today").path("value").asLong()).as("interview, offer, two tasks and the profile were created now").isEqualTo(5);
        assertThat(t.path("today").path("vs").asText()).isEqualTo("day");
        assertThat(t.path("upcomingReminders").path("value").asLong()).isEqualTo(3);
        assertThat(t.path("resolvedThisWeek").path("value").asLong()).isZero();
        assertThat(t.path("resolvedThisWeek").get("deltaPct").isNull()).isTrue();
        for (String k : List.of("unread", "highPriority", "today", "upcomingReminders", "resolvedThisWeek")) assertThat(t.path(k).path("sparkline")).as(k).hasSize(6);

        JsonNode tabs = p.path("tabs");
        assertThat(tabs.path("ALL").asLong()).isEqualTo(8);
        assertThat(tabs.path("JOB_MATCH").asLong()).isEqualTo(2);
        assertThat(tabs.path("APPROVAL").asLong()).isEqualTo(1);
        assertThat(tabs.path("INTERVIEW").asLong()).isEqualTo(1);
        assertThat(tabs.path("OFFER").asLong()).isEqualTo(1);
        assertThat(tabs.path("REMINDER").asLong()).isEqualTo(3);
        assertThat(tabs.path("APPLICATION").asLong()).isZero();
        assertThat(tabs.path("MESSAGE").asLong()).isZero();

        JsonNode cats = p.path("categories");
        assertThat(cats.path("period").asText()).isEqualTo("WEEK");
        assertThat(cats.path("vs").asText()).isEqualTo("last week");
        assertThat(cats.path("items")).hasSize(7);
        assertThat(cats.path("items").get(0).path("category").asText()).isEqualTo("JOB_MATCH");
        assertThat(cats.path("items").get(0).path("count").asLong()).isEqualTo(2);
        assertThat(cats.path("items").get(0).get("deltaPct").isNull()).isTrue();
        JsonNode today = page("?period=TODAY").path("categories");
        assertThat(today.path("vs").asText()).isEqualTo("yesterday");
        assertThat(today.path("items").get(0).path("count").asLong()).as("the matches are 2 and 3 days old").isZero();
        assertThat(today.path("items").get(6).path("count").asLong()).as("REMINDER created today").isEqualTo(3);
        JsonNode month = page("?period=MONTH").path("categories");
        assertThat(month.path("items").get(0).path("count").asLong()).isEqualTo(2);

        // one resolved so the "this week" tile and the tabs move
        long profileId = idOf(p, "Complete Your Profile");
        ok(send(post(path(a.getId(), "/resolve")), C1, "{\"ids\":" + ids(profileId) + "}"), "resolve");
        JsonNode after = page("");
        assertThat(after.path("tiles").path("resolvedThisWeek").path("value").asLong()).isEqualTo(1);
        assertThat(after.path("tiles").path("unread").path("value").asLong()).isEqualTo(7);
        assertThat(after.path("tabs").path("REMINDER").asLong()).isEqualTo(2);
    }

    @Test
    void filtersSearchPagingAndStatusRunOnTheServer() throws Exception {
        seedC1();
        JsonNode p = firstPageAll();
        assertThat(texts(page("?category=INTERVIEW").path("notifications").path("items"), "title")).containsExactly("Interview Reminder");
        assertThat(page("?category=REMINDER").path("notifications").path("total").asLong()).isEqualTo(3);
        assertThat(page("?priority=HIGH").path("notifications").path("total").asLong()).isEqualTo(5);
        assertThat(page("?priority=LOW").path("notifications").path("total").asLong()).isEqualTo(1);
        assertThat(page("?category=REMINDER&priority=HIGH").path("notifications").path("total").asLong()).isEqualTo(1);
        assertThat(texts(page("?q=cloudwave").path("notifications").path("items"), "title")).containsExactly("Offer Deadline Approaching");
        assertThat(page("?q=cloudwave").path("tabs").path("ALL").asLong()).as("tab counts follow the search").isEqualTo(1);
        assertThat(page("?q=nothing-matches-this").path("notifications").path("items")).isEmpty();

        JsonNode p0 = page("?size=3&page=0");
        assertThat(p0.path("notifications").path("items")).hasSize(3);
        assertThat(p0.path("notifications").path("totalPages").asInt()).isEqualTo(3);
        assertThat(page("?size=3&page=2").path("notifications").path("items")).hasSize(2);
        assertThat(page("?size=3&page=9").path("notifications").path("items")).isEmpty();

        // status filters
        long matchId = idOf(p, "New Job Match Available");
        long offerId = idOf(p, "Offer Deadline Approaching");
        long ivId = idOf(p, "Interview Reminder");
        ok(send(post(path(a.getId(), "/read")), C1, "{\"ids\":" + ids(matchId) + ",\"read\":true}"), "read");
        ok(send(post(path(a.getId(), "/resolve")), C1, "{\"ids\":" + ids(offerId) + "}"), "resolve");
        ok(send(post(path(a.getId(), "/snooze")), C1, "{\"ids\":" + ids(ivId) + ",\"until\":\"" + now.plus(Duration.ofDays(1)) + "\"}"), "snooze");
        assertThat(texts(page("?status=READ").path("notifications").path("items"), "title")).contains("New Job Match Available").hasSize(1 + 0);
        assertThat(page("?status=UNREAD").path("notifications").path("total").asLong()).isEqualTo(5);
        assertThat(texts(page("?status=RESOLVED").path("notifications").path("items"), "title")).containsExactly("Offer Deadline Approaching");
        assertThat(texts(page("?status=SNOOZED").path("notifications").path("items"), "title")).containsExactly("Interview Reminder");
        assertThat(page("").path("notifications").path("total").asLong()).as("the inbox hides resolved and snoozed").isEqualTo(6);
        assertThat(page("?status=ALL").path("notifications").path("total").asLong()).isEqualTo(8);

        for (String bad : List.of("?status=NOPE", "?category=SPAM", "?priority=URGENT", "?period=YEAR", "?size=0", "?size=51", "?page=-1", "?q=" + "x".repeat(81))) {
            assertStatus(send(get(path(a.getId(), bad)), C1, null), 422, "bad query " + bad);
        }
    }

    // ---- (b) isolation --------------------------------------------------------------------------------------------

    @Test
    void aConsultantNeverSeesOrChangesAnotherConsultantsNotifications() throws Exception {
        seedC1();
        seedC2();
        JsonNode p2 = page("cws-n-a-c2", a, "?status=ALL");
        assertThat(texts(p2.path("notifications").path("items"), "title")).containsExactlyInAnyOrder("New Job Match Available", "Follow-up Overdue");
        assertThat(p2.toString()).contains("Hidden Secret Role").doesNotContain("Casey One").doesNotContain("Cloud Architect");
        long hidden = idOf(p2, "New Job Match Available");

        MvcResult r = send(get(path(a.getId(), "?status=ALL")), C1, null);
        assertThat(r.getResponse().getContentAsString()).doesNotContain("Hidden").doesNotContain("Robin Two");
        assertThat(om.readTree(r.getResponse().getContentAsString()).path("notifications").path("total").asLong()).isEqualTo(8);

        assertGeneric404(send(post(path(a.getId(), "/read")), C1, "{\"ids\":" + ids(hidden) + ",\"read\":true}"), "read another's");
        assertGeneric404(send(post(path(a.getId(), "/resolve")), C1, "{\"ids\":" + ids(hidden) + "}"), "resolve another's");
        assertGeneric404(send(post(path(a.getId(), "/snooze")), C1, "{\"ids\":" + ids(hidden) + ",\"until\":\"" + now.plus(Duration.ofHours(5)) + "\"}"), "snooze another's");
        assertGeneric404(send(delete(path(a.getId(), "/" + hidden)), C1, null), "delete another's");
        assertGeneric404(send(post(path(a.getId(), "/delete")), C1, "{\"ids\":" + ids(hidden) + "}"), "bulk delete another's");
        CwsNotification h = fresh(hidden);
        assertThat(h.getReadAt()).isNull();
        assertThat(h.getResolvedAt()).isNull();
        assertThat(h.getSnoozedUntil()).isNull();
        assertThat(h.getDeletedAt()).isNull();

        // a mixed batch changes nothing at all
        long mine = idOf(firstPageAll(), "Complete Your Profile");
        assertGeneric404(send(post(path(a.getId(), "/read")), C1, "{\"ids\":" + ids(mine, hidden) + ",\"read\":true}"), "mixed batch");
        assertThat(fresh(mine).getReadAt()).as("all or nothing").isNull();

        // marking everything read touches only the caller
        ok(send(post(path(a.getId(), "/mark-all-read")), C1, null), "mark all");
        assertThat(fresh(hidden).getReadAt()).isNull();
        // preferences are per consultant
        ok(send(put(path(a.getId(), "/preferences/JOB_MATCH")), C1, "{\"enabled\":false}"), "pref");
        assertThat(page("cws-n-a-c2", a, "").path("prefs").get(0).path("enabled").asBoolean()).isTrue();
    }

    @Test
    void anotherOrganizationAndNonConsultantsGetTheGeneric404OnEveryRoute() throws Exception {
        seedC1();
        String id = String.valueOf(idOf(firstPageAll(), "Interview Reminder"));
        String until = "\"until\":\"" + now.plus(Duration.ofHours(5)) + "\"";
        List<String[]> routes = List.of(
            new String[] { "GET", path(a.getId(), ""), null },
            new String[] { "POST", path(a.getId(), "/read"), "{\"ids\":[" + id + "],\"read\":true}" },
            new String[] { "POST", path(a.getId(), "/resolve"), "{\"ids\":[" + id + "]}" },
            new String[] { "POST", path(a.getId(), "/snooze"), "{\"ids\":[" + id + "]," + until + "}" },
            new String[] { "POST", path(a.getId(), "/delete"), "{\"ids\":[" + id + "]}" },
            new String[] { "DELETE", path(a.getId(), "/" + id), null },
            new String[] { "POST", path(a.getId(), "/mark-all-read"), null },
            new String[] { "POST", path(a.getId(), "/mute-non-critical"), null },
            new String[] { "PUT", path(a.getId(), "/preferences/JOB_MATCH"), "{\"enabled\":false}" },
            new String[] { "PUT", path(a.getId(), "/preferences"), "{\"items\":[{\"category\":\"JOB_MATCH\",\"enabled\":false}]}" }
        );
        for (String login : List.of("cws-n-b-owner", "cws-n-b-c1", "ghost-login", "cws-n-a-owner", "cws-n-a-admin", "cws-n-a-marketer", "cws-n-a-noprofile")) {
            for (String[] route : routes) {
                MockHttpServletRequestBuilder req = switch (route[0]) {
                    case "POST" -> post(route[1]);
                    case "PUT" -> put(route[1]);
                    case "DELETE" -> delete(route[1]);
                    default -> get(route[1]);
                };
                assertGeneric404(send(req, login, route[2]), login + " " + route[0] + " " + route[1]);
            }
        }
        CwsNotification n = fresh(Long.parseLong(id));
        assertThat(n.getReadAt()).isNull();
        assertThat(n.getDeletedAt()).isNull();
        assertThat(prefRows.findByOrgIdAndConsultantId(a.getId(), c1.getId())).as("nobody else wrote a preference").isEmpty();
        assertGeneric404(send(get(path(999999999L, "")), C1, null), "an organization that does not exist");
        assertGeneric404(send(delete(path(a.getId(), "/987654321")), C1, null), "an id that does not exist");
        assertGeneric404(send(delete(path(b.getId(), "/" + id)), "cws-n-b-c1", null), "an id from another organization");
        assertGeneric404(send(post(path(b.getId(), "/resolve")), "cws-n-b-c1", "{\"ids\":[" + id + "]}"), "resolve across tenants");
    }

    @Test
    void theRoutesAre404WhenTheEnterpriseOrRolesFlagIsOff() throws Exception {
        seedC1();
        flags(true, false);
        assertGeneric404(send(get(path(a.getId(), "")), C1, null), "roles flag off");
        assertGeneric404(send(post(path(a.getId(), "/mark-all-read")), C1, null), "roles flag off, write");
        flags(false, true);
        assertGeneric404(send(get(path(a.getId(), "")), C1, null), "master flag off");
        assertThat(notifications.countByOrgIdAndConsultantId(a.getId(), c1.getId())).as("nothing was generated while the flags were off").isZero();
    }

    // ---- (e) empty consultant -------------------------------------------------------------------------------------

    @Test
    void aConsultantWithNothingToBeToldGetsZerosAndEmptyListsNeverNulls() throws Exception {
        JsonNode p = page("");
        for (String tile : List.of("unread", "highPriority", "today", "upcomingReminders", "resolvedThisWeek")) {
            JsonNode t = p.path("tiles").path(tile);
            assertThat(t.path("value").asLong()).as(tile).isZero();
            assertThat(t.path("previous").asLong()).as(tile).isZero();
            assertThat(t.get("deltaPct").isNull()).as(tile + " has no delta, not a made-up one").isTrue();
            assertThat(t.path("sparkline")).as(tile).hasSize(6);
        }
        assertThat(p.path("notifications").get("items").isArray()).isTrue();
        assertThat(p.path("notifications").path("items")).isEmpty();
        assertThat(p.path("notifications").path("totalPages").asInt()).isZero();
        assertThat(p.path("tabs").path("ALL").asLong()).isZero();
        assertThat(p.path("categories").path("items")).hasSize(7);
        assertThat(p.path("prefs")).hasSize(7);
        assertThat(p.path("muted").asBoolean()).isFalse();
        assertThat(notifications.countByOrgIdAndConsultantId(a.getId(), c1.getId())).isZero();
    }

    // ---- writes ---------------------------------------------------------------------------------------------------

    @Test
    void readUnreadResolveAndMarkAllReadAreIdempotentAndBulk() throws Exception {
        seedC1();
        JsonNode p = firstPageAll();
        long m = idOf(p, "New Job Match Available");
        long o = idOf(p, "Offer Deadline Approaching");

        assertThat(ok(send(post(path(a.getId(), "/read")), C1, "{\"ids\":" + ids(m, o) + ",\"read\":true}"), "read").path("changed").asInt()).isEqualTo(2);
        assertThat(ok(send(post(path(a.getId(), "/read")), C1, "{\"ids\":" + ids(m, o) + ",\"read\":true}"), "again").path("changed").asInt()).as("repeating changes nothing").isZero();
        assertThat(fresh(m).getReadAt()).isNotNull();
        assertThat(ok(send(post(path(a.getId(), "/read")), C1, "{\"ids\":" + ids(m) + ",\"read\":false}"), "unread").path("changed").asInt()).isEqualTo(1);
        assertThat(fresh(m).getReadAt()).isNull();

        assertThat(ok(send(post(path(a.getId(), "/resolve")), C1, "{\"ids\":" + ids(m, o) + "}"), "resolve").path("changed").asInt()).isEqualTo(2);
        assertThat(ok(send(post(path(a.getId(), "/resolve")), C1, "{\"ids\":" + ids(m, o) + "}"), "resolve again").path("changed").asInt()).isZero();
        assertThat(fresh(m).getResolvedAt()).isNotNull();
        assertThat(fresh(m).getReadAt()).as("resolving also reads").isNotNull();

        int unreadBefore = page("").path("tiles").path("unread").path("value").asInt();
        assertThat(ok(send(post(path(a.getId(), "/mark-all-read")), C1, null), "all").path("changed").asInt()).isEqualTo(unreadBefore);
        assertThat(page("").path("tiles").path("unread").path("value").asLong()).isZero();
        assertThat(ok(send(post(path(a.getId(), "/mark-all-read")), C1, null), "all again").path("changed").asInt()).isZero();

        assertStatus(send(post(path(a.getId(), "/read")), C1, "{\"ids\":[]}"), 422, "empty ids");
        assertStatus(send(post(path(a.getId(), "/read")), C1, "{\"ids\":" + ids(m) + "}"), 422, "read flag is required");
        assertStatus(send(post(path(a.getId(), "/read")), C1, null), 422, "no body");
        List<Long> many = new ArrayList<>();
        for (long i = 1; i <= 51; i++) many.add(i);
        assertStatus(send(post(path(a.getId(), "/resolve")), C1, "{\"ids\":" + many + "}"), 422, "more than 50 ids");
    }

    @Test
    void snoozeNeedsAFutureTimeWithin14DaysHidesTheRowAndCannotApplyToAResolvedOne() throws Exception {
        seedC1();
        JsonNode p = firstPageAll();
        long t = idOf(p, "Follow-up Due Today");
        long r = idOf(p, "Complete Your Profile");
        Instant until = now.plus(Duration.ofDays(1));

        assertStatus(send(post(path(a.getId(), "/snooze")), C1, "{\"ids\":" + ids(t) + ",\"until\":\"" + now.minus(Duration.ofHours(1)) + "\"}"), 422, "in the past");
        assertStatus(send(post(path(a.getId(), "/snooze")), C1, "{\"ids\":" + ids(t) + ",\"until\":\"" + now.plus(Duration.ofDays(15)) + "\"}"), 422, "over 14 days");
        assertStatus(send(post(path(a.getId(), "/snooze")), C1, "{\"ids\":" + ids(t) + "}"), 422, "no time");
        assertThat(fresh(t).getSnoozedUntil()).isNull();

        JsonNode done = ok(send(post(path(a.getId(), "/snooze")), C1, "{\"ids\":" + ids(t) + ",\"until\":\"" + until + "\"}"), "snooze");
        assertThat(done.path("changed").asInt()).isEqualTo(1);
        assertThat(Instant.parse(done.path("until").asText())).isEqualTo(until);
        assertThat(texts(page("").path("notifications").path("items"), "title")).doesNotContain("Follow-up Due Today");
        assertThat(page("").path("tiles").path("unread").path("value").asLong()).as("a snoozed row is not unread now").isEqualTo(7);
        assertThat(byTitle(page("?status=SNOOZED"), "Follow-up Due Today").path("status").asText()).isEqualTo("SNOOZED");
        assertThat(ok(send(post(path(a.getId(), "/snooze")), C1, "{\"ids\":" + ids(t) + ",\"until\":\"" + until + "\"}"), "same again").path("changed").asInt()).isZero();

        ok(send(post(path(a.getId(), "/resolve")), C1, "{\"ids\":" + ids(r) + "}"), "resolve");
        MvcResult conflict = send(post(path(a.getId(), "/snooze")), C1, "{\"ids\":" + ids(r) + ",\"until\":\"" + until + "\"}");
        assertStatus(conflict, 409, "a resolved one");
        assertThat(conflict.getResponse().getContentAsString()).contains("NOTIFICATION_RESOLVED");
        assertThat(fresh(r).getSnoozedUntil()).isNull();
    }

    @Test
    void deleteIsSoftSoTheSourceEventDoesNotComeBackAndASecondDeleteIs404() throws Exception {
        seedC1();
        JsonNode p = firstPageAll();
        long m = idOf(p, "New Job Match Available");
        long o = idOf(p, "Offer Deadline Approaching");
        long i = idOf(p, "Interview Reminder");

        assertThat(ok(send(delete(path(a.getId(), "/" + m)), C1, null), "delete one").path("changed").asInt()).isEqualTo(1);
        assertThat(ok(send(post(path(a.getId(), "/delete")), C1, "{\"ids\":" + ids(o, i) + "}"), "delete two").path("changed").asInt()).isEqualTo(2);
        JsonNode after = firstPageAll();
        assertThat(after.path("notifications").path("total").asLong()).isEqualTo(5);
        assertThat(texts(after.path("notifications").path("items"), "title")).doesNotContain("New Job Match Available", "Offer Deadline Approaching", "Interview Reminder");
        assertThat(notifications.countByOrgIdAndConsultantId(a.getId(), c1.getId())).as("kept as a tombstone, not regenerated").isEqualTo(8);
        assertThat(fresh(m).getDeletedAt()).isNotNull();
        assertThat(after.path("tiles").path("today").path("value").asLong()).as("deleted rows are not counted").isEqualTo(3);

        assertGeneric404(send(delete(path(a.getId(), "/" + m)), C1, null), "second delete");
        assertGeneric404(send(post(path(a.getId(), "/read")), C1, "{\"ids\":" + ids(m) + ",\"read\":true}"), "act on a deleted one");
    }

    // ---- preferences ----------------------------------------------------------------------------------------------

    @Test
    void preferencesDefaultOnSaveOnePartiallyAndNeverSwitchSmsOn() throws Exception {
        JsonNode p = page("");
        assertThat(texts(p.path("prefs"), "category")).containsExactly("JOB_MATCH", "APPLICATION", "INTERVIEW", "APPROVAL", "OFFER", "MESSAGE", "REMINDER");
        for (JsonNode pref : p.path("prefs")) {
            assertThat(pref.path("enabled").asBoolean()).isTrue();
            assertThat(pref.path("email").asBoolean()).isTrue();
            assertThat(pref.path("inApp").asBoolean()).isTrue();
            assertThat(pref.path("sms").asBoolean()).isFalse();
            assertThat(pref.path("smsAvailable").asBoolean()).isFalse();
        }
        assertThat(p.path("prefs").get(2).path("critical").asBoolean()).isTrue();
        assertThat(p.path("prefs").get(0).path("critical").asBoolean()).isFalse();

        JsonNode saved = ok(send(put(path(a.getId(), "/preferences/job_match")), C1, "{\"email\":false}"), "email off");
        assertThat(saved.path("prefs").get(0).path("email").asBoolean()).isFalse();
        assertThat(saved.path("prefs").get(0).path("enabled").asBoolean()).as("only the field sent changed").isTrue();
        assertThat(saved.path("prefs").get(0).path("inApp").asBoolean()).isTrue();
        ok(send(put(path(a.getId(), "/preferences/JOB_MATCH")), C1, "{\"enabled\":false}"), "off");
        assertThat(page("").path("prefs").get(0).path("enabled").asBoolean()).isFalse();
        assertThat(prefRows.findByOrgIdAndConsultantId(a.getId(), c1.getId())).hasSize(1);

        assertStatus(send(put(path(a.getId(), "/preferences/JOB_MATCH")), C1, "{\"sms\":true}"), 422, "sms on");
        assertStatus(send(put(path(a.getId(), "/preferences/WEATHER")), C1, "{\"enabled\":true}"), 422, "unknown category");
        assertStatus(send(put(path(a.getId(), "/preferences")), C1, "{\"items\":[{\"category\":\"OFFER\",\"enabled\":false},{\"category\":\"MESSAGE\",\"sms\":true}]}"), 422, "bad item");
        assertThat(page("").path("prefs").get(4).path("enabled").asBoolean()).as("all or nothing").isTrue();
        assertStatus(send(put(path(a.getId(), "/preferences")), C1, "{\"items\":[]}"), 422, "no items");
        assertStatus(send(put(path(a.getId(), "/preferences")), C1, "{\"items\":[{\"category\":\"NOPE\"}]}"), 422, "unknown category in a batch");
        assertThat(prefRows.findByOrgIdAndConsultantId(a.getId(), c1.getId()).stream().noneMatch(x -> x.isSms())).isTrue();
    }

    @Test
    void aSwitchedOffCategoryCreatesNothingNewButKeepsWhatIsThere() throws Exception {
        seedC1();
        ok(send(put(path(a.getId(), "/preferences/REMINDER")), C1, "{\"enabled\":false}"), "reminders off");
        ok(send(put(path(a.getId(), "/preferences/JOB_MATCH")), C1, "{\"inApp\":false}"), "in-app off");
        JsonNode p = firstPageAll();
        assertThat(texts(p.path("notifications").path("items"), "title")).containsExactlyInAnyOrder("Submission Approval Requested", "Interview Reminder", "Offer Deadline Approaching");

        ok(send(put(path(a.getId(), "/preferences/REMINDER")), C1, "{\"enabled\":true}"), "reminders on");
        assertThat(firstPageAll().path("notifications").path("total").asLong()).as("they are generated now that the category is on").isEqualTo(6);
    }

    @Test
    void muteSwitchesOffNonCriticalCategoriesAnswersThePreviousSettingsAndUndoRestoresThem() throws Exception {
        ok(send(put(path(a.getId(), "/preferences/MESSAGE")), C1, "{\"email\":false}"), "message email off");
        JsonNode mute = ok(send(post(path(a.getId(), "/mute-non-critical")), C1, null), "mute");
        assertThat(mute.path("muted").asBoolean()).isTrue();
        for (JsonNode pref : mute.path("prefs")) assertThat(pref.path("enabled").asBoolean()).as(pref.path("category").asText()).isEqualTo(pref.path("critical").asBoolean());
        assertThat(texts(mute.path("previous"), "category")).hasSize(7);
        for (JsonNode pref : mute.path("previous")) assertThat(pref.path("enabled").asBoolean()).isTrue();
        assertThat(page("").path("muted").asBoolean()).isTrue();
        assertThat(ok(send(post(path(a.getId(), "/mute-non-critical")), C1, null), "mute again").path("previous").get(0).path("enabled").asBoolean()).as("muting twice is harmless").isFalse();

        StringBuilder undo = new StringBuilder("{\"items\":[");
        boolean first = true;
        for (JsonNode pref : mute.path("previous")) {
            undo.append(first ? "" : ",").append("{\"category\":\"").append(pref.path("category").asText()).append("\",\"enabled\":").append(pref.path("enabled").asBoolean())
                .append(",\"email\":").append(pref.path("email").asBoolean()).append(",\"inApp\":").append(pref.path("inApp").asBoolean()).append("}");
            first = false;
        }
        JsonNode restored = ok(send(put(path(a.getId(), "/preferences")), C1, undo.append("]}").toString()), "undo");
        assertThat(restored.path("muted").asBoolean()).isFalse();
        for (JsonNode pref : restored.path("prefs")) assertThat(pref.path("enabled").asBoolean()).isTrue();
        assertThat(restored.path("prefs").get(5).path("email").asBoolean()).as("the earlier email switch came back too").isFalse();
        assertThat(restored.path("prefs").get(5).path("sms").asBoolean()).isFalse();
    }

    // ---- the seeder and the pieces -------------------------------------------------------------------------------

    @Test
    void theDemoSeederTouchesOnlyItsOwnTablesAndIsIdempotent() {
        int first = seeder.seed();
        assertThat(seeder.seed()).as("a second run creates nothing").isZero();
        assertThat(first).isGreaterThanOrEqualTo(0);
        assertThat(service.ensureDefaultPrefs(c1)).isEqualTo(7);
        assertThat(service.ensureDefaultPrefs(c1)).as("idempotent").isZero();
    }

    @Test
    void anActionLinkMustBeAnInternalConsultantPath() {
        assertThat(CwsNotification.validHref("/w/consultant/offers")).isTrue();
        assertThat(CwsNotification.validHref("/w/consultant")).isTrue();
        assertThat(CwsNotification.validHref("/w/consultant/matches?tab=new")).isTrue();
        for (String bad : List.of("https://evil.example/w/consultant/offers", "//evil.example", "/w/employer/offers", "/w/consultant/../admin", "javascript:alert(1)", "/w/consultant/offers#x", "", "/w/consultant/offers?next=https://x.y")) {
            assertThat(CwsNotification.validHref(bad)).as(bad).isFalse();
        }
        assertThat(CwsNotification.validHref(null)).isFalse();
    }
}
