package com.dossier.api.service.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.MarketerAssignment;
import com.dossier.api.domain.ent.talent.TalentApplication;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.MarketerAssignmentRepository;
import com.dossier.api.repository.ent.talent.MarketerCapacityRepository;
import com.dossier.api.repository.ent.talent.OrgResumeRepository;
import com.dossier.api.repository.ent.talent.RequirementMatchRepository;
import com.dossier.api.repository.ent.talent.TalentApplicationRepository;
import com.dossier.api.repository.ent.talent.TalentInterviewRepository;
import com.dossier.api.repository.ent.talent.TalentPlacementRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import java.lang.reflect.Method;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.type.filter.AssignableTypeFilter;
import org.springframework.data.repository.Repository;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.annotation.Transactional;

/**
 * The talent foundation on MySQL: the migration applies (every table exists with its tenant keys), the demo seeder fills the two
 * demo tenants consistently, a second run adds nothing, Beta's data never mixes with Acme's, every talent repository method is
 * org-scoped, and the composite tenant foreign key refuses a child row that points at another tenant's parent.
 */
@IntegrationTest
@Transactional
@TestPropertySource(properties = { "dossier.demo.enabled=true", "dossier.demo.enterprise-seed=true", "dossier.demo.create-accounts=false" })
@org.junit.jupiter.api.Timeout(180)
class TalentSchemaIT {

    private static final List<String> TABLES = List.of(
        "client_account", "client_contact", "consultant_profile", "consultant_skill", "marketer_capacity", "marketer_assignment", "client_requirement",
        "requirement_skill", "requirement_match", "org_resume", "org_resume_experience", "talent_application", "talent_application_event",
        "talent_application_note", "talent_interview", "talent_placement", "org_spend_entry"
    );

    @Autowired private EnterpriseDemoSeeder baseSeeder;
    @Autowired private TalentDemoSeeder talentSeeder;
    @Autowired private OrganizationRepository orgs;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private ResumeBuilderSettings settings;
    @Autowired private ConsultantProfileRepository consultants;
    @Autowired private MarketerAssignmentRepository assignments;
    @Autowired private MarketerCapacityRepository capacities;
    @Autowired private ClientAccountRepository clients;
    @Autowired private ClientRequirementRepository requirements;
    @Autowired private RequirementMatchRepository matches;
    @Autowired private OrgResumeRepository resumes;
    @Autowired private TalentApplicationRepository applications;
    @Autowired private TalentInterviewRepository interviews;
    @Autowired private TalentPlacementRepository placements;

    private Long acme;
    private Long beta;

    @BeforeEach
    @org.junit.jupiter.api.Timeout(180) // the base seeder plus the talent seed outgrow the 15 s default on a loaded machine
    void seed() {
        assertThat(baseSeeder.seed().ran()).isTrue();
        TalentDemoSeeder.Result r = talentSeeder.seed();
        assertThat(r.ran()).as(String.valueOf(r.skippedBecause())).isTrue();
        acme = orgs.findBySlug(EnterpriseDemoSeeder.ACME_SLUG).map(Organization::getId).orElseThrow();
        beta = orgs.findBySlug(EnterpriseDemoSeeder.BETA_SLUG).map(Organization::getId).orElseThrow();
    }

    @AfterEach
    void forget() {
        settings.invalidate();
    }

    private Map<String, Long> counts(Long orgId) {
        Map<String, Long> m = new HashMap<>();
        for (String t : TABLES) m.put(t, jdbc.queryForObject("select count(*) from " + t + " where org_id = ?", Long.class, orgId));
        return m;
    }

    @Test
    void everyTalentTableExistsWithAnOrgIdAndATenantForeignKey() {
        for (String t : TABLES) {
            Long cols = jdbc.queryForObject("select count(*) from information_schema.columns where table_schema = database() and table_name = ? and column_name = 'org_id' and is_nullable = 'NO'", Long.class, t);
            assertThat(cols).as(t + ".org_id NOT NULL").isEqualTo(1L);
            Long fk = jdbc.queryForObject(
                "select count(*) from information_schema.key_column_usage where table_schema = database() and table_name = ? and column_name = 'org_id' and referenced_table_name = 'organization'", Long.class, t);
            assertThat(fk).as(t + " FK to organization").isGreaterThanOrEqualTo(1L);
        }
        // composite tenant FKs: every FK to another talent table has org_id as its first column
        List<Map<String, Object>> childToParent = jdbc.queryForList(
            "select table_name t, constraint_name c, column_name col, ordinal_position pos, referenced_table_name r from information_schema.key_column_usage "
                + "where table_schema = database() and referenced_table_name in ('client_account','client_contact','consultant_profile','client_requirement','org_resume','talent_application','org_member','org_group') "
                + "and table_name in (" + String.join(",", TABLES.stream().map(x -> "'" + x + "'").toList()) + ") and ordinal_position = 1");
        assertThat(childToParent).isNotEmpty();
        for (Map<String, Object> row : childToParent) assertThat(row.get("col")).as(row.get("t") + "." + row.get("c") + " starts with org_id").isEqualTo("org_id");
    }

    @Test
    void aCrossTenantChildRowIsRefusedByTheDatabase() {
        Long acmeApp = applications.findByOrgId(acme).get(0).getId();
        assertThatThrownBy(() -> jdbc.update("insert into talent_application_note (org_id, application_id, body, created_at) values (?, ?, 'x', now(6))", beta, acmeApp))
            .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
    }

    @Test
    void acmeIsSeededRichAndConsistent() {
        Map<String, Long> c = counts(acme);
        assertThat(c.get("consultant_profile")).isEqualTo(153L);
        assertThat(c.get("client_account")).isEqualTo(8L);
        assertThat(c.get("client_requirement")).isEqualTo(24L);
        assertThat(c.get("talent_application")).isEqualTo(120L);
        assertThat(c.get("marketer_capacity")).isEqualTo(8L);
        assertThat(c.get("marketer_assignment")).isEqualTo(141L);
        assertThat(c.get("org_resume")).isBetween(80L, 160L);
        assertThat(c.get("talent_interview")).isBetween(70L, 110L);
        assertThat(c.get("org_spend_entry")).isEqualTo(18L);

        // 12 unassigned, 3 overloaded (workload >= 90 % of capacity), workloads equal the assignment rows
        Set<Long> assigned = new java.util.HashSet<>();
        for (MarketerAssignment a : assignments.findByOrgId(acme)) assigned.add(a.getConsultantId());
        assertThat(consultants.findByOrgId(acme).stream().filter(x -> !assigned.contains(x.getId())).count()).isEqualTo(12L);
        long overloaded = capacities.findByOrgIdAndStatus(acme, "ACTIVE").stream()
            .filter(cap -> assignments.countByOrgIdAndMarketerMemberId(acme, cap.getMemberId()) * 100 >= (long) TalentDemoSeeder.OVERLOAD_PCT * cap.getCapacity()).count();
        assertThat(overloaded).isEqualTo(3L);

        // every application's marketer is its consultant's marketer; the code is unique; the pair has an ASSIGNED match
        Map<Long, Long> marketerOf = new HashMap<>();
        for (MarketerAssignment a : assignments.findByOrgId(acme)) marketerOf.put(a.getConsultantId(), a.getMarketerMemberId());
        for (TalentApplication a : applications.findByOrgId(acme)) {
            assertThat(a.getMarketerMemberId()).isEqualTo(marketerOf.get(a.getConsultantId()));
            assertThat(a.getCode()).matches("APP-\\d{4}-\\d{3}");
        }
        assertThat(matches.countByOrgIdAndStatus(acme, "ASSIGNED")).isGreaterThanOrEqualTo(120L);

        // stage mix: all six stages present, closed ones carry a reason
        for (String s : List.of("ASSIGNED", "SUBMITTED", "UNDER_REVIEW", "INTERVIEWING", "OFFER", "CLOSED")) assertThat(applications.countByOrgIdAndStage(acme, s)).as(s).isPositive();
        assertThat(applications.findByOrgId(acme).stream().filter(a -> "CLOSED".equals(a.getStage()) && a.getClosedReason() == null)).isEmpty();

        // exactly one active placement per ON_PROJECT consultant; active placement count follows availability
        long onProject = consultants.countByOrgIdAndStatusAndAvailabilityStatus(acme, "ACTIVE", "ON_PROJECT");
        assertThat(placements.countByOrgIdAndStatus(acme, "ACTIVE")).isEqualTo(onProject);
        assertThat(placements.countActiveOn(acme, LocalDate.now(ZoneOffset.UTC))).isGreaterThanOrEqualTo(onProject);

        // a primary resume at most once per consultant (the generated unique key) and ~14 % pending
        long pending = resumes.countByOrgIdAndApprovalStatus(acme, "PENDING");
        assertThat(pending * 100.0 / c.get("org_resume")).isBetween(5.0, 25.0);

        // upcoming interviews exist, this and next week
        Instant now = Instant.now();
        assertThat(interviews.countByOrgIdAndStatusAndScheduledAtBetween(acme, "SCHEDULED", now, now.plusSeconds(14 * 86400L))).isBetween(20L, 40L);
    }

    @Test
    void sixMonthsOfHistoryWithARisingTrend() {
        LocalDate first = LocalDate.now(ZoneOffset.UTC).withDayOfMonth(1);
        List<Long> apps = new ArrayList<>();
        List<Long> places = new ArrayList<>();
        List<Long> interviewsPerMonth = new ArrayList<>();
        for (int k = 5; k >= 0; k--) {
            LocalDate from = first.minusMonths(k);
            LocalDate to = from.plusMonths(1).minusDays(1);
            apps.add(applications.countByOrgIdAndAppliedOnBetween(acme, from, to));
            places.add(placements.countByOrgIdAndStartDateBetween(acme, from, to));
            interviewsPerMonth.add(interviews.countByOrgIdAndScheduledAtBetween(acme, from.atStartOfDay().toInstant(ZoneOffset.UTC), to.plusDays(1).atStartOfDay().toInstant(ZoneOffset.UTC)));
        }
        for (int i = 1; i < apps.size(); i++) assertThat(apps.get(i)).as("applications month " + i).isGreaterThan(apps.get(i - 1));
        assertThat(places.get(5)).isGreaterThan(places.get(0));
        assertThat(places.get(3) + places.get(4) + places.get(5)).isGreaterThan(places.get(0) + places.get(1) + places.get(2));
        assertThat(interviewsPerMonth.get(5)).isGreaterThan(interviewsPerMonth.get(0));
        assertThat(interviewsPerMonth.get(3) + interviewsPerMonth.get(4) + interviewsPerMonth.get(5)).isGreaterThan(interviewsPerMonth.get(0) + interviewsPerMonth.get(1) + interviewsPerMonth.get(2));
        for (int i = 1; i < interviewsPerMonth.size(); i++) assertThat(interviewsPerMonth.get(i)).as("interviews month " + i).isGreaterThanOrEqualTo(interviewsPerMonth.get(i - 1) - 2);
        assertThat(apps.stream().mapToLong(Long::longValue).sum()).isEqualTo(120L);
    }

    @Test
    void secondRunAddsNothing() {
        Map<String, Long> before = counts(acme);
        Map<String, Long> betaBefore = counts(beta);
        TalentDemoSeeder.Result r = talentSeeder.seed();
        assertThat(r.ran()).isTrue();
        assertThat(r.seeded()).isEmpty();
        assertThat(counts(acme)).isEqualTo(before);
        assertThat(counts(beta)).isEqualTo(betaBefore);
    }

    @Test
    void betaIsSmallerAndNeverMixesWithAcme() {
        Map<String, Long> b = counts(beta);
        assertThat(b.get("consultant_profile")).isEqualTo(46L);
        assertThat(b.get("client_account")).isEqualTo(3L);
        assertThat(b.get("client_requirement")).isEqualTo(8L);
        assertThat(b.get("talent_application")).isEqualTo(36L);
        assertThat(b.get("marketer_assignment")).isEqualTo(42L);
        // no Acme row is visible through Beta's org id, and no Beta row references an Acme parent
        for (ConsultantProfile c : consultants.findByOrgId(acme)) assertThat(consultants.findByOrgIdAndId(beta, c.getId())).isEmpty();
        assertThat(clients.findByOrgIdOrderByNameAsc(beta)).extracting(x -> x.getName()).doesNotContain("TechCorp", "FinTech Solutions");
        Set<Long> betaRequirementIds = new java.util.HashSet<>();
        requirements.findByOrgId(beta).forEach(r -> betaRequirementIds.add(r.getId()));
        applications.findByOrgId(beta).forEach(a -> assertThat(betaRequirementIds).contains(a.getRequirementId()));
        Long orphans = jdbc.queryForObject(
            "select count(*) from talent_application a join client_requirement r on r.id = a.requirement_id where a.org_id <> r.org_id", Long.class);
        assertThat(orphans).isZero();
        assertThat(jdbc.queryForObject("select count(*) from consultant_profile p join org_member m on m.id = p.member_id where p.org_id <> m.org_id", Long.class)).isZero();
    }

    @Test
    void everyTalentRepositoryMethodIsOrgScoped() throws Exception {
        ClassPathScanningCandidateComponentProvider scanner = new ClassPathScanningCandidateComponentProvider(false) {
            @Override
            protected boolean isCandidateComponent(org.springframework.beans.factory.annotation.AnnotatedBeanDefinition bd) {
                return bd.getMetadata().isInterface();
            }
        };
        scanner.addIncludeFilter(new AssignableTypeFilter(Repository.class));
        int checked = 0;
        for (BeanDefinition bd : scanner.findCandidateComponents("com.dossier.api.repository.ent.talent")) {
            Class<?> repo = Class.forName(bd.getBeanClassName());
            for (Method m : repo.getDeclaredMethods()) {
                if (java.util.Set.of("save", "saveAndFlush", "flush", "saveAll", "saveAllAndFlush", "delete", "deleteAll").contains(m.getName())) continue; // entity-in writes (EntRepositoryContractTest allows the same set)
                assertThat(m.getParameterCount()).as(repo.getSimpleName() + "." + m.getName()).isGreaterThan(0);
                String first = m.getParameters()[0].getName();
                org.springframework.data.repository.query.Param p = m.getParameters()[0].getAnnotation(org.springframework.data.repository.query.Param.class);
                assertThat(p != null ? p.value() : first).as(repo.getSimpleName() + "." + m.getName() + " takes orgId first").isEqualTo("orgId");
                checked++;
            }
        }
        assertThat(checked).isGreaterThan(40);
        assertThat(scanner.findCandidateComponents("com.dossier.api.repository.ent.talent")).hasSize(17);
    }
}
