package com.dossier.api.service.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.ent.billing.ConsultantLicense;
import com.dossier.api.domain.ent.billing.OrgInvoice;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.billing.ConsultantLicenseRepository;
import com.dossier.api.repository.ent.billing.LicenseChangeRepository;
import com.dossier.api.repository.ent.billing.LicenseFeatureRepository;
import com.dossier.api.repository.ent.billing.OrgBillingAdjustmentRepository;
import com.dossier.api.repository.ent.billing.OrgInvoiceLineRepository;
import com.dossier.api.repository.ent.billing.OrgInvoiceRepository;
import com.dossier.api.repository.ent.billing.OrgPaymentRepository;
import com.dossier.api.repository.ent.billing.OrgSubscriptionItemRepository;
import com.dossier.api.repository.ent.billing.OrgSubscriptionRepository;
import com.dossier.api.repository.ent.billing.SubscriptionChangeRepository;
import com.dossier.api.repository.ent.billing.UsageAlertRepository;
import com.dossier.api.repository.ent.billing.UsageCounterRepository;
import com.dossier.api.repository.ent.billing.UsageEventRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import java.lang.reflect.Method;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
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
 * The billing data foundation on MySQL: the migration applies (every org table has org_id NOT NULL + a tenant FK, the composite tenant
 * FK refuses a cross-tenant child), the demo seeder fills the two demo tenants consistently with the talent seed (licenses link to the
 * seeded consultants), a second run adds nothing, Beta never mixes with Acme, money columns add up (sum of invoice lines = invoice
 * amount, payments = paid amount, usage counters = usage events), and every billing repository method is org-scoped.
 */
@IntegrationTest
@Transactional
@TestPropertySource(properties = { "dossier.demo.enabled=true", "dossier.demo.enterprise-seed=true", "dossier.demo.create-accounts=false" })
@org.junit.jupiter.api.Timeout(3000)
class BillingSchemaIT {

    @Autowired private EnterpriseDemoSeeder baseSeeder;
    @Autowired private TalentDemoSeeder talentSeeder;
    @Autowired private BillingDemoSeeder billingSeeder;
    @Autowired private OrganizationRepository orgs;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private ResumeBuilderSettings settings;
    @Autowired private ConsultantLicenseRepository licenses;
    @Autowired private LicenseFeatureRepository licenseFeatures;
    @Autowired private LicenseChangeRepository licenseChanges;
    @Autowired private OrgInvoiceRepository invoices;
    @Autowired private OrgInvoiceLineRepository lines;
    @Autowired private OrgPaymentRepository payments;
    @Autowired private OrgBillingAdjustmentRepository adjustments;
    @Autowired private OrgSubscriptionRepository subscriptions;
    @Autowired private OrgSubscriptionItemRepository items;
    @Autowired private SubscriptionChangeRepository subscriptionChanges;
    @Autowired private UsageCounterRepository counters;
    @Autowired private UsageEventRepository events;
    @Autowired private UsageAlertRepository alerts;

    private Long acme;
    private Long beta;

    private void seed() {
        assertThat(baseSeeder.seed().ran()).isTrue();
        TalentDemoSeeder.Result t = talentSeeder.seed();
        assertThat(t.ran()).as(String.valueOf(t.skippedBecause())).isTrue();
        BillingDemoSeeder.Result r = billingSeeder.seed();
        assertThat(r.ran()).as(String.valueOf(r.skippedBecause())).isTrue();
        acme = orgs.findBySlug(EnterpriseDemoSeeder.ACME_SLUG).map(Organization::getId).orElseThrow();
        beta = orgs.findBySlug(EnterpriseDemoSeeder.BETA_SLUG).map(Organization::getId).orElseThrow();
    }


    /** One seeding for the whole class (the base + talent + billing seed takes minutes on a loaded machine), then every check in order. */
    @Test
    void billingFoundation() throws Exception {
        try {
            seed();
            everyBillingTableHasAnOrgIdAndTenantForeignKeys();
            aCrossTenantChildRowIsRefusedByTheDatabase();
            acmeLicensesAreSeededRichAndLinkedToTheSeededConsultants();
            moneyAddsUp();
            sixMonthsOfRisingRecurringSpendAndTheBillingTiles();
            usageCountersEqualEventsAndTheTrendIsUp();
            secondRunAddsNothing();
            betaIsSmallerAndNeverMixesWithAcme();
            everyBillingRepositoryMethodIsOrgScoped();
        } finally {
            settings.invalidate();
        }
    }

    private Map<String, Long> counts(Long orgId) {
        Map<String, Long> m = new HashMap<>();
        for (String t : BillingDemoSeeder.TABLES) m.put(t, jdbc.queryForObject("select count(*) from " + t + " where org_id = ?", Long.class, orgId));
        return m;
    }

    private static String periodKey(LocalDate d) {
        return String.format("%04d-%02d", d.getYear(), d.getMonthValue());
    }

    private void everyBillingTableHasAnOrgIdAndTenantForeignKeys() {
        for (String t : BillingDemoSeeder.TABLES) {
            Long cols = jdbc.queryForObject("select count(*) from information_schema.columns where table_schema = database() and table_name = ? and column_name = 'org_id' and is_nullable = 'NO'", Long.class, t);
            assertThat(cols).as(t + ".org_id NOT NULL").isEqualTo(1L);
            Long fk = jdbc.queryForObject(
                "select count(*) from information_schema.key_column_usage where table_schema = database() and table_name = ? and column_name = 'org_id' and referenced_table_name = 'organization'", Long.class, t);
            assertThat(fk).as(t + " FK to organization").isGreaterThanOrEqualTo(1L);
            Long uk = jdbc.queryForObject(
                "select count(*) from information_schema.table_constraints where table_schema = database() and table_name = ? and constraint_type = 'UNIQUE' and constraint_name = ?", Long.class, t, "uk_" + t + "_org_id");
            assertThat(uk).as(t + " has uk (org_id, id)").isEqualTo(1L);
        }
        // every FK from a billing table to another org-owned table is composite and starts with org_id
        List<Map<String, Object>> rows = jdbc.queryForList(
            "select table_name t, constraint_name c, column_name col, referenced_table_name r from information_schema.key_column_usage "
                + "where table_schema = database() and referenced_table_name is not null and ordinal_position = 1 and table_name in ("
                + String.join(",", BillingDemoSeeder.TABLES.stream().map(x -> "'" + x + "'").toList()) + ")");
        assertThat(rows).isNotEmpty();
        Set<String> platform = Set.of("product", "feature_definition", "organization");
        for (Map<String, Object> row : rows) {
            if (platform.contains(String.valueOf(row.get("r")))) continue;
            assertThat(row.get("col")).as(row.get("t") + "." + row.get("c") + " is a composite tenant FK").isEqualTo("org_id");
        }
        // platform catalog tables carry no org_id and no price column
        for (String t : List.of("feature_definition", "product")) {
            assertThat(jdbc.queryForObject("select count(*) from information_schema.columns where table_schema = database() and table_name = ? and (column_name = 'org_id' or column_name like '%amount%' or column_name like '%price%')", Long.class, t)).as(t).isZero();
        }
        // no card-number-like or sensitive columns anywhere in the new tables
        assertThat(jdbc.queryForObject(
            "select count(*) from information_schema.columns where table_schema = database() and table_name in (" + String.join(",", BillingDemoSeeder.TABLES.stream().map(x -> "'" + x + "'").toList())
                + ") and column_name regexp 'card_?number|cvv|pan_|ssn|tax_?id|iban|routing|account_?number|passport|dob|birth'", Long.class)).isZero();
    }

    private void aCrossTenantChildRowIsRefusedByTheDatabase() {
        Long acmeInvoice = invoices.findByOrgId(acme).get(0).getId();
        assertThatThrownBy(() -> jdbc.update(
            "insert into org_invoice_line (org_id, invoice_id, line_kind, description, quantity, unit_amount_minor, amount_minor, sort_order) values (?, ?, 'BASE_LICENSE', 'x', 1, 1, 1, 1)", beta, acmeInvoice))
            .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        Long acmeConsultant = licenses.findByOrgId(acme).get(0).getConsultantId();
        assertThatThrownBy(() -> jdbc.update(
            "insert into usage_counter (org_id, consultant_id, feature_key, period_key, used, allowance, updated_at) values (?, ?, 'ai_assistant', '2000-01', 1, 1, now(6))", beta, acmeConsultant))
            .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        // one live license per consultant (generated key)
        ConsultantLicense live = licenses.findByOrgId(acme).stream().filter(l -> !"ENDED".equals(l.getStatus())).findFirst().orElseThrow();
        assertThatThrownBy(() -> jdbc.update(
            "insert into consultant_license (org_id, consultant_id, status, base_product_id, base_amount_minor, currency, starts_at, created_at, updated_at) values (?, ?, 'ACTIVE', ?, 1, 'USD', now(6), now(6), now(6))",
            acme, live.getConsultantId(), live.getBaseProductId()))
            .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
    }

    private void acmeLicensesAreSeededRichAndLinkedToTheSeededConsultants() {
        Map<String, Long> c = counts(acme);
        assertThat(jdbc.queryForObject("select count(*) from consultant_profile where org_id = ?", Long.class, acme)).isEqualTo(153L);
        assertThat(licenses.countLive(acme)).isEqualTo(142L);
        assertThat(licenses.countByOrgIdAndStatus(acme, "ACTIVE")).isEqualTo(118L);
        assertThat(licenses.countByOrgIdAndStatus(acme, "CANCEL_AT_PERIOD_END")).isEqualTo(18L);
        assertThat(licenses.countByOrgIdAndStatus(acme, "SUSPENDED")).isEqualTo(4L);
        assertThat(licenses.countByOrgIdAndStatus(acme, "PENDING")).isEqualTo(2L);
        assertThat(licenses.countByOrgIdAndStatus(acme, "ENDED")).isEqualTo(9L);
        // expiring: the 18 end within the next 30 days
        Instant now = Instant.now();
        assertThat(licenses.countByOrgIdAndStatusAndEndsAtBetween(acme, "CANCEL_AT_PERIOD_END", now, now.plus(30, ChronoUnit.DAYS))).isEqualTo(18L);
        // unlicensed = consultants without a live license
        long unlicensed = jdbc.queryForObject("select count(*) from consultant_profile p where p.org_id = ? and not exists (select 1 from consultant_license l where l.org_id = p.org_id and l.consultant_id = p.id and l.status <> 'ENDED')", Long.class, acme);
        assertThat(unlicensed).isEqualTo(11L);
        // licensed of capacity 142 / 150
        assertThat(subscriptions.findFirstByOrgIdOrderByIdDesc(acme).orElseThrow().getLicensedCapacity()).isEqualTo(150);
        // add-on features enabled; all 12 features carry usage this month
        assertThat(licenseFeatures.countEnabled(acme)).isBetween(110L, 260L);
        assertThat(counters.countFeatures(acme, periodKey(LocalDate.now(ZoneOffset.UTC)))).isEqualTo(12L);
        // growth: more licenses live now than 30 days ago
        assertThat(licenses.countLiveAt(acme, now)).isGreaterThan(licenses.countLiveAt(acme, now.minus(30, ChronoUnit.DAYS)));
        // history rows exist and scheduled changes are PENDING in the future
        assertThat(licenseChanges.countByOrgIdAndStatus(acme, "PENDING")).isBetween(25L, 40L);
        assertThat(c.get("license_change")).isGreaterThan(200L);
        assertThat(subscriptionChanges.findTop10ByOrgIdOrderByOccurredAtDesc(acme)).hasSizeGreaterThanOrEqualTo(5);
        // each seeded license points at a consultant of this org
        assertThat(jdbc.queryForObject("select count(*) from consultant_license l join consultant_profile p on p.id = l.consultant_id where l.org_id <> p.org_id", Long.class)).isZero();
        // the Consultants board's license chip follows the license
        assertThat(jdbc.queryForObject("select count(*) from consultant_profile p join consultant_license l on l.org_id = p.org_id and l.consultant_id = p.id where p.org_id = ? and l.status = 'ACTIVE' and p.license_status <> 'ACTIVE'", Long.class, acme)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from consultant_profile where org_id = ? and license_status = 'EXPIRING'", Long.class, acme)).isEqualTo(18L);
    }

    private void moneyAddsUp() {
        for (Long org : List.of(acme, beta)) {
            for (OrgInvoice inv : invoices.findByOrgId(org)) {
                assertThat(lines.sumAmount(org, inv.getId())).as(inv.getInvoiceNumber() + " lines = amount").isEqualTo(inv.getAmountMinor());
                assertThat(inv.getInvoiceNumber()).matches("INV-\\d{4}-\\d{4}");
                long succeeded = payments.findByOrgIdAndInvoiceIdOrderByOccurredAtAsc(org, inv.getId()).stream().filter(p -> "SUCCEEDED".equals(p.getStatus())).mapToLong(p -> p.getAmountMinor()).sum();
                if ("PAID".equals(inv.getStatus())) {
                    assertThat(inv.getAmountPaidMinor()).isEqualTo(inv.getAmountMinor());
                    assertThat(succeeded).as(inv.getInvoiceNumber() + " payments = amount").isEqualTo(inv.getAmountMinor());
                } else {
                    assertThat(inv.getAmountPaidMinor()).isZero();
                    assertThat(succeeded).isZero();
                }
                assertThat(inv.getAmountMinor()).isPositive();
            }
        }
        // subscription items: licensed per base tier = BILLABLE license count; monthly total = base + features + org add-ons
        var sub = subscriptions.findFirstByOrgIdOrderByIdDesc(acme).orElseThrow();
        long baseQty = items.findByOrgIdAndSubscriptionIdOrderBySortOrderAsc(acme, sub.getId()).stream().filter(i -> "BASE_LICENSE".equals(i.getKind())).mapToLong(i -> i.getQuantity()).sum();
        long billable = licenses.countByOrgIdAndStatus(acme, "ACTIVE") + licenses.countByOrgIdAndStatus(acme, "CANCEL_AT_PERIOD_END") + licenses.countByOrgIdAndStatus(acme, "PENDING");
        assertThat(baseQty).isEqualTo(billable);
        long orgAddons = items.findByOrgIdAndSubscriptionIdOrderBySortOrderAsc(acme, sub.getId()).stream().filter(i -> "ORG_ADDON".equals(i.getKind())).mapToLong(i -> i.getUnitAmountMinor() * i.getQuantity()).sum();
        assertThat(items.sumMonthlyMinor(acme, sub.getId())).isEqualTo(
            licenses.sumBaseAmount(acme, BillingDemoSeeder.BILLABLE) + licenseFeatures.sumAmount(acme, BillingDemoSeeder.BILLABLE) + orgAddons);
        // adjustments: the pending credit lands on the next invoice; applied ones are linked to an invoice
        assertThat(adjustments.sumAmountByStatus(acme, "PENDING")).isNegative();
        adjustments.findByOrgIdAndStatusOrderByCreatedAtDesc(acme, "APPLIED").forEach(a -> assertThat(a.getAppliedInvoiceId()).isNotNull());
    }

    private void sixMonthsOfRisingRecurringSpendAndTheBillingTiles() {
        LocalDate first = LocalDate.now(ZoneOffset.UTC).withDayOfMonth(1);
        List<Long> series = new ArrayList<>();
        for (int k = 6; k >= 1; k--) {
            LocalDate ps = first.minusMonths(k);
            List<OrgInvoice> inv = invoices.findByOrgIdAndKindAndPeriodStartBetweenOrderByPeriodStartAsc(acme, "RECURRING", ps, ps);
            assertThat(inv).as("one recurring invoice for " + ps).hasSize(1);
            series.add(lines.sumRecurring(acme, inv.get(0).getId()));
        }
        for (int i = 1; i < series.size(); i++) assertThat(series.get(i)).as("recurring month " + i).isGreaterThan(series.get(i - 1));
        assertThat(invoices.findByOrgIdAndKindAndPeriodStartBetweenOrderByPeriodStartAsc(acme, "RECURRING", first.minusMonths(24), first)).hasSize(12);
        // tiles: one overdue invoice, outstanding > 0, the latest invoice open, a failed payment exists but the success rate is high
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        // The seeded onboarding invoice (due 30 days ago) is always overdue. The latest recurring invoice stays open and is due 14 days after its
        // period ends, so from the 15th of the month on it is overdue too: the expectation follows the calendar instead of assuming "exactly one".
        long expectedOverdue = invoices.findByOrgId(acme).stream().filter(i -> "OPEN".equals(i.getStatus()) && i.getDueDate().isBefore(today)).count();
        assertThat(invoices.countOverdue(acme, today)).isEqualTo(expectedOverdue);
        assertThat(expectedOverdue).as("the onboarding invoice, plus the latest recurring one once its 14 days are up").isBetween(1L, 2L);
        assertThat(invoices.findOverdue(acme, today)).anyMatch(i -> i.getDescription().startsWith("Onboarding and training services"));
        assertThat(invoices.sumOutstanding(acme)).isPositive();
        Instant from = today.minusYears(1).atStartOfDay().toInstant(ZoneOffset.UTC);
        Instant to = Instant.now().plusSeconds(60);
        long attempts = payments.countAttemptsBetween(acme, from, to);
        long ok = payments.countByOrgIdAndStatusAndOccurredAtBetween(acme, "SUCCEEDED", from, to);
        assertThat(attempts).isGreaterThan(ok);
        assertThat(ok * 100.0 / attempts).isGreaterThan(85.0);
        assertThat(invoices.sumIssuedBetween(acme, first, today)).isPositive();
        assertThat(payments.sumSucceededBetween(acme, first.atStartOfDay().toInstant(ZoneOffset.UTC), to)).isPositive();
        assertThat(invoices.findByOrgIdOrderByIssueDateDescIdDesc(acme, PageRequest.of(0, 10)).getContent()).hasSize(10);
    }

    private void usageCountersEqualEventsAndTheTrendIsUp() {
        LocalDate first = LocalDate.now(ZoneOffset.UTC).withDayOfMonth(1);
        String cur = periodKey(first);
        String prev = periodKey(first.minusMonths(1));
        for (String p : List.of(cur, prev)) {
            for (var c : counters.findByOrgIdAndPeriodKey(acme, p)) {
                assertThat(events.sumQuantity(acme, c.getConsultantId(), c.getFeatureKey(), p)).as("events = counter " + c.getFeatureKey() + " " + p).isEqualTo(c.getUsed());
                assertThat(c.getUsed()).isLessThanOrEqualTo(c.getAllowance());
            }
            assertThat(events.sumQuantity(acme, p)).isEqualTo(counters.sumUsed(acme, p));
        }
        long used = counters.sumUsed(acme, cur);
        long before = counters.sumUsed(acme, prev);
        assertThat(used).isGreaterThan(before);
        assertThat(used * 100.0 / before).isBetween(105.0, 175.0);
        assertThat(counters.sumUsedAi(acme, cur)).isPositive().isLessThan(used);
        // six months of counters, rising overall
        List<Object[]> trend = counters.trend(acme, periodKey(first.minusMonths(5)), cur);
        assertThat(trend).hasSize(6);
        assertThat((Long) trend.get(5)[1]).isGreaterThan((Long) trend.get(0)[1]);
        // most used feature exists; alerts exist and are at 80 % or more
        assertThat(counters.byFeature(acme, cur)).hasSize(12);
        assertThat(alerts.findTop10ByOrgIdOrderByCreatedAtDesc(acme)).isNotEmpty();
        assertThat(counters.findAtOrAbovePct(acme, cur, 80)).isNotEmpty();
        assertThat(jdbc.queryForObject("select count(*) from feature_credit where org_id = ?", Long.class, acme)).isGreaterThanOrEqualTo(1L);
    }

    private void secondRunAddsNothing() {
        Map<String, Long> before = counts(acme);
        Map<String, Long> betaBefore = counts(beta);
        Long products = jdbc.queryForObject("select count(*) from product", Long.class);
        BillingDemoSeeder.Result r = billingSeeder.seed();
        assertThat(r.ran()).isTrue();
        assertThat(r.seeded()).isEmpty();
        assertThat(counts(acme)).isEqualTo(before);
        assertThat(counts(beta)).isEqualTo(betaBefore);
        assertThat(jdbc.queryForObject("select count(*) from product", Long.class)).isEqualTo(products);
        assertThat(jdbc.queryForObject("select count(*) from product where demo_data = false", Long.class)).isZero(); // the demo owns the whole catalog here
    }

    private void betaIsSmallerAndNeverMixesWithAcme() {
        Map<String, Long> b = counts(beta);
        assertThat(licenses.countLive(beta)).isEqualTo(34L);
        assertThat(b.get("org_invoice")).isEqualTo(6L);
        assertThat(b.get("org_contract")).isEqualTo(1L);
        assertThat(b.get("consultant_license")).isLessThan(counts(acme).get("consultant_license") / 2);
        // no Acme row is visible through Beta's id; no Beta row points at an Acme parent
        for (ConsultantLicense l : licenses.findByOrgId(acme).subList(0, 5)) assertThat(licenses.findByOrgIdAndId(beta, l.getId())).isEmpty();
        for (String t : List.of("org_invoice_line", "license_feature", "usage_counter", "usage_event", "license_change")) {
            String parent = switch (t) {
                case "org_invoice_line" -> "org_invoice p on p.id = x.invoice_id";
                case "license_feature", "license_change" -> "consultant_license p on p.id = x.license_id";
                default -> "consultant_profile p on p.id = x.consultant_id";
            };
            assertThat(jdbc.queryForObject("select count(*) from " + t + " x join " + parent + " where x.org_id <> p.org_id", Long.class)).as(t).isZero();
        }
        assertThat(jdbc.queryForObject("select count(distinct i.invoice_number) from org_invoice i where i.org_id = ?", Long.class, beta)).isEqualTo(6L);
        assertThat(counters.byFeature(beta, periodKey(LocalDate.now(ZoneOffset.UTC)))).isNotEmpty();
    }

    private void everyBillingRepositoryMethodIsOrgScoped() throws Exception {
        ClassPathScanningCandidateComponentProvider scanner = new ClassPathScanningCandidateComponentProvider(false) {
            @Override
            protected boolean isCandidateComponent(org.springframework.beans.factory.annotation.AnnotatedBeanDefinition bd) {
                return bd.getMetadata().isInterface();
            }
        };
        scanner.addIncludeFilter(new AssignableTypeFilter(Repository.class));
        int checked = 0;
        for (BeanDefinition bd : scanner.findCandidateComponents("com.dossier.api.repository.ent.billing")) {
            Class<?> repo = Class.forName(bd.getBeanClassName());
            assertThat(repo.getInterfaces()).as(repo.getSimpleName()).containsExactly(Repository.class);
            for (Method m : repo.getDeclaredMethods()) {
                if (Set.of("save", "saveAndFlush", "flush", "saveAll", "saveAllAndFlush", "delete", "deleteAll").contains(m.getName())) continue;
                assertThat(m.getParameterCount()).as(repo.getSimpleName() + "." + m.getName()).isGreaterThan(0);
                org.springframework.data.repository.query.Param p = m.getParameters()[0].getAnnotation(org.springframework.data.repository.query.Param.class);
                assertThat(p != null ? p.value() : m.getParameters()[0].getName()).as(repo.getSimpleName() + "." + m.getName() + " takes orgId first").isEqualTo("orgId");
                checked++;
            }
        }
        assertThat(checked).isGreaterThan(80);
        assertThat(scanner.findCandidateComponents("com.dossier.api.repository.ent.billing")).hasSize(19);
        assertThat(scanner.findCandidateComponents("com.dossier.api.repository.catalog")).hasSize(2);
    }
}
