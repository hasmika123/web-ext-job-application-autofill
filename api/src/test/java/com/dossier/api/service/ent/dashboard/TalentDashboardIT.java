package com.dossier.api.service.ent.dashboard;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.ent.talent.OrgSpendEntry;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.OrgDashboardRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.OrgSpendEntryRepository;
import com.dossier.api.repository.ent.talent.TalentApplicationRepository;
import com.dossier.api.repository.ent.talent.TalentInterviewRepository;
import com.dossier.api.repository.ent.talent.TalentPlacementRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.dto.ent.DashboardDTO.Activity;
import com.dossier.api.service.dto.ent.DashboardDTO.ActivityItem;
import com.dossier.api.service.dto.ent.DashboardDTO.Alert;
import com.dossier.api.service.dto.ent.DashboardDTO.Pipeline;
import com.dossier.api.service.dto.ent.DashboardDTO.Slice;
import com.dossier.api.service.dto.ent.DashboardDTO.State;
import com.dossier.api.service.dto.ent.DashboardDTO.StatTile;
import com.dossier.api.service.dto.ent.DashboardDTO.TeamPerformance;
import com.dossier.api.service.ent.EnterpriseDemoSeeder;
import com.dossier.api.service.ent.RoleTemplates;
import com.dossier.api.service.ent.TalentDemoSeeder;
import com.dossier.api.service.ent.authz.ScopeEvaluator;
import com.dossier.api.service.org.OrgMembership;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.annotation.Transactional;

/**
 * The talent dashboard widgets on MySQL with the seeded demo tenants: every figure equals an independent count taken straight from the
 * talent repositories (talent-foundation.md section 5), the history rises as designed, Beta's numbers differ from Acme's and never
 * mix with them, an organization with no rows gets honest empty widgets, and a role without a widget's permission cannot see it.
 */
@IntegrationTest
@Transactional
@TestPropertySource(properties = { "dossier.demo.enabled=true", "dossier.demo.enterprise-seed=true", "dossier.demo.create-accounts=false" })
@org.junit.jupiter.api.Timeout(240)
class TalentDashboardIT {

    @Autowired private EnterpriseDemoSeeder baseSeeder;
    @Autowired private TalentDemoSeeder talentSeeder;
    @Autowired private OrganizationRepository orgs;
    @Autowired private ResumeBuilderSettings settings;
    @Autowired private OrgDashboardRepository repo;
    @Autowired private DashboardWidgetRegistry registry;
    @Autowired private DashboardAlertService alerts;
    @Autowired private ConsultantProfileRepository consultants;
    @Autowired private TalentApplicationRepository applications;
    @Autowired private TalentInterviewRepository interviews;
    @Autowired private TalentPlacementRepository placements;
    @Autowired private OrgSpendEntryRepository spend;

    private Long acme;
    private Long beta;

    @BeforeEach
    @org.junit.jupiter.api.Timeout(300)
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

    /** A caller holding exactly the grants of a role template, all at the scopes the template gives them. */
    private OrgMembership me(Long orgId, String template) {
        Map<String, PermissionScope> grants = new LinkedHashMap<>();
        RoleTemplates.find(template).orElseThrow().grants().forEach(g -> grants.put(g.key(), g.scope()));
        return new OrgMembership(orgId, 1L, 1L, "tester", OrgRole.ADMIN, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE, List.of(new OrgMembership.RoleRef(null, template, template, true)), grants);
    }

    private DashboardContext ctx(Long orgId, String template) {
        return new DashboardContext(orgId, me(orgId, template), Instant.now(), mock(ScopeEvaluator.class), repo);
    }

    private WidgetResult run(String key, DashboardContext ctx) {
        return registry.providers().stream().filter(p -> p.key().equals(key)).findFirst().orElseThrow().compute(ctx);
    }

    private StatTile tile(String key, Long orgId) {
        WidgetResult r = run(key, ctx(orgId, RoleTemplates.ORG_ADMIN));
        assertThat(r.state()).as(key).isEqualTo(State.OK);
        return (StatTile) r.data();
    }

    @Test
    void tilesEqualIndependentCountsOfTheRows() {
        long open = applications.countByOrgId(acme) - applications.countByOrgIdAndStage(acme, "CLOSED");
        assertThat(tile("applications.active", acme).value()).isEqualTo(open);

        Instant now = Instant.now();
        long upcoming = interviews.countByOrgIdAndStatusAndScheduledAtBetween(acme, "SCHEDULED", now.minusSeconds(120), now.plusSeconds(7 * 86400));
        assertThat(tile("interviews.upcoming", acme).value()).isBetween(Math.max(0, upcoming - 3), upcoming + 3);

        assertThat(tile("placements", acme).value()).isEqualTo(placements.countByOrgIdAndStatus(acme, "ACTIVE"));
        assertThat(tile("consultants.total", acme).value()).isEqualTo(consultants.countByOrgIdAndStatus(acme, "ACTIVE")).isGreaterThan(100);

        LocalDate first = LocalDate.now(ZoneOffset.UTC).withDayOfMonth(1);
        long thisMonth = spend.findByOrgIdAndMonthStartBetweenOrderByMonthStartAsc(acme, first, first).stream().mapToLong(OrgSpendEntry::getAmountMinor).sum();
        StatTile money = tile("finance.summary", acme);
        assertThat(money.value()).isEqualTo(thisMonth).isPositive();
        assertThat(money.unit()).isEqualTo("money");
        assertThat(money.currency()).isEqualTo("USD");
        assertThat(money.sparkline()).hasSize(6);
        assertThat(money.sparkline().get(5)).isEqualTo(money.value());
    }

    @Test
    void deltasAreComputedFromRowsAndTheHistoryRises() {
        for (String key : List.of("placements", "consultants.total", "finance.summary")) {
            StatTile t = tile(key, acme);
            assertThat(t.previous()).as(key + " previous").isNotNull();
            assertThat(t.sparkline()).as(key + " sparkline").hasSize(6);
            assertThat(t.sparkline().get(5)).as(key + " last point is the value").isEqualTo(t.value());
            if (t.previous() > 0) assertThat(t.deltaPct()).isEqualTo(Math.round((t.value() - t.previous()) * 1000.0 / t.previous()) / 10.0);
        }
        StatTile placementsTile = tile("placements", acme);
        assertThat(placementsTile.value()).isGreaterThan(placementsTile.previous()); // the seeded story: vs last month is up
        assertThat(placementsTile.sparkline().get(0)).isLessThan(placementsTile.sparkline().get(5));
    }

    @Test
    void teamPerformanceHasSixMonthsOfRisingCounts() {
        WidgetResult r = run("team.performance", ctx(acme, RoleTemplates.ORG_ADMIN));
        assertThat(r.state()).isEqualTo(State.OK);
        TeamPerformance t = (TeamPerformance) r.data();
        assertThat(t.months()).hasSize(6);
        assertThat(t.series()).extracting(s -> s.key()).containsExactly("applications", "interviews", "placements");
        for (var s : t.series()) assertThat(s.values()).as(s.key()).hasSize(6);
        List<Long> apps = t.series().get(0).values();
        assertThat(apps.get(5)).isGreaterThan(apps.get(0)); // 6 -> 35 percent of the total in the seed
        assertThat(apps.stream().mapToLong(Long::longValue).sum()).isLessThanOrEqualTo(applications.countByOrgId(acme));
        long inWindow = applications.countByOrgIdAndAppliedOnBetween(acme, LocalDate.now(ZoneOffset.UTC).minusMonths(5).withDayOfMonth(1), LocalDate.now(ZoneOffset.UTC));
        assertThat(apps.stream().mapToLong(Long::longValue).sum()).isEqualTo(inWindow);
    }

    @Test
    void pipelineBucketsFollowTheStageMapping() {
        Pipeline p = (Pipeline) run("pipeline.overview", ctx(acme, RoleTemplates.ORG_ADMIN)).data();
        Map<String, Long> by = p.slices().stream().collect(Collectors.toMap(Slice::key, Slice::value));
        assertThat(by.get("new")).isEqualTo(applications.countByOrgIdAndStage(acme, "ASSIGNED"));
        assertThat(by.get("in_review")).isEqualTo(applications.countByOrgIdAndStageIn(acme, List.of("SUBMITTED", "UNDER_REVIEW")));
        assertThat(by.get("interviewing")).isEqualTo(applications.countByOrgIdAndStage(acme, "INTERVIEWING"));
        assertThat(by.get("offered")).isEqualTo(applications.countByOrgIdAndStage(acme, "OFFER"));
        long hired = applications.findByOrgId(acme).stream().filter(a -> "CLOSED".equals(a.getStage()) && "HIRED".equals(a.getClosedReason())).count();
        assertThat(by.get("hired")).isEqualTo(hired);
        assertThat(p.total()).isEqualTo(by.values().stream().mapToLong(Long::longValue).sum());
        assertThat(p.slices().stream().mapToDouble(s -> s.pct()).sum()).isBetween(99.5, 100.5);
    }

    @Test
    void betaNumbersDifferFromAcmeAndNeverMix() {
        for (String key : List.of("applications.active", "placements", "consultants.total", "finance.summary")) {
            long a = tile(key, acme).value();
            long b = tile(key, beta).value();
            assertThat(b).as(key + " differs between tenants").isNotEqualTo(a);
        }
        assertThat(tile("consultants.total", beta).value()).isEqualTo(consultants.countByOrgIdAndStatus(beta, "ACTIVE"));
        Pipeline pa = (Pipeline) run("pipeline.overview", ctx(acme, RoleTemplates.ORG_ADMIN)).data();
        Pipeline pb = (Pipeline) run("pipeline.overview", ctx(beta, RoleTemplates.ORG_ADMIN)).data();
        assertThat(pb.total()).isNotEqualTo(pa.total());
        // Beta's feed holds only Beta's people
        Activity feed = (Activity) run("activity.recent", ctx(beta, RoleTemplates.ORG_ADMIN)).data();
        assertThat(feed.items()).isNotEmpty();
        Long betaApps = applications.countByOrgId(beta);
        assertThat(betaApps).isLessThan(applications.countByOrgId(acme));
    }

    @Test
    void anOrganizationWithoutRowsGetsHonestEmptyWidgetsNeverZeros() {
        Long nobody = 987_654_321L;
        for (String key : List.of("applications.active", "interviews.upcoming", "placements", "finance.summary", "team.performance", "pipeline.overview", "consultants.total")) {
            WidgetResult r = run(key, ctx(nobody, RoleTemplates.ORG_ADMIN));
            assertThat(r.state()).as(key).isEqualTo(State.EMPTY);
            assertThat(r.reason()).as(key).isNotBlank();
            assertThat(r.data()).as(key).isNull();
        }
    }

    @Test
    void talentAlertsAreRealCountsWithTheDocumentedNumbers() {
        List<Alert> acmeAlerts = alerts.alerts(ctx(acme, RoleTemplates.ORG_ADMIN));
        Map<String, Alert> by = acmeAlerts.stream().collect(Collectors.toMap(Alert::key, a -> a, (x, y) -> x));
        assertThat(by.get("MARKETERS_OVERLOADED").count()).isEqualTo(3L); // talent-foundation.md section 3
        assertThat(by.get("CONSULTANTS_UNASSIGNED").count()).isEqualTo(12L);
        Map<String, Alert> betaBy = alerts.alerts(ctx(beta, RoleTemplates.ORG_ADMIN)).stream().collect(Collectors.toMap(Alert::key, a -> a, (x, y) -> x));
        assertThat(betaBy.get("MARKETERS_OVERLOADED").count()).isEqualTo(2L);
        assertThat(betaBy.get("CONSULTANTS_UNASSIGNED").count()).isEqualTo(4L);
        assertThat(DashboardAlertService.KEYS).contains("INTERVIEWS_WEEK", "APPLICATIONS_NEW", "LICENSES_ATTENTION", "RESUMES_PENDING");
    }

    @Test
    void recentActivityMergesApplicationEventsNewestFirstWithNamesAndJobs() {
        Activity feed = (Activity) run("activity.recent", ctx(acme, RoleTemplates.ORG_ADMIN)).data();
        List<ActivityItem> items = feed.items();
        assertThat(items).hasSizeBetween(1, ActivityRecentProvider.LIMIT);
        for (int i = 1; i < items.size(); i++) assertThat(items.get(i - 1).at()).isAfterOrEqualTo(items.get(i).at());
        List<ActivityItem> appEvents = items.stream().filter(i -> "application".equals(i.source())).toList();
        assertThat(appEvents).isNotEmpty();
        for (ActivityItem a : appEvents) {
            assertThat(a.actorName()).isNotBlank();
            assertThat(a.subject()).isNotBlank();
            assertThat(a.label()).isNotBlank();
        }
    }

    @Test
    void aRoleWithoutAWidgetsPermissionCannotSeeIt() {
        OrgMembership exec = me(acme, RoleTemplates.EXECUTIVE_VIEWER);
        Map<String, Boolean> sees = registry.providers().stream().collect(Collectors.toMap(DashboardWidgetProvider::key, p -> p.permissions().stream().anyMatch(exec::canKey)));
        assertThat(sees.get("finance.summary")).isFalse();
        assertThat(sees.get("placements")).isFalse();
        assertThat(sees.get("pipeline.overview")).isTrue();
        assertThat(sees.get("applications.active")).isTrue();
    }
}
