package com.dossier.api.service;

import com.dossier.api.service.storage.FileStorage;
import com.dossier.api.domain.Application;
import com.dossier.api.domain.Authority;
import com.dossier.api.domain.Bio;
import com.dossier.api.domain.Resume;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.domain.enumeration.JobMode;
import com.dossier.api.domain.enumeration.JobType;
import com.dossier.api.domain.enumeration.ResumeStatus;
import com.dossier.api.repository.AiAnswerRepository;
import com.dossier.api.repository.AiCallRepository;
import com.dossier.api.repository.AiUsageRepository;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.AuthorityRepository;
import com.dossier.api.repository.BioRepository;
import com.dossier.api.repository.FieldCacheRepository;
import com.dossier.api.repository.ResumeRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.inbox.InboxService;
import com.dossier.api.service.org.DemoOrgSeeder;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The public demo accounts (phase demo, {@code web/APP-V2-SPEC.md} section 9).
 *
 * <p>Two fixed accounts, {@code demo} (a job seeker) and {@code demo-org} (an organization admin),
 * that anyone can open from the login page while {@code dossier.demo.enabled} (env {@code DEMO_ENABLED}) is true. They are
 * ordinary {@code ROLE_USER} accounts on the <b>Free</b> plan: nothing here grants Pro, and the rest
 * of the app treats them like any other user. What makes them different is that
 *
 * <ul>
 *   <li>they are created by {@link #ensureAccounts()} at startup, never by a CSV or a signup;</li>
 *   <li>they can only be entered through {@code POST /api/authenticate/demo} (or the password, which
 *       is refused while the switch is off) - never through Google sign-in;</li>
 *   <li>{@link DemoGuard} stops them changing anything that should not be shared (profile,
 *       password, resumes, billing, inbox, deletion/export);</li>
 *   <li>an admin can wipe and re-seed their data ({@link #resetData()}).</li>
 * </ul>
 */
@Service
public class DemoAccountService {

    private static final Logger LOG = LoggerFactory.getLogger(DemoAccountService.class);

    public static final String LOGIN_JOB_SEEKER = "demo";
    public static final String LOGIN_ORG = "demo-org";

    /** How many applications {@link #resetData()} seeds for the job seeker. */
    static final int SEEDED_APPLICATIONS = 8;

    /** What the login page needs to draw one demo button. Never carries a password. */
    public record DemoAccount(String login, String label, String description, String landing) {}

    private static final List<DemoAccount> ACCOUNTS = List.of(
        new DemoAccount(
            LOGIN_JOB_SEEKER,
            "Job seeker",
            "A ready-made job search: a profile, resumes and an application board.",
            "/dashboard"
        ),
        new DemoAccount(LOGIN_ORG, "Organization admin", "The organization admin: people, boards and reports.", "/org")
    );

    private static final List<String> SKILLS = List.of(
        "Product design",
        "Design systems",
        "User research",
        "Prototyping",
        "Figma",
        "Interaction design",
        "Accessibility",
        "Workshop facilitation",
        "SQL",
        "HTML/CSS"
    );

    private final UserRepository userRepository;
    private final AuthorityRepository authorityRepository;
    private final PasswordEncoder passwordEncoder;
    private final ApplicationRepository applicationRepository;
    private final ResumeRepository resumeRepository;
    private final BioRepository bioRepository;
    private final AiAnswerRepository aiAnswerRepository;
    private final FieldCacheRepository fieldCacheRepository;
    private final FileStorage storageService;
    private final RefreshTokenService refreshTokenService;
    private final ProfileSuggestionService profileSuggestionService;
    private final ResumeMatchService resumeMatchService;
    private final JobFitService jobFitService;
    private final ResumeTailorService resumeTailorService;
    private final JobMatchService jobMatchService;
    private final InboxService inboxService;
    private final NotificationService notificationService;
    private final AiUsageRepository aiUsageRepository;
    private final AiCallRepository aiCallRepository;
    private final TrackerDataService trackerData;
    private final com.dossier.api.service.jobs.DemoJobSeeder jobSeeder;
    private final DemoOrgSeeder orgSeeder;
    private final ResumeBuilderDataService resumeBuilderData;
    private final ObjectMapper objectMapper;

    private final String demoPassword;

    /** {@code dossier.demo.enabled}: fixed at startup from server config; there is no runtime switch. */
    private volatile boolean enabled;

    public DemoAccountService(
        UserRepository userRepository,
        AuthorityRepository authorityRepository,
        PasswordEncoder passwordEncoder,
        ApplicationRepository applicationRepository,
        ResumeRepository resumeRepository,
        BioRepository bioRepository,
        AiAnswerRepository aiAnswerRepository,
        FieldCacheRepository fieldCacheRepository,
        FileStorage storageService,
        RefreshTokenService refreshTokenService,
        ProfileSuggestionService profileSuggestionService,
        ResumeMatchService resumeMatchService,
        JobFitService jobFitService,
        ResumeTailorService resumeTailorService,
        JobMatchService jobMatchService,
        InboxService inboxService,
        NotificationService notificationService,
        AiUsageRepository aiUsageRepository,
        AiCallRepository aiCallRepository,
        TrackerDataService trackerData,
        com.dossier.api.service.jobs.DemoJobSeeder jobSeeder,
        DemoOrgSeeder orgSeeder,
        ResumeBuilderDataService resumeBuilderData,
        ObjectMapper objectMapper,
        @Value("${dossier.demo.password:kiwiply-demo}") String demoPassword,
        @Value("${dossier.demo.enabled:false}") boolean enabled
    ) {
        this.enabled = enabled;
        this.userRepository = userRepository;
        this.authorityRepository = authorityRepository;
        this.passwordEncoder = passwordEncoder;
        this.applicationRepository = applicationRepository;
        this.resumeRepository = resumeRepository;
        this.bioRepository = bioRepository;
        this.aiAnswerRepository = aiAnswerRepository;
        this.fieldCacheRepository = fieldCacheRepository;
        this.storageService = storageService;
        this.refreshTokenService = refreshTokenService;
        this.profileSuggestionService = profileSuggestionService;
        this.resumeMatchService = resumeMatchService;
        this.jobFitService = jobFitService;
        this.resumeTailorService = resumeTailorService;
        this.jobMatchService = jobMatchService;
        this.inboxService = inboxService;
        this.notificationService = notificationService;
        this.aiUsageRepository = aiUsageRepository;
        this.aiCallRepository = aiCallRepository;
        this.trackerData = trackerData;
        this.jobSeeder = jobSeeder;
        this.orgSeeder = orgSeeder;
        this.resumeBuilderData = resumeBuilderData;
        this.objectMapper = objectMapper;
        // A blank DEMO_PASSWORD (the production default) means "no usable password": a random one per boot,
        // so the only way into a demo account is the one-click login, never a typed password.
        this.demoPassword = demoPassword == null || demoPassword.isBlank() ? UUID.randomUUID().toString() : demoPassword;
    }

    // ---- who is a demo account, and is the feature on ----------------------------------------

    /** The two accounts the login page offers, in display order. */
    public List<DemoAccount> accounts() {
        return ACCOUNTS;
    }

    /** True when {@code login} is one of the fixed demo logins (case-insensitive). */
    public boolean isDemo(String login) {
        return isDemoLogin(login);
    }

    /** Static form of {@link #isDemo}, for beans that must not depend on this service (it would be a cycle). */
    public static boolean isDemoLogin(String login) {
        if (login == null) {
            return false;
        }
        String lower = login.trim().toLowerCase(Locale.ENGLISH);
        return ACCOUNTS.stream().anyMatch(a -> a.login().equals(lower));
    }

    /**
     * Like {@link #isDemo} but for what a person types into the sign-in box, which can also be the
     * account's email address.
     */
    public boolean isDemoIdentifier(String loginOrEmail) {
        if (loginOrEmail == null) {
            return false;
        }
        String lower = loginOrEmail.trim().toLowerCase(Locale.ENGLISH);
        return isDemo(lower) || ACCOUNTS.stream().anyMatch(a -> emailFor(a.login()).equals(lower));
    }

    /** Whether the demo is on: the {@code dossier.demo.enabled} property (env {@code DEMO_ENABLED}), nothing else. */
    public boolean isEnabled() {
        return enabled;
    }

    /** Sign the demo accounts out everywhere by revoking their refresh tokens. */
    @Transactional
    public void revokeSessions() {
        for (DemoAccount account : ACCOUNTS) {
            userRepository.findOneByLogin(account.login()).ifPresent(u -> refreshTokenService.deleteAllForUser(u.getId()));
        }
    }

    /**
     * Make sure the demo job seeker has something to show: when it has no applications at all, run
     * {@link #resetData()}. Called at startup when the demo is enabled and on every demo job-seeker login,
     * so a freshly enabled demo ends up populated.
     */
    @Transactional
    public synchronized void ensureSeeded() {
        ensureAccounts();
        Optional<User> demo = userRepository.findOneByLogin(LOGIN_JOB_SEEKER);
        if (demo.isPresent() && applicationRepository.findByUserId(demo.get().getId()).isEmpty()) {
            resetData();
        }
        seedOrg(); // idempotent and cheap once seeded; refuses unless the demo and org features are on and this is not prod
        jobSeeder.seedIfStale(); // one count when the store already has live postings
    }

    /** The demo organization (O1.8): {@code demo-bootcamp}, owned by {@code demo-org}, with {@code demo} as a member. */
    private void seedOrg() {
        orgSeeder.seed(userRepository.findOneByLogin(LOGIN_ORG).orElse(null), userRepository.findOneByLogin(LOGIN_JOB_SEEKER).orElse(null));
    }

    // ---- accounts -----------------------------------------------------------------------------

    /**
     * Create the two demo users if they are missing and keep their password in step with
     * {@code dossier.demo.password}. Idempotent: running it again changes nothing unless the
     * configured password changed (then only the hash is rewritten).
     */
    @Transactional
    public void ensureAccounts() {
        Authority userAuthority = authorityRepository
            .findById(AuthoritiesConstants.USER)
            .orElseGet(() -> {
                Authority authority = new Authority();
                authority.setName(AuthoritiesConstants.USER);
                return authorityRepository.save(authority);
            });
        ensureAccount(LOGIN_JOB_SEEKER, "Priya", "Sharma", userAuthority); // the demo persona (D47)
        ensureAccount(LOGIN_ORG, "Demo", "Organization", userAuthority);
    }

    private void ensureAccount(String login, String firstName, String lastName, Authority userAuthority) {
        Optional<User> existing = userRepository.findOneByLogin(login);
        if (existing.isPresent()) {
            User user = existing.get();
            boolean dirty = false;
            if (!java.util.Objects.equals(firstName, user.getFirstName()) || !java.util.Objects.equals(lastName, user.getLastName())) {
                user.setFirstName(firstName); // an account made before the persona was renamed (Jordan, then "Demo") follows the seed
                user.setLastName(lastName);
                dirty = true;
            }
            if (user.getPassword() == null || !passwordEncoder.matches(demoPassword, user.getPassword())) {
                user.setPassword(passwordEncoder.encode(demoPassword));
                dirty = true;
            }
            if (!user.isActivated()) {
                user.setActivated(true);
                dirty = true;
            }
            if (dirty) {
                userRepository.save(user);
                LOG.info("Updated demo account '{}'", login);
            }
            return;
        }
        User user = new User();
        user.setLogin(login);
        user.setFirstName(firstName);
        user.setLastName(lastName);
        user.setEmail(emailFor(login));
        user.setLangKey("en");
        user.setActivated(true);
        user.setPassword(passwordEncoder.encode(demoPassword));
        user.setAuthorities(new HashSet<>(List.of(userAuthority)));
        userRepository.save(user);
        LOG.info("Created demo account '{}'", login);
    }

    private static String emailFor(String login) {
        return login + "@kiwiply.com";
    }

    // ---- data ---------------------------------------------------------------------------------

    /**
     * Wipe both demo accounts' data (applications, resumes, profile, notifications, inbox, AI
     * rows) and re-seed the job seeker: a profile for the fictional Priya Sharma (D47), two resumes
     * (label and parsed content only, no file) and eight applications across the board.
     */
    @Transactional
    public void resetData() {
        ensureAccounts();
        for (DemoAccount account : ACCOUNTS) {
            wipe(userRepository.findOneByLogin(account.login()).orElseThrow());
        }
        seed(userRepository.findOneByLogin(LOGIN_JOB_SEEKER).orElseThrow());
        jobSeeder.seedIfStale(); // postings for the demo to search when no board read has run here
        seedOrg();
        LOG.info("Demo data reset: {} applications seeded for '{}'", SEEDED_APPLICATIONS, LOGIN_JOB_SEEKER);
    }

    private void wipe(User user) {
        Long id = user.getId();
        // Applications reference resumes, so they go first (their events, notes and interviews before them).
        trackerData.deleteAllForUser(id);
        applicationRepository.deleteAll(applicationRepository.findByUserId(id));
        // Everything the sandbox lets a visitor make (Resume Builder docs, versions, AI proposals, share links and
        // their view events, profile items, onboarding draft, and every file under the user's storage prefixes).
        // Scoped to this demo user id only; before the resumes, like account deletion.
        resumeBuilderData.deleteAllForUser(id);
        resumeBuilderData.deleteSharingAsViewer(user.getLogin());
        List<Resume> resumes = resumeRepository.findByUserId(id);
        for (Resume resume : resumes) {
            String key = resume.getr2ObjectKey();
            if (key != null && !key.isBlank()) {
                storageService.delete(key);
            }
        }
        resumeRepository.deleteAll(resumes);
        bioRepository.deleteAll(bioRepository.findByUserId(id));
        aiAnswerRepository.deleteAll(aiAnswerRepository.findByUserId(id));
        fieldCacheRepository.deleteAll(fieldCacheRepository.findByUserId(id));
        profileSuggestionService.deleteAllForUser(id);
        resumeMatchService.deleteAllForUser(id);
        jobFitService.deleteAllForUser(id);
        resumeTailorService.deleteAllForUser(id);
        jobMatchService.deleteAllForUser(id);
        jobSeeder.wipeUser(id);
        inboxService.deleteAllForUser(id);
        notificationService.deleteAllForUser(id);
        aiUsageRepository.deleteByLoginValue(user.getLogin());
        aiCallRepository.anonymize(user.getLogin());
    }

    private void seed(User demo) {
        Instant now = Instant.now();

        Bio bio = new Bio();
        bio.setUser(demo);
        bio.setUpdatedAt(now);
        bio.setPayload(toJson(bioPayload()));
        bioRepository.save(bio);

        Resume primary = resume(demo, "Priya Sharma - Product Designer", true, now.minus(40, ChronoUnit.DAYS), resumeJson(true));
        Resume systems = resume(demo, "Priya Sharma - Design Systems focus", false, now.minus(12, ChronoUnit.DAYS), resumeJson(false));

        // Newest-first story: an offer, two interviews, two applied, a draft, a saved job, a rejection.
        Application lumen = application(demo, now, "Lumen Health","Senior Product Designer", ApplicationStatus.OFFER, 34, 30, "Austin, TX", JobMode.HYBRID, "$150,000 - $170,000", "Greenhouse", "https://boards.greenhouse.io/lumenhealth/jobs/4012001", primary);
        Application northwind = application(demo, now, "Northwind Labs","Product Designer, Growth", ApplicationStatus.INTERVIEW, 21, 18, "Remote (US)", JobMode.REMOTE, "$135,000 - $155,000", "Lever", "https://jobs.lever.co/northwindlabs/6f1a0c2e", primary);
        Application brightpath = application(demo, now, "Brightpath Learning","Lead UX Designer", ApplicationStatus.INTERVIEW, 16, 13, "Austin, TX", JobMode.ON_SITE, "$140,000", "Workday", "https://brightpath.wd5.myworkdayjobs.com/en-US/careers/job/Austin-TX/Lead-UX-Designer_R-10442", systems);
        application(demo, now, "Cobalt Payments", "Senior Product Designer", ApplicationStatus.APPLIED, 9, 8, "Remote (US)", JobMode.REMOTE, "$145,000 - $165,000", "Ashby", "https://jobs.ashbyhq.com/cobalt/2c7e9b1a", primary);
        application(demo, now, "Fernhill Mobility", "Product Designer", ApplicationStatus.APPLIED, 6, 5, "Dallas, TX", JobMode.HYBRID, "$125,000 - $140,000", "SmartRecruiters", "https://jobs.smartrecruiters.com/FernhillMobility/743999", systems);
        application(demo, now, "Atlas Commerce", "Design Systems Designer", ApplicationStatus.DRAFT, 2, -1, "Remote (US)", JobMode.REMOTE, null, "Greenhouse", "https://boards.greenhouse.io/atlascommerce/jobs/5108822", systems);
        application(demo, now, "Juniper Cloud", "Staff Product Designer", ApplicationStatus.SAVED, 3, -1, "Austin, TX", JobMode.HYBRID, "$170,000 - $190,000", "Lever", "https://jobs.lever.co/junipercloud/a93d00b7", null);
        seedTracker(lumen, northwind, brightpath, now);
        application(demo, now, "Quill and Co","Product Designer", ApplicationStatus.REJECTED, 28, 25, "Houston, TX", JobMode.ON_SITE, "$115,000", "Workable", "https://apply.workable.com/quillandco/j/8821F0", primary);
    }

    private Resume resume(User user, String label, boolean isDefault, Instant createdAt, String parsedJson) {
        Resume resume = new Resume();
        resume.setUser(user);
        resume.setLabel(label);
        resume.setr2ObjectKey(""); // no file: the column is non-null, blank means "nothing stored"
        resume.setParsedJson(parsedJson);
        resume.setStatus(ResumeStatus.CONFIRMED);
        resume.setCreatedAt(createdAt);
        resume.setArchived(false);
        resume.setStarred(isDefault);
        resume.setDefaultResume(isDefault);
        return resumeRepository.save(resume);
    }

    /**
     * The demo's tracker memory (APP-E2E U6.1): notes and interviews on the three applications that have a
     * story, so the dashboard's "interviews" and the detail sheet are real for the demo. Dates are relative
     * to now, so a reset always leaves some interviews ahead and some behind.
     */
    private void seedTracker(Application lumen, Application northwind, Application brightpath, Instant now) {
        String tz = "America/Chicago";
        Instant hour = now.truncatedTo(ChronoUnit.HOURS);
        trackerData.seedDemoInterview(lumen, "PHONE", hour.minus(24, ChronoUnit.DAYS), 30, tz, "Phone", "Maya Ortiz (recruiter)", "PASSED");
        trackerData.seedDemoInterview(lumen, "ONSITE", hour.minus(15, ChronoUnit.DAYS), 180, tz, "Lumen Health, 100 Main St, Austin", "Design team panel", "PASSED");
        trackerData.seedDemoNote(lumen, "Offer call went well. Ask about the design systems budget and the review at six months before answering.", true, now.minus(3, ChronoUnit.DAYS));
        trackerData.seedDemoInterview(northwind, "PHONE", hour.minus(10, ChronoUnit.DAYS), 30, tz, "Phone", "Sam Rivera", "PASSED");
        trackerData.seedDemoInterview(northwind, "VIDEO", hour.plus(2, ChronoUnit.DAYS), 60, tz, "Video call (link in the invite)", "Sam Rivera", null);
        trackerData.seedDemoNote(northwind, "Prep: growth experiments portfolio piece, the onboarding redesign story.", false, now.minus(1, ChronoUnit.DAYS));
        trackerData.seedDemoInterview(brightpath, "ONSITE", hour.plus(5, ChronoUnit.DAYS), 240, tz, "Brightpath Learning, 500 Congress Ave, Austin", "Priya Shah", null);
    }

    @SuppressWarnings("java:S107")
    private Application application(
        User user,
        Instant now,
        String company,
        String title,
        ApplicationStatus status,
        int createdDaysAgo,
        int appliedDaysAgo,
        String location,
        JobMode mode,
        String salary,
        String ats,
        String url,
        Resume resume
    ) {
        Application a = new Application();
        a.setUser(user);
        a.setCompany(company);
        a.setRoleTitle(title);
        a.setStatus(status);
        a.setLocation(location);
        a.setJobMode(mode);
        a.setJobType(JobType.FULL_TIME);
        a.setSalary(salary);
        a.setAtsPlatform(ats);
        a.setJobUrl(url);
        a.setSource("demo");
        a.setStarred(status == ApplicationStatus.OFFER || status == ApplicationStatus.INTERVIEW);
        a.setArchived(false);
        a.setResume(resume);
        Instant created = now.minus(createdDaysAgo, ChronoUnit.DAYS);
        a.setCreatedAt(created);
        if (appliedDaysAgo >= 0) {
            a.setAppliedAt(now.minus(appliedDaysAgo, ChronoUnit.DAYS));
            a.setUpdatedAt(now.minus(Math.max(appliedDaysAgo - 2, 0), ChronoUnit.DAYS));
            a.setSubmissionConfirmed(true);
        } else {
            a.setUpdatedAt(created);
            a.setSubmissionConfirmed(false);
        }
        applicationRepository.save(a);
        // History: created, then applied, then the move to where it stands now (the same dates the row shows).
        Instant applied = appliedDaysAgo >= 0 ? now.minus(appliedDaysAgo, ChronoUnit.DAYS) : null;
        Instant moved = applied != null && status != ApplicationStatus.APPLIED ? a.getUpdatedAt() : null;
        trackerData.seedDemoHistory(a, created, applied, moved);
        return a;
    }

    // ---- the fictional person -----------------------------------------------------------------

    private Map<String, Object> bioPayload() {
        Map<String, Object> bio = new LinkedHashMap<>();
        bio.put("firstName", "Priya");
        bio.put("lastName", "Sharma");
        bio.put("preferredName", "Priya");
        bio.put("email", "priya.sharma@example.com");
        bio.put("phone", "(512) 555-0142");
        bio.put("addressLine1", "1200 Example Street");
        bio.put("city", "Austin");
        bio.put("state", "TX");
        bio.put("postalCode", "78701");
        bio.put("country", "United States");
        bio.put("linkedin", "https://www.linkedin.com/in/priya-sharma-example");
        bio.put("website", "https://priyasharma.example.com");
        bio.put("authorizedToWork", "Yes");
        bio.put("requireSponsorship", "No");
        bio.put("desiredSalary", "$150,000");
        bio.put("noticePeriod", "2 weeks");
        bio.put("workPreference", "Hybrid");
        bio.put("willingToRelocate", "No");
        bio.put("referralSource", "LinkedIn");
        bio.put("skills", SKILLS);
        bio.put("experience", experience());
        bio.put("education", education());
        return bio;
    }

    private String resumeJson(boolean full) {
        Map<String, Object> r = new LinkedHashMap<>();
        r.put(
            "summary",
            full
                ? "Product designer with eight years of experience shipping consumer and B2B software. I turn fuzzy problems into clear, usable products and grow design teams along the way."
                : "Design-systems-minded product designer: component libraries, tokens and the documentation that makes them stick."
        );
        r.put("skills", full ? SKILLS : SKILLS.subList(0, 7));
        r.put("experience", experience());
        r.put("education", education());
        r.put("languages", List.of(Map.of("name", "English", "proficiency", "Native"), Map.of("name", "Spanish", "proficiency", "Conversational")));
        r.put("projects", List.of());
        return toJson(r);
    }

    private static List<Map<String, Object>> experience() {
        return List.of(
            Map.of(
                "company", "Meridian Software",
                "title", "Senior Product Designer",
                "location", "Austin, TX",
                "startDate", "2021-03",
                "endDate", "",
                "current", true,
                "bullets", List.of(
                    "Led the redesign of the scheduling product used by 40,000 teams, lifting weekly activation by 18%.",
                    "Built and maintained a design system of 90 components shared by four product squads.",
                    "Ran a continuous research program of 6 interviews a month that shaped the quarterly roadmap."
                )
            ),
            Map.of(
                "company", "Harbor and Pine",
                "title", "Product Designer",
                "location", "Austin, TX",
                "startDate", "2017-08",
                "endDate", "2021-02",
                "current", false,
                "bullets", List.of(
                    "Designed the checkout and account areas for a retail app with 1.2M monthly users.",
                    "Cut support tickets about order changes by 25% with a clearer order-status flow."
                )
            )
        );
    }

    private static List<Map<String, Object>> education() {
        return List.of(
            Map.of(
                "school", "Lakeview State University",
                "degree", "B.A.",
                "field", "Design",
                "startDate", "2013-08",
                "endDate", "2017-05",
                "gpa", "3.7",
                "location", "Austin, TX"
            )
        );
    }

    private String toJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Could not serialise demo data", e);
        }
    }
}
