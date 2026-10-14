package com.dossier.api.web.rest.ent.consultantws;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import com.dossier.api.IntegrationTest;
import com.dossier.api.ProSubscriptions;
import com.dossier.api.TestInboxKey;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.Application;
import com.dossier.api.domain.InboxConnection;
import com.dossier.api.domain.InboxMessage;
import com.dossier.api.domain.User;
import com.dossier.api.domain.ent.OrgMemberRole;
import com.dossier.api.domain.ent.billing.ConsultantLicense;
import com.dossier.api.domain.ent.billing.LicenseFeature;
import com.dossier.api.domain.ent.billing.Product;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.OrgAuditEvent;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.InboxConnectionRepository;
import com.dossier.api.repository.InboxMessageRepository;
import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.catalog.ProductRepository;
import com.dossier.api.repository.ent.OrgMemberRoleRepository;
import com.dossier.api.repository.ent.OrgRoleRepository;
import com.dossier.api.repository.ent.billing.ConsultantLicenseRepository;
import com.dossier.api.repository.ent.billing.LicenseFeatureRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ent.LegacyRoleMirror;
import com.dossier.api.service.ent.OrgRoleService;
import com.dossier.api.service.ent.RoleTemplates;
import com.dossier.api.service.ent.members.ConsultantInboxOffboardingHook;
import com.dossier.api.service.ent.members.OffboardingHook;
import com.dossier.api.service.inbox.ImapGateway;
import com.dossier.api.service.inbox.InboxEntitlement;
import com.dossier.api.service.inbox.InboxPoller;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import com.dossier.api.web.rest.org.OrgFixtures;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.mvc.method.RequestMappingInfo;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

/**
 * The consultant's own Gmail inbox inside the organization workspace (ent-inbox), through the real chain: the license decides who may connect, the
 * consultant is the only caller who reaches any inbox route, and NOTHING the organization can call (a sweep of every readable organization route, the
 * audit trail) carries the Gmail address, a subject, a sender or a body. Gmail itself is a mock gateway; the key is generated per run.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class ConsultantInboxResourceIT {

    private static final String WHO = "cws-inbox-it";
    private static final String ADDRESS = "anika.jobs.it@gmail.com";
    private static final String CODE = "abcdefghijklmnop";
    private static final String SECRET_SUBJECT = "ZZSECRETSUBJECT Interview invitation: Platform Engineer at Orbit Freight";
    private static final String SECRET_BODY = "ZZSECRETBODY we would like to schedule an interview with you";
    private static final String SECRET_SENDER = "zzsecretsender@orbitfreight.example";
    private static final String CONNECT = "{\"address\":\"" + ADDRESS + "\",\"appPassword\":\"" + CODE + "\"}";

    @DynamicPropertySource
    static void key(DynamicPropertyRegistry r) {
        r.add("dossier.inbox.key", () -> TestInboxKey.VALUE);
    }

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper om;
    @Autowired private EntityManager em;
    @Autowired private UserRepository users;
    @Autowired private OrganizationRepository orgs;
    @Autowired private OrgMemberRepository members;
    @Autowired private OrgRoleRepository roleRows;
    @Autowired private OrgMemberRoleRepository memberRoles;
    @Autowired private OrgRoleService roleService;
    @Autowired private AppSettingRepository settingRows;
    @Autowired private ResumeBuilderSettings cache;
    @Autowired private ConsultantProfileRepository profiles;
    @Autowired private ProductRepository products;
    @Autowired private com.dossier.api.repository.catalog.FeatureDefinitionRepository featureDefs;
    @Autowired private ConsultantLicenseRepository licenses;
    @Autowired private LicenseFeatureRepository features;
    @Autowired private InboxConnectionRepository connections;
    @Autowired private InboxMessageRepository messages;
    @Autowired private ApplicationRepository applications;
    @Autowired private SubscriptionRepository subscriptions;
    @Autowired private InboxPoller poller;
    @Autowired private ConsultantInboxOffboardingHook offboarding;
    @Autowired @org.springframework.beans.factory.annotation.Qualifier("requestMappingHandlerMapping") private RequestMappingHandlerMapping handlerMapping;

    @MockitoBean private ImapGateway imap;

    private OrgFixtures fx;
    private Organization a;
    private Organization b;
    private final Instant now = Instant.now();
    private LicenseFeature inboxFeature;
    private Long c1Seat;
    private Long c3Seat;

    @BeforeEach
    void seed() {
        fx = new OrgFixtures(users, orgs, members);
        String n = String.valueOf(System.nanoTime());
        a = fx.org("cws-ib-a-" + n, OrgStatus.ACTIVE);
        b = fx.org("cws-ib-b-" + n, OrgStatus.ACTIVE);
        flags();
        staff(a, "cws-ib-a-owner", OrgRole.OWNER);
        staff(a, "cws-ib-a-admin", OrgRole.ADMIN);
        staff(a, "cws-ib-a-emily", OrgRole.MARKETER);
        staff(b, "cws-ib-b-owner", OrgRole.OWNER);

        // c1: licensed WITH inbox.monitoring; c2: licensed without it; c3: no license at all; the b consultant has its own license with it
        ConsultantProfile c1 = consultant(a, "cws-ib-a-c1", "Casey One");
        c1Seat = c1.getMemberId();
        licenseFor(a, c1, true);
        licenseFor(a, consultant(a, "cws-ib-a-c2", "Robin Two"), false);
        c3Seat = consultant(a, "cws-ib-a-c3", "Sam Unlicensed").getMemberId();
        licenseFor(b, consultant(b, "cws-ib-b-c1", "Bee Consultant"), true);

        when(imap.probe(anyString(), anyString())).thenReturn(new ImapGateway.Probe(ImapGateway.Outcome.OK, "[Gmail]/Sent Mail"));
    }

    @AfterEach
    void clean() {
        for (AppSetting s : settingRows.findAll()) if (WHO.equals(s.getUpdatedBy())) settingRows.delete(s);
        cache.invalidate();
    }

    private void flags() {
        settingRows.save(new AppSetting(EnterpriseSettingKeys.FLAG_ENTERPRISE, "{\"on\":true}", WHO, Instant.now()));
        settingRows.save(new AppSetting(EnterpriseSettingKeys.FLAG_ROLES, "{\"on\":true}", WHO, Instant.now()));
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

    private ConsultantProfile consultant(Organization org, String login, String name) {
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
        ConsultantProfile p = new ConsultantProfile();
        p.setOrgId(org.getId());
        p.setMemberId(m.getId());
        p.setDisplayName(name);
        p.setEmail(login + "@example.org");
        p.setJobTitle("Senior Engineer");
        return profiles.saveAndFlush(p);
    }

    private void licenseFor(Organization org, ConsultantProfile c, boolean withInbox) {
        String code = "IB-" + System.nanoTime() + "-" + c.getId();
        Product base = new Product();
        base.setCode(code);
        base.setName("Base " + code);
        base.setKind("BASE_LICENSE");
        base.setActive(true);
        base.setSortOrder(1);
        base.setDemoData(true);
        base.setCreatedAt(now);
        base = products.save(base);
        ConsultantLicense l = new ConsultantLicense();
        l.setOrgId(org.getId());
        l.setConsultantId(c.getId());
        l.setStatus("ACTIVE");
        l.setBaseProductId(base.getId());
        l.setBaseAmountMinor(100L);
        l.setStartsAt(now.minus(Duration.ofDays(30)));
        l = licenses.saveAndFlush(l);
        if (!withInbox) return;
        if (featureDefs.findByFeatureKey(InboxEntitlement.FEATURE).isEmpty()) { // the add-on's catalog row (products point at it)
            com.dossier.api.domain.ent.billing.FeatureDefinition d = new com.dossier.api.domain.ent.billing.FeatureDefinition();
            d.setFeatureKey(InboxEntitlement.FEATURE);
            d.setName("Inbox monitoring");
            d.setUsageType("INTEGRATION");
            d.setUsageUnit("connections");
            d.setDefaultAllowance(1L);
            d.setAllowancePeriod("MONTH");
            d.setActive(true);
            d.setSortOrder(60);
            d.setDemoData(true);
            d.setCreatedAt(now);
            featureDefs.save(d);
        }
        Product addon = new Product();
        addon.setCode(code + "-FEAT");
        addon.setName("Inbox " + code);
        addon.setKind("FEATURE");
        addon.setFeatureKey(InboxEntitlement.FEATURE);
        addon.setActive(true);
        addon.setSortOrder(2);
        addon.setDemoData(true);
        addon.setCreatedAt(now);
        addon = products.save(addon);
        LicenseFeature f = new LicenseFeature();
        f.setOrgId(org.getId());
        f.setLicenseId(l.getId());
        f.setFeatureKey(InboxEntitlement.FEATURE);
        f.setProductId(addon.getId());
        f.setUnitAmountMinor(100L);
        f.setQuantity(1);
        f.setStartsAt(now.minus(Duration.ofDays(30)));
        f.setLive(true);
        f = features.saveAndFlush(f);
        if (org.getId().equals(a.getId()) && c.getDisplayName().startsWith("Casey")) inboxFeature = f;
    }

    // ---- calls ----------------------------------------------------------------------------------------------------

    private String base(Organization org) {
        return "/api/orgs/" + org.getId() + "/me-workspace/inbox";
    }

    private MvcResult call(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder req, String login) throws Exception {
        return mockMvc.perform(req.with(user(login)).contentType(MediaType.APPLICATION_JSON)).andReturn();
    }

    private JsonNode json(MvcResult r, int status) throws Exception {
        assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(status);
        String body = r.getResponse().getContentAsString();
        return body.isBlank() ? null : om.readTree(body);
    }

    private void assertGeneric404(MvcResult r, String what) throws Exception {
        String body = r.getResponse().getContentAsString();
        assertThat(r.getResponse().getStatus()).as(what + " -> " + body).isEqualTo(404);
        assertThat(body.toLowerCase()).as(what).contains("\"code\":\"not_found\"").doesNotContain("forbidden").doesNotContain("permission").doesNotContain("not a member");
    }

    private Long userId(String login) {
        return users.findOneByLogin(login).orElseThrow().getId();
    }

    private InboxMessage mail(Long userId, String suggestion, Long applicationId, String statusChange) {
        InboxMessage m = new InboxMessage();
        m.setUserId(userId);
        m.setFolder("INBOX");
        m.setDirection(InboxMessage.IN);
        m.setUid(System.nanoTime() % 1_000_000);
        m.setDedupKey("it-" + System.nanoTime());
        m.setMessageId("<" + System.nanoTime() + "@it.example>");
        m.setFromAddress(SECRET_SENDER);
        m.setFromName("ZZSECRETNAME Careers");
        m.setSubject(SECRET_SUBJECT);
        m.setSentAt(now.minus(Duration.ofHours(2)));
        m.setJobMail(true);
        m.setBodyText(SECRET_BODY);
        m.setCategory("INTERVIEW");
        m.setClassifiedBy("RULE");
        m.setCompanyGuess("Orbit Freight");
        m.setRoleGuess("Platform Engineer");
        m.setSuggestion(suggestion);
        m.setApplicationId(applicationId);
        m.setStatusChange(statusChange);
        m.setParsedAt(now);
        return messages.saveAndFlush(m);
    }

    private Application application(String login, String company, ApplicationStatus status) {
        User u = users.findOneByLogin(login).orElseThrow();
        Application x = new Application();
        x.setUser(u);
        x.setCompany(company);
        x.setRoleTitle("Platform Engineer");
        x.setStatus(status);
        x.setStarred(false);
        x.setArchived(false);
        x.setCreatedAt(now);
        x.setUpdatedAt(now);
        return applications.saveAndFlush(x);
    }

    // ---- the license decides ------------------------------------------------------------------------------------------

    @Test
    void aConsultantWhoseLicenseGrantsItConnectsAndTheAppPasswordNeverComesBack() throws Exception {
        JsonNode page = json(call(get(base(a)), "cws-ib-a-c1"), 200);
        assertThat(page.path("inbox").path("entitled").asBoolean()).isTrue();
        assertThat(page.path("inbox").path("connected").asBoolean()).isFalse();

        MvcResult r = call(post(base(a)).content(CONNECT), "cws-ib-a-c1");
        JsonNode view = json(r, 200);
        assertThat(view.path("connected").asBoolean()).isTrue();
        assertThat(view.path("address").asText()).isEqualTo(ADDRESS);
        assertThat(view.path("status").asText()).isEqualTo("CONNECTED");
        assertThat(r.getResponse().getContentAsString()).doesNotContain(CODE).doesNotContain("abcd").doesNotContain("passwordEnc").doesNotContain("v1:");

        InboxConnection c = connections.findById(userId("cws-ib-a-c1")).orElseThrow();
        assertThat(c.getPasswordEnc()).startsWith("v1:").doesNotContain(CODE);
        assertThat(c.getConnectedViaOrgId()).as("the organization whose license made it possible, from the path the host vouched for").isEqualTo(a.getId());

        // the whole page afterwards, and disconnect forgets everything
        assertThat(call(get(base(a)), "cws-ib-a-c1").getResponse().getContentAsString()).doesNotContain(CODE).doesNotContain("v1:");
        json(call(delete(base(a)), "cws-ib-a-c1"), 200);
        assertThat(connections.findById(userId("cws-ib-a-c1"))).isEmpty();
    }

    @Test
    void aConsultantWhoseLicenseLacksItGetsAnHonest402AndGmailIsNeverAsked() throws Exception {
        for (String login : List.of("cws-ib-a-c2", "cws-ib-a-c3")) {
            JsonNode page = json(call(get(base(a)), login), 200);
            assertThat(page.path("inbox").path("entitled").asBoolean()).as(login).isFalse();
            MvcResult r = call(post(base(a)).content(CONNECT), login);
            JsonNode body = json(r, 402);
            assertThat(body.path("code").asText()).isEqualTo("FEATURE_NOT_LICENSED");
            assertThat(connections.findById(userId(login))).isEmpty();
        }
        org.mockito.Mockito.verify(imap, org.mockito.Mockito.never()).probe(anyString(), anyString());
    }

    @Test
    void theLicenseOfAnotherOrganizationGrantsNothingHere() throws Exception {
        // the b consultant is licensed in b, but is not a member of a: a's route is the generic 404 for them
        assertGeneric404(call(get(base(a)), "cws-ib-b-c1"), "b consultant on a's route");
        assertGeneric404(call(post(base(a)).content(CONNECT), "cws-ib-b-c1"), "b consultant connecting through a");
        JsonNode own = json(call(get(base(b)), "cws-ib-b-c1"), 200);
        assertThat(own.path("inbox").path("entitled").asBoolean()).isTrue();
    }

    @Test
    void thePersonalPlanKeepsWorkingExactlyAsBefore() throws Exception {
        // c3 has no license, but is Pro on their own account: the personal route connects, and no organization marker is recorded
        ProSubscriptions.makePro(subscriptions, users, "cws-ib-a-c3");
        mockMvc.perform(post("/api/profile/inbox").with(user("cws-ib-a-c3")).contentType(MediaType.APPLICATION_JSON).content(CONNECT)).andReturn();
        InboxConnection c = connections.findById(userId("cws-ib-a-c3")).orElseThrow();
        assertThat(c.getConnectedViaOrgId()).isNull();
        // and from the workspace the page shows it as entitled through the personal plan
        JsonNode page = json(call(get(base(a)), "cws-ib-a-c3"), 200);
        assertThat(page.path("inbox").path("connected").asBoolean()).isTrue();
        assertThat(page.path("inbox").path("entitled").asBoolean()).isTrue();
    }

    // ---- stopping ------------------------------------------------------------------------------------------------------

    @Test
    void whenTheAddOnIsRemovedTheConnectionStopsAndTheConsultantIsToldWhy() throws Exception {
        json(call(post(base(a)).content(CONNECT), "cws-ib-a-c1"), 200);
        Long uid = userId("cws-ib-a-c1");
        mail(uid, "NEW", null, null);

        inboxFeature.setLive(false);
        features.saveAndFlush(inboxFeature);

        JsonNode page = json(call(get(base(a)), "cws-ib-a-c1"), 200);
        assertThat(page.path("inbox").path("status").asText()).isEqualTo("NO_ENTITLEMENT");
        assertThat(page.path("inbox").path("stoppedNote").asText()).isEqualTo("Your organization no longer includes inbox tracking.");
        assertThat(page.path("inbox").path("entitled").asBoolean()).isFalse();
        assertThat(page.path("suggestions")).as("a stopped inbox shows no new suggestions").isEmpty();

        InboxConnection c = connections.findById(uid).orElseThrow();
        assertThat(poller.reconcile(c)).as("the poller must not read it").isFalse();
        assertThat(connections.findById(uid).orElseThrow().getStatus()).isEqualTo(InboxConnection.NO_ENTITLEMENT);

        // switched back on: it resumes by itself
        inboxFeature.setLive(true);
        features.saveAndFlush(inboxFeature);
        assertThat(poller.reconcile(connections.findById(uid).orElseThrow())).isTrue();
        assertThat(connections.findById(uid).orElseThrow().getStatus()).isEqualTo(InboxConnection.CONNECTED);
    }

    @Test
    void offboardingPurgesAConnectionMadeThroughTheOrganizationAndNeverAPersonalOne() throws Exception {
        json(call(post(base(a)).content(CONNECT), "cws-ib-a-c1"), 200);
        Long uid = userId("cws-ib-a-c1");
        mail(uid, "NEW", null, null);
        assertThat(messages.countByUserId(uid)).isEqualTo(1);

        ProSubscriptions.makePro(subscriptions, users, "cws-ib-a-c3");
        mockMvc.perform(post("/api/profile/inbox").with(user("cws-ib-a-c3")).contentType(MediaType.APPLICATION_JSON).content(CONNECT)).andReturn();
        Long personalUid = userId("cws-ib-a-c3");
        mail(personalUid, "NEW", null, null);

        offboarding.apply(new OffboardingHook.Context(a.getId(), c1Seat, "cws-ib-a-c1", "left", "cws-ib-a-owner", List.of()));
        offboarding.apply(new OffboardingHook.Context(a.getId(), c3Seat, "cws-ib-a-c3", "left", "cws-ib-a-owner", List.of()));
        em.flush();
        em.clear();

        assertThat(connections.findById(uid)).as("made through the organization: purged").isEmpty();
        assertThat(messages.countByUserId(uid)).isZero();
        assertThat(connections.findById(personalUid)).as("made on their own plan: theirs, never touched").isPresent();
        assertThat(messages.countByUserId(personalUid)).isEqualTo(1);
        assertThat(offboarding.preview(a.getId(), c1Seat)).as("the organization is told nothing about a mailbox").isEmpty();
    }

    // ---- credentials -----------------------------------------------------------------------------------------------------

    @Test
    void aRejectedPasswordStoresNothingAndTooManyTriesAreStopped() throws Exception {
        when(imap.probe(anyString(), anyString())).thenReturn(new ImapGateway.Probe(ImapGateway.Outcome.BAD_CREDENTIALS, null));
        for (int i = 0; i < 5; i++) {
            JsonNode body = json(call(post(base(a)).content(CONNECT), "cws-ib-a-c1"), 422);
            assertThat(body.path("code").asText()).isEqualTo("BAD_CREDENTIALS");
        }
        assertThat(connections.findById(userId("cws-ib-a-c1"))).isEmpty();
        JsonNode sixth = json(call(post(base(a)).content(CONNECT), "cws-ib-a-c1"), 429);
        assertThat(sixth.path("code").asText()).isEqualTo("TOO_MANY_ATTEMPTS");
    }

    @Test
    void anAddressThatIsNotGmailOrAPasswordThatIsNotSixteenLettersIsRefusedBeforeGoogle() throws Exception {
        assertThat(json(call(post(base(a)).content("{\"address\":\"me@company.com\",\"appPassword\":\"" + CODE + "\"}"), "cws-ib-a-c1"), 400).path("code").asText()).isEqualTo("NOT_GMAIL");
        assertThat(json(call(post(base(a)).content("{\"address\":\"" + ADDRESS + "\",\"appPassword\":\"MyRealGooglePassword1\"}"), "cws-ib-a-c1"), 400).path("code").asText()).isEqualTo("APP_PASSWORD_FORMAT");
        org.mockito.Mockito.verify(imap, org.mockito.Mockito.never()).probe(anyString(), anyString());
    }

    // ---- what the consultant sees ----------------------------------------------------------------------------------------------

    @Test
    void suggestionsAcceptDismissAndTheUpdatesListAreTheConsultantsOwn() throws Exception {
        json(call(post(base(a)).content(CONNECT), "cws-ib-a-c1"), 200);
        Long uid = userId("cws-ib-a-c1");
        InboxMessage suggested = mail(uid, "NEW", null, null);
        Application moved = application("cws-ib-a-c1", "Cedar Analytics", ApplicationStatus.INTERVIEW);
        mail(uid, "NONE", moved.getId(), "INTERVIEW");

        JsonNode page = json(call(get(base(a)), "cws-ib-a-c1"), 200);
        assertThat(page.path("suggestions")).hasSize(1);
        assertThat(page.path("suggestions").get(0).path("company").asText()).isEqualTo("Orbit Freight");
        assertThat(page.path("suggestions").get(0).path("stage").asText()).isEqualTo("INTERVIEW");
        assertThat(page.path("updates")).hasSize(1);
        JsonNode update = page.path("updates").get(0);
        assertThat(update.path("company").asText()).isEqualTo("Cedar Analytics");
        assertThat(update.path("stageLabel").asText()).isEqualTo("Interview");
        assertThat(update.path("source").asText()).isEqualTo("INBOX");

        // a second consultant sees none of it
        JsonNode other = json(call(get(base(a)), "cws-ib-a-c2"), 200);
        assertThat(other.path("suggestions")).isEmpty();
        assertThat(other.path("updates")).isEmpty();
        assertGeneric404(call(post(base(a) + "/suggestions/" + suggested.getId() + "/accept").content("{}"), "cws-ib-a-owner"), "the owner accepting a consultant's suggestion");

        // accept lands the job on the board at the stage the mail showed; the suggestion is then handled
        JsonNode accepted = json(call(post(base(a) + "/suggestions/" + suggested.getId() + "/accept").content("{}"), "cws-ib-a-c1"), 200);
        Application created = applications.findById(accepted.path("applicationId").asLong()).orElseThrow();
        assertThat(created.getStatus()).isEqualTo(ApplicationStatus.INTERVIEW);
        assertThat(created.getSource()).isEqualTo("inbox");
        assertThat(created.getUser().getId()).isEqualTo(uid);
        json(call(post(base(a) + "/suggestions/" + suggested.getId() + "/accept").content("{}"), "cws-ib-a-c1"), 409);

        // dismiss
        InboxMessage second = mail(uid, "NEW", null, null);
        second.setCompanyGuess("Harbor Cloud");
        messages.saveAndFlush(second);
        json(call(post(base(a) + "/suggestions/" + second.getId() + "/dismiss"), "cws-ib-a-c1"), 200);
        assertThat(json(call(get(base(a) + "/suggestions"), "cws-ib-a-c1"), 200)).isEmpty();
    }

    @Test
    void notifyNeedsAConnectionAndTheSwitchSticks() throws Exception {
        json(call(put(base(a) + "/notify").content("{\"email\":false}"), "cws-ib-a-c1"), 409);
        json(call(post(base(a)).content(CONNECT), "cws-ib-a-c1"), 200);
        assertThat(json(call(put(base(a) + "/notify").content("{\"email\":false}"), "cws-ib-a-c1"), 200).path("notifyEmail").asBoolean()).isFalse();
    }

    // ---- THE PRIVACY WALL ---------------------------------------------------------------------------------------------------

    private List<String> hostileCallers() {
        return List.of("cws-ib-a-owner", "cws-ib-a-admin", "cws-ib-a-emily", "cws-ib-b-owner", "cws-ib-b-c1", "platform-root", "nobody-at-all");
    }

    private RequestPostProcessor caller(String login) {
        if (login.equals("platform-root")) return user(login).authorities(new SimpleGrantedAuthority("ROLE_ADMIN"), new SimpleGrantedAuthority("ROLE_USER"));
        return user(login);
    }

    @Test
    void noOneButTheConsultantReachesAnInboxRoute() throws Exception {
        json(call(post(base(a)).content(CONNECT), "cws-ib-a-c1"), 200);
        InboxMessage m = mail(userId("cws-ib-a-c1"), "NEW", null, null);
        for (String who : hostileCallers()) {
            RequestPostProcessor p = caller(who);
            String where = who + " -> ";
            assertGeneric404(mockMvc.perform(get(base(a)).with(p)).andReturn(), where + "page");
            assertGeneric404(mockMvc.perform(get(base(a) + "/suggestions").with(p)).andReturn(), where + "suggestions");
            assertGeneric404(mockMvc.perform(get(base(a) + "/updates").with(p)).andReturn(), where + "updates");
            assertGeneric404(mockMvc.perform(post(base(a)).with(p).contentType(MediaType.APPLICATION_JSON).content(CONNECT)).andReturn(), where + "connect");
            assertGeneric404(mockMvc.perform(delete(base(a)).with(p)).andReturn(), where + "disconnect");
            assertGeneric404(mockMvc.perform(put(base(a) + "/notify").with(p).contentType(MediaType.APPLICATION_JSON).content("{\"email\":false}")).andReturn(), where + "notify");
            assertGeneric404(mockMvc.perform(post(base(a) + "/suggestions/" + m.getId() + "/accept").with(p).contentType(MediaType.APPLICATION_JSON).content("{}")).andReturn(), where + "accept");
            assertGeneric404(mockMvc.perform(post(base(a) + "/suggestions/" + m.getId() + "/dismiss").with(p)).andReturn(), where + "dismiss");
        }
        em.flush();
        em.clear();
        assertThat(connections.findById(userId("cws-ib-a-c1"))).as("none of the attacks disconnected or changed it").isPresent();
        assertThat(messages.findOneByIdAndUserId(m.getId(), userId("cws-ib-a-c1")).orElseThrow().getSuggestion()).isEqualTo("NEW");
    }

    @Test
    @org.junit.jupiter.api.Timeout(300) // it fetches every readable organization route three times
    void nothingAnOrganizationCanReadCarriesTheAddressASubjectASenderOrABody() throws Exception {
        json(call(post(base(a)).content(CONNECT), "cws-ib-a-c1"), 200);
        Long uid = userId("cws-ib-a-c1");
        Application app = application("cws-ib-a-c1", "Orbit Freight", ApplicationStatus.INTERVIEW);
        mail(uid, "NEW", null, null);
        mail(uid, "NONE", app.getId(), "INTERVIEW");
        em.flush();
        em.clear();

        List<String> markers = List.of(ADDRESS, "ZZSECRET", SECRET_SENDER, CODE);
        int swept = 0;
        List<String> paths = new ArrayList<>();
        for (var e : handlerMapping.getHandlerMethods().entrySet()) {
            RequestMappingInfo info = e.getKey();
            HandlerMethod hm = e.getValue();
            if (info.getPathPatternsCondition() == null || !info.getMethodsCondition().getMethods().contains(org.springframework.web.bind.annotation.RequestMethod.GET)) continue;
            for (var pattern : info.getPathPatternsCondition().getPatterns()) {
                String p = pattern.getPatternString();
                if (!p.startsWith("/api/orgs/{orgId}") || p.contains("/me-workspace/")) continue; // the consultant's own routes are covered above
                if (p.replace("{orgId}", "").contains("{")) continue; // routes that need another id are covered by the isolation sweep
                paths.add(p.replace("{orgId}", String.valueOf(a.getId())));
            }
        }
        for (String path : paths) {
            for (String who : List.of("cws-ib-a-owner", "cws-ib-a-admin", "cws-ib-a-emily")) {
                MvcResult r = mockMvc.perform(get(path).with(user(who)).contentType(MediaType.APPLICATION_JSON)).andReturn();
                String body = r.getResponse().getContentAsString();
                for (String marker : markers) assertThat(body).as(who + " GET " + path).doesNotContain(marker);
                swept++;
            }
        }
        assertThat(swept).as("the sweep really visited the organization's readable routes").isGreaterThan(30);

        // the audit trail of the organization never carries any of it either
        List<OrgAuditEvent> rows = em.createQuery("select e from OrgAuditEvent e where e.orgId = :o", OrgAuditEvent.class).setParameter("o", a.getId()).getResultList();
        for (OrgAuditEvent e : rows) {
            String all = e.getAction() + "|" + e.getTargetType() + "|" + e.getTargetLogin() + "|" + e.getTargetId() + "|" + e.getDetails() + "|" + e.getActorLogin();
            for (String marker : markers) assertThat(all).as("audit row " + e.getAction()).doesNotContain(marker);
        }
    }

    @Test
    void connectingAndDisconnectingWritesNoOrganizationAuditRow() throws Exception {
        long before = ((Number) em.createQuery("select count(e) from OrgAuditEvent e where e.orgId = :o").setParameter("o", a.getId()).getSingleResult()).longValue();
        json(call(post(base(a)).content(CONNECT), "cws-ib-a-c1"), 200);
        json(call(delete(base(a)), "cws-ib-a-c1"), 200);
        long after = ((Number) em.createQuery("select count(e) from OrgAuditEvent e where e.orgId = :o").setParameter("o", a.getId()).getSingleResult()).longValue();
        assertThat(after).as("the organization is not told that, or when, a consultant connects a mailbox").isEqualTo(before);
    }
}
