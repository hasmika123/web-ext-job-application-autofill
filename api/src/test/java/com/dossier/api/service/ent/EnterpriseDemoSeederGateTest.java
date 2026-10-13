package com.dossier.api.service.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.repository.AuthorityRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.OrgAssignmentRepository;
import com.dossier.api.repository.ent.OrgBrandingRepository;
import com.dossier.api.repository.ent.OrgHostnameRepository;
import com.dossier.api.repository.ent.OrgMemberRoleRepository;
import com.dossier.api.repository.ent.OrgRoleRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.storage.FileStorage;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.security.crypto.password.PasswordEncoder;

/** The config-only gate of the enterprise demo seed: both switches must be on, and the prod profile always wins. */
class EnterpriseDemoSeederGateTest {

    private static EnterpriseDemoSeeder seeder(boolean demo, boolean enterprise, String... profiles) {
        MockEnvironment env = new MockEnvironment();
        env.setActiveProfiles(profiles);
        return new EnterpriseDemoSeeder(
            mock(OrganizationRepository.class),
            mock(OrgMemberRepository.class),
            mock(com.dossier.api.repository.org.OrgGroupRepository.class),
            mock(OrgHostnameRepository.class),
            mock(OrgBrandingRepository.class),
            mock(OrgRoleRepository.class),
            mock(OrgMemberRoleRepository.class),
            mock(OrgAssignmentRepository.class),
            mock(UserRepository.class),
            mock(AuthorityRepository.class),
            mock(AppSettingRepository.class),
            mock(ResumeBuilderSettings.class),
            mock(TenantResolver.class),
            mock(FileStorage.class),
            mock(PasswordEncoder.class),
            env,
            new ObjectMapper(),
            demo,
            enterprise
        );
    }

    @Test
    void offByDefault() {
        assertThat(seeder(false, false).refusal()).isNotNull();
        assertThat(seeder(false, false).seed().ran()).isFalse();
    }

    @Test
    void bothSwitchesAreNeeded() {
        assertThat(seeder(true, false).refusal()).contains("ENT_DEMO_SEED");
        assertThat(seeder(false, true).refusal()).contains("DEMO_ENABLED");
        assertThat(seeder(true, true).refusal()).isNull();
    }

    @Test
    void neverUnderTheProdProfileWhateverTheSwitchesSay() {
        assertThat(seeder(true, true, "prod").refusal()).contains("prod");
        assertThat(seeder(true, true, "prod").seed().ran()).isFalse();
    }

    @Test
    void theDemoNamespaceIsRecognisedCaseInsensitively() {
        assertThat(EnterpriseDemoSeeder.isEnterpriseDemoLogin("Demo-Ent-Acme-Sarah")).isTrue();
        assertThat(EnterpriseDemoSeeder.isEnterpriseDemoLogin("demo-org")).isFalse();
        assertThat(EnterpriseDemoSeeder.isEnterpriseDemoLogin(null)).isFalse();
    }

    @Test
    void theRosterMatchesTheBoards() {
        assertThat(EnterpriseDemoSeeder.ACME.people()).hasSize(11);
        assertThat(EnterpriseDemoSeeder.ACME.people().get(0).roles()).containsExactly(RoleTemplates.ORG_ADMIN, RoleTemplates.MARKETING_MANAGER);
        assertThat(EnterpriseDemoSeeder.BETA.people()).hasSize(1);
        assertThat(EnterpriseDemoSeeder.TENANTS.stream().flatMap(t -> t.people().stream().map(p -> p.email(t.orgKey()))).distinct().count()).isEqualTo(12);
    }
}
