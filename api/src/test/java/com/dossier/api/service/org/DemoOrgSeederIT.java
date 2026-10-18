package com.dossier.api.service.org;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.Application;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.enumeration.OrgType;
import com.dossier.api.domain.enumeration.ShareScope;
import com.dossier.api.domain.org.OrgGroup;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.org.DataShareEventRepository;
import com.dossier.api.repository.org.DataShareRepository;
import com.dossier.api.repository.org.OrgAuditEventRepository;
import com.dossier.api.repository.org.OrgGroupRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.DemoAccountService;
import com.dossier.api.service.ResumeBuilderSettingKeys;
import com.dossier.api.service.ResumeBuilderSettings;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * O1.8 against MySQL with the demo switched on: {@code demo-bootcamp} and Priya Sharma are seeded through the real
 * services, a second run changes nothing, the org is reachable through the real org API (and only by its own people),
 * and the table matches {@code web/scripts/fixtures/demo-org.json}, which the mock API serves for {@code npm run dev:demo}.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
@TestPropertySource(properties = { "dossier.demo.enabled=true", "dossier.demo.create-accounts=false" })
@org.junit.jupiter.api.Timeout(90) // the first seed writes ~150 rows; the suite-wide 15 s default is too tight on a loaded CI box
class DemoOrgSeederIT {

    @Autowired private DemoAccountService demo;
    @Autowired private DemoOrgSeeder seeder;
    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper om;
    @Autowired private UserRepository users;
    @Autowired private OrganizationRepository orgs;
    @Autowired private OrgMemberRepository members;
    @Autowired private OrgGroupRepository groups;
    @Autowired private ApplicationRepository applications;
    @Autowired private DataShareRepository shares;
    @Autowired private DataShareEventRepository shareEvents;
    @Autowired private OrgAuditEventRepository audit;
    @Autowired private DataShareService dataShare;
    @Autowired private AppSettingRepository appSettings;
    @Autowired private ResumeBuilderSettings settings;

    @BeforeEach
    void accounts() {
        demo.ensureAccounts();
    }

    @AfterEach
    void forgetTheCache() {
        settings.invalidate();
    }

    private Organization seededOrg() {
        return orgs.findBySlug(DemoOrgSeeder.SLUG).orElseThrow();
    }

    private OrgMember seatOf(Organization org, String login) {
        User u = users.findOneByLogin(login).orElseThrow();
        return members.findByOrgIdAndUserIdAndStatusIn(org.getId(), u.getId(), List.of(OrgMemberStatus.ACTIVE)).get(0);
    }

    private record Counts(long users, long orgs, long seats, long groups, long shares, long events, long audit, long applications) {}

    private Counts counts() {
        Organization org = seededOrg();
        long seats = members.countByOrgIdAndStatusIn(org.getId(), List.of(OrgMemberStatus.ACTIVE, OrgMemberStatus.INVITED, OrgMemberStatus.SUSPENDED, OrgMemberStatus.LEFT));
        long shareRows = shares.countByOrgIdAndScope(org.getId(), ShareScope.SUMMARY) + shares.countByOrgIdAndScope(org.getId(), ShareScope.NONE) + shares.countByOrgIdAndScope(org.getId(), ShareScope.FULL);
        return new Counts(users.count(), orgs.countByCreatedByUserId(users.findOneByLogin("demo-org").orElseThrow().getId()), seats, groups.countByOrgId(org.getId()), shareRows, shareEvents.countByOrgId(org.getId()), audit.countByOrgId(org.getId()), applications.count());
    }

    // ---- what is seeded --------------------------------------------------------------------------------------------

    @Test
    void resetDataSeedsDemoBootcampWithPriyaSharmaAsASummaryMember() {
        demo.resetData();

        Organization org = seededOrg();
        assertThat(org.getName()).isEqualTo("Demo Bootcamp");
        assertThat(org.getType()).isEqualTo(OrgType.BOOTCAMP);
        assertThat(org.getStatus()).isEqualTo(OrgStatus.ACTIVE);
        assertThat(org.getCreatedByUserId()).isEqualTo(users.findOneByLogin("demo-org").orElseThrow().getId());

        assertThat(groups.findByOrgIdOrderBySortOrderAscNameAsc(org.getId())).extracting(OrgGroup::getName).containsExactly("Cohort 26-A", "Cohort 26-B");

        assertThat(seatOf(org, "demo-org").getRole()).isEqualTo(OrgRole.OWNER);
        OrgMember priya = seatOf(org, "demo");
        assertThat(priya.getRole()).isEqualTo(OrgRole.MEMBER);
        assertThat(dataShare.scopeOf(org.getId(), priya.getId())).isEqualTo(ShareScope.SUMMARY);
        assertThat(users.findOneByLogin("demo").orElseThrow().getFirstName() + " " + users.findOneByLogin("demo").orElseThrow().getLastName()).isEqualTo("Priya Sharma");

        assertThat(members.countByOrgIdAndRoleAndStatus(org.getId(), OrgRole.STAFF, OrgMemberStatus.ACTIVE)).isEqualTo(2);
        assertThat(members.countByOrgIdAndStatus(org.getId(), OrgMemberStatus.ACTIVE)).isEqualTo(DemoOrgSeeder.EXPECTED_ACTIVE_SEATS);
        assertThat(members.countByOrgIdAndStatus(org.getId(), OrgMemberStatus.INVITED)).isEqualTo(1);
        // 9 synthetic members + Priya share a summary, 2 share nothing.
        assertThat(shares.countByOrgIdAndScope(org.getId(), ShareScope.SUMMARY)).isEqualTo(10);
        assertThat(shares.countByOrgIdAndScope(org.getId(), ShareScope.NONE)).isEqualTo(2);
        assertThat(shares.countByOrgIdAndScope(org.getId(), ShareScope.FULL)).isZero();
        assertThat(shareEvents.countByOrgId(org.getId())).as("every consent has its event, written by the real service").isEqualTo(12);
    }

    @Test
    void everySyntheticPersonIsFictionalUnusableAsALoginAndEachActiveMemberHasTwoToSixApplications() {
        demo.resetData();
        Organization org = seededOrg();

        for (DemoOrgSeeder.Person p : DemoOrgSeeder.MEMBERS) {
            if (p.status() != OrgMemberStatus.ACTIVE) continue;
            User u = users.findOneByLogin(p.login()).orElseThrow();
            assertThat(u.isActivated()).as(p.login() + " must not be able to sign in").isFalse();
            assertThat(u.getEmail()).endsWith("@example.com");
            List<Application> apps = applications.findByUserId(u.getId());
            assertThat(apps.size()).as(p.login() + " applications").isBetween(2, 6);
            assertThat(apps).allSatisfy(a -> assertThat(a.getSource()).isEqualTo("demo"));
            assertThat(dataShare.scopeOf(org.getId(), seatOf(org, p.login()).getId())).as(p.login()).isEqualTo(p.scope());
        }
        assertThat(applications.findByUserId(users.findOneByLogin("demo").orElseThrow().getId())).as("Priya keeps her own eight").hasSize(8);

        OrgMember lena = members.findByOrgIdAndInviteEmailAndStatusIn(org.getId(), "demo-bc-lena@example.com", List.of(OrgMemberStatus.INVITED)).get(0);
        assertThat(lena.getUserId()).as("an invited person has no account yet").isNull();
        assertThat(users.findOneByLogin("demo-bc-lena")).isEmpty();
    }

    @Test
    void staffAreTheSupportOwnersOfTheirCohort() {
        demo.resetData();
        Organization org = seededOrg();
        OrgMember marcus = seatOf(org, "demo-bc-marcus");
        OrgMember elena = seatOf(org, "demo-bc-elena");
        assertThat(marcus.getRole()).isEqualTo(OrgRole.STAFF);
        assertThat(seatOf(org, "demo-bc-aarav").getSupportOwnerMemberId()).isEqualTo(marcus.getId());
        assertThat(seatOf(org, "demo-bc-gabriel").getSupportOwnerMemberId()).isEqualTo(elena.getId());
        assertThat(seatOf(org, "demo").getSupportOwnerMemberId()).isEqualTo(marcus.getId());
    }

    // ---- idempotent ------------------------------------------------------------------------------------------------

    @Test
    void runningTheSeedAgainChangesNothing() {
        demo.resetData();
        Counts first = counts();

        demo.resetData(); // wipes and re-seeds the job seeker's own data, then the org seed runs again
        demo.ensureSeeded();
        DemoOrgSeeder.Result again = seeder.seed(users.findOneByLogin("demo-org").orElseThrow(), users.findOneByLogin("demo").orElseThrow());

        assertThat(again.ran()).isFalse();
        assertThat(again.skippedBecause()).isEqualTo("already seeded");
        assertThat(counts()).isEqualTo(first);
    }

    @Test
    void aHalfSeededOrgIsCompletedWithoutDuplicatingAnythingOrOverwritingAChoice() {
        demo.resetData();
        Counts full = counts();
        Organization org = seededOrg();

        // Someone is missing, and one member has since changed their mind.
        OrgMember fatima = seatOf(org, "demo-bc-fatima");
        shares.deleteByOrgIdAndMemberId(org.getId(), fatima.getId());
        OrgMember kofi = seatOf(org, "demo-bc-kofi");
        kofi.setStatus(OrgMemberStatus.LEFT);
        members.saveAndFlush(kofi);
        OrgMember aarav = seatOf(org, "demo-bc-aarav");
        dataShare.grant(new OrgMembership(org.getId(), aarav.getId(), aarav.getUserId(), "demo-bc-aarav", OrgRole.MEMBER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE), ShareScope.NONE, null, OrgShareConsent.CURRENT, DataShareService.ShareContext.EMPTY);

        DemoOrgSeeder.Result r = seeder.seed(users.findOneByLogin("demo-org").orElseThrow(), users.findOneByLogin("demo").orElseThrow());

        assertThat(r.ran()).isTrue();
        assertThat(dataShare.scopeOf(org.getId(), fatima.getId())).isEqualTo(ShareScope.NONE);
        assertThat(shares.findByOrgIdAndMemberId(org.getId(), fatima.getId())).as("the missing choice is back").isPresent();
        assertThat(dataShare.scopeOf(org.getId(), aarav.getId())).as("a member's own later choice is never overwritten").isEqualTo(ShareScope.NONE);
        assertThat(members.countByOrgIdAndStatus(org.getId(), OrgMemberStatus.ACTIVE)).as("the person who left gets a fresh seat; nobody is duplicated").isEqualTo(DemoOrgSeeder.EXPECTED_ACTIVE_SEATS);
        assertThat(users.count()).isEqualTo(full.users());
        assertThat(groups.countByOrgId(org.getId())).isEqualTo(2);
    }

    // ---- guards ----------------------------------------------------------------------------------------------------

    @Test
    void anOrgThatHoldsTheSlugButWasNotCreatedByTheDemoOwnerIsNeverAdopted() {
        Organization squatter = new Organization();
        squatter.setSlug(DemoOrgSeeder.SLUG);
        squatter.setName("Not the demo");
        squatter.setType(OrgType.COMPANY);
        squatter.setStatus(OrgStatus.ACTIVE);
        squatter.setCreatedByUserId(users.findOneByLogin("demo").orElseThrow().getId());
        orgs.saveAndFlush(squatter);

        DemoOrgSeeder.Result r = seeder.seed(users.findOneByLogin("demo-org").orElseThrow(), users.findOneByLogin("demo").orElseThrow());

        assertThat(r.ran()).isFalse();
        assertThat(r.skippedBecause()).contains("did not create");
        assertThat(members.countByOrgIdAndStatus(squatter.getId(), OrgMemberStatus.ACTIVE)).isZero();
    }

    @Test
    void whileTheOrgFeatureFlagIsOffNothingIsSeeded() {
        appSettings.saveAndFlush(new AppSetting(ResumeBuilderSettingKeys.FEATURE_ORGS, "false", "test", Instant.now()));
        settings.invalidate();

        demo.resetData();

        assertThat(orgs.findBySlug(DemoOrgSeeder.SLUG)).isEmpty();
        assertThat(users.findOneByLogin("demo-bc-aarav")).isEmpty();
    }

    // ---- through the real org API ----------------------------------------------------------------------------------

    @Test
    void demoOrgSeesItsOrgThroughTheRealApiAndStrangersDoNot() throws Exception {
        demo.resetData();
        long id = seededOrg().getId();

        mockMvc
            .perform(get("/api/orgs/mine").with(user("demo-org")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(1)))
            .andExpect(jsonPath("$[0].slug").value("demo-bootcamp"))
            .andExpect(jsonPath("$[0].role").value("OWNER"))
            .andExpect(jsonPath("$[0].status").value("ACTIVE"))
            .andExpect(jsonPath("$[0].memberCount").value(DemoOrgSeeder.EXPECTED_ACTIVE_SEATS));
        mockMvc.perform(get("/api/orgs/mine").with(user("demo"))).andExpect(jsonPath("$[0].role").value("MEMBER"));
        mockMvc
            .perform(get("/api/orgs/" + id + "/groups").with(user("demo-org")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(2)))
            .andExpect(jsonPath("$[0].name").value("Cohort 26-A"))
            .andExpect(jsonPath("$[0].memberCount").value(8)) // Marcus, Aarav..Fatima (5+1), Priya
            .andExpect(jsonPath("$[1].memberCount").value(7)); // Elena, Gabriel..Kofi (4+1), Lena (invited)

        users.save(newUser("stranger"));
        mockMvc.perform(get("/api/orgs/" + id).with(user("stranger"))).andExpect(status().isNotFound());
        mockMvc.perform(get("/api/orgs/" + id).with(user("demo-bc-aarav"))).andExpect(status().isOk()); // a member sees their own org
    }

    private static User newUser(String login) {
        User u = new User();
        u.setLogin(login);
        u.setPassword("x".repeat(60));
        u.setActivated(true);
        u.setEmail(login + "@example.com");
        u.setLangKey("en");
        return u;
    }

    // ---- the fixture shared with the mock API ----------------------------------------------------------------------

    @Test
    void theSeedMatchesTheFixtureTheMockApiServes() throws Exception {
        Path file = Path.of("../web/scripts/fixtures/demo-org.json");
        if (!Files.exists(file)) file = Path.of("web/scripts/fixtures/demo-org.json");
        assertThat(file).exists();
        JsonNode fixture = om.readTree(Files.readString(file, StandardCharsets.UTF_8));

        JsonNode org = fixture.path("org");
        assertThat(org.path("slug").asText()).isEqualTo(DemoOrgSeeder.SLUG);
        assertThat(org.path("name").asText()).isEqualTo(DemoOrgSeeder.NAME);
        assertThat(org.path("type").asText()).isEqualTo("BOOTCAMP");
        assertThat(org.path("status").asText()).isEqualTo("ACTIVE");
        assertThat(fixture.path("owner").asText()).isEqualTo(DemoAccountService.LOGIN_ORG);
        assertThat(fixture.path("jobSeeker").path("login").asText()).isEqualTo(DemoAccountService.LOGIN_JOB_SEEKER);
        assertThat(fixture.path("jobSeeker").path("name").asText()).isEqualTo("Priya Sharma");
        assertThat(fixture.path("jobSeeker").path("scope").asText()).isEqualTo("SUMMARY");

        List<String> groupNames = new java.util.ArrayList<>();
        fixture.path("groups").forEach(g -> groupNames.add(g.path("name").asText()));
        assertThat(groupNames).containsExactly(DemoOrgSeeder.COHORT_A, DemoOrgSeeder.COHORT_B);

        List<DemoOrgSeeder.Person> seeded = new java.util.ArrayList<>(DemoOrgSeeder.STAFF);
        seeded.addAll(DemoOrgSeeder.MEMBERS);
        JsonNode people = fixture.path("people");
        assertThat(people).hasSize(seeded.size());
        for (int i = 0; i < seeded.size(); i++) {
            DemoOrgSeeder.Person p = seeded.get(i);
            JsonNode f = people.get(i);
            Map<String, String> expected = Map.of("login", p.login(), "first", p.first(), "last", p.last(), "role", p.role().name(), "group", p.group(), "status", p.status().name(), "scope", p.scope().name());
            expected.forEach((key, value) -> assertThat(f.path(key).asText()).as(p.login() + "." + key).isEqualTo(value));
        }
    }
}
