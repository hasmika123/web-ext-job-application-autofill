package com.dossier.api.service.ent;

import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.Authority;
import com.dossier.api.domain.User;
import com.dossier.api.domain.ent.OrgAssignment;
import com.dossier.api.domain.ent.OrgBranding;
import com.dossier.api.domain.ent.OrgHostname;
import com.dossier.api.domain.ent.OrgMemberRole;
import com.dossier.api.domain.enumeration.AssignmentHealth;
import com.dossier.api.domain.enumeration.AssignmentKind;
import com.dossier.api.domain.enumeration.HostnameCertState;
import com.dossier.api.domain.enumeration.OrgHostnameKind;
import com.dossier.api.domain.enumeration.OrgHostnameStatus;
import com.dossier.api.domain.enumeration.OrgGroupKind;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.enumeration.OrgType;
import com.dossier.api.domain.org.OrgGroup;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.repository.AuthorityRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.OrgAssignmentRepository;
import com.dossier.api.repository.ent.OrgBrandingRepository;
import com.dossier.api.repository.ent.OrgHostnameRepository;
import com.dossier.api.repository.ent.OrgMemberRoleRepository;
import com.dossier.api.repository.ent.OrgRoleRepository;
import com.dossier.api.domain.org.OrgAuditEvent;
import com.dossier.api.repository.org.OrgAuditEventRepository;
import com.dossier.api.repository.org.OrgGroupRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import com.dossier.api.service.storage.FileStorage;
import com.dossier.api.service.storage.OrgStorageKeys;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.awt.Color;
import java.awt.Font;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.geom.RoundRectangle2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import javax.imageio.ImageIO;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Enterprise V2 demo tenants (X1.12): two fictional organizations a developer or QA can sign in to end to end on the real
 * stack, mirrored by {@code web/scripts/fixtures/enterprise.mjs} for the mock API.
 *
 * <ul>
 *   <li><b>Acme Staffing</b> (CONSULTANCY, host {@code acme.localhost}): published branding with a generated logo, every
 *       persona of the testing plan with real role rows (Sarah Chen is Org Admin plus Talent Marketing Manager), one
 *       suspended and one invited member, and two consultant assignments.</li>
 *   <li><b>Beta Talent</b> (COMPANY, host {@code beta.localhost}): different colours, one owner. It proves isolation.</li>
 * </ul>
 *
 * <p><b>It only runs when it is safe</b>, checked first on every call: {@code dossier.demo.enabled} (env DEMO_ENABLED) AND
 * {@code dossier.demo.enterprise-seed} (env ENT_DEMO_SEED), both default false, and the {@code prod} profile is NOT active.
 * Nothing else switches it on: no request, no admin setting.
 *
 * <p><b>Idempotent.</b> Everything is matched by slug, login, hostname or seat, so a second run creates nothing. The members are
 * real, activated {@code jhi_user} rows whose password is a random value generated per run that nobody is told: the only way in
 * is the one-click demo login ({@code POST /api/authenticate/demo} on the member's own tenant host). Logins start with
 * {@link #LOGIN_PREFIX}, which {@link com.dossier.api.service.DemoAccountService} treats as a demo account (the demo sandbox
 * rules and the DEMO_DISABLED refusal apply) and registration refuses.
 *
 * <p>Names are invented, addresses are on {@code example.com}, no date of birth and no numbers of any kind.
 */
@Service
public class EnterpriseDemoSeeder {

    private static final Logger LOG = LoggerFactory.getLogger(EnterpriseDemoSeeder.class);

    /** Every enterprise demo login starts with this; nothing else may. */
    public static final String LOGIN_PREFIX = "demo-ent-";

    public static final String ACME_SLUG = "demo-acme";
    public static final String BETA_SLUG = "demo-beta";
    public static final String ACME_HOST = "acme.localhost";
    public static final String BETA_HOST = "beta.localhost";

    /** One seeded person. {@code roles} are template keys, the first is the primary one. {@code status} ACTIVE, SUSPENDED or INVITED. */
    public record Person(String key, String first, String last, List<String> roles, OrgMemberStatus status) {
        public String login(String orgKey) {
            return LOGIN_PREFIX + orgKey + "-" + key;
        }

        public String email(String orgKey) {
            return first.toLowerCase() + "." + last.toLowerCase() + "@" + orgKey + ".example.com";
        }
    }

    /** One seeded organization. */
    public record Tenant(String orgKey, String slug, String name, OrgType type, String host, String primary, String secondary, String welcomeTitle, String welcomeMessage, String supportEmail, List<Person> people, boolean separate) {
        /** A legacy SHARED tenant (acme, beta): its people are synthetic demo-login accounts. */
        public Tenant(String orgKey, String slug, String name, OrgType type, String host, String primary, String secondary, String welcomeTitle, String welcomeMessage, String supportEmail, List<Person> people) {
            this(orgKey, slug, name, type, host, primary, secondary, welcomeTitle, welcomeMessage, supportEmail, people, false);
        }
    }

    private static Person p(String key, String first, String last, OrgMemberStatus status, String... roles) {
        return new Person(key, first, last, List.of(roles), status);
    }

    public static final Tenant ACME = new Tenant(
        "acme",
        ACME_SLUG,
        "Acme Staffing",
        OrgType.CONSULTANCY,
        ACME_HOST,
        "#1d5bd8",
        "#f59e0b",
        "Welcome to Acme Staffing",
        "Sign in to your consultant bench, placements and team workspace.",
        "support@acme.example.com",
        List.of(
            p("sarah", "Sarah", "Chen", OrgMemberStatus.ACTIVE, RoleTemplates.ORG_ADMIN, RoleTemplates.MARKETING_MANAGER),
            p("omar", "Omar", "Haddad", OrgMemberStatus.ACTIVE, RoleTemplates.MARKETING_SPECIALIST),
            p("anika", "Anika", "Rao", OrgMemberStatus.ACTIVE, RoleTemplates.CONSULTANT),
            p("ben", "Ben", "Okafor", OrgMemberStatus.ACTIVE, RoleTemplates.CONSULTANT),
            p("hana", "Hana", "Petrov", OrgMemberStatus.ACTIVE, RoleTemplates.HR_SPECIALIST),
            p("felix", "Felix", "Ng", OrgMemberStatus.ACTIVE, RoleTemplates.FINANCE_SPECIALIST),
            p("amara", "Amara", "Silva", OrgMemberStatus.ACTIVE, RoleTemplates.ACCOUNT_MANAGER),
            p("tomas", "Tomas", "Berg", OrgMemberStatus.ACTIVE, RoleTemplates.TALENT_ACQUISITION),
            p("eve", "Eve", "Lindqvist", OrgMemberStatus.ACTIVE, RoleTemplates.EXECUTIVE_VIEWER),
            p("sam", "Sam", "Whitfield", OrgMemberStatus.SUSPENDED, RoleTemplates.CONSULTANT),
            p("nina", "Nina", "Vogel", OrgMemberStatus.INVITED, RoleTemplates.CONSULTANT)
        )
    );

    public static final Tenant BETA = new Tenant(
        "beta",
        BETA_SLUG,
        "Beta Talent",
        OrgType.COMPANY,
        BETA_HOST,
        "#4338ca",
        "#ec4899",
        "Welcome to Beta Talent",
        "Sign in to your people workspace.",
        "help@beta.example.com",
        List.of(p("bea", "Bea", "Turner", OrgMemberStatus.ACTIVE, RoleTemplates.OWNER))
    );

    public static final List<Tenant> TENANTS = List.of(ACME, BETA);

    public static final String GAMMA_SLUG = "demo-gamma";
    public static final String GAMMA_HOST = "gamma.localhost";

    /** The login of the PERSONAL account that shares Dana's address (decision O4: the two accounts never meet). Not a demo login. */
    public static final String GAMMA_PERSONAL_LOGIN = "gamma-personal-dana";

    /**
     * Gamma Consulting: a SEPARATE organization (decision O4, docs/enterprise-v2/19 S10), host {@code gamma.localhost}. Every person is an
     * ENTERPRISE account of Gamma created through {@code UserService.createEnterpriseAccount} (login {@code ent#<orgId>#<email>}, signs in with the
     * address on the tenant host). Dana's address ALSO exists as a personal account ({@link #GAMMA_PERSONAL_LOGIN}) that is never touched or linked.
     * Deliberately NOT in {@link #TENANTS}: the other demo seeders walk acme and beta only, so Gamma changes none of their data.
     */
    public static final Tenant GAMMA = new Tenant(
        "gamma",
        GAMMA_SLUG,
        "Gamma Consulting",
        OrgType.CONSULTANCY,
        GAMMA_HOST,
        "#0f766e",
        "#f97316",
        "Welcome to Gamma Consulting",
        "Sign in to your Gamma account.",
        "support@gamma.example.com",
        List.of(
            p("gina", "Gina", "Alvarez", OrgMemberStatus.ACTIVE, RoleTemplates.OWNER),
            p("oscar", "Oscar", "Fraser", OrgMemberStatus.ACTIVE, RoleTemplates.ORG_ADMIN),
            p("marco", "Marco", "Bellini", OrgMemberStatus.ACTIVE, RoleTemplates.MARKETING_SPECIALIST),
            p("cora", "Cora", "Lindahl", OrgMemberStatus.ACTIVE, RoleTemplates.CONSULTANT),
            p("dana", "Dana", "Moreau", OrgMemberStatus.ACTIVE, RoleTemplates.CONSULTANT),
            p("hank", "Hank", "Osei", OrgMemberStatus.ACTIVE, RoleTemplates.HR_SPECIALIST)
        ),
        true
    );

    /** What {@link #seedSeparate()} did, for the log and the tests. */
    public record SeparateResult(boolean ran, String skippedBecause, int orgs, int accountsCreated, int seatsCreated) {}

    /** What a call did, for the log and the tests. */
    public record Result(boolean ran, String skippedBecause, int orgs, int usersCreated, int seatsCreated, int roleRowsCreated, int assignmentsCreated) {
        static Result skipped(String why) {
            return new Result(false, why, 0, 0, 0, 0, 0);
        }
    }

    private final OrganizationRepository orgs;
    private final OrgMemberRepository members;
    private final OrgGroupRepository groupRows;
    private final OrgHostnameRepository hostnames;
    private final OrgBrandingRepository brandings;
    private final OrgRoleRepository roleRows;
    private final OrgMemberRoleRepository memberRoles;
    private final OrgAssignmentRepository assignments;
    private final UserRepository users;
    private final AuthorityRepository authorities;
    private final AppSettingRepository settingRows;
    private final ResumeBuilderSettings settings;
    private final TenantResolver resolver;
    private final FileStorage storage;
    private final PasswordEncoder passwordEncoder;
    private final Environment environment;
    private final ObjectMapper mapper;
    private final boolean demoEnabled;
    private final boolean enterpriseSeed;

    /** Optional so the gate test can build the seeder by hand; the dashboard's Recent Activity feed reads what this writes. */
    @Autowired(required = false)
    private OrgAuditEventRepository auditRows;

    /** Optional for the same reason: only {@link #seedSeparate()} needs it. */
    @Autowired(required = false)
    private DemoEnterpriseAccounts enterpriseAccounts;

    /** The password of the Gamma demo people (dev databases only: the seed never runs under the prod profile). Override with {@code dossier.demo.separate-password}. */
    @Value("${dossier.demo.separate-password:Gamma-Demo-2026!}")
    private String separatePassword = "Gamma-Demo-2026!";

    public EnterpriseDemoSeeder(
        OrganizationRepository orgs,
        OrgMemberRepository members,
        OrgGroupRepository groupRows,
        OrgHostnameRepository hostnames,
        OrgBrandingRepository brandings,
        OrgRoleRepository roleRows,
        OrgMemberRoleRepository memberRoles,
        OrgAssignmentRepository assignments,
        UserRepository users,
        AuthorityRepository authorities,
        AppSettingRepository settingRows,
        ResumeBuilderSettings settings,
        TenantResolver resolver,
        FileStorage storage,
        PasswordEncoder passwordEncoder,
        Environment environment,
        ObjectMapper mapper,
        @Value("${dossier.demo.enabled:false}") boolean demoEnabled,
        @Value("${dossier.demo.enterprise-seed:false}") boolean enterpriseSeed
    ) {
        this.orgs = orgs;
        this.members = members;
        this.groupRows = groupRows;
        this.hostnames = hostnames;
        this.brandings = brandings;
        this.roleRows = roleRows;
        this.memberRoles = memberRoles;
        this.assignments = assignments;
        this.users = users;
        this.authorities = authorities;
        this.settingRows = settingRows;
        this.settings = settings;
        this.resolver = resolver;
        this.storage = storage;
        this.passwordEncoder = passwordEncoder;
        this.environment = environment;
        this.mapper = mapper;
        this.demoEnabled = demoEnabled;
        this.enterpriseSeed = enterpriseSeed;
    }

    /** Why the seed must not run right now, or null when it may. */
    public String refusal() {
        if (environment.acceptsProfiles(Profiles.of("prod"))) return "the prod profile is active";
        if (!demoEnabled) return "the demo is off (DEMO_ENABLED)";
        if (!enterpriseSeed) return "the enterprise demo seed is off (ENT_DEMO_SEED)";
        return null;
    }

    /** The tenant definition seeded under {@code slug}, if any. */
    public static Optional<Tenant> bySlug(String slug) {
        return TENANTS.stream().filter(t -> t.slug().equals(slug)).findFirst();
    }

    /** True for a login in the enterprise demo namespace. */
    public static boolean isEnterpriseDemoLogin(String login) {
        return login != null && login.trim().toLowerCase(java.util.Locale.ENGLISH).startsWith(LOGIN_PREFIX);
    }

    @Transactional
    public Result seed() {
        String why = refusal();
        if (why != null) {
            LOG.debug("Enterprise demo seed skipped: {}", why);
            return Result.skipped(why);
        }
        Authority userAuthority = authorities.findById(AuthoritiesConstants.USER).orElse(null);
        String passwordHash = passwordEncoder.encode(UUID.randomUUID().toString()); // random per run; nobody knows it
        Instant now = Instant.now();
        int[] counts = new int[4]; // users, seats, role rows, assignments
        Set<Long> orgIds = new LinkedHashSet<>();
        Map<String, Map<String, OrgMember>> seatsByOrg = new LinkedHashMap<>();
        Map<String, Organization> orgByKey = new LinkedHashMap<>();

        for (Tenant t : TENANTS) {
            Person first = t.people().get(0);
            User owner = syntheticUser(t, first, passwordHash, userAuthority, counts);
            Organization org = orgs.findBySlug(t.slug()).orElse(null);
            if (org != null && !owner.getId().equals(org.getCreatedByUserId())) {
                LOG.warn("An organization with the slug '{}' exists but the enterprise demo did not create it; leaving it alone", t.slug());
                continue;
            }
            if (org == null) org = createOrg(t, owner, now);
            orgIds.add(org.getId());
            orgByKey.put(t.orgKey(), org);
            ensureHostname(org, t.host(), now);
            ensureBranding(org, t, now);

            Map<String, OrgMember> seats = new LinkedHashMap<>();
            int index = 0;
            for (Person person : t.people()) {
                Instant joined = now.minus(60 - index * 3L, ChronoUnit.DAYS);
                if (person.status() == OrgMemberStatus.INVITED) {
                    invitedSeat(org, t, person, now.minus(2, ChronoUnit.DAYS), seats.get("sarah"), counts);
                } else {
                    User u = person == first ? owner : syntheticUser(t, person, passwordHash, userAuthority, counts);
                    seats.put(person.key(), seat(org, u, person, joined, counts));
                }
                index++;
            }
            seatsByOrg.put(t.orgKey(), seats);
            seedActivity(org, t, now);
        }

        assign(seatsByOrg.get("acme"), "sarah", "anika", AssignmentKind.PRIMARY, now, counts);
        assign(seatsByOrg.get("acme"), "omar", "ben", AssignmentKind.PRIMARY, now, counts);
        if (orgByKey.containsKey("acme") && seatsByOrg.containsKey("acme")) seedStructure(orgByKey.get("acme"), seatsByOrg.get("acme"));

        if (!orgIds.isEmpty()) {
            enableFlags(orgIds);
            ensureLocalBaseDomain();
        }
        settings.invalidate();
        resolver.invalidate();
        LOG.info("Enterprise demo seeded: {} orgs, {} users, {} seats, {} role rows, {} assignments created", orgIds.size(), counts[0], counts[1], counts[2], counts[3]);
        return new Result(true, null, orgIds.size(), counts[0], counts[1], counts[2], counts[3]);
    }

    /**
     * Seeds {@link #GAMMA}, the one SEPARATE-accounts demo organization (decision O4, doc 19 S10), under the same gate as {@link #seed()}.
     * Switches the platform setting {@code enterprise.separate_accounts} on (without it the tenant host would still authenticate personal
     * accounts), creates the organization with {@code account_mode = SEPARATE}, one ENTERPRISE account per person through
     * {@code UserService.createEnterpriseAccount} (stable demo password, never a demo login), their seats and roles, and a PERSONAL account that
     * shares Dana's address. It never touches acme, beta or any other organization, and never changes an existing organization's account mode.
     * Idempotent: a second run creates nothing. Run it after {@link #seed()} (it needs the system roles).
     */
    @Transactional
    public SeparateResult seedSeparate() {
        String why = refusal();
        if (why != null) return new SeparateResult(false, why, 0, 0, 0);
        if (enterpriseAccounts == null) return new SeparateResult(false, "the account factory is not available", 0, 0, 0);
        Tenant t = GAMMA;
        Instant now = Instant.now();
        int[] counts = new int[4]; // accounts, seats, role rows, assignments
        Organization org = orgs.findBySlug(t.slug()).orElse(null);
        Person first = t.people().get(0);
        if (org != null && !org.isSeparateAccounts()) {
            LOG.warn("The organization '{}' exists but is not SEPARATE; the separate-accounts demo leaves it alone", t.slug());
            return new SeparateResult(false, "the organization exists with another account mode", 0, 0, 0);
        }
        if (org == null) {
            org = createOrg(t, null, now);
        }
        User owner = separateAccount(org, first, counts);
        if (org.getCreatedByUserId() == null) {
            org.setCreatedByUserId(owner.getId());
            org = orgs.saveAndFlush(org);
        } else if (!owner.getId().equals(org.getCreatedByUserId())) {
            LOG.warn("An organization with the slug '{}' exists but the enterprise demo did not create it; leaving it alone", t.slug());
            return new SeparateResult(false, "the organization was not created by the demo", 0, 0, 0);
        }
        ensureHostname(org, t.host(), now);
        ensureBranding(org, t, now);
        Map<String, OrgMember> seats = new LinkedHashMap<>();
        int index = 0;
        for (Person person : t.people()) {
            User u = person == first ? owner : separateAccount(org, person, counts);
            seats.put(person.key(), seat(org, u, person, now.minus(40 - index * 3L, ChronoUnit.DAYS), counts));
            index++;
        }
        assign(seats, "marco", "cora", AssignmentKind.PRIMARY, now, counts);
        if (auditRows != null && auditRows.countByOrgId(org.getId()) == 0) {
            record(org, owner.getLogin(), OrgAuditService.ORG_CREATE, OrgAuditService.TARGET_ORG, null, now.minus(40, ChronoUnit.DAYS));
            record(org, owner.getLogin(), OrgAuditService.BRANDING_PUBLISH, OrgAuditService.TARGET_BRANDING, null, now.minus(39, ChronoUnit.DAYS));
        }
        samePersonalAccountAsDana(t, counts);
        write(EnterpriseSettingKeys.SEPARATE_ACCOUNTS, "true");
        enableFlags(Set.of(org.getId()));
        ensureLocalBaseDomain();
        settings.invalidate();
        resolver.invalidate();
        LOG.info("Separate-accounts demo seeded ({}): {} enterprise accounts, {} seats created", t.host(), counts[0], counts[1]);
        return new SeparateResult(true, null, 1, counts[0], counts[1]);
    }

    private User separateAccount(Organization org, Person p, int[] counts) {
        String email = p.email(GAMMA.orgKey());
        boolean existed = users.findOneByOrgIdAndEmailIgnoreCase(org.getId(), email).isPresent();
        User u = enterpriseAccounts.ensure(org.getId(), p.first(), p.last(), email, separatePassword);
        if (!existed) counts[0]++;
        return u;
    }

    /** A PERSONAL account (org_id null, kiwiply.com) with Dana's exact address: separate row, id, login and password; the organization never reads it. */
    private void samePersonalAccountAsDana(Tenant t, int[] counts) {
        Person dana = t.people().stream().filter(x -> x.key().equals("dana")).findFirst().orElseThrow();
        String email = dana.email(t.orgKey());
        if (users.findOneByOrgIdIsNullAndEmailIgnoreCase(email).isPresent()) return;
        User u = new User();
        u.setLogin(GAMMA_PERSONAL_LOGIN);
        u.setFirstName(dana.first());
        u.setLastName(dana.last());
        u.setEmail(email);
        u.setLangKey("en");
        u.setActivated(true);
        u.setPassword(passwordEncoder.encode(separatePassword));
        authorities.findById(AuthoritiesConstants.USER).ifPresent(a -> u.setAuthorities(new HashSet<>(List.of(a))));
        users.save(u);
        counts[0]++;
    }

    /**
     * A believable audit trail for the dashboard's Recent Activity feed: what an admin of this fictional organization did while
     * setting it up (rows dated back from today). Only when the organization has none yet, so a second run adds nothing and real
     * activity is never mixed with seeded rows. Details are left out: the feed shows who, what and to whom.
     */
    private void seedActivity(Organization org, Tenant t, Instant now) {
        if (auditRows == null || auditRows.countByOrgId(org.getId()) > 0) return;
        String admin = t.people().get(0).login(t.orgKey());
        record(org, admin, OrgAuditService.ORG_CREATE, OrgAuditService.TARGET_ORG, null, now.minus(60, ChronoUnit.DAYS));
        record(org, admin, OrgAuditService.BRANDING_PUBLISH, OrgAuditService.TARGET_BRANDING, null, now.minus(59, ChronoUnit.DAYS));
        if (!t.orgKey().equals("acme")) return;
        String omar = t.people().get(1).login(t.orgKey());
        record(org, admin, OrgAuditService.MEMBER_INVITE, OrgAuditService.TARGET_MEMBER, t.people().get(2).login(t.orgKey()), now.minus(45, ChronoUnit.DAYS));
        record(org, admin, OrgAuditService.MEMBER_INVITE, OrgAuditService.TARGET_MEMBER, t.people().get(3).login(t.orgKey()), now.minus(40, ChronoUnit.DAYS));
        record(org, admin, OrgAuditService.MEMBER_ROLE, OrgAuditService.TARGET_MEMBER, omar, now.minus(30, ChronoUnit.DAYS));
        record(org, admin, OrgAuditService.ASSIGNMENT_CREATE, OrgAuditService.TARGET_MEMBER, t.people().get(2).login(t.orgKey()), now.minus(28, ChronoUnit.DAYS));
        record(org, omar, OrgAuditService.ASSIGNMENT_CREATE, OrgAuditService.TARGET_MEMBER, t.people().get(3).login(t.orgKey()), now.minus(27, ChronoUnit.DAYS));
        record(org, admin, OrgAuditService.MEMBER_SUSPEND, OrgAuditService.TARGET_MEMBER, t.people().get(9).login(t.orgKey()), now.minus(6, ChronoUnit.DAYS));
        record(org, admin, OrgAuditService.MEMBER_INVITE, OrgAuditService.TARGET_MEMBER, null, now.minus(2, ChronoUnit.DAYS));
    }

    private void record(Organization org, String actorLogin, String action, String targetType, String targetLogin, Instant at) {
        OrgAuditEvent e = new OrgAuditEvent();
        e.setOrgId(org.getId());
        e.setActorLogin(actorLogin);
        e.setActorRole("ADMIN");
        e.setAction(action);
        e.setTargetType(targetType);
        e.setTargetLogin(targetLogin);
        e.setCreatedAt(at);
        auditRows.save(e);
    }

    // ---- pieces ---------------------------------------------------------------------------------------------------

    private Organization createOrg(Tenant t, User owner, Instant now) {
        Organization org = new Organization();
        if (t.separate()) org.setAccountMode(com.dossier.api.domain.enumeration.OrgAccountMode.SEPARATE);
        org.setSlug(t.slug());
        org.setName(t.name());
        org.setDisplayName(t.name());
        org.setType(t.type());
        org.setStatus(OrgStatus.ACTIVE);
        org.setSizeBand("11_50");
        org.setCountry("US");
        org.setTimezone("America/Chicago");
        org.setCreatedByUserId(owner == null ? null : owner.getId()); // a SEPARATE organization exists before its owner's account (the account carries org_id)
        org.setSetupFeePaidAt(now.minus(60, ChronoUnit.DAYS)); // a demo: nothing was charged
        org.setSubdomain(t.orgKey());
        org.setSubdomainEnabled(true);
        return orgs.saveAndFlush(org);
    }

    private void ensureHostname(Organization org, String host, Instant now) {
        if (hostnames.findLiveByOrgIdAndHostname(org.getId(), host).isPresent()) return;
        OrgHostname h = new OrgHostname();
        h.setOrgId(org.getId());
        h.setHostname(host);
        h.setKind(OrgHostnameKind.SUBDOMAIN);
        h.setStatus(OrgHostnameStatus.ACTIVE);
        h.setPrimary(true);
        h.setVerifiedAt(now);
        h.setActivatedAt(now);
        h.setCertState(HostnameCertState.NONE);
        hostnames.saveAndFlush(h);
    }

    /** Published branding (colours, welcome copy, support address and a generated logo through the FileStorage seam). */
    private void ensureBranding(Organization org, Tenant t, Instant now) {
        OrgBranding b = brandings.findByOrgId(org.getId()).orElse(null);
        if (b != null && b.getPublishedAt() != null && b.getLogoKey() != null) return;
        if (b == null) {
            b = new OrgBranding();
            b.setOrgId(org.getId());
        }
        byte[] png = logo(t);
        String key = OrgStorageKeys.brandingKey(org.getId(), "logo", sha(png).substring(0, 12), "png");
        storage.store(key, png, "image/png");
        b.setLogoKey(key);
        b.setPrimaryColor(t.primary());
        b.setSecondaryColor(t.secondary());
        b.setWelcomeTitle(t.welcomeTitle());
        b.setWelcomeMessage(t.welcomeMessage());
        b.setSupportEmail(t.supportEmail());
        b.setPublishedAt(now);
        b.setDraftJson(null);
        brandings.saveAndFlush(b);
        org.setConfigVersion(org.getConfigVersion() + 1);
        orgs.saveAndFlush(org);
    }

    /** A 256 px rounded square in the tenant's primary colour with its initial; generated, so no binary asset ships. */
    static byte[] logo(Tenant t) {
        try {
            BufferedImage img = new BufferedImage(256, 256, BufferedImage.TYPE_INT_ARGB);
            Graphics2D g = img.createGraphics();
            g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
            g.setColor(Color.decode(t.primary()));
            g.fill(new RoundRectangle2D.Float(8, 8, 240, 240, 56, 56));
            g.setColor(Color.decode(t.secondary()));
            g.fill(new RoundRectangle2D.Float(150, 150, 98, 98, 40, 40));
            g.setColor(Color.WHITE);
            g.setFont(new Font(Font.SANS_SERIF, Font.BOLD, 132));
            String initial = t.name().substring(0, 1);
            int w = g.getFontMetrics().stringWidth(initial);
            g.drawString(initial, (256 - w) / 2 - 10, 168);
            g.dispose();
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            ImageIO.write(img, "png", out);
            return out.toByteArray();
        } catch (Exception e) {
            throw new IllegalStateException("could not draw the demo logo", e);
        }
    }

    private static String sha(byte[] bytes) {
        try {
            byte[] d = MessageDigest.getInstance("SHA-256").digest(bytes);
            StringBuilder sb = new StringBuilder();
            for (byte x : d) sb.append(String.format("%02x", x));
            return sb.toString();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private User syntheticUser(Tenant t, Person p, String passwordHash, Authority userAuthority, int[] counts) {
        String login = p.login(t.orgKey());
        User existing = users.findOneByLogin(login).orElse(null);
        if (existing != null) {
            existing.setPassword(passwordHash); // a fresh random secret per boot, never shown
            existing.setActivated(true);
            return users.save(existing);
        }
        User u = new User();
        u.setLogin(login);
        u.setFirstName(p.first());
        u.setLastName(p.last());
        u.setEmail(p.email(t.orgKey()));
        u.setLangKey("en");
        u.setActivated(true);
        u.setPassword(passwordHash);
        if (userAuthority != null) u.setAuthorities(new HashSet<>(List.of(userAuthority)));
        counts[0]++;
        return users.save(u);
    }

    /** The legacy enum a template mirrors to, so the seat and its role rows agree (the mirror rule of X1.6). */
    private static OrgRole legacyRole(String primaryTemplate) {
        return LegacyRoleMirror.toEnum(primaryTemplate).orElse(OrgRole.MEMBER);
    }

    private OrgMember seat(Organization org, User user, Person person, Instant joinedAt, int[] counts) {
        List<OrgMember> live = members.findByOrgIdAndUserIdAndStatusIn(org.getId(), user.getId(), List.of(OrgMemberStatus.ACTIVE, OrgMemberStatus.SUSPENDED));
        OrgMember m;
        if (live.isEmpty()) {
            m = new OrgMember();
            m.setOrgId(org.getId());
            m.setUserId(user.getId());
            m.setRole(legacyRole(person.roles().get(0)));
            m.setStatus(person.status());
            m.setJoinedAt(joinedAt);
            m.setDisplayLabel(person.roles().get(0));
            m = members.saveAndFlush(m);
            counts[1]++;
        } else {
            m = live.get(0);
        }
        applyRoles(org.getId(), m, person.roles(), counts);
        return m;
    }

    /** The member's live role rows: the primary and any others, created only when missing. */
    private void applyRoles(Long orgId, OrgMember seat, List<String> templateKeys, int[] counts) {
        List<OrgMemberRole> live = memberRoles.findLiveByOrgIdAndMemberId(orgId, seat.getId());
        Set<Long> have = new HashSet<>();
        for (OrgMemberRole r : live) have.add(r.getRoleId());
        boolean first = live.stream().noneMatch(OrgMemberRole::isPrimary);
        for (String key : templateKeys) {
            var def = roleRows.findSystemByRoleKey(key);
            if (def.isEmpty()) {
                LOG.warn("system role {} is not seeded; the demo member {} has no row for it", key, seat.getId());
                continue;
            }
            if (have.contains(def.get().getId())) {
                first = false;
                continue;
            }
            OrgMemberRole row = new OrgMemberRole();
            row.setOrgId(orgId);
            row.setMemberId(seat.getId());
            row.setRoleId(def.get().getId());
            row.setPrimary(first);
            row.setGrantedAt(Instant.now());
            memberRoles.saveAndFlush(row);
            counts[2]++;
            if (first) {
                seat.setPrimaryRoleId(def.get().getId());
                members.save(seat);
            }
            first = false;
        }
    }

    private void invitedSeat(Organization org, Tenant t, Person p, Instant invitedAt, OrgMember inviter, int[] counts) {
        String email = p.email(t.orgKey());
        List<OrgMember> existing = members.findByOrgIdAndInviteEmailAndStatusIn(org.getId(), email, List.of(OrgMemberStatus.INVITED));
        if (!existing.isEmpty()) {
            // a database seeded before the Invitations page: give the seat what the page lists (a send time, a name, who sent it)
            OrgMember m = existing.get(0);
            if (m.getInviteSentAt() == null) {
                stampInvitation(m, p, invitedAt, inviter);
                members.saveAndFlush(m);
            }
            return;
        }
        OrgMember m = new OrgMember();
        m.setOrgId(org.getId());
        m.setRole(legacyRole(p.roles().get(0)));
        m.setStatus(OrgMemberStatus.INVITED);
        m.setInviteEmail(email);
        m.setInviteExpiresAt(invitedAt.plus(14, ChronoUnit.DAYS));
        m.setDisplayLabel(p.roles().get(0));
        stampInvitation(m, p, invitedAt, inviter);
        m = members.saveAndFlush(m);
        counts[1]++;
        applyRoles(org.getId(), m, p.roles(), counts); // an invitation holds its role row too (06 section 4: one primary per live seat)
    }

    /** What the Invitations page lists an invited seat by: when it was sent, to whom (by name), and by whom. No token: the demo link is never sent. */
    private static void stampInvitation(OrgMember m, Person p, Instant invitedAt, OrgMember inviter) {
        m.setInviteSentAt(invitedAt);
        m.setInviteName(p.first() + " " + p.last());
        if (inviter != null) m.setInvitedByMemberId(inviter.getId());
    }

    private void assign(Map<String, OrgMember> seats, String assigneeKey, String consultantKey, AssignmentKind kind, Instant now, int[] counts) {
        if (seats == null) return;
        OrgMember assignee = seats.get(assigneeKey);
        OrgMember consultant = seats.get(consultantKey);
        if (assignee == null || consultant == null) return;
        if (assignments.countEffective(assignee.getOrgId(), consultant.getId(), List.of(assignee.getId()), List.of(kind), now) > 0) return;
        OrgAssignment x = new OrgAssignment();
        x.setOrgId(assignee.getOrgId());
        x.setAssigneeMemberId(assignee.getId());
        x.setConsultantMemberId(consultant.getId());
        x.setKind(kind);
        x.setStartsAt(now.minus(30, ChronoUnit.DAYS));
        x.setHealth(AssignmentHealth.OK);
        x.setReason("demo seed");
        x.setCreatedByMemberId(assignee.getId());
        assignments.saveAndFlush(x);
        counts[3]++;
    }

    // ---- departments and teams (X4.5) -------------------------------------------------------------------------------

    /** One seeded department: name, picker icon and colour, lead (a person key), people (person keys) and its teams. */
    record DemoDepartment(String name, String icon, String color, String lead, List<String> people, List<DemoTeam> teams) {}

    record DemoTeam(String name, String icon, String color, String lead, List<String> people) {}

    /** Acme's structure, drawn from the seeded people. Names are invented; a person appears in at most one department. */
    static final List<DemoDepartment> ACME_STRUCTURE = List.of(
        new DemoDepartment("Consulting", "briefcase", "primary", "amara", List.of("amara", "sam", "nina"), List.of(new DemoTeam("Bench East", "users", "info", "anika", List.of("anika", "ben")))),
        new DemoDepartment("Marketing", "rocket", "secondary", "sarah", List.of("sarah"), List.of(new DemoTeam("Talent Marketing", "lightbulb", "warning", "omar", List.of("omar")))),
        new DemoDepartment("HR", "users", "info", "hana", List.of("hana"), List.of(new DemoTeam("People Operations", "heart", "danger", "tomas", List.of("tomas")))),
        new DemoDepartment("Finance", "dollar", "success", "felix", List.of("felix"), List.of()),
        new DemoDepartment("Operations", "building", "neutral", "eve", List.of("eve"), List.of())
    );

    /**
     * Creates Acme's departments and teams, with leads and placed people, the first time (a group that already exists is left exactly as
     * it is, so a person moved or a lead changed in a later session is never put back). Nina is an invited seat: she is placed through
     * her invite email. Idempotent.
     */
    private void seedStructure(Organization org, Map<String, OrgMember> seats) {
        Long orgId = org.getId();
        OrgMember nina = members.findByOrgIdAndInviteEmailAndStatusIn(orgId, "nina.vogel@acme.example.com", List.of(OrgMemberStatus.INVITED)).stream().findFirst().orElse(null);
        Map<String, OrgMember> all = new LinkedHashMap<>(seats);
        if (nina != null) all.put("nina", nina);
        int created = 0;
        int order = 0;
        for (DemoDepartment d : ACME_STRUCTURE) {
            OrgGroup dept = createDemoGroup(orgId, d.name(), OrgGroupKind.DEPARTMENT, null, d.icon(), d.color(), all.get(d.lead()), order++);
            boolean deptNew = dept != null;
            if (deptNew) created++;
            else dept = findGroup(orgId, d.name());
            if (dept == null) continue;
            if (deptNew) {
                for (String key : d.people()) {
                    OrgMember m = all.get(key);
                    if (m != null && m.getDepartmentGroupId() == null) {
                        m.setDepartmentGroupId(dept.getId());
                        members.saveAndFlush(m);
                    }
                }
            }
            for (DemoTeam t : d.teams()) {
                OrgGroup team = createDemoGroup(orgId, t.name(), OrgGroupKind.TEAM, dept.getId(), t.icon(), t.color(), all.get(t.lead()), order++);
                if (team == null) continue;
                created++;
                for (String key : t.people()) {
                    OrgMember m = all.get(key);
                    if (m != null && m.getTeamGroupId() == null) {
                        m.setTeamGroupId(team.getId());
                        m.setDepartmentGroupId(dept.getId());
                        members.saveAndFlush(m);
                    }
                }
            }
        }
        if (created > 0) LOG.info("Enterprise demo structure: {} departments and teams created for {}", created, org.getSlug());
    }

    private OrgGroup findGroup(Long orgId, String name) {
        return groupRows.findByOrgIdOrderBySortOrderAscNameAsc(orgId).stream().filter(g -> g.getName().equalsIgnoreCase(name)).findFirst().orElse(null);
    }

    /** The new group, or null when one of that name already exists. */
    private OrgGroup createDemoGroup(Long orgId, String name, OrgGroupKind kind, Long parentId, String icon, String color, OrgMember lead, int order) {
        if (groupRows.existsByOrgIdAndName(orgId, name)) return null;
        OrgGroup g = new OrgGroup();
        g.setOrgId(orgId);
        g.setName(name);
        g.setKind(kind);
        g.setParentGroupId(parentId);
        g.setIcon(icon);
        g.setColor(color);
        g.setSortOrder(order);
        if (lead != null && lead.getStatus() == OrgMemberStatus.ACTIVE) g.setLeadMemberId(lead.getId());
        return groupRows.saveAndFlush(g);
    }

    // ---- settings ---------------------------------------------------------------------------------------------------

    /**
     * Switches the enterprise flags on for the demo organizations through the same registry rows the flags read. A flag an admin
     * already turned on for everyone is left alone; otherwise the demo organizations are added to its allow list, so the
     * programme stays dark for every other organization on a shared dev database.
     *
     * <p>Which flags: every LIVE {@code flag.enterprise*} key of the registry ({@link EnterpriseSettingKeys#all()}), so a story that
     * promotes a module flag from {@link EnterpriseSettingKeys#deferred()} to live lights it for the demo organizations with no
     * edit here. A deferred flag is never written: it is not registered, nothing reads it, and a row for it would only fake a module
     * whose pages and APIs do not exist yet (billing, hrFinance, integrations, analytics and extensionWorkspaces at the time of writing).
     */
    private void enableFlags(Set<Long> orgIds) {
        for (String key : liveEnterpriseFlagKeys()) {
            ObjectNode flag = mapper.createObjectNode();
            JsonNode current = settingRows.findById(key).map(r -> parse(r.getValue())).orElse(null);
            Set<Long> allow = new LinkedHashSet<>();
            if (current != null && current.isObject() && current.path("on").asBoolean(false)) {
                JsonNode a = current.get("allow");
                if (a == null || !a.isArray() || a.isEmpty()) {
                    if (current.has("deny") && current.get("deny").isArray() && !current.get("deny").isEmpty()) {
                        // an everyone-flag with a deny list: keep it as it is unless a demo org is denied
                        boolean denied = false;
                        for (JsonNode d : current.get("deny")) denied |= orgIds.contains(d.asLong(-1));
                        if (!denied) continue;
                    } else {
                        continue; // already on for everyone
                    }
                } else {
                    for (JsonNode e : a) allow.add(e.asLong());
                }
            }
            allow.addAll(orgIds);
            flag.put("on", true);
            ArrayNode arr = flag.putArray("allow");
            allow.forEach(arr::add);
            write(key, flag.toString());
        }
    }

    /** Every live (registered, not deferred) enterprise flag key, in registry order. */
    static List<String> liveEnterpriseFlagKeys() {
        return EnterpriseSettingKeys.all().stream().map(k -> k.key()).filter(k -> k.startsWith("flag.enterprise")).toList();
    }

    /** {@code localhost} joins the tenant base domains in the registry (the resolver also needs dossier.tenant-host.allow-localhost-tenants). */
    private void ensureLocalBaseDomain() {
        String key = EnterpriseSettingKeys.HOSTS_TENANT_BASE_DOMAINS;
        JsonNode current = settingRows.findById(key).map(r -> parse(r.getValue())).orElse(null);
        List<String> domains = new ArrayList<>();
        if (current != null && current.isArray()) current.forEach(n -> domains.add(n.asText()));
        else domains.add("kiwiply.com");
        if (domains.contains("localhost")) return;
        domains.add("localhost");
        ArrayNode arr = mapper.createArrayNode();
        domains.forEach(arr::add);
        write(key, arr.toString());
    }

    private void write(String key, String json) {
        AppSetting row = settingRows.findById(key).orElse(null);
        if (row == null) {
            settingRows.save(new AppSetting(key, json, "enterprise-demo-seed", Instant.now()));
        } else {
            row.setValue(json);
            row.setUpdatedBy("enterprise-demo-seed");
            row.setUpdatedDate(Instant.now());
            settingRows.save(row);
        }
    }

    private JsonNode parse(String json) {
        try {
            return mapper.readTree(json);
        } catch (Exception e) {
            return null;
        }
    }
}
