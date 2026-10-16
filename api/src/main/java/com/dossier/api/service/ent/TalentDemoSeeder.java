package com.dossier.api.service.ent;

import com.dossier.api.domain.Authority;
import com.dossier.api.domain.User;
import com.dossier.api.domain.ent.OrgMemberRole;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientContact;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.ConsultantSkill;
import com.dossier.api.domain.ent.talent.MarketerAssignment;
import com.dossier.api.domain.ent.talent.MarketerCapacity;
import com.dossier.api.domain.ent.talent.OrgResume;
import com.dossier.api.domain.ent.talent.OrgResumeExperience;
import com.dossier.api.domain.ent.talent.OrgSpendEntry;
import com.dossier.api.domain.ent.talent.RequirementMatch;
import com.dossier.api.domain.ent.talent.RequirementSkill;
import com.dossier.api.domain.ent.talent.TalentApplication;
import com.dossier.api.domain.ent.talent.TalentApplicationEvent;
import com.dossier.api.domain.ent.talent.TalentApplicationNote;
import com.dossier.api.domain.ent.talent.TalentInterview;
import com.dossier.api.domain.ent.talent.TalentPlacement;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.org.OrgGroup;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.AuthorityRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.OrgMemberRoleRepository;
import com.dossier.api.repository.ent.OrgRoleRepository;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.ClientContactRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.ConsultantSkillRepository;
import com.dossier.api.repository.ent.talent.MarketerAssignmentRepository;
import com.dossier.api.repository.ent.talent.MarketerCapacityRepository;
import com.dossier.api.repository.ent.talent.OrgResumeExperienceRepository;
import com.dossier.api.repository.ent.talent.OrgResumeRepository;
import com.dossier.api.repository.ent.talent.OrgSpendEntryRepository;
import com.dossier.api.repository.ent.talent.RequirementMatchRepository;
import com.dossier.api.repository.ent.talent.RequirementSkillRepository;
import com.dossier.api.repository.ent.talent.TalentApplicationEventRepository;
import com.dossier.api.repository.ent.talent.TalentApplicationNoteRepository;
import com.dossier.api.repository.ent.talent.TalentApplicationRepository;
import com.dossier.api.repository.ent.talent.TalentInterviewRepository;
import com.dossier.api.repository.ent.talent.TalentPlacementRepository;
import com.dossier.api.repository.org.OrgGroupRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.security.AuthoritiesConstants;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Demo data for the five Enterprise talent boards and the dashboard's talent tiles (branch ent-talent). It runs under exactly the
 * switches of {@link EnterpriseDemoSeeder} ({@code DEMO_ENABLED} + {@code ENT_DEMO_SEED}, never under {@code prod}) and only AFTER it:
 * {@link com.dossier.api.config.EnterpriseDemoBootstrap} calls {@link #seed()} once the demo tenants exist.
 *
 * <p>Acme Staffing is the rich tenant (153 consultants, 8 clients, 24 jobs, 120 applications, 8 marketers); Beta Talent is about
 * 30 % of it, so isolation can be shown. Everything is dated relative to now (consultants, jobs, resumes, applications, stage
 * events, interviews and placements are spread over the last six months with a rising trend) so "vs last month" figures can be
 * computed from rows. The random stream is seeded per organization, so two databases get the same story.
 *
 * <p><b>Idempotent:</b> an organization that already has consultant profiles is left untouched. <b>No PII:</b> names are invented,
 * emails are on {@code example.com}, there are no phone numbers, birth dates, document or bank numbers, and no photos.
 */
@Service
public class TalentDemoSeeder {

    private static final Logger LOG = LoggerFactory.getLogger(TalentDemoSeeder.class);

    /** Workload / capacity at or above this percentage counts as "overloaded" on the Marketing Assignments board. */
    public static final int OVERLOAD_PCT = 90;

    /** One seeded marketer: key becomes the demo login suffix; existing ones are the base demo members. */
    record Marketer(String key, String first, String last, int capacity, int workload, boolean existing, String title) {}

    record ClientSpec(String name, String industry, String domain, String contactA, String contactB) {}

    record Spec(String orgKey, String slug, int consultants, int unassigned, List<Marketer> marketers, List<ClientSpec> clients, int jobs, int apps, int spendBase, long seed) {}

    static final Spec ACME = new Spec(
        "acme", EnterpriseDemoSeeder.ACME_SLUG, 153, 12,
        List.of(
            new Marketer("sarah", "Sarah", "Chen", 20, 9, true, "Marketing Manager"),
            new Marketer("omar", "Omar", "Haddad", 20, 10, true, "Marketing Consultant"),
            new Marketer("jessica", "Jessica", "Davis", 30, 28, false, "Marketing Consultant"),
            new Marketer("michael", "Michael", "Park", 30, 29, false, "Marketing Consultant"),
            new Marketer("emily", "Emily", "Lawson", 25, 23, false, "Marketing Consultant"),
            new Marketer("david", "David", "Kim", 25, 16, false, "Marketing Consultant"),
            new Marketer("samantha", "Samantha", "Lee", 25, 14, false, "Marketing Consultant"),
            new Marketer("ryan", "Ryan", "Thompson", 20, 12, false, "Marketing Consultant")
        ),
        List.of(
            new ClientSpec("TechCorp", "Technology", "techcorp.example.com", "Michael Reyes", "Dana Whitaker"),
            new ClientSpec("Global Media", "Media", "globalmedia.example.com", "Priya Nandakumar", "Tom Eriksen"),
            new ClientSpec("FinTech Solutions", "Financial Services", "fintechsolutions.example.com", "Laura Benitez", "Omar Siddiqui"),
            new ClientSpec("HealthPlus", "Healthcare", "healthplus.example.com", "Grace Okonkwo", "Ian McAllister"),
            new ClientSpec("InnovateLab", "Technology", "innovatelab.example.com", "Yuki Tanaka", "Carla Mendes"),
            new ClientSpec("RetailCo", "Retail", "retailco.example.com", "Ben Hartmann", "Aisha Rahman"),
            new ClientSpec("ACME Internal", "Staffing", "acme.example.com", "Helen Brooks", "Marco Rinaldi"),
            new ClientSpec("Northwind Logistics", "Logistics", "northwindlogistics.example.com", "Sven Lindgren", "Fatima Zahra")
        ),
        24, 120, 4_100_000, 20261013L
    );

    static final Spec BETA = new Spec(
        "beta", EnterpriseDemoSeeder.BETA_SLUG, 46, 4,
        List.of(
            new Marketer("bea", "Bea", "Turner", 12, 11, true, "Marketing Consultant"),
            new Marketer("priya", "Priya", "Nair", 20, 17, false, "Marketing Consultant"),
            new Marketer("leo", "Leo", "Fischer", 15, 14, false, "Marketing Consultant")
        ),
        List.of(
            new ClientSpec("Lumina Retail", "Retail", "luminaretail.example.com", "Joan Whitfield", "Rafael Ortiz"),
            new ClientSpec("Orchid Health", "Healthcare", "orchidhealth.example.com", "Nadia Petrova", "Chris Abbott"),
            new ClientSpec("Vertex Capital", "Financial Services", "vertexcapital.example.com", "Ellen Marsh", "Kofi Mensah")
        ),
        8, 36, 1_250_000, 20261014L
    );

    public static final List<Spec> SPECS = List.of(ACME, BETA);

    /** What a call did: per organization slug, the row count of every talent table afterwards (only for organizations seeded now). */
    public record Result(boolean ran, String skippedBecause, Map<String, Map<String, Long>> seeded) {
        static Result skipped(String why) {
            return new Result(false, why, Map.of());
        }
    }

    // ---- archetypes ----------------------------------------------------------------------------------------------------

    record Arch(String title, String department, String[] skills) {}

    private static Arch a(String title, String dept, String... skills) {
        return new Arch(title, dept, skills);
    }

    private static final List<Arch> ARCH = List.of(
        a("Senior React Developer", "Consulting", "React", "TypeScript", "Next.js", "Node.js", "AWS", "GraphQL"),
        a("Data Analyst", "Consulting", "SQL", "Python", "Tableau", "Power BI", "Excel", "Statistics"),
        a("Marketing Automation Specialist", "Marketing", "HubSpot", "Marketing", "Automation", "Salesforce", "SEO", "Analytics"),
        a("Project Manager", "Consulting", "Agile", "JIRA", "Program Management", "Scrum", "Risk Management", "Stakeholder Management"),
        a("UX/UI Designer", "Consulting", "Figma", "UI/UX", "Design Systems", "Prototyping", "User Research", "Accessibility"),
        a("Salesforce Consultant", "Consulting", "Salesforce", "Apex", "CRM", "LWC", "Integration", "Administration"),
        a("HR Business Partner", "HR", "HR", "People Ops", "Employee Relations", "Recruiting", "Compensation", "Onboarding"),
        a("DevOps Engineer", "Consulting", "AWS", "DevOps", "Kubernetes", "Terraform", "CI/CD", "Docker"),
        a("Full Stack Developer", "Consulting", "Java", "Spring Boot", "React", "MySQL", "REST", "Docker"),
        a("Cloud Engineer", "Consulting", "Cloud", "Azure", "AWS", "Networking", "Security", "Terraform"),
        a("Business Analyst", "Consulting", "Business Analysis", "Requirements", "SQL", "JIRA", "Process Mapping", "Visio"),
        a("QA Engineer", "Consulting", "Test Automation", "Selenium", "Cypress", "API Testing", "JIRA", "CI/CD"),
        a("Data Engineer", "Consulting", "Python", "Spark", "Airflow", "SQL", "Snowflake", "ETL"),
        a("Product Manager", "Consulting", "Roadmapping", "Agile", "Analytics", "Stakeholder Management", "UX", "SQL"),
        a("Finance Analyst", "Finance", "Financial Modeling", "Excel", "SQL", "Forecasting", "SAP", "Reporting"),
        a("Operations Manager", "Operations", "Operations", "Process Improvement", "Lean", "Vendor Management", "Budgeting", "Reporting")
    );

    private static final String[] FIRST = {
        "Aaliyah", "Adrian", "Akira", "Alana", "Amir", "Anaya", "Andre", "Beatriz", "Caleb", "Camila", "Carlos", "Chloe", "Dara", "Darius", "Elena", "Eli",
        "Esther", "Farah", "Felipe", "Gabriela", "Hamza", "Hannah", "Ibrahim", "Imani", "Isla", "Jamal", "Jin", "Joaquin", "Kai", "Keiko", "Khalid", "Lena",
        "Lucas", "Maya", "Mateo", "Mei", "Nadia", "Naveen", "Noor", "Olivia", "Omari", "Paloma", "Quentin", "Rania", "Rohan", "Sana", "Santiago", "Tariq",
        "Thalia", "Theo", "Uma", "Valeria", "Victor", "Wen", "Xavier", "Yara", "Yusuf", "Zainab", "Zane", "Zoe"
    };
    private static final String[] LAST = {
        "Abara", "Alvarez", "Andersson", "Banerjee", "Bianchi", "Castillo", "Chaudhry", "Delgado", "Dlamini", "Eriksen", "Farouk", "Fontaine", "Gallagher", "Hassan",
        "Hoang", "Ibarra", "Ito", "Jovanovic", "Kamara", "Kowalski", "Lindqvist", "Madrigal", "Mbeki", "Moreau", "Nakamura", "Novak", "Oyelaran", "Pereira",
        "Petrov", "Quinn", "Rahimi", "Rosales", "Salazar", "Sandoval", "Sato", "Singh", "Takahashi", "Tran", "Underwood", "Varga", "Vasquez", "Walker", "Whitlock",
        "Xu", "Yamamoto", "Yilmaz", "Zhou", "Zielinski", "Bergstrom", "Cardenas", "Dubois", "Egwu", "Frost", "Grewal", "Haddad", "Iyer", "Jansen", "Kaplan"
    };
    private static final String[][] CITIES = {
        { "New York, NY", "HYBRID" }, { "San Francisco, CA", "HYBRID" }, { "Austin, TX", "REMOTE" }, { "Seattle, WA", "HYBRID" }, { "Chicago, IL", "REMOTE" },
        { "Boston, MA", "REMOTE" }, { "Denver, CO", "HYBRID" }, { "Los Angeles, CA", "REMOTE" }, { "Atlanta, GA", "REMOTE" }, { "Dallas, TX", "ON_SITE" },
        { "Philadelphia, PA", "HYBRID" }, { "Raleigh, NC", "REMOTE" }, { "Minneapolis, MN", "HYBRID" }, { "Phoenix, AZ", "REMOTE" }, { "Charlotte, NC", "ON_SITE" }, { "Portland, OR", "REMOTE" }
    };
    private static final String[] EMPLOYERS = {
        "Northgate Systems", "Bluepeak Consulting", "Harbor Analytics", "Quillon Labs", "Evergreen Digital", "Sunrise Partners", "Redwood Technologies", "Meridian Group", "Kestrel Software", "Alder & Finch"
    };
    /** Application source labels in the Reports board's mix (LinkedIn 32, Company Website 24, Referral 18, Job Board 14, Recruiter 8, Other 4 percent). */
    private static final String[] SOURCES = weighted(new String[] { "LinkedIn", "Company Website", "Referral", "Job Board", "Recruiter", "Other" }, new int[] { 32, 24, 18, 14, 8, 4 });

    private static String[] weighted(String[] labels, int[] weights) {
        List<String> out = new ArrayList<>();
        for (int i = 0; i < labels.length; i++) for (int k = 0; k < weights[i]; k++) out.add(labels[i]);
        return out.toArray(new String[0]);
    }
    private static final String[] NOTES = {
        "Spoke with the hiring manager; positive feedback on the resume.", "Client asked for a shorter profile summary; updated and resent.",
        "Consultant confirmed availability and rate.", "Waiting on the vendor for the interview slots.", "Client liked the portfolio, asking about start date.",
        "Rate negotiation in progress; client budget is tight.", "Consultant prepared for the technical round with the marketing team."
    };
    private static final String[] ROUNDS = { "Phone Screen", "Technical Interview", "Client Interview", "Final Round", "Hiring Manager Chat" };

    // ---- collaborators -------------------------------------------------------------------------------------------------

    private final EnterpriseDemoSeeder base;
    private final OrganizationRepository orgs;
    private final OrgMemberRepository members;
    private final OrgGroupRepository groups;
    private final OrgRoleRepository roleRows;
    private final OrgMemberRoleRepository memberRoles;
    private final UserRepository users;
    private final AuthorityRepository authorities;
    private final PasswordEncoder passwordEncoder;

    /** Creates a marketer of a SEPARATE organization as an enterprise account (decision O4, S10); optional so the seeder can still be built by hand. */
    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private DemoEnterpriseAccounts enterpriseAccounts;
    private final ClientAccountRepository clientRepo;
    private final ClientContactRepository contactRepo;
    private final ConsultantProfileRepository consultantRepo;
    private final ConsultantSkillRepository skillRepo;
    private final MarketerCapacityRepository capacityRepo;
    private final MarketerAssignmentRepository assignmentRepo;
    private final ClientRequirementRepository requirementRepo;
    private final RequirementSkillRepository reqSkillRepo;
    private final RequirementMatchRepository matchRepo;
    private final OrgResumeRepository resumeRepo;
    private final OrgResumeExperienceRepository experienceRepo;
    private final TalentApplicationRepository applicationRepo;
    private final TalentApplicationEventRepository eventRepo;
    private final TalentApplicationNoteRepository noteRepo;
    private final TalentInterviewRepository interviewRepo;
    private final TalentPlacementRepository placementRepo;
    private final OrgSpendEntryRepository spendRepo;

    public TalentDemoSeeder(
        EnterpriseDemoSeeder base, OrganizationRepository orgs, OrgMemberRepository members, OrgGroupRepository groups, OrgRoleRepository roleRows,
        OrgMemberRoleRepository memberRoles, UserRepository users, AuthorityRepository authorities, PasswordEncoder passwordEncoder,
        ClientAccountRepository clientRepo, ClientContactRepository contactRepo, ConsultantProfileRepository consultantRepo, ConsultantSkillRepository skillRepo,
        MarketerCapacityRepository capacityRepo, MarketerAssignmentRepository assignmentRepo, ClientRequirementRepository requirementRepo,
        RequirementSkillRepository reqSkillRepo, RequirementMatchRepository matchRepo, OrgResumeRepository resumeRepo, OrgResumeExperienceRepository experienceRepo,
        TalentApplicationRepository applicationRepo, TalentApplicationEventRepository eventRepo, TalentApplicationNoteRepository noteRepo,
        TalentInterviewRepository interviewRepo, TalentPlacementRepository placementRepo, OrgSpendEntryRepository spendRepo
    ) {
        this.base = base;
        this.orgs = orgs;
        this.members = members;
        this.groups = groups;
        this.roleRows = roleRows;
        this.memberRoles = memberRoles;
        this.users = users;
        this.authorities = authorities;
        this.passwordEncoder = passwordEncoder;
        this.clientRepo = clientRepo;
        this.contactRepo = contactRepo;
        this.consultantRepo = consultantRepo;
        this.skillRepo = skillRepo;
        this.capacityRepo = capacityRepo;
        this.assignmentRepo = assignmentRepo;
        this.requirementRepo = requirementRepo;
        this.reqSkillRepo = reqSkillRepo;
        this.matchRepo = matchRepo;
        this.resumeRepo = resumeRepo;
        this.experienceRepo = experienceRepo;
        this.applicationRepo = applicationRepo;
        this.eventRepo = eventRepo;
        this.noteRepo = noteRepo;
        this.interviewRepo = interviewRepo;
        this.placementRepo = placementRepo;
        this.spendRepo = spendRepo;
    }

    /** The repositories are bare (no saveAll): save one by one, keeping order. IDENTITY keys, so ids are assigned on save. */
    private static <T> List<T> saveEach(java.util.function.UnaryOperator<T> save, Iterable<T> rows) {
        List<T> out = new ArrayList<>();
        for (T row : rows) out.add(save.apply(row));
        return out;
    }

    /** Same switches as the base demo seed. Null when the seed may run. */
    public String refusal() {
        return base.refusal();
    }

    @Transactional
    public Result seed() {
        String why = refusal();
        if (why != null) return Result.skipped(why);
        Map<String, Map<String, Long>> done = new LinkedHashMap<>();
        for (Spec spec : SPECS) {
            Organization org = orgs.findBySlug(spec.slug()).orElse(null);
            if (org == null) {
                LOG.debug("Talent demo seed: organization {} does not exist yet, skipped", spec.slug());
                continue;
            }
            User creator = org.getCreatedByUserId() == null ? null : users.findById(org.getCreatedByUserId()).orElse(null);
            if (creator == null || !EnterpriseDemoSeeder.isEnterpriseDemoLogin(creator.getLogin())) {
                LOG.warn("Talent demo seed: {} was not created by the enterprise demo; leaving it alone", spec.slug());
                continue;
            }
            if (consultantRepo.countByOrgId(org.getId()) > 0) continue; // already seeded: idempotent
            Map<String, Long> counts = new Gen(spec, org).run();
            done.put(spec.slug(), counts);
            LOG.info("Talent demo seeded for {}: {}", spec.slug(), counts);
        }
        return new Result(true, null, done);
    }

    // ---- the generator for one organization ----------------------------------------------------------------------------

    private final class Gen {
        final Spec spec;
        final Long orgId;
        final Random rnd;
        final Instant now = Instant.now();
        final LocalDate today = LocalDate.now(ZoneOffset.UTC);
        final String domain;

        final List<OrgMember> marketerSeats = new ArrayList<>();
        OrgMember accountManager;
        List<ClientAccount> clients = new ArrayList<>();
        Map<Long, List<ClientContact>> contactsByClient = new HashMap<>();
        List<ConsultantProfile> cons = new ArrayList<>();
        Map<Long, List<String>> skillsOf = new HashMap<>();
        Map<Long, Integer> archOf = new HashMap<>();
        Map<Long, OrgMember> marketerOf = new HashMap<>();
        List<ClientRequirement> jobs = new ArrayList<>();
        Map<Long, List<String>> jobSkills = new HashMap<>();
        Map<Long, Integer> jobPopularity = new HashMap<>();
        Map<String, RequirementMatch> matchByPair = new HashMap<>();
        Map<Long, List<OrgResume>> resumesOf = new HashMap<>();
        Map<Long, OrgResume> primaryOf = new HashMap<>();
        final Map<String, Long> counts = new LinkedHashMap<>();

        final Organization org;

        Gen(Spec spec, Organization org) {
            this.org = org;
            this.spec = spec;
            this.orgId = org.getId();
            this.rnd = new Random(spec.seed());
            this.domain = spec.orgKey() + ".example.com";
        }

        Map<String, Long> run() {
            seedMarketers(org);
            seedClients();
            seedConsultants(org);
            seedAssignments();
            seedJobs();
            seedMatches();
            seedResumes();
            seedApplications();
            seedPlacements();
            seedSpend();
            counts.put("consultant_profile", consultantRepo.countByOrgId(orgId));
            counts.put("consultant_skill", skillRepo.countByOrgId(orgId));
            counts.put("marketer_capacity", capacityRepo.countByOrgId(orgId));
            counts.put("marketer_assignment", assignmentRepo.countByOrgId(orgId));
            counts.put("client_account", clientRepo.countByOrgId(orgId));
            counts.put("client_contact", contactRepo.countByOrgId(orgId));
            counts.put("client_requirement", requirementRepo.countByOrgId(orgId));
            counts.put("requirement_skill", reqSkillRepo.countByOrgId(orgId));
            counts.put("requirement_match", matchRepo.countByOrgId(orgId));
            counts.put("org_resume", resumeRepo.countByOrgId(orgId));
            counts.put("org_resume_experience", experienceRepo.countByOrgId(orgId));
            counts.put("talent_application", applicationRepo.countByOrgId(orgId));
            counts.put("talent_application_event", eventRepo.countByOrgId(orgId));
            counts.put("talent_application_note", noteRepo.countByOrgId(orgId));
            counts.put("talent_interview", interviewRepo.countByOrgId(orgId));
            counts.put("talent_placement", placementRepo.countByOrgId(orgId));
            counts.put("org_spend_entry", spendRepo.countByOrgId(orgId));
            return counts;
        }

        // ---- small helpers ----

        Instant daysAgo(double d) {
            return now.minusSeconds((long) (d * 86400));
        }

        <T> T pick(List<T> l) {
            return l.get(rnd.nextInt(l.size()));
        }

        <T> T pick(T[] l) {
            return l[rnd.nextInt(l.length)];
        }

        int between(int lo, int hi) {
            return lo + rnd.nextInt(hi - lo + 1);
        }

        /** Largest-remainder split of total by weights. */
        int[] alloc(int total, int[] weights) {
            int sum = 0;
            for (int w : weights) sum += w;
            int[] out = new int[weights.length];
            double[] rem = new double[weights.length];
            int given = 0;
            for (int i = 0; i < weights.length; i++) {
                double exact = total * (double) weights[i] / sum;
                out[i] = (int) Math.floor(exact);
                rem[i] = exact - out[i];
                given += out[i];
            }
            while (given < total) {
                int best = 0;
                for (int i = 1; i < rem.length; i++) if (rem[i] > rem[best]) best = i;
                out[best]++;
                rem[best] = -1;
                given++;
            }
            return out;
        }

        /** Month start k months before the current month (k = 0 is this month). */
        LocalDate monthStart(int k) {
            return today.withDayOfMonth(1).minusMonths(k);
        }

        /** A random instant on a random day of the month k months back (this month: up to now), at a working hour. */
        Instant randomInMonth(int k) {
            LocalDate from = monthStart(k);
            LocalDate to = k == 0 ? today : from.plusMonths(1).minusDays(1);
            int span = (int) ChronoUnit.DAYS.between(from, to);
            LocalDate d = from.plusDays(span <= 0 ? 0 : rnd.nextInt(span + 1));
            Instant t = d.atStartOfDay().toInstant(ZoneOffset.UTC).plus(between(9, 17), ChronoUnit.HOURS).plus(rnd.nextInt(60), ChronoUnit.MINUTES);
            return t.isAfter(now) ? now.minus(between(1, 5), ChronoUnit.HOURS) : t;
        }

        LocalDate date(Instant t) {
            return t.atZone(ZoneOffset.UTC).toLocalDate();
        }

        // ---- marketers ----

        void seedMarketers(Organization org) {
            Authority userAuthority = authorities.findById(AuthoritiesConstants.USER).orElse(null);
            String hash = passwordEncoder.encode(UUID.randomUUID().toString());
            for (Marketer m : spec.marketers()) {
                String login = EnterpriseDemoSeeder.LOGIN_PREFIX + spec.orgKey() + "-" + m.key();
                String mail = m.first().toLowerCase() + "." + m.last().toLowerCase() + "@" + domain;
                // A SEPARATE organization's people are enterprise accounts (ent# login, org_id set), found by address inside that organization; a legacy SHARED one keeps its demo-login users.
                User u = org.isSeparateAccounts() && enterpriseAccounts != null
                    ? enterpriseAccounts.ensure(orgId, m.first(), m.last(), mail, UUID.randomUUID().toString())
                    : users.findOneByLogin(login).orElse(null);
                if (u == null) {
                    u = new User();
                    u.setLogin(login);
                    u.setFirstName(m.first());
                    u.setLastName(m.last());
                    u.setEmail(m.first().toLowerCase() + "." + m.last().toLowerCase() + "@" + domain);
                    u.setLangKey("en");
                    u.setActivated(true);
                    u.setPassword(hash);
                    if (userAuthority != null) u.setAuthorities(new HashSet<>(List.of(userAuthority)));
                    u = users.save(u);
                }
                List<OrgMember> live = members.findByOrgIdAndUserIdAndStatusIn(orgId, u.getId(), List.of(OrgMemberStatus.ACTIVE, OrgMemberStatus.SUSPENDED));
                OrgMember seat;
                if (live.isEmpty()) {
                    seat = new OrgMember();
                    seat.setOrgId(orgId);
                    seat.setUserId(u.getId());
                    seat.setRole(LegacyRoleMirror.toEnum(RoleTemplates.MARKETING_SPECIALIST).orElse(OrgRole.MEMBER));
                    seat.setStatus(OrgMemberStatus.ACTIVE);
                    seat.setJoinedAt(daysAgo(70 + rnd.nextInt(20)));
                    seat.setDisplayLabel(RoleTemplates.MARKETING_SPECIALIST);
                    seat.setTitle(m.title());
                    seat = members.saveAndFlush(seat);
                    var def = roleRows.findSystemByRoleKey(RoleTemplates.MARKETING_SPECIALIST);
                    if (def.isPresent()) {
                        OrgMemberRole r = new OrgMemberRole();
                        r.setOrgId(orgId);
                        r.setMemberId(seat.getId());
                        r.setRoleId(def.get().getId());
                        r.setPrimary(true);
                        r.setGrantedAt(Instant.now());
                        memberRoles.saveAndFlush(r);
                        seat.setPrimaryRoleId(def.get().getId());
                        members.save(seat);
                    }
                } else {
                    seat = live.get(0);
                }
                marketerSeats.add(seat);
                MarketerCapacity cap = new MarketerCapacity();
                cap.setOrgId(orgId);
                cap.setMemberId(seat.getId());
                cap.setCapacity(m.capacity());
                cap.setStatus("ACTIVE");
                cap.setTitleLabel(m.title());
                capacityRepo.save(cap);
            }
            String amLogin = EnterpriseDemoSeeder.LOGIN_PREFIX + spec.orgKey() + "-amara";
            User am = users.findOneByLogin(amLogin).orElse(null);
            if (am != null) accountManager = members.findByOrgIdAndUserIdAndStatusIn(orgId, am.getId(), List.of(OrgMemberStatus.ACTIVE)).stream().findFirst().orElse(null);
            if (accountManager == null) accountManager = marketerSeats.get(0);
        }

        OrgMember seatOf(int marketerIndex) {
            return marketerSeats.get(marketerIndex);
        }

        // ---- clients ----

        void seedClients() {
            for (ClientSpec cs : spec.clients()) {
                ClientAccount c = new ClientAccount();
                c.setOrgId(orgId);
                c.setKind(cs.name().equals("ACME Internal") ? "PARTNER" : "END_CLIENT");
                c.setName(cs.name());
                c.setIndustry(cs.industry());
                c.setWebsite("https://www." + cs.domain());
                c.setStatus("ACTIVE");
                c.setOwnerMemberId(accountManager.getId());
                c.setCreatedAt(daysAgo(150 + rnd.nextInt(60)));
                c.setUpdatedAt(daysAgo(rnd.nextInt(20)));
                clients.add(c);
            }
            clients = saveEach(clientRepo::save, clients);
            List<ClientContact> contacts = new ArrayList<>();
            for (int i = 0; i < clients.size(); i++) {
                ClientSpec cs = spec.clients().get(i);
                int idx = 0;
                for (String n : new String[] { cs.contactA(), cs.contactB() }) {
                    ClientContact cc = new ClientContact();
                    cc.setOrgId(orgId);
                    cc.setClientId(clients.get(i).getId());
                    cc.setName(n);
                    cc.setTitle(idx == 0 ? "Hiring Manager" : "Talent Partner");
                    cc.setRoleLabel(idx == 0 ? "HIRING_MANAGER" : "RECRUITER");
                    cc.setWorkEmail(n.toLowerCase().replace(' ', '.') + "@" + cs.domain());
                    cc.setStatus("ACTIVE");
                    cc.setCreatedAt(clients.get(i).getCreatedAt());
                    contacts.add(cc);
                    idx++;
                }
            }
            for (ClientContact cc : saveEach(contactRepo::save, contacts)) contactsByClient.computeIfAbsent(cc.getClientId(), k -> new ArrayList<>()).add(cc);
        }

        // ---- consultants ----

        void seedConsultants(Organization org) {
            Map<String, OrgMember> baseSeats = new HashMap<>();
            for (String key : new String[] { "anika", "ben", "sam" }) {
                User u = users.findOneByLogin(EnterpriseDemoSeeder.LOGIN_PREFIX + spec.orgKey() + "-" + key).orElse(null);
                if (u == null) continue;
                members.findByOrgIdAndUserIdAndStatusIn(orgId, u.getId(), List.of(OrgMemberStatus.ACTIVE, OrgMemberStatus.SUSPENDED)).stream().findFirst().ifPresent(s -> baseSeats.put(key, s));
            }
            Map<String, Long> deptIds = new HashMap<>();
            for (OrgGroup g : groups.findByOrgIdOrderBySortOrderAscNameAsc(orgId)) {
                if ("DEPARTMENT".equals(g.getKind().name())) deptIds.put(g.getName(), g.getId());
            }
            Set<String> usedNames = new HashSet<>();
            List<String[]> fixed = List.of(new String[] { "anika", "Anika", "Rao", "8", "AVAILABLE" }, new String[] { "ben", "Ben", "Okafor", "7", "ON_PROJECT" }, new String[] { "sam", "Sam", "Whitfield", "5", "UNAVAILABLE" });
            for (String mk : spec.marketers().stream().map(m -> m.first() + " " + m.last()).toList()) usedNames.add(mk);
            for (int i = 0; i < spec.consultants(); i++) {
                String first;
                String last;
                String fixedKey = null;
                String forcedAvail = null;
                int forcedYears = -1;
                if (spec.orgKey().equals("acme") && i < fixed.size() && baseSeats.containsKey(fixed.get(i)[0])) {
                    String[] f = fixed.get(i);
                    fixedKey = f[0];
                    first = f[1];
                    last = f[2];
                    forcedYears = Integer.parseInt(f[3]);
                    forcedAvail = f[4];
                } else {
                    do {
                        first = pick(FIRST);
                        last = pick(LAST);
                    } while (!usedNames.add(first + " " + last));
                }
                usedNames.add(first + " " + last);
                int archIdx = fixedKey != null ? (fixedKey.equals("anika") ? 8 : fixedKey.equals("ben") ? 7 : 3) : rnd.nextInt(ARCH.size());
                Arch arch = ARCH.get(archIdx);
                String[] city = pick(CITIES);
                ConsultantProfile c = new ConsultantProfile();
                c.setOrgId(orgId);
                if (fixedKey != null) c.setMemberId(baseSeats.get(fixedKey).getId());
                c.setDisplayName(first + " " + last);
                c.setEmail(first.toLowerCase() + "." + last.toLowerCase() + "@" + domain);
                c.setJobTitle(arch.title());
                c.setHeadline(arch.title() + " with a focus on " + arch.skills()[0] + " and " + arch.skills()[1]);
                c.setYearsExperience(forcedYears > 0 ? forcedYears : between(2, 14));
                c.setLocationLabel(city[0]);
                c.setWorkMode(city[1]);
                // created: 12 % in the last 30 days, 20 % in 30-90, the rest 90-240 days ago
                double r = rnd.nextDouble();
                double createdDays = r < 0.12 ? rnd.nextDouble() * 30 : r < 0.32 ? 30 + rnd.nextDouble() * 60 : 90 + rnd.nextDouble() * 150;
                if (i < 3 && fixedKey != null) createdDays = 120 + i * 10;
                c.setCreatedAt(daysAgo(createdDays));
                c.setUpdatedAt(daysAgo(rnd.nextDouble() * Math.min(createdDays, 20)));
                String avail = forcedAvail;
                if (avail == null) {
                    double x = rnd.nextDouble();
                    avail = x < 0.55 ? "ON_PROJECT" : x < 0.85 ? "AVAILABLE" : x < 0.93 ? "NOTICE" : "UNAVAILABLE";
                }
                c.setAvailabilityStatus(avail);
                c.setAvailabilitySince(date(daysAgo(Math.min(createdDays, 5 + rnd.nextInt(110)))));
                c.setMarketingStatus(avail.equals("AVAILABLE") ? "ACTIVE" : avail.equals("NOTICE") ? "PREPARING" : avail.equals("ON_PROJECT") ? "PAUSED" : "NOT_MARKETED");
                if (avail.equals("AVAILABLE")) c.setBenchSince(c.getAvailabilitySince());
                if (avail.equals("NOTICE")) c.setAvailableFrom(today.plusDays(between(14, 45)));
                double lx = rnd.nextDouble();
                String lic = lx < 0.78 ? "ACTIVE" : lx < 0.86 ? "EXPIRING" : lx < 0.93 ? "PENDING" : "NEEDS_REVIEW";
                c.setLicenseStatus(lic);
                if (lic.equals("ACTIVE")) c.setLicenseValidUntil(today.plusDays(between(60, 400)));
                else if (lic.equals("EXPIRING")) c.setLicenseValidUntil(today.plusDays(between(5, 30)));
                else if (lic.equals("NEEDS_REVIEW")) c.setLicenseValidUntil(today.plusDays(between(60, 200)));
                c.setHasCertifications(rnd.nextDouble() < 0.55);
                c.setHasPreferences(rnd.nextDouble() < 0.7);
                Long dept = deptIds.get(arch.department());
                if (dept == null) dept = deptIds.get("Consulting");
                c.setDepartmentGroupId(dept);
                c.setStatus("ACTIVE");
                c.setProfileCompleteness(0); // set below, once resumes are known
                cons.add(c);
            }
            cons = saveEach(consultantRepo::save, cons);
            List<ConsultantSkill> skillRows = new ArrayList<>();
            for (ConsultantProfile c : cons) {
                int archIdx = 0;
                for (int k = 0; k < ARCH.size(); k++) if (ARCH.get(k).title().equals(c.getJobTitle())) archIdx = k;
                archOf.put(c.getId(), archIdx);
                String[] sk = ARCH.get(archIdx).skills();
                int n = between(4, 6);
                List<String> chosen = new ArrayList<>();
                for (int k = 0; k < n; k++) {
                    ConsultantSkill s = new ConsultantSkill();
                    s.setOrgId(orgId);
                    s.setConsultantId(c.getId());
                    s.setSkill(sk[k]);
                    s.setPrimarySkill(k < 2);
                    s.setSortOrder(k);
                    skillRows.add(s);
                    chosen.add(sk[k]);
                }
                skillsOf.put(c.getId(), chosen);
            }
            saveEach(skillRepo::save, skillRows);
        }

        // ---- marketer assignments ----

        void seedAssignments() {
            // the pool of assignable consultants; Anika and Ben are pinned to Sarah and Omar (the base demo assignments)
            List<ConsultantProfile> pool = new ArrayList<>(cons);
            Collections.shuffle(pool, rnd);
            List<ConsultantProfile> unassigned = new ArrayList<>();
            for (ConsultantProfile c : new ArrayList<>(pool)) {
                if (unassigned.size() >= spec.unassigned()) break;
                if (c.getMemberId() != null && !isSam(c)) continue; // Anika and Ben stay assigned
                unassigned.add(c);
                pool.remove(c);
            }
            List<MarketerAssignment> rows = new ArrayList<>();
            int cursor = 0;
            for (int m = 0; m < spec.marketers().size(); m++) {
                Marketer mk = spec.marketers().get(m);
                List<ConsultantProfile> mine = new ArrayList<>();
                if (spec.orgKey().equals("acme") && m == 0) pool.stream().filter(c -> "Anika Rao".equals(c.getDisplayName())).findFirst().ifPresent(c -> { mine.add(c); });
                if (spec.orgKey().equals("acme") && m == 1) pool.stream().filter(c -> "Ben Okafor".equals(c.getDisplayName())).findFirst().ifPresent(c -> { mine.add(c); });
                pool.removeAll(mine);
                while (mine.size() < mk.workload() && !pool.isEmpty()) mine.add(pool.remove(0));
                for (ConsultantProfile c : mine) {
                    MarketerAssignment a = new MarketerAssignment();
                    a.setOrgId(orgId);
                    a.setConsultantId(c.getId());
                    a.setMarketerMemberId(seatOf(m).getId());
                    int b = rnd.nextInt(spec.marketers().size());
                    if (b != m) a.setBackupMemberId(seatOf(b).getId());
                    double p = rnd.nextDouble();
                    a.setPriority(p < 0.2 ? "HIGH" : p < 0.65 ? "MEDIUM" : "LOW");
                    a.setStatus(rnd.nextDouble() < 0.92 ? "ACTIVE" : "PAUSED");
                    double ad = rnd.nextDouble() < 0.22 ? rnd.nextDouble() * 30 : 30 + rnd.nextDouble() * 60;
                    Instant at = daysAgo(ad);
                    if (at.isBefore(c.getCreatedAt())) at = c.getCreatedAt().plus(1, ChronoUnit.HOURS);
                    a.setAssignedAt(at);
                    a.setAssignedByMemberId(seatOf(0).getId());
                    a.setLastActivityAt(daysAgo(rnd.nextDouble() * 14));
                    a.setUpdatedAt(a.getLastActivityAt());
                    rows.add(a);
                    marketerOf.put(c.getId(), seatOf(m));
                }
            }
            saveEach(assignmentRepo::save, rows);
        }

        boolean isSam(ConsultantProfile c) {
            return "Sam Whitfield".equals(c.getDisplayName());
        }

        // ---- jobs ----

        void seedJobs() {
            int n = spec.jobs();
            String[] base24 = {
                "OPEN", "OPEN", "OPEN", "OPEN", "OPEN", "IN_REVIEW", "OPEN", "OPEN", "OPEN", "OPEN", "IN_REVIEW", "ON_HOLD",
                "OPEN", "OPEN", "OPEN", "FILLED", "IN_REVIEW", "ON_HOLD", "OPEN", "FILLED", "FILLED", "FILLED", "CLOSED", "CLOSED"
            };
            String[] statuses = new String[n];
            for (int i = 0; i < n; i++) statuses[i] = base24[(int) (i * 24.0 / n)];
            int[] firstSix = alloc(n, new int[] { 6, 6, 6, 6 }); // 7 days / 30 days / 90 days / 180 days buckets
            List<ClientRequirement> rows = new ArrayList<>();
            int j = 0;
            for (int bucket = 0; bucket < 4; bucket++) {
                for (int q = 0; q < firstSix[bucket]; q++, j++) {
                    double days = bucket == 0 ? rnd.nextDouble() * 6.5 : bucket == 1 ? 8 + rnd.nextDouble() * 21 : bucket == 2 ? 31 + rnd.nextDouble() * 58 : 91 + rnd.nextDouble() * 85;
                    Arch arch = j == 0 ? ARCH.get(0) : ARCH.get((j * 5 + rnd.nextInt(3)) % ARCH.size());
                    ClientAccount client = j == 0 ? clients.get(0) : clients.get(j % clients.size());
                    String[] city = pick(CITIES);
                    ClientRequirement r = new ClientRequirement();
                    r.setOrgId(orgId);
                    r.setClientId(client.getId());
                    r.setContactId(contactsByClient.get(client.getId()).get(0).getId());
                    r.setTitle(arch.title());
                    r.setLocation(city[0]);
                    r.setWorkMode(city[1]);
                    double ex = rnd.nextDouble();
                    String emp = ex < 0.6 ? "CONTRACT" : ex < 0.9 ? "FTE" : "C2C";
                    r.setEmploymentLabel(emp);
                    r.setDurationLabel(emp.equals("FTE") ? "Permanent" : pick(new String[] { "6 months", "12 months", "9 months", "3 months" }));
                    r.setExperienceLevel(pick(new String[] { "SENIOR", "SENIOR", "MID", "LEAD" }));
                    if (emp.equals("FTE")) {
                        r.setRateUnit("YEAR");
                        long lo = between(90, 150) * 1000L;
                        r.setRateMinMinor(lo * 100);
                        r.setRateMaxMinor((lo + between(20, 45) * 1000L) * 100);
                    } else {
                        r.setRateUnit("HOUR");
                        long lo = between(55, 110);
                        r.setRateMinMinor(lo * 100);
                        r.setRateMaxMinor((lo + between(25, 55)) * 100);
                    }
                    r.setCurrency("USD");
                    r.setPositions(emp.equals("FTE") ? 1 : between(1, 3));
                    String st = statuses[j];
                    r.setStatus(st);
                    Instant posted = daysAgo(days);
                    r.setPostedAt(posted);
                    r.setCreatedAt(posted);
                    r.setOwnerMemberId(accountManager.getId());
                    r.setSource(pick(new String[] { "MANUAL", "EMAIL_PASTE", "MANUAL" }));
                    r.setFilled(st.equals("FILLED") ? r.getPositions() : 0);
                    if (st.equals("FILLED") || st.equals("CLOSED")) {
                        double closedDays = bucket == 2 ? 1 + rnd.nextDouble() * 25 : Math.max(1, days - (10 + rnd.nextDouble() * 50));
                        r.setClosedAt(daysAgo(Math.min(closedDays, days - 0.2)));
                    }
                    r.setUpdatedAt(r.getClosedAt() != null ? r.getClosedAt() : daysAgo(rnd.nextDouble() * Math.min(days, 10)));
                    r.setDescriptionText("We are looking for a " + arch.title() + " to join " + client.getName() + "'s " + client.getIndustry().toLowerCase()
                        + " team. You will work with a cross-functional group, own delivery of well-scoped features, and help shape the approach. Strong communication and hands-on experience with "
                        + arch.skills()[0] + " and " + arch.skills()[1] + " are expected.");
                    rows.add(r);
                }
            }
            jobs = saveEach(requirementRepo::save, rows);
            List<RequirementSkill> sk = new ArrayList<>();
            for (ClientRequirement r : jobs) {
                Arch arch = null;
                for (Arch a : ARCH) if (a.title().equals(r.getTitle())) arch = a;
                List<String> chosen = new ArrayList<>();
                int cnt = between(4, 6);
                for (int i = 0; i < cnt; i++) {
                    RequirementSkill s = new RequirementSkill();
                    s.setOrgId(orgId);
                    s.setRequirementId(r.getId());
                    s.setSkill(arch.skills()[i]);
                    s.setSortOrder(i);
                    sk.add(s);
                    chosen.add(arch.skills()[i]);
                }
                jobSkills.put(r.getId(), chosen);
                jobPopularity.put(r.getId(), 1 + rnd.nextInt(5) * rnd.nextInt(3) + (r.getStatus().equals("OPEN") ? 3 : 1));
            }
            saveEach(reqSkillRepo::save, sk);
        }

        // ---- matches ----

        int scoreOf(ConsultantProfile c, ClientRequirement r) {
            List<String> have = skillsOf.get(c.getId());
            List<String> need = jobSkills.get(r.getId());
            int overlap = 0;
            for (String s : need) if (have.contains(s)) overlap++;
            double frac = overlap / (double) need.size();
            int score = (int) Math.round(38 + 56 * frac + rnd.nextInt(7) - 3);
            return Math.max(30, Math.min(99, score));
        }

        void seedMatches() {
            List<RequirementMatch> rows = new ArrayList<>();
            for (ClientRequirement r : jobs) {
                List<RequirementMatch> forJob = new ArrayList<>();
                for (ConsultantProfile c : cons) {
                    if (c.getCreatedAt().isAfter(r.getPostedAt().plus(40, ChronoUnit.DAYS))) continue;
                    int s = scoreOf(c, r);
                    if (s < 70) continue;
                    RequirementMatch m = new RequirementMatch();
                    m.setOrgId(orgId);
                    m.setRequirementId(r.getId());
                    m.setConsultantId(c.getId());
                    m.setScore(s);
                    m.setReason("Matches " + overlapOf(c, r) + " of " + jobSkills.get(r.getId()).size() + " required skills");
                    m.setSource("RULE");
                    m.setStatus("SUGGESTED");
                    m.setCreatedAt(r.getPostedAt().plus(rnd.nextInt(6), ChronoUnit.HOURS));
                    forJob.add(m);
                }
                forJob.sort(Comparator.comparingInt(RequirementMatch::getScore).reversed());
                for (int i = 0; i < Math.min(14, forJob.size()); i++) rows.add(forJob.get(i));
            }
            for (RequirementMatch m : saveEach(matchRepo::save, rows)) matchByPair.put(m.getRequirementId() + ":" + m.getConsultantId(), m);
        }

        int overlapOf(ConsultantProfile c, ClientRequirement r) {
            int overlap = 0;
            for (String s : jobSkills.get(r.getId())) if (skillsOf.get(c.getId()).contains(s)) overlap++;
            return overlap;
        }

        // ---- resumes ----

        void seedResumes() {
            List<OrgResume> rows = new ArrayList<>();
            for (ConsultantProfile c : cons) {
                boolean recent = c.getCreatedAt().isAfter(daysAgo(20));
                if (rnd.nextDouble() > (recent ? 0.35 : 0.72)) continue;
                int copies = rnd.nextDouble() < 0.15 ? 2 : 1;
                for (int q = 0; q < copies; q++) {
                    Arch arch = ARCH.get(archOf.get(c.getId()));
                    OrgResume r = new OrgResume();
                    r.setOrgId(orgId);
                    r.setConsultantId(c.getId());
                    r.setMemberId(c.getMemberId());
                    String slug = c.getDisplayName().toLowerCase().replace(' ', '_');
                    r.setName(c.getDisplayName() + " Resume" + (q == 1 ? " (" + arch.skills()[0] + ")" : ""));
                    r.setFileName(slug + "_resume" + (q == 1 ? "_alt" : "") + ".pdf");
                    r.setTargetRole(q == 1 ? ARCH.get((archOf.get(c.getId()) + 1) % ARCH.size()).title() : arch.title());
                    double vx = rnd.nextDouble();
                    r.setVersionNo(vx < 0.35 ? 1 : vx < 0.6 ? 2 : vx < 0.85 ? 3 : 4);
                    double vis = rnd.nextDouble();
                    r.setVisibility(vis < 0.6 ? "INTERNAL" : vis < 0.88 ? "PUBLIC" : "PRIVATE");
                    boolean pending = rnd.nextDouble() < 0.14;
                    r.setApprovalStatus(pending ? "PENDING" : "APPROVED");
                    double createdDays = rnd.nextDouble() < 0.1 ? rnd.nextDouble() * 30 : 30 + rnd.nextDouble() * 150;
                    Instant created = daysAgo(createdDays);
                    if (created.isBefore(c.getCreatedAt())) created = c.getCreatedAt().plus(1, ChronoUnit.DAYS);
                    if (created.isAfter(now)) created = now.minus(2, ChronoUnit.HOURS);
                    r.setCreatedAt(created);
                    double upd = rnd.nextDouble() < 0.18 ? rnd.nextDouble() * 7 : rnd.nextDouble() * 85;
                    Instant updated = daysAgo(upd);
                    r.setUpdatedAt(updated.isBefore(created) ? created : updated);
                    OrgMember owner = marketerOf.get(c.getId());
                    r.setOwnerMemberId(owner != null ? owner.getId() : seatOf(0).getId());
                    if (!pending) {
                        r.setApprovedAt(created.plus(1, ChronoUnit.DAYS).isAfter(now) ? created : created.plus(1, ChronoUnit.DAYS));
                        r.setApprovedByMemberId(seatOf(0).getId());
                    }
                    r.setFileSizeKb(between(310, 1180));
                    r.setHeadline(arch.title());
                    r.setSummaryText(c.getYearsExperience() + " years as a " + arch.title() + ". Strong in " + arch.skills()[0] + ", " + arch.skills()[1] + " and " + arch.skills()[2]
                        + ". Known for clear communication and dependable delivery on client engagements.");
                    boolean primary = q == 0 && !pending && rnd.nextDouble() < 0.88;
                    r.setPrimaryForOrg(primary);
                    rows.add(r);
                }
            }
            rows = saveEach(resumeRepo::save, rows);
            List<OrgResumeExperience> exp = new ArrayList<>();
            for (OrgResume r : rows) {
                resumesOf.computeIfAbsent(r.getConsultantId(), k -> new ArrayList<>()).add(r);
                if (r.isPrimaryForOrg()) primaryOf.put(r.getConsultantId(), r);
                Arch arch = ARCH.get(archOf.get(r.getConsultantId()));
                int y = today.getYear();
                int jobsN = between(2, 3);
                for (int e = 0; e < jobsN; e++) {
                    OrgResumeExperience x = new OrgResumeExperience();
                    x.setOrgId(orgId);
                    x.setResumeId(r.getId());
                    x.setTitle((e == 0 ? "Senior " : e == 1 ? "" : "Junior ") + arch.title().replaceFirst("^Senior ", ""));
                    x.setEmployer(pick(EMPLOYERS));
                    int len = between(2, 5);
                    x.setStartYear(y - len);
                    x.setEndYear(e == 0 ? null : y);
                    x.setSortOrder(e);
                    y = y - len;
                    exp.add(x);
                }
            }
            saveEach(experienceRepo::save, exp);
            // profile completeness: basics + skills are always there; a resume, certifications and preferences add the rest
            for (ConsultantProfile c : cons) {
                int pc = 40 + (resumesOf.containsKey(c.getId()) ? 30 : 0) + (c.isHasCertifications() ? 15 : 0) + (c.isHasPreferences() ? 15 : 0) - rnd.nextInt(8);
                c.setProfileCompleteness(Math.min(100, pc + (resumesOf.containsKey(c.getId()) && c.isHasCertifications() && c.isHasPreferences() ? 8 : 0)));
            }
            saveEach(consultantRepo::save, cons);
        }

        // ---- applications, events, notes, interviews ----

        static final String[] STAGES = { "ASSIGNED", "SUBMITTED", "UNDER_REVIEW", "INTERVIEWING", "OFFER", "CLOSED" };

        void seedApplications() {
            int A = spec.apps();
            int[] stageCount = alloc(A, new int[] { 14, 22, 24, 26, 10, 24 });
            int closed = stageCount[5];
            int[] closedSplit = alloc(closed, new int[] { 10, 8, 4, 2 }); // HIRED, REJECTED, WITHDRAWN, NO_RESPONSE
            // the tokens, most advanced first; older applications get the more advanced ones
            List<String[]> tokens = new ArrayList<>(); // {stage, closedReason}
            String[] reasons = { "HIRED", "REJECTED", "WITHDRAWN", "NO_RESPONSE" };
            for (int r = 0; r < 4; r++) for (int i = 0; i < closedSplit[r]; i++) tokens.add(new String[] { "CLOSED", reasons[r] });
            for (int s = 4; s >= 0; s--) for (int i = 0; i < stageCount[s]; i++) tokens.add(new String[] { STAGES[s], null });
            // dates: per month bucket with a rising trend, oldest first
            int[] perMonth = alloc(A, new int[] { 6, 9, 12, 16, 22, 35 });
            List<Instant> dates = new ArrayList<>();
            for (int m = 0; m < 6; m++) for (int i = 0; i < perMonth[m]; i++) dates.add(randomInMonth(5 - m));
            Collections.sort(dates);
            for (int i = 0; i < tokens.size(); i++) { // light shuffle so it is not perfectly ordered
                if (rnd.nextDouble() < 0.3) Collections.swap(tokens, i, Math.max(0, Math.min(tokens.size() - 1, i + between(-6, 6))));
            }
            List<ConsultantProfile> assignable = new ArrayList<>();
            for (ConsultantProfile c : cons) if (marketerOf.containsKey(c.getId())) assignable.add(c);
            Set<String> pairs = new HashSet<>();
            record Draft(TalentApplication app, String stage, String reason, Instant created, ClientRequirement job, ConsultantProfile cons) {}
            List<Draft> drafts = new ArrayList<>();
            Map<Long, Integer> perJob = new HashMap<>();
            for (int i = 0; i < A; i++) {
                Instant created = dates.get(i);
                // a job open at that date, weighted by popularity
                List<ClientRequirement> open = new ArrayList<>();
                for (ClientRequirement r : jobs) {
                    if (r.getPostedAt().isAfter(created)) continue;
                    if (r.getClosedAt() != null && r.getClosedAt().isBefore(created)) continue;
                    open.add(r);
                }
                if (open.isEmpty()) open.addAll(jobs);
                ClientRequirement job = weightedJob(open);
                ConsultantProfile c = null;
                for (int attempt = 0; attempt < 60 && c == null; attempt++) {
                    List<RequirementMatch> ms = matchRepo.findByOrgIdAndRequirementIdOrderByScoreDesc(orgId, job.getId());
                    ConsultantProfile cand = null;
                    if (!ms.isEmpty() && rnd.nextDouble() < 0.85) {
                        RequirementMatch m = ms.get(rnd.nextInt(ms.size()));
                        cand = cons.stream().filter(x -> x.getId().equals(m.getConsultantId())).findFirst().orElse(null);
                    } else {
                        cand = pick(assignable);
                    }
                    if (cand == null || !marketerOf.containsKey(cand.getId()) || cand.getCreatedAt().isAfter(created)) continue;
                    if (!pairs.add(job.getId() + ":" + cand.getId())) continue;
                    c = cand;
                }
                if (c == null) { // fall back to any free pair
                    for (ClientRequirement j2 : jobs) {
                        for (ConsultantProfile cand : assignable) {
                            if (!cand.getCreatedAt().isAfter(created) && pairs.add(j2.getId() + ":" + cand.getId())) { job = j2; c = cand; break; }
                        }
                        if (c != null) break;
                    }
                }
                perJob.merge(job.getId(), 1, Integer::sum);
                String[] tk = tokens.get(i);
                TalentApplication app = new TalentApplication();
                app.setOrgId(orgId);
                app.setRequirementId(job.getId());
                app.setConsultantId(c.getId());
                app.setClientId(job.getClientId());
                OrgResume rs = primaryOf.get(c.getId());
                if (rs == null && resumesOf.containsKey(c.getId())) rs = resumesOf.get(c.getId()).get(0);
                if (rs != null) app.setResumeId(rs.getId());
                app.setMarketerMemberId(marketerOf.get(c.getId()).getId());
                app.setAppliedOn(date(created));
                app.setSourceLabel(pick(SOURCES));
                app.setCreatedAt(created);
                drafts.add(new Draft(app, tk[0], tk[1], created, job, c));
            }
            // codes by applied date, per year
            Map<Integer, Integer> seqByYear = new HashMap<>();
            drafts.sort(Comparator.comparing(Draft::created));
            for (Draft d : drafts) {
                int y = d.app().getAppliedOn().getYear();
                int n = seqByYear.merge(y, 1, Integer::sum);
                d.app().setCode(String.format("APP-%d-%03d", y, n));
                d.app().setStage("ASSIGNED");
                d.app().setStageChangedAt(d.created());
                d.app().setUpdatedAt(d.created());
            }
            // events, notes, stage walk
            List<Draft> interviewing = new ArrayList<>();
            Map<String, List<TalentApplicationEvent>> eventsOf = new HashMap<>();
            Map<String, List<TalentApplicationNote>> notesOf = new HashMap<>();
            for (Draft d : drafts) {
                TalentApplication app = d.app();
                int target = indexOf(d.stage());
                List<Integer> path = new ArrayList<>();
                if (d.stage().equals("CLOSED")) {
                    int via = d.reason().equals("HIRED") ? 4 : d.reason().equals("REJECTED") ? (rnd.nextBoolean() ? 2 : 3) : 1;
                    for (int s = 1; s <= via; s++) path.add(s);
                    path.add(5);
                } else {
                    for (int s = 1; s <= target; s++) path.add(s);
                }
                List<TalentApplicationEvent> evs = new ArrayList<>();
                evs.add(event(app, "CREATED", null, "ASSIGNED", marketerSeat(app), "Assigned to " + marketerName(app), d.created()));
                Instant t = d.created();
                String prev = "ASSIGNED";
                for (int s : path) {
                    Instant nt = t.plus(between(1, 6), ChronoUnit.DAYS).plus(rnd.nextInt(8), ChronoUnit.HOURS);
                    if (nt.isAfter(now.minus(30, ChronoUnit.MINUTES))) nt = t.plus(Math.max(1, ChronoUnit.MINUTES.between(t, now) / 2), ChronoUnit.MINUTES);
                    if (!nt.isAfter(t)) nt = t.plusSeconds(60);
                    evs.add(event(app, "STAGE_CHANGE", prev, STAGES[s], marketerSeat(app), s == 5 ? "Closed: " + d.reason().toLowerCase().replace('_', ' ') : null, nt));
                    prev = STAGES[s];
                    t = nt;
                }
                app.setStage(prev);
                app.setStageChangedAt(t);
                app.setUpdatedAt(t);
                if (prev.equals("CLOSED")) app.setClosedReason(d.reason());
                nextAction(app, prev);
                // notes
                List<TalentApplicationNote> ns = new ArrayList<>();
                if (rnd.nextDouble() < 0.6) {
                    int cnt = between(1, 3);
                    for (int q = 0; q < cnt; q++) {
                        long window = Math.max(1, ChronoUnit.MINUTES.between(d.created(), now) - 30);
                        Instant at = d.created().plus((long) (rnd.nextDouble() * window), ChronoUnit.MINUTES);
                        TalentApplicationNote note = new TalentApplicationNote();
                        note.setOrgId(orgId);
                        note.setAuthorMemberId(marketerSeat(app));
                        note.setBody(pick(NOTES));
                        note.setCreatedAt(at);
                        ns.add(note);
                        evs.add(event(app, "NOTE", null, null, marketerSeat(app), note.getBody(), at));
                    }
                }
                eventsOf.put(app.getCode(), evs);
                notesOf.put(app.getCode(), ns);
                if (prev.equals("INTERVIEWING")) interviewing.add(d);
            }
            List<TalentApplication> savedApps = saveEach(applicationRepo::save, drafts.stream().map(Draft::app).toList());
            Map<String, TalentApplication> byCode = new HashMap<>();
            for (TalentApplication a : savedApps) byCode.put(a.getCode(), a);
            List<TalentApplicationEvent> allEvents = new ArrayList<>();
            List<TalentApplicationNote> allNotes = new ArrayList<>();
            for (var e : eventsOf.entrySet()) for (TalentApplicationEvent ev : e.getValue()) { ev.setApplicationId(byCode.get(e.getKey()).getId()); allEvents.add(ev); }
            for (var e : notesOf.entrySet()) for (TalentApplicationNote n : e.getValue()) { n.setApplicationId(byCode.get(e.getKey()).getId()); allNotes.add(n); }
            saveEach(eventRepo::save, allEvents);
            saveEach(noteRepo::save, allNotes);
            // matches: every application pair is an ASSIGNED match; plus a few assigned-not-yet-applied
            List<RequirementMatch> touched = new ArrayList<>();
            for (Draft d : drafts) {
                String key = d.job().getId() + ":" + d.cons().getId();
                RequirementMatch m = matchByPair.get(key);
                if (m == null) {
                    m = new RequirementMatch();
                    m.setOrgId(orgId);
                    m.setRequirementId(d.job().getId());
                    m.setConsultantId(d.cons().getId());
                    m.setScore(scoreOf(d.cons(), d.job()));
                    m.setReason("Matches " + overlapOf(d.cons(), d.job()) + " of " + jobSkills.get(d.job().getId()).size() + " required skills");
                    m.setSource("RULE");
                    m.setCreatedAt(d.created());
                    matchByPair.put(key, m);
                }
                m.setStatus("ASSIGNED");
                m.setAssignedAt(d.created());
                m.setAssignedByMemberId(d.app().getMarketerMemberId());
                touched.add(m);
            }
            int extra = 0;
            for (RequirementMatch m : new ArrayList<>(matchByPair.values())) {
                if (extra >= Math.max(3, A / 10)) break;
                ClientRequirement job = jobs.stream().filter(j -> j.getId().equals(m.getRequirementId())).findFirst().orElse(null);
                if (m.getId() != null && "SUGGESTED".equals(m.getStatus()) && job != null && job.getStatus().equals("OPEN") && marketerOf.containsKey(m.getConsultantId()) && m.getScore() >= 80) {
                    m.setStatus("ASSIGNED");
                    m.setAssignedAt(daysAgo(rnd.nextDouble() * 20));
                    m.setAssignedByMemberId(marketerOf.get(m.getConsultantId()).getId());
                    touched.add(m);
                    extra++;
                }
            }
            saveEach(matchRepo::save, new ArrayList<>(new HashSet<>(touched)));
            seedInterviews(drafts.stream().map(d -> new Object[] { byCode.get(d.app().getCode()), d.job(), d.cons() }).toList(), byCode);
            // marketers' last activity follows their latest application event
            Map<Long, Instant> latest = new HashMap<>();
            for (TalentApplicationEvent ev : allEvents) {
                TalentApplication app = savedApps.stream().filter(a -> a.getId().equals(ev.getApplicationId())).findFirst().orElse(null);
                if (app != null) latest.merge(app.getConsultantId(), ev.getOccurredAt(), (x, y) -> x.isAfter(y) ? x : y);
            }
            List<MarketerAssignment> as = assignmentRepo.findByOrgId(orgId);
            for (MarketerAssignment ma : as) {
                Instant l = latest.get(ma.getConsultantId());
                if (l != null && (ma.getLastActivityAt() == null || l.isAfter(ma.getLastActivityAt()))) ma.setLastActivityAt(l);
            }
            saveEach(assignmentRepo::save, as);
            // hired consultants are on a project
            for (Draft d : drafts) {
                TalentApplication a = byCode.get(d.app().getCode());
                if ("HIRED".equals(a.getClosedReason())) {
                    d.cons().setAvailabilityStatus("ON_PROJECT");
                    d.cons().setMarketingStatus("PAUSED");
                    d.cons().setBenchSince(null);
                    d.cons().setAvailabilitySince(date(a.getStageChangedAt()));
                    hired.put(d.cons().getId(), new Object[] { a, d.job() });
                }
            }
            saveEach(consultantRepo::save, cons);
        }

        final Map<Long, Object[]> hired = new HashMap<>();

        ClientRequirement weightedJob(List<ClientRequirement> open) {
            int sum = 0;
            for (ClientRequirement r : open) sum += jobPopularity.getOrDefault(r.getId(), 2);
            int x = rnd.nextInt(Math.max(1, sum));
            for (ClientRequirement r : open) {
                x -= jobPopularity.getOrDefault(r.getId(), 2);
                if (x < 0) return r;
            }
            return open.get(0);
        }

        int indexOf(String stage) {
            for (int i = 0; i < STAGES.length; i++) if (STAGES[i].equals(stage)) return i;
            return 0;
        }

        Long marketerSeat(TalentApplication app) {
            return app.getMarketerMemberId();
        }

        String marketerName(TalentApplication app) {
            for (int i = 0; i < marketerSeats.size(); i++) if (marketerSeats.get(i).getId().equals(app.getMarketerMemberId())) return spec.marketers().get(i).first();
            return "a marketer";
        }

        TalentApplicationEvent event(TalentApplication app, String type, String from, String to, Long actor, String detail, Instant at) {
            TalentApplicationEvent e = new TalentApplicationEvent();
            e.setOrgId(orgId);
            e.setEventType(type);
            e.setFromStage(from);
            e.setToStage(to);
            e.setActorMemberId(actor);
            e.setDetail(detail == null ? null : detail.length() > 300 ? detail.substring(0, 300) : detail);
            e.setOccurredAt(at);
            return e;
        }

        void nextAction(TalentApplication app, String stage) {
            switch (stage) {
                case "ASSIGNED" -> { app.setNextAction("Prepare application"); app.setNextActionDue(today.plusDays(between(-3, 5))); }
                case "SUBMITTED" -> { app.setNextAction(pick(new String[] { "Send to client", "Follow up with client" })); app.setNextActionDue(today.plusDays(between(-4, 7))); }
                case "UNDER_REVIEW" -> { app.setNextAction(pick(new String[] { "Review application", "Client feedback" })); app.setNextActionDue(today.plusDays(between(-5, 10))); }
                case "INTERVIEWING" -> { app.setNextAction(pick(new String[] { "Schedule interview", "Interview round 2", "Prepare consultant" })); app.setNextActionDue(today.plusDays(between(-2, 12))); }
                case "OFFER" -> { app.setNextAction(pick(new String[] { "Prepare offer", "Negotiate terms", "Confirm start date" })); app.setNextActionDue(today.plusDays(between(-1, 9))); }
                default -> { app.setNextAction(null); app.setNextActionDue(null); }
            }
        }

        void seedInterviews(List<Object[]> triples, Map<String, TalentApplication> byCode) {
            List<TalentInterview> rows = new ArrayList<>();
            int upcomingUnderReview = 2;
            int pastBudget = 0;
            for (Object[] tr : triples) {
                TalentApplication a = (TalentApplication) tr[0];
                ClientRequirement job = (ClientRequirement) tr[1];
                ConsultantProfile c = (ConsultantProfile) tr[2];
                String contact = pick(contactsByClient.get(a.getClientId())).getName();
                String st = a.getStage();
                List<String> past = new ArrayList<>();
                boolean upcoming = false;
                switch (st) {
                    case "INTERVIEWING" -> { upcoming = true; if (rnd.nextDouble() < 0.5) past.add(ROUNDS[0]); }
                    case "UNDER_REVIEW" -> { if (upcomingUnderReview > 0) { upcoming = true; upcomingUnderReview--; } }
                    case "OFFER" -> { past.add(ROUNDS[0]); past.add(ROUNDS[3]); }
                    case "CLOSED" -> {
                        if ("HIRED".equals(a.getClosedReason())) { past.add(ROUNDS[0]); past.add(ROUNDS[3]); }
                        else if ("REJECTED".equals(a.getClosedReason())) past.add(ROUNDS[between(0, 2)]);
                    }
                    default -> { }
                }
                for (String round : past) {
                    int[] w = { 8, 11, 15, 19, 25, 22 };
                    int total = 100, x = rnd.nextInt(total), m = 0;
                    for (; m < 5; m++) { x -= w[m]; if (x < 0) break; }
                    Instant at = randomInMonth(5 - m);
                    if (at.isBefore(a.getCreatedAt().plus(1, ChronoUnit.HOURS))) at = a.getCreatedAt().plus(between(1, 72), ChronoUnit.HOURS);
                    if (at.isAfter(now.minus(2, ChronoUnit.HOURS))) at = now.minus(between(3, 48), ChronoUnit.HOURS);
                    if (at.isBefore(a.getCreatedAt())) at = a.getCreatedAt().plus(1, ChronoUnit.HOURS);
                    rows.add(interview(a, c, round, at, rnd.nextDouble() < 0.08 ? "CANCELLED" : "COMPLETED", contact));
                }
                if (upcoming) {
                    Instant at = now.plus(between(3, 13 * 24), ChronoUnit.HOURS);
                    LocalDate d = date(at);
                    at = d.atStartOfDay().toInstant(ZoneOffset.UTC).plus(between(9, 17), ChronoUnit.HOURS).plus(rnd.nextBoolean() ? 30 : 0, ChronoUnit.MINUTES);
                    if (!at.isAfter(now)) at = now.plus(5, ChronoUnit.HOURS);
                    rows.add(interview(a, c, past.isEmpty() ? ROUNDS[1] : ROUNDS[2], at, "SCHEDULED", contact));
                }
            }
            saveEach(interviewRepo::save, rows);
        }

        TalentInterview interview(TalentApplication a, ConsultantProfile c, String round, Instant at, String status, String interviewer) {
            TalentInterview i = new TalentInterview();
            i.setOrgId(orgId);
            i.setApplicationId(a.getId());
            i.setConsultantId(c.getId());
            i.setClientId(a.getClientId());
            i.setScheduledAt(at);
            i.setDurationMinutes(pick(new Integer[] { 30, 45, 60 }));
            i.setStatus(status);
            i.setRoundLabel(round);
            i.setInterviewerName(interviewer);
            Instant created = at.minus(between(2, 6), ChronoUnit.DAYS);
            i.setCreatedAt(created.isBefore(a.getCreatedAt()) ? a.getCreatedAt() : created);
            i.setUpdatedAt(status.equals("SCHEDULED") ? i.getCreatedAt() : at);
            return i;
        }

        // ---- placements ----

        void seedPlacements() {
            int[] monthWeights = { 4, 6, 9, 15, 24, 42 };
            List<ConsultantProfile> onProject = new ArrayList<>();
            List<ConsultantProfile> off = new ArrayList<>();
            for (ConsultantProfile c : cons) {
                if ("ON_PROJECT".equals(c.getAvailabilityStatus())) onProject.add(c);
                else if (c.getCreatedAt().isBefore(daysAgo(150)) && ("AVAILABLE".equals(c.getAvailabilityStatus()) || "NOTICE".equals(c.getAvailabilityStatus()))) off.add(c);
            }
            List<TalentPlacement> rows = new ArrayList<>();
            int[] alloc = alloc(onProject.size(), monthWeights);
            int idx = 0;
            List<Integer> monthOf = new ArrayList<>();
            for (int m = 0; m < 6; m++) for (int i = 0; i < alloc[m]; i++) monthOf.add(5 - m);
            Collections.shuffle(monthOf, rnd);
            for (ConsultantProfile c : onProject) {
                Object[] h = hired.get(c.getId());
                TalentPlacement p = new TalentPlacement();
                p.setOrgId(orgId);
                p.setConsultantId(c.getId());
                p.setRoleTitle(c.getJobTitle());
                p.setStatus("ACTIVE");
                Instant start;
                if (h != null) {
                    TalentApplication a = (TalentApplication) h[0];
                    ClientRequirement job = (ClientRequirement) h[1];
                    p.setClientId(a.getClientId());
                    p.setRequirementId(job.getId());
                    p.setRoleTitle(job.getTitle());
                    start = a.getStageChangedAt().plus(between(3, 10), ChronoUnit.DAYS);
                    if (start.isAfter(now)) start = a.getStageChangedAt();
                } else {
                    p.setClientId(clients.get(rnd.nextInt(clients.size())).getId());
                    start = randomInMonth(monthOf.get(idx % monthOf.size()));
                    idx++;
                }
                p.setStartDate(date(start));
                p.setRateUnit("HOUR");
                p.setBillRateMinor((long) between(55, 140) * 100);
                p.setCurrency("USD");
                p.setCreatedAt(start.isBefore(now) ? start : now);
                p.setUpdatedAt(p.getCreatedAt());
                rows.add(p);
            }
            Collections.shuffle(off, rnd);
            int ended = Math.min(off.size(), Math.max(4, spec.consultants() / 5));
            for (int i = 0; i < ended; i++) {
                ConsultantProfile c = off.get(i);
                TalentPlacement p = new TalentPlacement();
                p.setOrgId(orgId);
                p.setConsultantId(c.getId());
                p.setClientId(clients.get(rnd.nextInt(clients.size())).getId());
                p.setRoleTitle(c.getJobTitle());
                p.setStatus("ENDED");
                Instant start = randomInMonth(between(3, 5));
                if (start.isBefore(c.getCreatedAt())) start = c.getCreatedAt().plus(2, ChronoUnit.DAYS);
                Instant end = start.plus(between(40, 90), ChronoUnit.DAYS);
                if (end.isAfter(now.minus(7, ChronoUnit.DAYS))) end = now.minus(between(8, 25), ChronoUnit.DAYS);
                if (!end.isAfter(start)) end = start.plus(20, ChronoUnit.DAYS);
                p.setStartDate(date(start));
                p.setEndDate(date(end));
                p.setRateUnit("HOUR");
                p.setBillRateMinor((long) between(55, 140) * 100);
                p.setCurrency("USD");
                p.setCreatedAt(start);
                p.setUpdatedAt(end);
                rows.add(p);
            }
            saveEach(placementRepo::save, rows);
        }

        // ---- spend ----

        void seedSpend() {
            List<OrgSpendEntry> rows = new ArrayList<>();
            double[] g = { 0.89, 0.93, 0.95, 0.99, 0.96, 1.0 };
            for (int m = 0; m < 6; m++) {
                LocalDate ms = monthStart(5 - m);
                double f = g[m];
                rows.add(spend(ms, "CONSULTANT_LICENSES", Math.round(spec.spendBase() * 0.62 * f)));
                rows.add(spend(ms, "INFRA", Math.round(spec.spendBase() * 0.20 * (0.94 + 0.012 * m))));
                rows.add(spend(ms, "OTHER", Math.round(spec.spendBase() * 0.18 * (0.8 + rnd.nextDouble() * 0.35))));
            }
            saveEach(spendRepo::save, rows);
        }

        OrgSpendEntry spend(LocalDate month, String category, long minor) {
            OrgSpendEntry s = new OrgSpendEntry();
            s.setOrgId(orgId);
            s.setMonthStart(month);
            s.setCategory(category);
            s.setAmountMinor(minor);
            s.setCurrency("USD");
            s.setNote("demo ledger");
            s.setCreatedAt(month.atStartOfDay().toInstant(ZoneOffset.UTC));
            return s;
        }
    }
}
