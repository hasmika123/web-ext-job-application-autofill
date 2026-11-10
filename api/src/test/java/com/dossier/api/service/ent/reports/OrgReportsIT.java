package com.dossier.api.service.ent.reports;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.OrgDashboardRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.dto.ent.DashboardDTO.Checklist;
import com.dossier.api.service.dto.ent.DashboardDTO.State;
import com.dossier.api.service.dto.ent.ReportsDTO;
import com.dossier.api.service.ent.EnterpriseDemoSeeder;
import com.dossier.api.service.ent.RoleTemplates;
import com.dossier.api.service.ent.TalentDemoSeeder;
import com.dossier.api.service.ent.authz.ScopeEvaluator;
import com.dossier.api.service.ent.dashboard.DashboardContext;
import com.dossier.api.service.ent.dashboard.DashboardWidgetRegistry;
import com.dossier.api.service.ent.dashboard.WidgetResult;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Org Admin Reports numbers and the dashboard activation checklist on the seeded demo tenants: every report figure equals an independent
 * SQL count taken straight from the tables, a tenant never sees another's rows, a key held at a narrower scope than ORG is the generic 404,
 * and the checklist is computed from real state (Acme is set up, an organization with no rows is not).
 */
@IntegrationTest
@Transactional
@TestPropertySource(properties = { "dossier.demo.enabled=true", "dossier.demo.enterprise-seed=true", "dossier.demo.create-accounts=false" })
@org.junit.jupiter.api.Timeout(1200)
class OrgReportsIT {

    @Autowired private EnterpriseDemoSeeder baseSeeder;
    @Autowired private TalentDemoSeeder talentSeeder;
    @Autowired private OrganizationRepository orgs;
    @Autowired private ResumeBuilderSettings settings;
    @Autowired private OrgReportsService reports;
    @Autowired private OrgDashboardRepository dashboardRepo;
    @Autowired private DashboardWidgetRegistry registry;
    @Autowired private ConsultantProfileRepository consultants;
    @Autowired private JdbcTemplate jdbc;

    private Long acme;
    private Long beta;

    @BeforeEach
    @org.junit.jupiter.api.Timeout(900)
    void seed() {
        assertThat(baseSeeder.seed().ran()).isTrue();
        assertThat(talentSeeder.seed().ran()).isTrue();
        acme = orgs.findBySlug(EnterpriseDemoSeeder.ACME_SLUG).map(Organization::getId).orElseThrow();
        beta = orgs.findBySlug(EnterpriseDemoSeeder.BETA_SLUG).map(Organization::getId).orElseThrow();
    }

    @AfterEach
    void forget() {
        settings.invalidate();
    }

    private OrgMembership me(Long orgId, String template) {
        Map<String, PermissionScope> grants = new LinkedHashMap<>();
        RoleTemplates.find(template).orElseThrow().grants().forEach(g -> grants.put(g.key(), g.scope()));
        return new OrgMembership(orgId, 1L, 1L, "tester", OrgRole.ADMIN, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE, List.of(new OrgMembership.RoleRef(null, template, template, true)), grants);
    }

    private long count(String sql, Object... args) {
        Long n = jdbc.queryForObject(sql, Long.class, args);
        return n == null ? 0 : n;
    }

    /** One test: seeding the two demo tenants is the expensive part, so every check runs on the same seed. */
    @Test
    void reportsAndChecklistOnTheSeededTenants() {
        everyReportFigureEqualsAnIndependentCount();
        aTenantNeverSeesAnotherTenantsRows();
        onlyAnOrgScopedReportsViewReadsTheReports();
        theRangeIsValidated();
        anOrganizationWithoutRowsHasHonestZerosAndAChecklistToDo();
        theSetUpDemoOrganizationHasACompleteChecklist();
    }

    private void everyReportFigureEqualsAnIndependentCount() {
        for (int days : List.of(30, 90)) {
            ReportsDTO.Overview o = reports.overview(me(acme, RoleTemplates.ORG_ADMIN), String.valueOf(days));
            LocalDate today = LocalDate.now(ZoneOffset.UTC);
            LocalDate from = today.minusDays(days - 1L);
            assertThat(o.rangeDays()).isEqualTo(days);
            assertThat(o.roster().total()).isEqualTo(consultants.countByOrgIdAndStatus(acme, "ACTIVE")).isGreaterThan(100);
            assertThat(o.roster().byMarketingStatus().stream().mapToLong(ReportsDTO.Slice::count).sum()).isEqualTo(o.roster().total());
            assertThat(o.roster().byAvailability().stream().mapToLong(ReportsDTO.Slice::count).sum()).isEqualTo(o.roster().total());

            long applied = count("select count(*) from talent_application where org_id = ? and applied_on >= ?", acme, from);
            assertThat(o.funnel().total()).as("applications in " + days + " days").isEqualTo(applied);
            assertThat(o.funnel().stages().stream().mapToLong(ReportsDTO.StageRow::count).sum()).isEqualTo(applied);
            assertThat(o.funnel().weekly().stream().mapToLong(ReportsDTO.WeekPoint::value).sum()).isEqualTo(applied);
            assertThat(o.funnel().stages()).extracting(ReportsDTO.StageRow::key).containsExactly("ASSIGNED", "SUBMITTED", "UNDER_REVIEW", "INTERVIEWING", "OFFER", "CLOSED");

            Instant start = from.atStartOfDay().toInstant(ZoneOffset.UTC);
            long scheduled = count("select count(*) from talent_interview where org_id = ? and scheduled_at >= ? and scheduled_at < ?", acme, java.time.LocalDateTime.ofInstant(start, ZoneOffset.UTC), today.plusDays(1).atStartOfDay());
            assertThat(o.interviews().scheduled()).as("interviews in " + days + " days").isEqualTo(scheduled);
            assertThat(o.interviews().completed() + o.interviews().cancelled() + o.interviews().awaitingOutcome()).isLessThanOrEqualTo(o.interviews().scheduled());
            assertThat(o.interviews().weekly().stream().mapToLong(ReportsDTO.WeekPoint::value).sum()).isEqualTo(o.interviews().scheduled());

            long activePlacements = count(
                "select count(*) from talent_placement where org_id = ? and status = 'ACTIVE' and start_date <= ? and (end_date is null or end_date > ?)", acme, today, today);
            assertThat(o.placements().active()).isEqualTo(activePlacements);
            assertThat(o.placements().months()).hasSize(6);
            assertThat(o.topClients().stream().mapToLong(ReportsDTO.ClientRow::activePlacements).sum()).isLessThanOrEqualTo(activePlacements);
            assertThat(o.topClients()).isSortedAccordingTo((a, b) -> Long.compare(b.activePlacements(), a.activePlacements()));
            assertThat(o.topClients().size()).isLessThanOrEqualTo(5);

            assertThat(o.marketers()).isNotEmpty();
            assertThat(o.marketers()).allSatisfy(m -> {
                assertThat(m.name()).isNotBlank().doesNotContain("@");
                assertThat(m.consultants() + m.openOpportunities()).isPositive();
            });
            assertThat(o.marketers().stream().mapToLong(ReportsDTO.MarketerRow::consultants).sum()).isLessThanOrEqualTo(count("select count(*) from marketer_assignment where org_id = ? and status = 'ACTIVE'", acme));

            assertThat(o.firstSubmission().sample()).isGreaterThanOrEqualTo(0);
            assertThat(o.firstSubmission().medianHours() == null).isEqualTo(o.firstSubmission().sample() == 0);
            assertThat(o.tiles()).extracting(ReportsDTO.Tile::key).contains("consultants", "applications", "interviewsCompleted", "placements", "timeToSubmit");
        }
    }

    private void aTenantNeverSeesAnotherTenantsRows() {
        ReportsDTO.Overview a = reports.overview(me(acme, RoleTemplates.ORG_ADMIN), "90");
        ReportsDTO.Overview b = reports.overview(me(beta, RoleTemplates.ORG_ADMIN), "90");
        assertThat(b.orgId()).isEqualTo(beta);
        assertThat(b.roster().total()).isEqualTo(consultants.countByOrgIdAndStatus(beta, "ACTIVE")).isNotEqualTo(a.roster().total());
        assertThat(b.funnel().total()).isEqualTo(count("select count(*) from talent_application where org_id = ? and applied_on >= ?", beta, LocalDate.now(ZoneOffset.UTC).minusDays(89)));
        // a marketer of Acme is never listed in Beta's workload
        assertThat(b.marketers()).extracting(ReportsDTO.MarketerRow::memberId).doesNotContainAnyElementsOf(a.marketers().stream().map(ReportsDTO.MarketerRow::memberId).toList());
    }

    private void onlyAnOrgScopedReportsViewReadsTheReports() {
        // a marketing specialist holds reports.view at ASSIGNED scope only: not this page
        assertThatThrownBy(() -> reports.overview(me(acme, RoleTemplates.MARKETING_SPECIALIST), "30")).isInstanceOf(OrgNotFoundException.class);
        // a plain member holds no reports key at all
        assertThatThrownBy(() -> reports.overview(me(acme, RoleTemplates.MEMBER), "30")).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> reports.overview(null, "30")).isInstanceOf(OrgNotFoundException.class);
    }

    private void theRangeIsValidated() {
        OrgMembership admin = me(acme, RoleTemplates.ORG_ADMIN);
        assertThat(reports.overview(admin, null).rangeDays()).isEqualTo(30);
        assertThat(reports.overview(admin, "90d").rangeDays()).isEqualTo(90);
        for (String bad : List.of("45", "0", "-30", "abc", "30; drop table")) assertThatThrownBy(() -> reports.overview(admin, bad)).isInstanceOf(OrgException.class);
    }

    private void anOrganizationWithoutRowsHasHonestZerosAndAChecklistToDo() {
        Long nobody = 987_654_321L;
        ReportsDTO.Overview o = reports.overview(me(nobody, RoleTemplates.ORG_ADMIN), "30");
        assertThat(o.roster().total()).isZero();
        assertThat(o.funnel().total()).isZero();
        assertThat(o.interviews().scheduled()).isZero();
        assertThat(o.placements().active()).isZero();
        assertThat(o.topClients()).isEmpty();
        assertThat(o.marketers()).isEmpty();
        assertThat(o.firstSubmission().medianHours()).isNull();

        // a fresh organization sees the whole checklist, nothing done
        WidgetResult r = checklist(nobody);
        assertThat(r.state()).isEqualTo(State.OK);
        Checklist list = (Checklist) r.data();
        assertThat(list.done()).isZero();
        assertThat(list.items()).extracting(i -> i.key()).containsExactly("branding", "department", "employees", "roles", "assignments");
        assertThat(list.items()).allSatisfy(i -> assertThat(i.href()).startsWith("/w/admin/"));
    }

    private void theSetUpDemoOrganizationHasACompleteChecklist() {
        WidgetResult r = checklist(acme);
        assertThat(r.state()).isEqualTo(State.EMPTY);
        assertThat(r.reason()).isEqualTo("COMPLETE");
        assertThat(r.data()).isNull();
        // Beta is a second tenant: its checklist is its own state, never Acme's
        assertThat(checklist(beta).state()).isIn(State.OK, State.EMPTY);
    }

    private WidgetResult checklist(Long orgId) {
        DashboardContext ctx = new DashboardContext(orgId, me(orgId, RoleTemplates.ORG_ADMIN), Instant.now(), mock(ScopeEvaluator.class), dashboardRepo);
        return registry.providers().stream().filter(p -> p.key().equals("checklist")).findFirst().orElseThrow().compute(ctx);
    }
}
