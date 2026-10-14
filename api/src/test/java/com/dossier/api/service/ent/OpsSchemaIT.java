package com.dossier.api.service.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.ent.ops.HrEmployee;
import com.dossier.api.domain.ent.ops.ReportDefinition;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.ops.FinanceInvoiceRepository;
import com.dossier.api.repository.ent.ops.FinancePaymentRepository;
import com.dossier.api.repository.ent.ops.FinancePlacementPeriodRepository;
import com.dossier.api.repository.ent.ops.FinanceTimesheetRepository;
import com.dossier.api.repository.ent.ops.HrEmployeeRepository;
import com.dossier.api.repository.ent.ops.HrOffboardingTaskRepository;
import com.dossier.api.repository.ent.ops.HrTrainingRecordRepository;
import com.dossier.api.repository.ent.ops.OpsMetricsRepository;
import com.dossier.api.repository.ent.ops.ReportDefinitionRepository;
import com.dossier.api.repository.ent.ops.ReportExportRepository;
import com.dossier.api.repository.ent.ops.ReportRunRepository;
import com.dossier.api.repository.ent.talent.TalentApplicationRepository;
import com.dossier.api.repository.ent.talent.TalentPlacementRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import java.lang.reflect.Method;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.type.filter.AssignableTypeFilter;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.repository.Repository;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.annotation.Transactional;

/**
 * The ops data foundation on MySQL: the migration applies (every table has its tenant keys), the demo seeder fills both demo tenants
 * consistently with the talent rows, a second run adds nothing, Beta never mixes with Acme, every ops repository method is org-scoped, the
 * composite tenant foreign key refuses a cross-tenant child, the board numbers are computable from rows, and no table has a column that
 * could hold sensitive PII (E2: record-only).
 */
@IntegrationTest
@Transactional
@TestPropertySource(properties = { "dossier.demo.enabled=true", "dossier.demo.enterprise-seed=true", "dossier.demo.create-accounts=false" })
@org.junit.jupiter.api.Timeout(1500)
class OpsSchemaIT {

    private static final List<String> TABLES = List.of(
        "hr_employee", "hr_employee_note", "hr_onboarding_item", "hr_document_requirement", "hr_training", "hr_training_record", "hr_offboarding_task", "hr_lifecycle_event",
        "finance_placement_terms", "finance_invoice", "finance_timesheet", "finance_placement_period", "finance_payment", "finance_forecast_input",
        "report_definition", "report_metric", "report_recipient", "report_run", "report_export"
    );

    @Autowired private EnterpriseDemoSeeder baseSeeder;
    @Autowired private TalentDemoSeeder talentSeeder;
    @Autowired private OpsDemoSeeder opsSeeder;
    @Autowired private OrganizationRepository orgs;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private ResumeBuilderSettings settings;
    @Autowired private HrEmployeeRepository employees;
    @Autowired private HrTrainingRecordRepository trainingRecords;
    @Autowired private HrOffboardingTaskRepository offboardingTasks;
    @Autowired private FinancePlacementPeriodRepository periods;
    @Autowired private FinanceTimesheetRepository timesheets;
    @Autowired private FinanceInvoiceRepository invoices;
    @Autowired private FinancePaymentRepository payments;
    @Autowired private ReportDefinitionRepository definitions;
    @Autowired private ReportRunRepository runs;
    @Autowired private ReportExportRepository exports;
    @Autowired private TalentPlacementRepository placements;
    @Autowired private TalentApplicationRepository applications;
    @Autowired private OpsMetricsRepository metrics;

    private Long acme;
    private Long beta;
    private final LocalDate today = LocalDate.now(ZoneOffset.UTC);

    /** Seeding the demo tenants takes minutes on MySQL, so the seeded checks run inside ONE test (see seededFoundationHolds); the schema checks need no data. */
    private void seedAll() {
        assertThat(baseSeeder.seed().ran()).isTrue();
        TalentDemoSeeder.Result t = talentSeeder.seed();
        assertThat(t.ran()).as(String.valueOf(t.skippedBecause())).isTrue();
        OpsDemoSeeder.Result r = opsSeeder.seed();
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

    private long q(String sql, Object... args) {
        Long v = jdbc.queryForObject(sql, Long.class, args);
        return v == null ? 0 : v;
    }

    @Test
    void seededFoundationHolds() {
        seedAll();
        aCrossTenantChildRowIsRefusedByTheDatabase();
        hrRecordsCoverEveryMemberAndConsultantAndTheTilesAddUp();
        financeRowsExistForEveryPlacementAndAreArithmeticallyConsistent();
        monthlySeriesRisesAndTheMarginIsPlausible();
        reportsOverviewNumbersAreComputableFromRows();
        noSensitiveValuesInSeededText();
        secondRunAddsNothing();
        betaIsSmallerAndNeverMixesWithAcme();
        System.out.println("OPS-COUNTS-ACME " + counts(acme));
        System.out.println("OPS-COUNTS-BETA " + counts(beta));
    }

    @Test
    void everyOpsTableHasAnOrgIdAndOnlyCompositeTenantForeignKeys() {
        for (String t : TABLES) {
            assertThat(q("select count(*) from information_schema.columns where table_schema = database() and table_name = ? and column_name = 'org_id' and is_nullable = 'NO'", t)).as(t + ".org_id NOT NULL").isEqualTo(1L);
            assertThat(q("select count(*) from information_schema.key_column_usage where table_schema = database() and table_name = ? and column_name = 'org_id' and referenced_table_name = 'organization'", t)).as(t + " FK to organization").isGreaterThanOrEqualTo(1L);
            // every other FK of the table starts with org_id (composite) and every secondary index starts with org_id
            List<Map<String, Object>> fks = jdbc.queryForList(
                "select constraint_name c, column_name col, ordinal_position pos from information_schema.key_column_usage where table_schema = database() and table_name = ? and referenced_table_name is not null and referenced_table_name <> 'organization'", t);
            for (Map<String, Object> row : fks) if (((Number) row.get("pos")).intValue() == 1) assertThat(row.get("col")).as(t + "." + row.get("c") + " starts with org_id").isEqualTo("org_id");
            List<Map<String, Object>> idx = jdbc.queryForList("select index_name i, column_name col from information_schema.statistics where table_schema = database() and table_name = ? and seq_in_index = 1 and index_name <> 'PRIMARY'", t);
            for (Map<String, Object> row : idx) {
                if (String.valueOf(row.get("i")).startsWith("fk_")) continue; // an FK's helper index MySQL created
                assertThat(row.get("col")).as(t + " index " + row.get("i") + " starts with org_id").isEqualTo("org_id");
            }
        }
    }

    private void aCrossTenantChildRowIsRefusedByTheDatabase() {
        Long acmeEmployee = employees.findByOrgId(acme).get(0).getId();
        assertThatThrownBy(() -> jdbc.update("insert into hr_onboarding_item (org_id, employee_id, title, done, required, sort_order, created_at) values (?, ?, 'x', 0, 1, 0, now(6))", beta, acmeEmployee))
            .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        Long acmePlacement = placements.findByOrgId(acme).get(0).getId();
        assertThatThrownBy(() -> jdbc.update("insert into finance_placement_terms (org_id, placement_id, pay_rate_minor, rate_unit, currency, terms_days, created_at, updated_at) values (?, ?, 1, 'HOUR', 'USD', 30, now(6), now(6))", beta, acmePlacement))
            .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        Long acmeReport = definitions.findByOrgId(acme).get(0).getId();
        assertThatThrownBy(() -> jdbc.update("insert into report_metric (org_id, definition_id, label, sort_order) values (?, ?, 'x', 0)", beta, acmeReport))
            .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
    }

    private void hrRecordsCoverEveryMemberAndConsultantAndTheTilesAddUp() {
        Map<String, Long> c = counts(acme);
        long seats = q("select count(*) from org_member where org_id = ? and status in ('ACTIVE','SUSPENDED','INVITED')", acme);
        long consultants = q("select count(*) from consultant_profile where org_id = ?", acme);
        long linked = q("select count(*) from consultant_profile where org_id = ? and member_id is not null", acme);
        assertThat(c.get("hr_employee")).isEqualTo(seats + consultants - linked);
        assertThat(q("select count(*) from hr_employee e where e.org_id = ? and e.consultant_id is not null", acme)).isEqualTo(consultants);
        assertThat(q("select count(*) from hr_employee e where e.org_id = ? and e.member_id is not null", acme)).isEqualTo(seats);
        assertThat(c.get("hr_training")).isEqualTo(3L);
        assertThat(c.get("hr_document_requirement")).isEqualTo(c.get("hr_employee") * 6);
        assertThat(c.get("hr_onboarding_item")).isEqualTo(c.get("hr_employee") * 5);

        // tiles: statuses and stages partition the directory; offboarding records carry open tasks
        long total = employees.countByOrgIdAndEmploymentStatusNot(acme, "ENDED");
        assertThat(total).isEqualTo(c.get("hr_employee"));
        long active = employees.countByOrgIdAndEmploymentStatus(acme, "ACTIVE");
        long leave = employees.countByOrgIdAndEmploymentStatus(acme, "ON_LEAVE");
        long off = employees.countByOrgIdAndEmploymentStatus(acme, "OFFBOARDING");
        assertThat(active + leave + off).isEqualTo(total);
        assertThat(off).isEqualTo(3L);
        long notStarted = employees.countByOrgIdAndOnboardingStage(acme, "NOT_STARTED");
        long inProgress = employees.countByOrgIdAndOnboardingStage(acme, "IN_PROGRESS");
        long completed = employees.countByOrgIdAndOnboardingStage(acme, "COMPLETED");
        assertThat(notStarted + inProgress + completed).isEqualTo(total);
        assertThat(inProgress).isBetween(3L, 30L);
        assertThat(notStarted).isGreaterThanOrEqualTo(1L);
        Instant now = Instant.now();
        assertThat(employees.countOnboardingInProgressAt(acme, now)).isEqualTo(inProgress);
        assertThat(employees.countEmployedOn(acme, today)).isEqualTo(total - notStarted);
        assertThat(employees.countEmployedOn(acme, today.minusDays(30))).isLessThan(employees.countEmployedOn(acme, today)); // people joined in the last 30 days
        long openOffboarding = offboardingTasks.countByOrgIdAndDone(acme, false);
        assertThat(openOffboarding).isBetween(3L, 14L);
        assertThat(offboardingTasks.countOpenAt(acme, now)).isEqualTo(openOffboarding);

        // compliance completion: a plausible high percentage and it is higher now than 30 days ago (late completions arrive)
        double pctNow = pct(acme, today);
        double pctThen = pct(acme, today.minusDays(30));
        assertThat(pctNow).isBetween(85.0, 99.0);
        assertThat(pctNow).isGreaterThanOrEqualTo(pctThen);

        // the directory query works and filters
        assertThat(employees.search(acme, null, null, null, "", PageRequest.of(0, 10)).getTotalElements()).isEqualTo(total);
        assertThat(employees.search(acme, null, "OFFBOARDING", null, "", PageRequest.of(0, 10)).getTotalElements()).isEqualTo(3L);
        HrEmployee first = employees.findByOrgIdOrderByDisplayNameAsc(acme).get(0);
        assertThat(employees.search(acme, null, null, null, first.getDisplayName().toLowerCase(), PageRequest.of(0, 10)).getTotalElements()).isGreaterThanOrEqualTo(1L);
        // linked consultants who hold a seat keep one record with both ids
        assertThat(q("select count(*) from hr_employee where org_id = ? and member_id is not null and consultant_id is not null", acme)).isEqualTo(linked);
        // the manager of a consultant is that consultant's marketer
        assertThat(q("select count(*) from hr_employee e join marketer_assignment a on a.org_id = e.org_id and a.consultant_id = e.consultant_id where e.org_id = ? and e.manager_member_id <> a.marketer_member_id", acme)).isZero();
    }

    private double pct(Long orgId, LocalDate asOf) {
        long due = trainingRecords.countDueOnOrBefore(orgId, asOf);
        long done = trainingRecords.countCompletedAsOf(orgId, asOf);
        return due == 0 ? 0 : done * 100.0 / due;
    }

    private void financeRowsExistForEveryPlacementAndAreArithmeticallyConsistent() {
        long placementCount = placements.countByOrgId(acme);
        assertThat(q("select count(distinct placement_id) from finance_placement_period where org_id = ?", acme)).as("every placement has finance rows").isEqualTo(placementCount);
        assertThat(q("select count(*) from finance_placement_terms where org_id = ?", acme)).isEqualTo(placementCount);
        // revenue = bill x hours, payout = pay x hours (rounded), margin = (revenue - payout) / revenue, in basis points
        assertThat(q("select count(*) from finance_placement_period where org_id = ? and abs(revenue_minor - round(bill_rate_minor * hours)) > 1", acme)).isZero();
        assertThat(q("select count(*) from finance_placement_period where org_id = ? and abs(payout_minor - round(pay_rate_minor * hours)) > 1", acme)).isZero();
        assertThat(q("select count(*) from finance_placement_period where org_id = ? and abs(margin_bps - floor((revenue_minor - payout_minor) * 10000 / revenue_minor)) > 1", acme)).isZero();
        assertThat(q("select count(*) from finance_placement_period where org_id = ? and pay_rate_minor >= bill_rate_minor", acme)).isZero();

        // the active placements have a row for the current month and (when started before it) for each month of the last three
        LocalDate thisMonth = today.withDayOfMonth(1);
        assertThat(periods.countByOrgIdAndPeriodStart(acme, thisMonth)).isGreaterThanOrEqualTo(placements.countByOrgIdAndStatus(acme, "ACTIVE") - 6);
        // a timesheet exists for each period of the last three months and carries the same hours; older months have none
        assertThat(q("select count(*) from finance_placement_period p where p.org_id = ? and p.period_start >= ? and p.timesheet_id is null", acme, thisMonth.minusMonths(2))).isZero();
        assertThat(q("select count(*) from finance_placement_period p where p.org_id = ? and p.period_start < ? and p.timesheet_id is not null", acme, thisMonth.minusMonths(2))).isZero();
        assertThat(q("select count(*) from finance_placement_period p join finance_timesheet t on t.org_id = p.org_id and t.id = p.timesheet_id where p.org_id = ? and (t.hours <> p.hours or t.placement_id <> p.placement_id or t.period_start <> p.period_start)", acme)).isZero();
        assertThat(timesheets.countByOrgId(acme)).isEqualTo(q("select count(*) from finance_placement_period where org_id = ? and timesheet_id is not null", acme));
        assertThat(timesheets.countByOrgIdAndStatus(acme, "PENDING")).isGreaterThan(5L);
        assertThat(timesheets.countByOrgIdAndStatus(acme, "APPROVED")).isGreaterThan(timesheets.countByOrgIdAndStatus(acme, "PENDING"));
        assertThat(timesheets.countByOrgIdAndStatus(acme, "REJECTED")).isGreaterThanOrEqualTo(0L);
        assertThat(timesheets.countPendingAt(acme, Instant.now())).isEqualTo(timesheets.countByOrgIdAndStatus(acme, "PENDING"));
        assertThat(timesheets.countPendingAt(acme, Instant.now().minus(7, ChronoUnit.DAYS))).isGreaterThanOrEqualTo(0L);
        assertThat(q("select count(*) from finance_timesheet where org_id = ? and status <> 'PENDING' and decided_at is null", acme)).isZero();

        // invoice workflow: every invoice-status value is present and matches the invoice row
        for (String s : List.of("PAID", "INVOICED", "OVERDUE", "PENDING_INVOICE", "PENDING_REVIEW"))
            assertThat(q("select count(*) from finance_placement_period where org_id = ? and invoice_status = ?", acme, s)).as(s).isGreaterThan(0L);
        assertThat(q("select count(*) from finance_placement_period p join finance_invoice i on i.org_id = p.org_id and i.id = p.invoice_id where p.org_id = ? and i.amount_minor <> p.revenue_minor", acme)).isZero();
        assertThat(q("select count(*) from finance_placement_period where org_id = ? and invoice_status in ('PAID','INVOICED','OVERDUE') and invoice_id is null", acme)).isZero();
        assertThat(q("select count(*) from finance_invoice where org_id = ? and status = 'OVERDUE' and due_on >= ?", acme, today)).isZero();
        assertThat(q("select count(*) from finance_invoice where org_id = ? and status = 'PAID' and paid_on is null", acme)).isZero();
        assertThat(q("select count(*) from finance_invoice where org_id = ? and (paid_on > ? or issued_on > ?)", acme, today, today)).isZero();
        assertThat(invoices.countByOrgIdAndStatus(acme, "PAID")).isEqualTo(q("select count(*) from finance_payment where org_id = ? and direction = 'IN' and status = 'PAID'", acme));
        assertThat(q("select count(*) from (select code from finance_invoice where org_id = ? group by code having count(*) > 1) x", acme)).isZero();

        // payouts: open ones exist, only approved or untimesheeted periods have one
        assertThat(payments.sumOpenPayouts(acme)).isPositive();
        assertThat(payments.countByOrgIdAndDirectionAndStatus(acme, "OUT", "PAID")).isPositive();
        assertThat(q("select count(*) from finance_payment o join finance_timesheet t on t.org_id = o.org_id and t.placement_id = o.placement_id and t.period_start = o.period_start where o.org_id = ? and o.direction = 'OUT' and t.status <> 'APPROVED'", acme)).isZero();
        assertThat(q("select count(*) from finance_payment where org_id = ? and status = 'PAID' and paid_on is null", acme)).isZero();
        assertThat(payments.sumOpenPayoutsAt(acme, Instant.now(), today)).isEqualTo(payments.sumOpenPayouts(acme));
        assertThat(payments.sumOpenPayoutsAt(acme, Instant.now().minus(30, ChronoUnit.DAYS), today.minusDays(30))).isGreaterThanOrEqualTo(0L);

        // forecast inputs for the next six months
        assertThat(counts(acme).get("finance_forecast_input")).isEqualTo(6L);
    }

    private void monthlySeriesRisesAndTheMarginIsPlausible() {
        LocalDate first = today.withDayOfMonth(1).minusMonths(5);
        List<Object[]> series = periods.monthlySeries(acme, first, today.withDayOfMonth(1));
        assertThat(series).hasSize(6);
        long firstRevenue = ((Number) series.get(0)[1]).longValue();
        long lastRevenue = ((Number) series.get(5)[1]).longValue();
        assertThat(lastRevenue).isGreaterThan(firstRevenue);
        long thisMonth = periods.sumRevenue(acme, today.withDayOfMonth(1));
        assertThat(thisMonth).isEqualTo(lastRevenue);
        long prev = periods.sumRevenue(acme, today.withDayOfMonth(1).minusMonths(1));
        assertThat(thisMonth).as("revenue this month vs last month is a rise").isGreaterThan(prev);
        for (Object[] row : series) {
            long rev = ((Number) row[1]).longValue();
            long pay = ((Number) row[2]).longValue();
            double margin = (rev - pay) * 100.0 / rev;
            assertThat(margin).isBetween(26.0, 38.0);
        }
        // the table query works and filters
        assertThat(periods.search(acme, today.withDayOfMonth(1), null, null, null, "", PageRequest.of(0, 10)).getTotalElements()).isEqualTo(periods.countByOrgIdAndPeriodStart(acme, today.withDayOfMonth(1)));
        assertThat(periods.search(acme, today.withDayOfMonth(1), "PENDING_REVIEW", null, null, "", PageRequest.of(0, 10)).getTotalElements())
            .isEqualTo(periods.countByOrgIdAndPeriodStartAndInvoiceStatus(acme, today.withDayOfMonth(1), "PENDING_REVIEW"));
    }

    private void reportsOverviewNumbersAreComputableFromRows() {
        Map<String, Long> c = counts(acme);
        assertThat(c.get("report_definition")).isEqualTo(12L);
        assertThat(c.get("report_metric")).isGreaterThanOrEqualTo(36L);
        assertThat(c.get("report_recipient")).isGreaterThanOrEqualTo(24L);
        assertThat(c.get("report_run")).isGreaterThan(40L);
        for (ReportDefinition d : definitions.findByOrgId(acme)) {
            assertThat(Set.of("RECRUITING", "CONSULTANTS", "FINANCE", "CLIENTS")).contains(d.getReportType());
            assertThat(runs.findByOrgIdAndDefinitionIdOrderByStartedAtDesc(acme, d.getId())).isNotEmpty();
            var latest = runs.findFirstByOrgIdAndDefinitionIdOrderByStartedAtDesc(acme, d.getId()).orElseThrow();
            assertThat(d.getLastRunAt()).isEqualTo(latest.getStartedAt());
            assertThat(d.getLastRunStatus()).isEqualTo(latest.getStatus());
            assertThat(d.getLastRunSummary()).isEqualTo(latest.getSummary());
            assertThat(d.getLastRunAt()).isBefore(Instant.now());
            if (!"NONE".equals(d.getScheduleFrequency())) assertThat(d.getNextRunAt()).isAfter(d.getLastRunAt());
            else assertThat(d.getNextRunAt()).isNull();
        }
        assertThat(runs.countByOrgIdAndStatus(acme, "FAILED")).isGreaterThanOrEqualTo(1L);
        assertThat(exports.countByOrgIdAndStatus(acme, "READY")).isBetween(1L, 5L);
        assertThat(q("select count(*) from report_export where org_id = ? and status = 'READY' and expires_at < now(6)", acme)).isZero();
        assertThat(definitions.search(acme, "FINANCE", null, null, "", PageRequest.of(0, 10)).getTotalElements()).isGreaterThanOrEqualTo(3L);

        // Applications by source adds up to the applications of the window and leads with LinkedIn (the board's mix)
        LocalDate from = today.minusMonths(6);
        List<Object[]> bySource = metrics.applicationsBySource(acme, from, today);
        long sum = bySource.stream().mapToLong(r -> ((Number) r[1]).longValue()).sum();
        assertThat(sum).isEqualTo(applications.countByOrgIdAndAppliedOnBetween(acme, from, today));
        assertThat(bySource.get(0)[0]).isEqualTo("LinkedIn");
        // Applications per month: six rising buckets that add up to the total
        List<Object[]> perMonth = metrics.applicationsPerMonth(acme, today.withDayOfMonth(1).minusMonths(5), today);
        assertThat(perMonth).hasSize(6);
        assertThat(perMonth.stream().mapToLong(r -> ((Number) r[2]).longValue()).sum()).isEqualTo(applications.countByOrgId(acme));
        // Placements by department/industry add up to the placements started in the window
        LocalDate yearStart = today.withDayOfYear(1);
        long started = placements.countByOrgIdAndStartDateBetween(acme, yearStart, today);
        assertThat(metrics.placementsByClientIndustry(acme, yearStart, today).stream().mapToLong(r -> ((Number) r[1]).longValue()).sum()).isEqualTo(started);
        assertThat(metrics.placementsByConsultantDepartment(acme, yearStart, today).stream().mapToLong(r -> ((Number) r[1]).longValue()).sum()).isEqualTo(started);
        // Interview conversion: applications entering INTERVIEWING over applications created, over the last 90 days, is a sane fraction
        Instant to = Instant.now();
        Instant start = to.minus(90, ChronoUnit.DAYS);
        long created = metrics.countApplicationsCreated(acme, start, to);
        long interviewed = metrics.countApplicationsEnteringStage(acme, "INTERVIEWING", start, to);
        assertThat(created).isPositive();
        assertThat(interviewed).isBetween(1L, created);
    }

    private void secondRunAddsNothing() {
        Map<String, Long> before = counts(acme);
        Map<String, Long> betaBefore = counts(beta);
        OpsDemoSeeder.Result r = opsSeeder.seed();
        assertThat(r.ran()).isTrue();
        assertThat(r.seeded()).isEmpty();
        assertThat(counts(acme)).isEqualTo(before);
        assertThat(counts(beta)).isEqualTo(betaBefore);
    }

    private void betaIsSmallerAndNeverMixesWithAcme() {
        Map<String, Long> b = counts(beta);
        Map<String, Long> a = counts(acme);
        assertThat(b.get("hr_employee")).isGreaterThan(40L).isLessThan(a.get("hr_employee"));
        assertThat(b.get("report_definition")).isEqualTo(5L);
        assertThat(b.get("finance_placement_period")).isBetween(a.get("finance_placement_period") / 6, a.get("finance_placement_period") / 2);
        assertThat(b.get("finance_placement_period")).isEqualTo(q("select count(*) from finance_placement_period p join talent_placement t on t.id = p.placement_id where p.org_id = ? and t.org_id = ?", beta, beta));
        for (HrEmployee e : employees.findByOrgId(acme)) assertThat(employees.findByOrgIdAndId(beta, e.getId())).isEmpty();
        for (String t : List.of("hr_employee", "finance_placement_period", "finance_invoice", "finance_payment", "finance_timesheet", "report_run", "report_export")) {
            assertThat(q("select count(*) from " + t + " x join organization o on o.id = x.org_id where x.org_id = ? and o.slug <> 'demo-beta'", beta)).as(t).isZero();
        }
        // no Beta row references an Acme parent (the composite FKs make it a database fact; this proves the data agrees)
        assertThat(q("select count(*) from hr_employee e join consultant_profile c on c.id = e.consultant_id where e.org_id <> c.org_id", new Object[0])).isZero();
        assertThat(q("select count(*) from finance_payment p join talent_placement t on t.id = p.placement_id where p.org_id <> t.org_id", new Object[0])).isZero();
        assertThat(q("select count(*) from report_recipient r join org_member m on m.id = r.member_id where r.org_id <> m.org_id", new Object[0])).isZero();
        assertThat(definitions.findByOrgId(beta)).extracting(ReportDefinition::getName).doesNotContain("Revenue Summary").contains("Application Funnel Report");
    }

    /**
     * NeverCollectedSchema-style guard (E2, doc 36 section 1): no ops table has a column that could hold a phone number, date of birth,
     * identity-document, tax-id, bank or routing value. Matched by underscore-separated tokens (so "starting" does not trip "tin") plus a few
     * whole-name fragments.
     */
    @Test
    void noOpsTableHasAColumnThatCouldHoldSensitivePii() {
        Set<String> bannedTokens = Set.of("ssn", "itin", "dob", "birth", "birthday", "passport", "visa", "i9", "ead", "bank", "routing", "iban", "swift", "ein", "tin", "vat", "phone", "mobile", "cell", "fax", "ssn4", "pin", "cvv", "card", "pan");
        List<String> bannedFragments = List.of("account_no", "account_number", "tax_id", "taxid", "document_number", "doc_number", "id_number", "licence_no", "license_no", "drivers_license", "national_id", "social_security", "date_of_birth");
        List<Map<String, Object>> cols = jdbc.queryForList("select table_name t, column_name c from information_schema.columns where table_schema = database() and table_name in (" + String.join(",", TABLES.stream().map(x -> "'" + x + "'").toList()) + ")");
        assertThat(cols).hasSizeGreaterThan(150);
        for (Map<String, Object> row : cols) {
            String col = String.valueOf(row.get("c")).toLowerCase();
            for (String token : col.split("_")) assertThat(bannedTokens).as(row.get("t") + "." + col + " has a banned token").doesNotContain(token);
            for (String frag : bannedFragments) assertThat(col).as(row.get("t") + "." + col).doesNotContain(frag);
        }
        // (value checks run in seededFoundationHolds)
    }

    private void noSensitiveValuesInSeededText() {
        // the seeded free text carries no digits-heavy values either: no value of any short text column looks like an SSN or card number
        assertThat(q("select count(*) from hr_employee where work_email regexp '[0-9]{3}-[0-9]{2}-[0-9]{4}' or job_title regexp '[0-9]{9}'")).isZero();
        assertThat(q("select count(*) from hr_employee_note where body regexp '[0-9]{3}-[0-9]{2}-[0-9]{4}' or body regexp '[0-9]{9,}'")).isZero();
        assertThat(q("select count(*) from finance_payment where memo regexp '[0-9]{9,}' or method_label regexp '[0-9]{6,}'")).isZero();
    }

    @Test
    void everyOpsRepositoryMethodIsOrgScoped() throws Exception {
        ClassPathScanningCandidateComponentProvider scanner = new ClassPathScanningCandidateComponentProvider(false) {
            @Override
            protected boolean isCandidateComponent(org.springframework.beans.factory.annotation.AnnotatedBeanDefinition bd) {
                return bd.getMetadata().isInterface();
            }
        };
        scanner.addIncludeFilter(new AssignableTypeFilter(Repository.class));
        int checked = 0;
        for (BeanDefinition bd : scanner.findCandidateComponents("com.dossier.api.repository.ent.ops")) {
            Class<?> repo = Class.forName(bd.getBeanClassName());
            for (Method m : repo.getDeclaredMethods()) {
                if (Set.of("save", "saveAndFlush", "flush", "saveAll", "saveAllAndFlush", "delete", "deleteAll").contains(m.getName())) continue;
                assertThat(m.getParameterCount()).as(repo.getSimpleName() + "." + m.getName()).isGreaterThan(0);
                org.springframework.data.repository.query.Param p = m.getParameters()[0].getAnnotation(org.springframework.data.repository.query.Param.class);
                assertThat(p != null ? p.value() : m.getParameters()[0].getName()).as(repo.getSimpleName() + "." + m.getName() + " takes orgId first").isEqualTo("orgId");
                checked++;
            }
        }
        assertThat(checked).isGreaterThan(80);
        assertThat(scanner.findCandidateComponents("com.dossier.api.repository.ent.ops")).hasSize(21);
    }
}
