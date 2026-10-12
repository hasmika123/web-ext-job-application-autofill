package com.dossier.api.service.org;

import com.dossier.api.domain.Application;
import com.dossier.api.domain.Authority;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.domain.enumeration.JobMode;
import com.dossier.api.domain.enumeration.JobType;
import com.dossier.api.domain.enumeration.OrgGroupKind;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.enumeration.OrgType;
import com.dossier.api.domain.enumeration.ShareScope;
import com.dossier.api.domain.org.OrgGroup;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.AuthorityRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.org.OrgGroupRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.org.DataShareService.ShareContext;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The demo organization (APP-E2E-PLAN section 2.1, story O1.8): {@code demo-bootcamp}, an ACTIVE bootcamp owned by the
 * {@code demo-org} account, so the sales demo and the org console have something real to show.
 *
 * <p>What it holds: two cohorts ("Cohort 26-A", "Cohort 26-B"), two STAFF support owners, twelve synthetic members (nine
 * sharing a SUMMARY, two sharing NONE, one still INVITED), each active one with a handful of applications across the
 * board, and the {@code demo} job seeker, Priya Sharma, as a MEMBER sharing a SUMMARY (so {@code /settings/organizations}
 * has something to show). Consent goes through {@link DataShareService#grant}, so every share has its event and audit
 * row exactly as real traffic would; no SQL fixtures.
 *
 * <p><b>It only ever runs when it is safe.</b> All of these must hold, checked first thing on every call: the demo is on
 * ({@code dossier.demo.enabled}, env {@code DEMO_ENABLED}); the org feature is on ({@link OrgFeatureFlag}); and the
 * {@code prod} Spring profile is NOT active. Production ships with the demo and the org flag off, and the profile check is
 * a third wall: a mis-set environment variable can never put synthetic people into a production database.
 *
 * <p><b>Idempotent.</b> Running it again creates nothing that exists (matched by slug, login and seat) and changes no
 * one's consent; a fully seeded org is recognised with one count and returns at once. The org is only trusted when the
 * demo owner created it, so a real tenant that happens to hold the slug is never adopted (the slug is also reserved).
 * The synthetic members are real {@code jhi_user} rows that are NOT activated, so nobody can sign in as them or reset a
 * password for them, and their addresses are on the reserved {@code example.com}.
 *
 * <p>Nothing sensitive is seeded: names are invented, no date of birth, no numbers of any kind.
 */
@Service
public class DemoOrgSeeder {

    private static final Logger LOG = LoggerFactory.getLogger(DemoOrgSeeder.class);

    public static final String SLUG = "demo-bootcamp";
    public static final String NAME = "Demo Bootcamp";
    public static final String COHORT_A = "Cohort 26-A";
    public static final String COHORT_B = "Cohort 26-B";

    /** Who is seeded and how; the same table is mirrored in {@code web/scripts/fixtures/demo-org.json}. */
    record Person(String login, String first, String last, OrgRole role, String group, OrgMemberStatus status, ShareScope scope) {
        String email() {
            return login + "@example.com";
        }
    }

    static final Person STAFF_A = new Person("demo-bc-marcus", "Marcus", "Webb", OrgRole.STAFF, COHORT_A, OrgMemberStatus.ACTIVE, ShareScope.NONE);
    static final Person STAFF_B = new Person("demo-bc-elena", "Elena", "Rossi", OrgRole.STAFF, COHORT_B, OrgMemberStatus.ACTIVE, ShareScope.NONE);

    static final List<Person> STAFF = List.of(STAFF_A, STAFF_B);

    /** The twelve members: 9 SUMMARY + 2 NONE active, 1 INVITED. */
    static final List<Person> MEMBERS = List.of(
        member("aarav", "Aarav", "Mehta", COHORT_A, ShareScope.SUMMARY),
        member("bela", "Bela", "Kovacs", COHORT_A, ShareScope.SUMMARY),
        member("chen", "Chen", "Wei", COHORT_A, ShareScope.SUMMARY),
        member("dana", "Dana", "Okafor", COHORT_A, ShareScope.SUMMARY),
        member("emil", "Emil", "Novak", COHORT_A, ShareScope.SUMMARY),
        member("fatima", "Fatima", "Zahra", COHORT_A, ShareScope.NONE),
        member("gabriel", "Gabriel", "Santos", COHORT_B, ShareScope.SUMMARY),
        member("hana", "Hana", "Suzuki", COHORT_B, ShareScope.SUMMARY),
        member("ivan", "Ivan", "Petrov", COHORT_B, ShareScope.SUMMARY),
        member("jada", "Jada", "Brooks", COHORT_B, ShareScope.SUMMARY),
        member("kofi", "Kofi", "Mensah", COHORT_B, ShareScope.NONE),
        new Person("demo-bc-lena", "Lena", "Fischer", OrgRole.MEMBER, COHORT_B, OrgMemberStatus.INVITED, ShareScope.NONE)
    );

    /** Seats of every state the seed makes: the owner, 2 STAFF, 11 active members, the demo job seeker, 1 invited. */
    static final int EXPECTED_ACTIVE_SEATS = 1 + 2 + 11 + 1;
    static final int EXPECTED_INVITED_SEATS = 1;

    private static Person member(String key, String first, String last, String group, ShareScope scope) {
        return new Person("demo-bc-" + key, first, last, OrgRole.MEMBER, group, OrgMemberStatus.ACTIVE, scope);
    }

    private static final String[] COMPANIES = { "Lumen Health", "Northwind Labs", "Brightpath Learning", "Cobalt Payments", "Fernhill Mobility", "Atlas Commerce", "Juniper Cloud", "Quill and Co", "Harbor and Pine", "Meridian Software" };
    private static final String[] ROLES = { "Junior Software Engineer", "Frontend Developer", "Data Analyst", "QA Engineer", "Backend Developer", "Product Analyst", "Support Engineer" };
    private static final ApplicationStatus[] STATUSES = { ApplicationStatus.APPLIED, ApplicationStatus.SAVED, ApplicationStatus.INTERVIEW, ApplicationStatus.APPLIED, ApplicationStatus.REJECTED, ApplicationStatus.OFFER, ApplicationStatus.DRAFT };

    /** What a call did, for the log and the tests. */
    public record Result(boolean ran, String skippedBecause, int liveSeats, int usersCreated, int sharesSet, int applicationsCreated) {
        static Result skipped(String why) {
            return new Result(false, why, 0, 0, 0, 0);
        }
    }

    private final OrganizationRepository orgs;
    private final OrgMemberRepository members;
    private final OrgGroupRepository groups;
    private final UserRepository users;
    private final AuthorityRepository authorities;
    private final ApplicationRepository applications;
    private final DataShareService dataShare;
    private final OrgAuditService audit;
    private final OrgFeatureFlag orgFlag;
    private final PasswordEncoder passwordEncoder;
    private final Environment environment;
    private final boolean demoEnabled;

    public DemoOrgSeeder(
        OrganizationRepository orgs,
        OrgMemberRepository members,
        OrgGroupRepository groups,
        UserRepository users,
        AuthorityRepository authorities,
        ApplicationRepository applications,
        DataShareService dataShare,
        OrgAuditService audit,
        OrgFeatureFlag orgFlag,
        PasswordEncoder passwordEncoder,
        Environment environment,
        @Value("${dossier.demo.enabled:false}") boolean demoEnabled
    ) {
        this.orgs = orgs;
        this.members = members;
        this.groups = groups;
        this.users = users;
        this.authorities = authorities;
        this.applications = applications;
        this.dataShare = dataShare;
        this.audit = audit;
        this.orgFlag = orgFlag;
        this.passwordEncoder = passwordEncoder;
        this.environment = environment;
        this.demoEnabled = demoEnabled;
    }

    /** Why the seed must not run right now, or null when it may. Cheap: three reads, no database. */
    String refusal() {
        if (environment.acceptsProfiles(Profiles.of("prod"))) return "the prod profile is active";
        if (!demoEnabled) return "the demo is off (DEMO_ENABLED)";
        if (!orgFlag.isEnabled()) return "organization features are off (ORGS_ENABLED)";
        return null;
    }

    /**
     * Seeds {@code demo-bootcamp} with {@code owner} (the {@code demo-org} account) as OWNER and {@code jobSeeker} (the
     * {@code demo} account) as a SUMMARY member. Safe to call on every demo login.
     */
    @Transactional
    public Result seed(User owner, User jobSeeker) {
        String why = refusal();
        if (why != null) {
            LOG.debug("Demo org seed skipped: {}", why);
            return Result.skipped(why);
        }
        if (owner == null || jobSeeker == null) return Result.skipped("the demo accounts do not exist yet");

        Optional<Organization> existing = orgs.findBySlug(SLUG);
        if (existing.isPresent()) {
            Organization org = existing.get();
            if (!owner.getId().equals(org.getCreatedByUserId())) {
                LOG.warn("An organization with the slug '{}' exists but the demo owner did not create it; the demo org seed leaves it alone", SLUG);
                return Result.skipped("the slug is held by an organization the demo owner did not create");
            }
            if (isComplete(org.getId())) return Result.skipped("already seeded");
        }

        Instant now = Instant.now();
        Organization org = existing.orElseGet(() -> createOrg(owner, now));
        Long orgId = org.getId();

        int usersCreated = 0;

        int sharesSet = 0;
        int apps = 0;

        Map<String, OrgGroup> byName = new HashMap<>();
        for (OrgGroup g : groups.findByOrgIdOrderBySortOrderAscNameAsc(orgId)) byName.put(g.getName(), g);
        for (String name : List.of(COHORT_A, COHORT_B)) {
            if (!byName.containsKey(name)) {
                OrgGroup g = new OrgGroup();
                g.setOrgId(orgId);
                g.setName(name);
                g.setKind(OrgGroupKind.COHORT);
                g.setSortOrder(byName.size());
                byName.put(name, groups.saveAndFlush(g));
            }
        }

        // Owner and the demo job seeker are existing accounts; everyone else is synthetic.
        OrgMember ownerSeat = seat(orgId, owner, OrgRole.OWNER, null, null, null, now.minus(60, ChronoUnit.DAYS));
        OrgMember marcusSeat = null;
        OrgMember elenaSeat = null;
        String passwordHash = passwordEncoder.encode(UUID.randomUUID().toString()); // nobody knows it, nobody can reset it
        Authority userAuthority = authorities.findById(AuthoritiesConstants.USER).orElse(null);

        int index = 0;
        for (Person p : STAFF) {
            boolean created = users.findOneByLogin(p.login()).isEmpty();
            User u = syntheticUser(p, passwordHash, userAuthority);
            usersCreated += created ? 1 : 0;
            OrgMember s = seat(orgId, u, p.role(), byName.get(p.group()).getId(), null, p.group(), now.minus(55 - index, ChronoUnit.DAYS));
            if (p == STAFF_A) marcusSeat = s;
            else elenaSeat = s;
            index++;
        }

        // The demo job seeker, Priya Sharma (D47), joins Cohort 26-A and shares a summary.
        OrgMember priyaSeat = seat(orgId, jobSeeker, OrgRole.MEMBER, byName.get(COHORT_A).getId(), marcusSeat.getId(), COHORT_A, now.minus(30, ChronoUnit.DAYS));
        sharesSet += share(org, priyaSeat, jobSeeker.getLogin(), ShareScope.SUMMARY);

        index = 0;
        for (Person p : MEMBERS) {
            Long groupId = byName.get(p.group()).getId();
            Long supportOwner = (COHORT_A.equals(p.group()) ? marcusSeat : elenaSeat).getId();
            if (p.status() == OrgMemberStatus.INVITED) {
                invitedSeat(orgId, p, groupId, supportOwner, ownerSeat.getId(), now.minus(3, ChronoUnit.DAYS));
                continue;
            }
            boolean created = users.findOneByLogin(p.login()).isEmpty();
            User u = syntheticUser(p, passwordHash, userAuthority);
            usersCreated += created ? 1 : 0;
            OrgMember s = seat(orgId, u, p.role(), groupId, supportOwner, p.group(), now.minus(40 - index * 2L, ChronoUnit.DAYS));
            sharesSet += share(org, s, u.getLogin(), p.scope());
            apps += applicationsFor(u, index, now);
            index++;
        }
        // The live seats the org now holds (after a first run all of them are the seed's).
        int seats = (int) members.countByOrgIdAndStatusIn(orgId, List.of(OrgMemberStatus.ACTIVE, OrgMemberStatus.INVITED));

        LOG.info("Demo organization '{}' seeded: {} live seats, {} users created, {} shares set, {} applications created", SLUG, seats, usersCreated, sharesSet, apps);
        return new Result(true, null, seats, usersCreated, sharesSet, apps);
    }

    // ---- pieces ---------------------------------------------------------------------------------------------------

    private boolean isComplete(Long orgId) {
        return members.countByOrgIdAndStatus(orgId, OrgMemberStatus.ACTIVE) >= EXPECTED_ACTIVE_SEATS
            && members.countByOrgIdAndStatus(orgId, OrgMemberStatus.INVITED) >= EXPECTED_INVITED_SEATS;
    }

    private Organization createOrg(User owner, Instant now) {
        Organization org = new Organization();
        org.setSlug(SLUG);
        org.setName(NAME);
        org.setType(OrgType.BOOTCAMP);
        org.setStatus(OrgStatus.ACTIVE);
        org.setSizeBand("51_200");
        org.setCountry("US");
        org.setTimezone("America/Chicago");
        org.setCreatedByUserId(owner.getId());
        org.setSetupFeePaidAt(now.minus(60, ChronoUnit.DAYS)); // a demo: nothing was charged
        org = orgs.saveAndFlush(org);
        audit.record(org.getId(), owner.getLogin(), OrgRole.OWNER, OrgAuditService.ORG_CREATE, OrgAuditService.TARGET_ORG, null, org.getId().toString(), "type=BOOTCAMP slug=" + SLUG + " (demo seed)", null);
        return org;
    }

    /** The user with this login, created (not activated, unusable password) when missing. */
    private User syntheticUser(Person p, String passwordHash, Authority userAuthority) {
        return users
            .findOneByLogin(p.login())
            .orElseGet(() -> {
                User u = new User();
                u.setLogin(p.login());
                u.setFirstName(p.first());
                u.setLastName(p.last());
                u.setEmail(p.email());
                u.setLangKey("en");
                u.setActivated(false); // never able to sign in, never able to reset a password
                u.setPassword(passwordHash);
                if (userAuthority != null) u.setAuthorities(new HashSet<>(List.of(userAuthority)));
                return users.save(u);
            });
    }

    /** The user's live seat in the org, created when missing. */
    private OrgMember seat(Long orgId, User user, OrgRole role, Long groupId, Long supportOwnerId, String label, Instant joinedAt) {
        List<OrgMember> live = members.findByOrgIdAndUserIdAndStatusIn(orgId, user.getId(), List.of(OrgMemberStatus.ACTIVE, OrgMemberStatus.SUSPENDED));
        if (!live.isEmpty()) return live.get(0);
        OrgMember m = new OrgMember();
        m.setOrgId(orgId);
        m.setUserId(user.getId());
        m.setRole(role);
        m.setStatus(OrgMemberStatus.ACTIVE);
        m.setGroupId(groupId);
        m.setSupportOwnerMemberId(supportOwnerId);
        m.setDisplayLabel(label);
        m.setJoinedAt(joinedAt);
        return members.saveAndFlush(m);
    }

    private boolean invitedSeat(Long orgId, Person p, Long groupId, Long supportOwnerId, Long invitedBy, Instant invitedAt) {
        if (!members.findByOrgIdAndInviteEmailAndStatusIn(orgId, p.email(), List.of(OrgMemberStatus.INVITED)).isEmpty()) return false;
        OrgMember m = new OrgMember();
        m.setOrgId(orgId);
        m.setRole(OrgRole.MEMBER);
        m.setStatus(OrgMemberStatus.INVITED);
        m.setInviteEmail(p.email());
        m.setInviteExpiresAt(invitedAt.plus(14, ChronoUnit.DAYS));
        m.setInvitedByMemberId(invitedBy);
        m.setGroupId(groupId);
        m.setSupportOwnerMemberId(supportOwnerId);
        m.setDisplayLabel(p.group());
        members.saveAndFlush(m);
        return true;
    }

    /** Records the member's own choice once; a seat that already chose keeps its choice. Returns 1 when it wrote one. */
    private int share(Organization org, OrgMember seat, String login, ShareScope scope) {
        if (dataShare.viewOf(org.getId(), seat.getId()).isPresent()) return 0;
        OrgMembership as = new OrgMembership(org.getId(), seat.getId(), seat.getUserId(), login, seat.getRole(), seat.getStatus(), org.getStatus());
        dataShare.grant(as, scope, null, OrgShareConsent.CURRENT, ShareContext.EMPTY);
        return 1;
    }

    /** 2 to 6 applications across the board for a person with none yet; deterministic from the person's position. */
    private int applicationsFor(User user, int index, Instant now) {
        if (!applications.findByUserId(user.getId()).isEmpty()) return 0;
        int count = 2 + (index * 3) % 5;
        for (int i = 0; i < count; i++) {
            ApplicationStatus status = STATUSES[(index + i) % STATUSES.length];
            int createdDaysAgo = 4 + i * 5 + index;
            Application a = new Application();
            a.setUser(user);
            a.setCompany(COMPANIES[(index * 3 + i) % COMPANIES.length]);
            a.setRoleTitle(ROLES[(index + i * 2) % ROLES.length]);
            a.setStatus(status);
            a.setLocation(i % 3 == 0 ? "Remote (US)" : "Chicago, IL");
            a.setJobMode(i % 3 == 0 ? JobMode.REMOTE : JobMode.HYBRID);
            a.setJobType(JobType.FULL_TIME);
            a.setSource("demo");
            a.setStarred(status == ApplicationStatus.OFFER || status == ApplicationStatus.INTERVIEW);
            a.setArchived(false);
            Instant created = now.minus(createdDaysAgo, ChronoUnit.DAYS);
            a.setCreatedAt(created);
            boolean sent = status != ApplicationStatus.SAVED && status != ApplicationStatus.DRAFT;
            if (sent) {
                a.setAppliedAt(created.plus(1, ChronoUnit.DAYS));
                a.setUpdatedAt(created.plus(3, ChronoUnit.DAYS));
                a.setSubmissionConfirmed(true);
            } else {
                a.setUpdatedAt(created);
                a.setSubmissionConfirmed(false);
            }
            applications.save(a);
        }
        return count;
    }
}
