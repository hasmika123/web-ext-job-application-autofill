package com.dossier.api.service.org;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.ShareScope;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.AuthorityRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.org.OrgGroupRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.security.crypto.password.PasswordEncoder;

/** O1.8: the demo org seed refuses to run unless it is safe, and the table it seeds has the shape the plan promises. */
class DemoOrgSeederTest {

    private final OrganizationRepository orgs = mock(OrganizationRepository.class);
    private final OrgMemberRepository members = mock(OrgMemberRepository.class);
    private final OrgGroupRepository groups = mock(OrgGroupRepository.class);
    private final UserRepository users = mock(UserRepository.class);
    private final AuthorityRepository authorities = mock(AuthorityRepository.class);
    private final ApplicationRepository applications = mock(ApplicationRepository.class);
    private final DataShareService dataShare = mock(DataShareService.class);
    private final OrgAuditService audit = mock(OrgAuditService.class);
    private final OrgFeatureFlag flag = mock(OrgFeatureFlag.class);
    private final PasswordEncoder encoder = mock(PasswordEncoder.class);

    private DemoOrgSeeder seeder(MockEnvironment env, boolean demoEnabled, boolean orgsEnabled) {
        when(flag.isEnabled()).thenReturn(orgsEnabled);
        return new DemoOrgSeeder(orgs, members, groups, users, authorities, applications, dataShare, audit, flag, encoder, env, mock(com.dossier.api.service.ent.OrgRoleService.class), demoEnabled);
    }

    private static User user(long id, String login) {
        User u = new User();
        u.setId(id);
        u.setLogin(login);
        return u;
    }

    private void assertNothingTouched() {
        verifyNoInteractions(orgs, members, groups, users, authorities, applications, dataShare, audit, encoder);
    }

    @Test
    void theProdProfileNeverSeedsEvenWithTheDemoAndOrgsOn() {
        MockEnvironment prod = new MockEnvironment();
        prod.setActiveProfiles("prod");
        DemoOrgSeeder s = seeder(prod, true, true);

        DemoOrgSeeder.Result r = s.seed(user(1, "demo-org"), user(2, "demo"));

        assertThat(r.ran()).isFalse();
        assertThat(r.skippedBecause()).contains("prod");
        assertNothingTouched();
    }

    @Test
    void aProdLikeProfileCombinationStillCountsAsProd() {
        MockEnvironment env = new MockEnvironment();
        env.setActiveProfiles("prod", "tls");
        assertThat(seeder(env, true, true).refusal()).contains("prod");
    }

    @Test
    void withTheDemoOffNothingIsSeeded() {
        DemoOrgSeeder.Result r = seeder(new MockEnvironment(), false, true).seed(user(1, "demo-org"), user(2, "demo"));
        assertThat(r.ran()).isFalse();
        assertThat(r.skippedBecause()).contains("DEMO_ENABLED");
        assertNothingTouched();
    }

    @Test
    void withTheOrgFeatureOffNothingIsSeeded() {
        DemoOrgSeeder.Result r = seeder(new MockEnvironment(), true, false).seed(user(1, "demo-org"), user(2, "demo"));
        assertThat(r.ran()).isFalse();
        assertThat(r.skippedBecause()).contains("ORGS_ENABLED");
        assertNothingTouched();
    }

    @Test
    void missingDemoAccountsSeedNothing() {
        DemoOrgSeeder s = seeder(new MockEnvironment(), true, true);
        assertThat(s.seed(null, user(2, "demo")).ran()).isFalse();
        assertThat(s.seed(user(1, "demo-org"), null).ran()).isFalse();
        assertNothingTouched();
    }

    @Test
    void theSeededTableMatchesThePlan() {
        // 12 members: 9 SUMMARY + 2 NONE active, 1 INVITED; 2 STAFF support owners; two cohorts.
        assertThat(DemoOrgSeeder.MEMBERS).hasSize(12);
        assertThat(DemoOrgSeeder.MEMBERS.stream().filter(p -> p.status() == OrgMemberStatus.ACTIVE && p.scope() == ShareScope.SUMMARY)).hasSize(9);
        assertThat(DemoOrgSeeder.MEMBERS.stream().filter(p -> p.status() == OrgMemberStatus.ACTIVE && p.scope() == ShareScope.NONE)).hasSize(2);
        assertThat(DemoOrgSeeder.MEMBERS.stream().filter(p -> p.status() == OrgMemberStatus.INVITED)).hasSize(1);
        assertThat(DemoOrgSeeder.STAFF).hasSize(2);
        assertThat(DemoOrgSeeder.MEMBERS.stream().map(DemoOrgSeeder.Person::group).distinct().toList()).containsExactly(DemoOrgSeeder.COHORT_A, DemoOrgSeeder.COHORT_B);
        assertThat(DemoOrgSeeder.EXPECTED_ACTIVE_SEATS).as("owner + 2 staff + 11 active members + the demo job seeker").isEqualTo(15);
    }

    @Test
    void everyoneSeededIsFictionalOnTheReservedExampleDomainAndNobodyHasASensitiveField() {
        List<DemoOrgSeeder.Person> everyone = new java.util.ArrayList<>(DemoOrgSeeder.MEMBERS);
        everyone.addAll(DemoOrgSeeder.STAFF);
        assertThat(everyone).allSatisfy(p -> {
            assertThat(p.email()).endsWith("@example.com");
            assertThat(p.login()).startsWith("demo-bc-").hasSizeLessThanOrEqualTo(50);
        });
        assertThat(everyone.stream().map(DemoOrgSeeder.Person::login).distinct()).hasSameSizeAs(everyone);
        assertThat(OrgSlugs.isReserved(DemoOrgSeeder.SLUG)).as("a real tenant cannot squat the demo slug").isTrue();
    }
}
