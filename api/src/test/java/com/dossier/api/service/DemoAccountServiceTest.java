package com.dossier.api.service;

import com.dossier.api.service.storage.FileStorage;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.Application;
import com.dossier.api.domain.Authority;
import com.dossier.api.domain.Bio;
import com.dossier.api.domain.Resume;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.repository.AiAnswerRepository;
import com.dossier.api.repository.AiCallRepository;
import com.dossier.api.repository.AiUsageRepository;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.AuthorityRepository;
import com.dossier.api.repository.BioRepository;
import com.dossier.api.repository.FieldCacheRepository;
import com.dossier.api.repository.ResumeRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.service.inbox.InboxService;
import com.dossier.api.service.org.DemoOrgSeeder;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

/** Unit tests for the demo accounts: creation, idempotency, the switch, and the seed (phase demo). */
class DemoAccountServiceTest {

    private final PasswordEncoder encoder = new BCryptPasswordEncoder(4);
    private final ObjectMapper mapper = new ObjectMapper();

    private final Map<String, User> users = new HashMap<>();
    private long nextId = 100;

    private UserRepository userRepository;
    private AuthorityRepository authorityRepository;
    private ApplicationRepository applicationRepository;
    private ResumeRepository resumeRepository;
    private BioRepository bioRepository;
    private RefreshTokenService refreshTokenService;
    private InboxService inboxService;
    private NotificationService notificationService;
    private ResumeBuilderDataService resumeBuilderData = mock(ResumeBuilderDataService.class);

    private DemoAccountService service(String password) {
        return service(password, false);
    }

    private DemoAccountService service(String password, boolean enabled) {
        return new DemoAccountService(
            userRepository,
            authorityRepository,
            encoder,
            applicationRepository,
            resumeRepository,
            bioRepository,
            mock(AiAnswerRepository.class),
            mock(FieldCacheRepository.class),
            mock(FileStorage.class),
            refreshTokenService,
            mock(ProfileSuggestionService.class),
            mock(ResumeMatchService.class),
            mock(JobFitService.class),
            mock(ResumeTailorService.class),
            mock(JobMatchService.class),
            inboxService,
            notificationService,
            mock(AiUsageRepository.class),
            mock(AiCallRepository.class),
            mock(TrackerDataService.class),
            mock(com.dossier.api.service.jobs.DemoJobSeeder.class),
            mock(DemoOrgSeeder.class),
            resumeBuilderData,
            mapper,
            password,
            enabled
        );
    }

    @BeforeEach
    void setUp() {
        userRepository = mock(UserRepository.class);
        authorityRepository = mock(AuthorityRepository.class);
        applicationRepository = mock(ApplicationRepository.class);
        resumeRepository = mock(ResumeRepository.class);
        bioRepository = mock(BioRepository.class);
        refreshTokenService = mock(RefreshTokenService.class);
        inboxService = mock(InboxService.class);
        notificationService = mock(NotificationService.class);

        when(userRepository.findOneByLogin(anyString())).thenAnswer(inv -> Optional.ofNullable(users.get(inv.<String>getArgument(0))));
        when(userRepository.save(any(User.class))).thenAnswer(inv -> {
            User u = inv.getArgument(0);
            if (u.getId() == null) {
                u.setId(nextId++);
            }
            users.put(u.getLogin(), u);
            return u;
        });
        Authority role = new Authority();
        role.setName("ROLE_USER");
        when(authorityRepository.findById("ROLE_USER")).thenReturn(Optional.of(role));
        when(resumeRepository.save(any(Resume.class))).thenAnswer(inv -> inv.getArgument(0));
        when(applicationRepository.save(any(Application.class))).thenAnswer(inv -> inv.getArgument(0));
        when(applicationRepository.findByUserId(any())).thenReturn(List.of());
        when(resumeRepository.findByUserId(any())).thenReturn(List.of());
        when(bioRepository.findByUserId(any())).thenReturn(List.of());
    }

    // ---- accounts -----------------------------------------------------------------------------

    @Test
    void ensureAccountsCreatesTwoActivatedFreeUsersWithHashedPasswords() {
        service("s3cret-demo").ensureAccounts();

        assertThat(users).containsOnlyKeys("demo", "demo-org");
        User demo = users.get("demo");
        assertThat(demo.getEmail()).isEqualTo("demo@kiwiply.com");
        assertThat(demo.getFirstName()).isEqualTo("Priya");
        assertThat(demo.getLastName()).isEqualTo("Sharma");
        assertThat(demo.isActivated()).isTrue();
        assertThat(demo.getAuthorities()).extracting(Authority::getName).containsExactly("ROLE_USER");
        assertThat(demo.getPassword()).isNotEqualTo("s3cret-demo");
        assertThat(encoder.matches("s3cret-demo", demo.getPassword())).isTrue();
        User org = users.get("demo-org");
        assertThat(org.getEmail()).isEqualTo("demo-org@kiwiply.com");
        assertThat(org.getFirstName()).isEqualTo("Demo");
        assertThat(org.getLastName()).isEqualTo("Organization");
        // No admin role, ever.
        assertThat(org.getAuthorities()).extracting(Authority::getName).doesNotContain("ROLE_ADMIN");
    }

    @Test
    void ensureAccountsIsIdempotent() {
        DemoAccountService service = service("same-password");
        service.ensureAccounts();
        String firstHash = users.get("demo").getPassword();

        service.ensureAccounts();

        assertThat(users).hasSize(2);
        assertThat(users.get("demo").getPassword()).isEqualTo(firstHash); // not re-hashed
        verify(userRepository, times(2)).save(any(User.class)); // only the two creations
    }

    @Test
    void ensureAccountsRewritesTheHashWhenTheConfiguredPasswordChanges() {
        service("old-password").ensureAccounts();
        String oldHash = users.get("demo").getPassword();

        service("new-password").ensureAccounts();

        assertThat(users).hasSize(2);
        assertThat(users.get("demo").getPassword()).isNotEqualTo(oldHash);
        assertThat(encoder.matches("new-password", users.get("demo").getPassword())).isTrue();
    }

    @Test
    void ensureAccountsReactivatesADeactivatedDemoUser() {
        DemoAccountService service = service("pw");
        service.ensureAccounts();
        users.get("demo").setActivated(false);

        service.ensureAccounts();

        assertThat(users.get("demo").isActivated()).isTrue();
    }

    @Test
    void aBlankConfiguredPasswordMeansNoTypeableDemoPassword() {
        service("").ensureAccounts();

        assertThat(encoder.matches("", users.get("demo").getPassword())).isFalse();
        assertThat(encoder.matches("kiwiply-demo", users.get("demo").getPassword())).isFalse();
    }

    @Test
    void isDemoMatchesOnlyTheTwoFixedLogins() {
        DemoAccountService service = service("pw");

        assertThat(service.isDemo("demo")).isTrue();
        assertThat(service.isDemo("DEMO-ORG")).isTrue();
        assertThat(service.isDemo("demo2")).isFalse();
        assertThat(service.isDemo("demo@kiwiply.com")).isFalse();
        assertThat(service.isDemo(null)).isFalse();
        // What a person types into the sign-in box can be the email too.
        assertThat(service.isDemoIdentifier("demo@kiwiply.com")).isTrue();
        assertThat(service.isDemoIdentifier("Demo-Org@kiwiply.com")).isTrue();
        assertThat(service.isDemoIdentifier("jane@example.com")).isFalse();
    }

    @Test
    void theAppAdminIsOfferedAfterTheJobSeekerOnlyWhileTheAdminDemoIsOn() {
        DemoAccountService off = service("pw", true);
        assertThat(off.accounts()).extracting(DemoAccountService.DemoAccount::login).containsExactly("demo");
        assertThat(off.isAdminDemoEnabled()).isFalse();

        DemoAccountService on = service("pw", true);
        org.springframework.test.util.ReflectionTestUtils.setField(on, "adminEnabled", true);
        assertThat(on.accounts()).extracting(DemoAccountService.DemoAccount::login).containsExactly("demo", "demo-admin");
        assertThat(on.accounts()).extracting(DemoAccountService.DemoAccount::landing).containsExactly("/dashboard", "/admin");
        assertThat(on.isAdminDemoEnabled()).isTrue();
    }

    @Test
    void theAccountListNeverCarriesAPassword() {
        List<DemoAccountService.DemoAccount> accounts = service("super-secret").accounts();

        assertThat(accounts).extracting(DemoAccountService.DemoAccount::login).containsExactly("demo");
        assertThat(accounts).extracting(DemoAccountService.DemoAccount::landing).containsExactly("/dashboard");
        assertThat(accounts.toString()).doesNotContain("super-secret");
    }

    @Test
    void isEnabledFollowsTheConfigPropertyOnly() {
        assertThat(service("pw", false).isEnabled()).isFalse();
        assertThat(service("pw", true).isEnabled()).isTrue();
    }

    // ---- sessions and seeding -----------------------------------------------------------------

    @Test
    void ensureSeededSeedsTheDemoWhenTheJobSeekerHasNoApplications() {
        service("pw", true).ensureSeeded();

        verify(applicationRepository, times(8)).save(any(Application.class));
        verify(refreshTokenService, never()).deleteAllForUser(any());
    }

    @Test
    void ensureSeededDoesNotReseedWhenTheJobSeekerAlreadyHasApplications() {
        DemoAccountService service = service("pw", true);
        service.ensureAccounts();
        when(applicationRepository.findByUserId(users.get("demo").getId())).thenReturn(List.of(new Application()));

        service.ensureSeeded();

        verify(applicationRepository, never()).save(any(Application.class));
        verify(bioRepository, never()).save(any(Bio.class));
    }

    @Test
    void revokeSessionsSignsTheDemoAccountsOutEverywhere() {
        DemoAccountService service = service("pw");
        service.ensureAccounts();

        service.revokeSessions();

        verify(refreshTokenService).deleteAllForUser(users.get("demo").getId());
        verify(refreshTokenService).deleteAllForUser(users.get("demo-org").getId());
        verify(applicationRepository, never()).save(any(Application.class));
    }

    // ---- the seed -----------------------------------------------------------------------------

    @Test
    void resetDataSeedsPriyaSharmaWithEightApplicationsAndTwoFilelessResumes() throws Exception {
        service("pw").resetData();

        // Profile: a complete fictional job seeker.
        ArgumentCaptor<Bio> bio = ArgumentCaptor.forClass(Bio.class);
        verify(bioRepository).save(bio.capture());
        JsonNode payload = mapper.readTree(bio.getValue().getPayload());
        assertThat(payload.get("firstName").asText()).isEqualTo("Priya");
        assertThat(payload.get("lastName").asText()).isEqualTo("Sharma");
        assertThat(payload.get("city").asText()).isEqualTo("Austin");
        assertThat(payload.get("state").asText()).isEqualTo("TX");
        assertThat(payload.get("skills")).isNotEmpty();
        assertThat(payload.get("experience")).hasSize(2);
        assertThat(payload.get("education")).hasSize(1);
        assertThat(bio.getValue().getUser().getLogin()).isEqualTo("demo");

        // Two resumes with no file behind them.
        ArgumentCaptor<Resume> resumes = ArgumentCaptor.forClass(Resume.class);
        verify(resumeRepository, times(2)).save(resumes.capture());
        assertThat(resumes.getAllValues()).allSatisfy(r -> {
            assertThat(r.getr2ObjectKey()).isEmpty();
            assertThat(r.getParsedJson()).contains("\"experience\"");
            assertThat(r.getUser().getLogin()).isEqualTo("demo");
        });
        assertThat(resumes.getAllValues().stream().filter(r -> Boolean.TRUE.equals(r.getDefaultResume()))).hasSize(1);

        // Eight applications spread across the board.
        ArgumentCaptor<Application> apps = ArgumentCaptor.forClass(Application.class);
        verify(applicationRepository, times(8)).save(apps.capture());
        List<Application> saved = new ArrayList<>(apps.getAllValues());
        assertThat(saved.stream().map(Application::getStatus).collect(Collectors.toSet()))
            .containsExactlyInAnyOrder(
                ApplicationStatus.SAVED,
                ApplicationStatus.DRAFT,
                ApplicationStatus.APPLIED,
                ApplicationStatus.INTERVIEW,
                ApplicationStatus.OFFER,
                ApplicationStatus.REJECTED
            );
        assertThat(saved).allSatisfy(a -> {
            assertThat(a.getCompany()).isNotBlank();
            assertThat(a.getRoleTitle()).isNotBlank();
            assertThat(a.getCreatedAt()).isNotNull();
            assertThat(a.getUpdatedAt()).isNotNull();
            assertThat(a.getUser().getLogin()).isEqualTo("demo");
        });
        // Only applied-or-later applications carry an applied date.
        assertThat(saved.stream().filter(a -> a.getAppliedAt() != null)).hasSize(6);
    }

    @Test
    void resetDataWipesBothAccountsFirst() {
        service("pw").resetData();

        Long demoId = users.get("demo").getId();
        Long orgId = users.get("demo-org").getId();
        verify(inboxService).deleteAllForUser(demoId);
        verify(inboxService).deleteAllForUser(orgId);
        verify(notificationService).deleteAllForUser(demoId);
        verify(notificationService).deleteAllForUser(orgId);
        // The org account is wiped but not seeded.
        verify(bioRepository, times(1)).save(any(Bio.class));
    }

    @Test
    void resetDataErasesTheBuilderSandboxOfTheDemoAccountsOnly() {
        users.put("real-user", userWithId("real-user", 9001L));

        service("pw").resetData();

        Long demoId = users.get("demo").getId();
        Long orgId = users.get("demo-org").getId();
        verify(resumeBuilderData).deleteAllForUser(demoId);
        verify(resumeBuilderData).deleteAllForUser(orgId);
        verify(resumeBuilderData).deleteSharingAsViewer("demo");
        verify(resumeBuilderData).deleteSharingAsViewer("demo-org");
        verify(resumeBuilderData, times(2)).deleteAllForUser(any());
        verify(resumeBuilderData, never()).deleteAllForUser(9001L);
    }

    private static User userWithId(String login, Long id) {
        User u = new User();
        u.setLogin(login);
        u.setId(id);
        return u;
    }
}
