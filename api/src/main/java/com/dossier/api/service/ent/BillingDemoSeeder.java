package com.dossier.api.service.ent;

import com.dossier.api.domain.ent.billing.ConsultantLicense;
import com.dossier.api.domain.ent.billing.FeatureCredit;
import com.dossier.api.domain.ent.billing.FeatureDefinition;
import com.dossier.api.domain.ent.billing.LicenseChange;
import com.dossier.api.domain.ent.billing.LicenseFeature;
import com.dossier.api.domain.ent.billing.OrgBillingAccount;
import com.dossier.api.domain.ent.billing.OrgBillingAdjustment;
import com.dossier.api.domain.ent.billing.OrgContract;
import com.dossier.api.domain.ent.billing.OrgContractPrice;
import com.dossier.api.domain.ent.billing.OrgInvoice;
import com.dossier.api.domain.ent.billing.OrgInvoiceLine;
import com.dossier.api.domain.ent.billing.OrgPayment;
import com.dossier.api.domain.ent.billing.OrgPaymentMethod;
import com.dossier.api.domain.ent.billing.OrgPlanFeature;
import com.dossier.api.domain.ent.billing.OrgSubscription;
import com.dossier.api.domain.ent.billing.OrgSubscriptionItem;
import com.dossier.api.domain.ent.billing.Product;
import com.dossier.api.domain.ent.billing.SubscriptionChange;
import com.dossier.api.domain.ent.billing.UsageAlert;
import com.dossier.api.domain.ent.billing.UsageCounter;
import com.dossier.api.domain.ent.billing.UsageEvent;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.MarketerCapacity;
import com.dossier.api.domain.User;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.catalog.FeatureDefinitionRepository;
import com.dossier.api.repository.catalog.ProductRepository;
import com.dossier.api.repository.ent.billing.ConsultantLicenseRepository;
import com.dossier.api.repository.ent.billing.FeatureCreditRepository;
import com.dossier.api.repository.ent.billing.LicenseChangeRepository;
import com.dossier.api.repository.ent.billing.LicenseFeatureRepository;
import com.dossier.api.repository.ent.billing.OrgBillingAccountRepository;
import com.dossier.api.repository.ent.billing.OrgBillingAdjustmentRepository;
import com.dossier.api.repository.ent.billing.OrgContractPriceRepository;
import com.dossier.api.repository.ent.billing.OrgContractRepository;
import com.dossier.api.repository.ent.billing.OrgInvoiceLineRepository;
import com.dossier.api.repository.ent.billing.OrgInvoiceRepository;
import com.dossier.api.repository.ent.billing.OrgPaymentMethodRepository;
import com.dossier.api.repository.ent.billing.OrgPaymentRepository;
import com.dossier.api.repository.ent.billing.OrgPlanFeatureRepository;
import com.dossier.api.repository.ent.billing.OrgSubscriptionItemRepository;
import com.dossier.api.repository.ent.billing.OrgSubscriptionRepository;
import com.dossier.api.repository.ent.billing.SubscriptionChangeRepository;
import com.dossier.api.repository.ent.billing.UsageAlertRepository;
import com.dossier.api.repository.ent.billing.UsageCounterRepository;
import com.dossier.api.repository.ent.billing.UsageEventRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.MarketerCapacityRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Demo data for the four Enterprise billing boards (Subscription Overview, Consultant Licenses, Billing, Feature Usage), branch
 * ent-billing-data. Same switches as {@link EnterpriseDemoSeeder} ({@code DEMO_ENABLED} + {@code ENT_DEMO_SEED}, never under
 * {@code prod}) and only AFTER {@link TalentDemoSeeder}: it links licenses to the EXISTING seeded {@code consultant_profile} rows.
 *
 * <p><b>Demo catalog data.</b> The platform catalog ships without prices. This seeder inserts clearly marked demo catalog rows
 * ({@code feature_definition.demo_data}, {@code product.demo_data}, codes starting {@code DEMO_}) and gives each demo organization a
 * demo {@code org_contract} whose {@code org_contract_price} rows carry the prices (the constants below are the only place they
 * exist; no application code reads them). Plan names ("Professional", "Standard", "Enterprise") are data, not code.
 *
 * <p>Acme Staffing is the rich tenant (153 consultants: 142 licensed of 150 seats, 18 expiring in the next 30 days, 12 months of
 * rising invoices, 12 features with usage for the last six months); Beta Talent is about 30 % of it. Everything is dated relative
 * to now and the random stream is seeded per organization. <b>Idempotent:</b> an organization that already has a contract is skipped.
 * <b>No PII, no card numbers:</b> payment methods are brand + last4 + expiry only; the seeded last4 values are the public Stripe test
 * numbers.
 */
@Service
public class BillingDemoSeeder {

    private static final Logger LOG = LoggerFactory.getLogger(BillingDemoSeeder.class);

    /** Usage at or above this percentage of the allowance raises an APPROACHING_LIMIT alert. */
    public static final int ALERT_PCT = 80;

    /** The statuses that are billed (a suspended license is "licensed" but excluded from the next period; 20 s3). */
    public static final Set<String> BILLABLE = Set.of("ACTIVE", "CANCEL_AT_PERIOD_END", "PENDING");

    record Feat(String key, String name, String type, String unit, long allowance, String icon, String desc, long price, int weight) {}

    record Tier(String code, String name, int rank, long price, String detail) {}

    record OrgAddon(String code, String name, long price, String detail, int startMonthsAgo) {}

    record Spec(String slug, String key, int licensed, int capacity, int expiring, int suspended, int pending, int ended, int months, boolean orgAddons,
                int pendingAdds, int pendingUpgrades, long seed) {}

    // DEMO CATALOG DATA (not prices of the product: the demo contract of each demo org). USD minor units per consultant per month.
    static final List<Feat> FEATS = List.of(
        new Feat("ai_assistant", "AI Assistant", "AI_FEATURE", "requests", 1000, "assistant", "Drafts, summaries and answers for consultant work.", 3900, 20),
        new Feat("analytics_reporting", "Analytics & Reporting", "ANALYTICS", "reports", 500, "analytics", "Extended reporting and insights.", 2900, 16),
        new Feat("custom_fields", "Custom Fields", "PRODUCTIVITY", "records", 500, "fields", "Custom fields on profiles and applications.", 1900, 12),
        new Feat("resume_parsing", "Resume Parsing", "AI_FEATURE", "parses", 500, "parsing", "Parse resumes into structured profiles.", 2400, 10),
        new Feat("candidate_matching", "Candidate Matching", "AI_FEATURE", "matches", 750, "matching", "AI-ranked consultant to job matches.", 3400, 10),
        new Feat("email_campaigns", "Email Campaigns", "MARKETING", "emails", 500, "email", "Outreach campaigns to clients and candidates.", 1900, 8),
        new Feat("interview_scheduling", "Interview Scheduling", "PRODUCTIVITY", "schedules", 300, "calendar", "Scheduling links and reminders.", 1500, 8),
        new Feat("job_postings", "Job Postings", "RECRUITING", "postings", 400, "briefcase", "Publish and track job postings.", 2900, 6),
        new Feat("background_checks", "Background Checks", "RECRUITING", "checks", 200, "shield", "Order and track screening checks.", 4500, 4),
        new Feat("api_access", "API Access", "INTEGRATION", "calls", 200, "api", "Programmatic access for the consultant's data.", 3000, 3),
        new Feat("integrations", "Integrations", "INTEGRATION", "syncs", 300, "plug", "Third-party integrations and syncs.", 2500, 5),
        new Feat("document_templates", "Document Templates", "PRODUCTIVITY", "documents", 250, "document", "Reusable document templates.", 900, 4)
    );

    static final List<Tier> TIERS = List.of(
        new Tier("DEMO_BASE_STANDARD", "Standard", 1, 7900, "Core consultant workspace"),
        new Tier("DEMO_BASE_PROFESSIONAL", "Professional", 2, 14900, "Full platform access with advanced features for marketing consultants"),
        new Tier("DEMO_BASE_ENTERPRISE", "Enterprise", 3, 19900, "Everything in Professional plus priority support and custom limits")
    );

    static final List<OrgAddon> ORG_ADDONS = List.of(
        new OrgAddon("DEMO_ORG_ADV_ANALYTICS", "Advanced Analytics Add-on", 50000, "Extended reporting and insights", 8),
        new OrgAddon("DEMO_ORG_API_ACCESS", "API Access Add-on", 30000, "External integrations", 3)
    );

    static final List<String> PLAN_FEATURES = List.of(
        "Consultant Management", "Marketing Assignments", "Jobs & Applications", "Client Management", "Reporting & Analytics", "Integrations & API Access", "Priority Support");

    static final List<String> SUSPEND_REASONS = List.of("Payment review", "Consultant on leave", "Compliance check", "Awaiting contract renewal");

    public static final Spec ACME = new Spec(EnterpriseDemoSeeder.ACME_SLUG, "acme", 142, 150, 18, 4, 2, 9, 12, true, 8, 5, 20261020L);
    public static final Spec BETA = new Spec(EnterpriseDemoSeeder.BETA_SLUG, "beta", 34, 40, 5, 1, 1, 3, 6, false, 2, 1, 20261021L);
    public static final List<Spec> SPECS = List.of(ACME, BETA);

    /** What a call did: per organization slug, the row count of every billing table afterwards (only for organizations seeded now). */
    public record Result(boolean ran, String skippedBecause, Map<String, Map<String, Long>> seeded) {
        static Result skipped(String why) {
            return new Result(false, why, Map.of());
        }
    }

    private final EnterpriseDemoSeeder base;
    private final OrganizationRepository orgs;
    private final UserRepository users;
    private final JdbcTemplate jdbc;
    private final ConsultantProfileRepository consultantRepo;
    private final MarketerCapacityRepository capacityRepo;
    private final FeatureDefinitionRepository featureDefs;
    private final ProductRepository products;
    private final OrgContractRepository contractRepo;
    private final OrgContractPriceRepository contractPriceRepo;
    private final OrgPaymentMethodRepository methodRepo;
    private final OrgBillingAccountRepository accountRepo;
    private final OrgSubscriptionRepository subscriptionRepo;
    private final OrgPlanFeatureRepository planFeatureRepo;
    private final OrgSubscriptionItemRepository itemRepo;
    private final SubscriptionChangeRepository subscriptionChangeRepo;
    private final ConsultantLicenseRepository licenseRepo;
    private final LicenseFeatureRepository licenseFeatureRepo;
    private final LicenseChangeRepository licenseChangeRepo;
    private final OrgInvoiceRepository invoiceRepo;
    private final OrgInvoiceLineRepository lineRepo;
    private final OrgPaymentRepository paymentRepo;
    private final OrgBillingAdjustmentRepository adjustmentRepo;
    private final UsageEventRepository eventRepo;
    private final UsageCounterRepository counterRepo;
    private final UsageAlertRepository alertRepo;
    private final FeatureCreditRepository creditRepo;

    public BillingDemoSeeder(
        EnterpriseDemoSeeder base, OrganizationRepository orgs, UserRepository users, JdbcTemplate jdbc, ConsultantProfileRepository consultantRepo,
        MarketerCapacityRepository capacityRepo, FeatureDefinitionRepository featureDefs, ProductRepository products, OrgContractRepository contractRepo,
        OrgContractPriceRepository contractPriceRepo, OrgPaymentMethodRepository methodRepo, OrgBillingAccountRepository accountRepo,
        OrgSubscriptionRepository subscriptionRepo, OrgPlanFeatureRepository planFeatureRepo, OrgSubscriptionItemRepository itemRepo,
        SubscriptionChangeRepository subscriptionChangeRepo, ConsultantLicenseRepository licenseRepo, LicenseFeatureRepository licenseFeatureRepo,
        LicenseChangeRepository licenseChangeRepo, OrgInvoiceRepository invoiceRepo, OrgInvoiceLineRepository lineRepo, OrgPaymentRepository paymentRepo,
        OrgBillingAdjustmentRepository adjustmentRepo, UsageEventRepository eventRepo, UsageCounterRepository counterRepo, UsageAlertRepository alertRepo,
        FeatureCreditRepository creditRepo
    ) {
        this.base = base;
        this.orgs = orgs;
        this.users = users;
        this.jdbc = jdbc;
        this.consultantRepo = consultantRepo;
        this.capacityRepo = capacityRepo;
        this.featureDefs = featureDefs;
        this.products = products;
        this.contractRepo = contractRepo;
        this.contractPriceRepo = contractPriceRepo;
        this.methodRepo = methodRepo;
        this.accountRepo = accountRepo;
        this.subscriptionRepo = subscriptionRepo;
        this.planFeatureRepo = planFeatureRepo;
        this.itemRepo = itemRepo;
        this.subscriptionChangeRepo = subscriptionChangeRepo;
        this.licenseRepo = licenseRepo;
        this.licenseFeatureRepo = licenseFeatureRepo;
        this.licenseChangeRepo = licenseChangeRepo;
        this.invoiceRepo = invoiceRepo;
        this.lineRepo = lineRepo;
        this.paymentRepo = paymentRepo;
        this.adjustmentRepo = adjustmentRepo;
        this.eventRepo = eventRepo;
        this.counterRepo = counterRepo;
        this.alertRepo = alertRepo;
        this.creditRepo = creditRepo;
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
        boolean catalogDone = false;
        for (Spec spec : SPECS) {
            Organization org = orgs.findBySlug(spec.slug()).orElse(null);
            if (org == null) continue;
            User creator = org.getCreatedByUserId() == null ? null : users.findById(org.getCreatedByUserId()).orElse(null);
            if (creator == null || !EnterpriseDemoSeeder.isEnterpriseDemoLogin(creator.getLogin())) {
                LOG.warn("Billing demo seed: {} was not created by the enterprise demo; leaving it alone", spec.slug());
                continue;
            }
            if (contractRepo.countByOrgId(org.getId()) > 0) continue; // already seeded: idempotent
            List<ConsultantProfile> cons = consultantRepo.findByOrgId(org.getId());
            if (cons.isEmpty()) {
                LOG.debug("Billing demo seed: {} has no consultants yet (talent seed not run), skipped", spec.slug());
                continue;
            }
            if (!catalogDone) {
                seedCatalog();
                catalogDone = true;
            }
            Map<String, Long> counts = new Gen(spec, org, cons).run();
            done.put(spec.slug(), counts);
            LOG.info("Billing demo seeded for {}: {}", spec.slug(), counts);
        }
        return new Result(true, null, done);
    }

    /** The platform catalog rows of the demo (idempotent by key / code). Marked demo_data; no prices. */
    void seedCatalog() {
        Instant now = Instant.now();
        short order = 0;
        for (Feat f : FEATS) {
            order++;
            if (featureDefs.findByFeatureKey(f.key()).isEmpty()) {
                FeatureDefinition d = new FeatureDefinition();
                d.setFeatureKey(f.key());
                d.setName(f.name());
                d.setDescription(f.desc());
                d.setUsageType(f.type());
                d.setUsageUnit(f.unit());
                d.setDefaultAllowance(f.allowance());
                d.setAllowancePeriod("MONTH");
                d.setIconKey(f.icon());
                d.setActive(true);
                d.setSortOrder((int) order);
                d.setDemoData(true);
                d.setCreatedAt(now);
                featureDefs.save(d);
            }
        }
        for (Tier t : TIERS) {
            if (products.findByCode(t.code()).isEmpty()) products.save(product(t.code(), t.name() + " License", "BASE_LICENSE", null, t.detail(), t.rank(), t.rank(), now));
        }
        order = 10;
        for (Feat f : FEATS) {
            order++;
            String code = featCode(f.key());
            if (products.findByCode(code).isEmpty()) products.save(product(code, f.name() + " Add-on", "FEATURE", f.key(), f.desc(), null, order, now));
        }
        order = 50;
        for (OrgAddon a : ORG_ADDONS) {
            order++;
            if (products.findByCode(a.code()).isEmpty()) products.save(product(a.code(), a.name(), "ORG_ADDON", null, a.detail(), null, order, now));
        }
    }

    private static String featCode(String key) {
        return "DEMO_FEAT_" + key.toUpperCase();
    }

    private static Product product(String code, String name, String kind, String featureKey, String desc, Integer tierRank, int sort, Instant now) {
        Product p = new Product();
        p.setCode(code);
        p.setName(name);
        p.setKind(kind);
        p.setFeatureKey(featureKey);
        p.setDescription(desc);
        p.setTierRank(tierRank);
        p.setActive(true);
        p.setSortOrder(sort);
        p.setDemoData(true);
        p.setCreatedAt(now);
        return p;
    }

    // ---- the generator for one organization ----------------------------------------------------------------------------

    private final class Gen {
        final Spec spec;
        final Organization org;
        final Long orgId;
        final List<ConsultantProfile> cons;
        final Random rnd;
        final Instant now = Instant.now();
        final LocalDate today = LocalDate.now(ZoneOffset.UTC);
        final LocalDate firstThis = today.withDayOfMonth(1);
        final Map<String, Long> counts = new LinkedHashMap<>();

        final Map<String, Product> productByCode = new HashMap<>();
        final Map<Long, OrgContractPrice> priceByProduct = new HashMap<>();
        final Map<String, Feat> featByKey = new HashMap<>();
        final Map<String, FeatureDefinition> defByKey = new HashMap<>();
        Long actorA; // Sarah (org admin) when she is a marketer seat, else the first seat
        Long actorB;
        Long actorC;
        OrgPaymentMethod defaultMethod;
        OrgPaymentMethod backupMethod;
        final List<ConsultantLicense> licenses = new ArrayList<>();
        final Map<Long, List<LicenseFeature>> featuresOf = new HashMap<>();
        final Map<Long, ConsultantProfile> consultantById = new HashMap<>();
        int oldestLeft = 2; // guarantees the oldest invoice month has licenses

        Gen(Spec spec, Organization org, List<ConsultantProfile> cons) {
            this.spec = spec;
            this.org = org;
            this.orgId = org.getId();
            this.cons = new ArrayList<>(cons);
            this.cons.sort(Comparator.comparing(ConsultantProfile::getId));
            this.rnd = new Random(spec.seed());
            for (ConsultantProfile c : cons) consultantById.put(c.getId(), c);
        }

        Map<String, Long> run() {
            loadCatalog();
            pickActors();
            seedContract();
            seedMethods();
            seedLicenses();
            seedLicenseChanges();
            seedSubscription();
            seedInvoices();
            seedUsage();
            syncConsultantProfiles();
            seedSubscriptionChanges();
            seedAccount();
            for (String t : TABLES) counts.put(t, jdbc.queryForObject("select count(*) from " + t + " where org_id = ?", Long.class, orgId));
            return counts;
        }

        // ---- helpers ----

        <T> T pick(List<T> l) {
            return l.get(rnd.nextInt(l.size()));
        }

        int between(int lo, int hi) {
            return lo + rnd.nextInt(hi - lo + 1);
        }

        Instant at(LocalDate d) {
            return d.atStartOfDay().toInstant(ZoneOffset.UTC);
        }

        Instant daysAgo(double d) {
            return now.minusSeconds((long) (d * 86400));
        }

        Instant daysAhead(double d) {
            return now.plusSeconds((long) (d * 86400));
        }

        Instant randIn(Instant a, Instant b) {
            long span = Math.max(1, b.getEpochSecond() - a.getEpochSecond());
            return a.plusSeconds((long) (rnd.nextDouble() * span));
        }

        String key(LocalDate d) {
            return String.format("%04d-%02d", d.getYear(), d.getMonthValue());
        }

        static String money(long minor) {
            return minor % 100 == 0 ? "$" + String.format("%,d", minor / 100) : "$" + String.format("%,.2f", minor / 100.0);
        }

        void loadCatalog() {
            for (Tier t : TIERS) productByCode.put(t.code(), products.findByCode(t.code()).orElseThrow());
            for (Feat f : FEATS) {
                productByCode.put(featCode(f.key()), products.findByCode(featCode(f.key())).orElseThrow());
                featByKey.put(f.key(), f);
                defByKey.put(f.key(), featureDefs.findByFeatureKey(f.key()).orElseThrow());
            }
            for (OrgAddon a : ORG_ADDONS) productByCode.put(a.code(), products.findByCode(a.code()).orElseThrow());
        }

        void pickActors() {
            List<MarketerCapacity> caps = capacityRepo.findByOrgId(orgId);
            caps.sort(Comparator.comparing(MarketerCapacity::getId));
            if (caps.isEmpty()) return; // actors stay null (nullable FKs)
            actorA = caps.get(0).getMemberId();
            actorB = caps.get(Math.min(2, caps.size() - 1)).getMemberId();
            actorC = caps.get(Math.min(3, caps.size() - 1)).getMemberId();
        }

        long priceOf(String productCode) {
            return priceByProduct.get(productByCode.get(productCode).getId()).getOverrideAmountMinor();
        }

        OrgContractPrice contractPriceOf(String productCode) {
            return priceByProduct.get(productByCode.get(productCode).getId());
        }

        // ---- contract (the demo prices) ----

        void seedContract() {
            OrgContract c = new OrgContract();
            c.setOrgId(orgId);
            c.setReference("DEMO-" + spec.key().toUpperCase() + "-2026");
            c.setName("Demo agreement (demo catalog data)");
            c.setStatus("ACTIVE");
            c.setVersion(1);
            c.setStartsAt(at(firstThis.minusMonths(spec.months() + 2)));
            c.setDemoData(true);
            c.setCreatedAt(c.getStartsAt());
            c.setUpdatedAt(c.getStartsAt());
            c = contractRepo.save(c);
            List<OrgContractPrice> rows = new ArrayList<>();
            for (Tier t : TIERS) rows.add(price(c, t.code(), t.price()));
            for (Feat f : FEATS) rows.add(price(c, featCode(f.key()), f.price()));
            for (OrgAddon a : ORG_ADDONS) rows.add(price(c, a.code(), a.price()));
            for (OrgContractPrice r : contractPriceRepo.saveAll(rows)) priceByProduct.put(r.getProductId(), r);
        }

        OrgContractPrice price(OrgContract c, String code, long minor) {
            OrgContractPrice p = new OrgContractPrice();
            p.setOrgId(orgId);
            p.setContractId(c.getId());
            p.setProductId(productByCode.get(code).getId());
            p.setOverrideAmountMinor(minor);
            p.setCreatedAt(c.getCreatedAt());
            return p;
        }

        void seedMethods() {
            OrgPaymentMethod a = method("Visa", "4242", 12, today.getYear() + 2, true);
            defaultMethod = methodRepo.save(a);
            if (spec.orgAddons()) backupMethod = methodRepo.save(method("Mastercard", "4444", 8, today.getYear() + 1, false));
        }

        OrgPaymentMethod method(String brand, String last4, int expMonth, int expYear, boolean def) {
            OrgPaymentMethod m = new OrgPaymentMethod();
            m.setOrgId(orgId);
            m.setBrand(brand);
            m.setLast4(last4);
            m.setExpMonth(expMonth);
            m.setExpYear(expYear);
            m.setDefaultMethod(def);
            m.setStatus("ACTIVE");
            m.setCreatedAt(at(firstThis.minusMonths(spec.months() + 1)));
            return m;
        }

        // ---- licenses and features ----

        String tierFor(double r) {
            return r < 0.45 ? "DEMO_BASE_STANDARD" : r < 0.85 ? "DEMO_BASE_PROFESSIONAL" : "DEMO_BASE_ENTERPRISE";
        }

        /** Months-ago bucket of a start date, rising: this month weighs (months+1), the oldest bucket weighs 1. */
        int startBucket() {
            int total = 0;
            for (int m = 0; m <= spec.months(); m++) total += spec.months() + 1 - m;
            int r = rnd.nextInt(total);
            for (int m = 0; m <= spec.months(); m++) {
                r -= spec.months() + 1 - m;
                if (r < 0) return m;
            }
            return 0;
        }

        Instant startInBucket(int m) {
            LocalDate from = firstThis.minusMonths(m);
            Instant a = at(from).plus(between(8, 17), ChronoUnit.HOURS);
            Instant b = m == 0 ? now.minus(1, ChronoUnit.DAYS) : at(from.plusMonths(1)).minus(1, ChronoUnit.DAYS);
            if (!b.isAfter(a)) return a.isAfter(now) ? now.minus(2, ChronoUnit.HOURS) : a;
            return randIn(a, b);
        }

        void seedLicenses() {
            List<ConsultantProfile> order = new ArrayList<>(cons);
            java.util.Collections.shuffle(order, rnd);
            int liveCount = Math.min(spec.licensed(), order.size());
            // statuses of the live ones: first expiring, then suspended, then pending, the rest active
            List<String> statuses = new ArrayList<>();
            for (int i = 0; i < spec.expiring(); i++) statuses.add("CANCEL_AT_PERIOD_END");
            for (int i = 0; i < spec.suspended(); i++) statuses.add("SUSPENDED");
            for (int i = 0; i < spec.pending(); i++) statuses.add("PENDING");
            while (statuses.size() < liveCount) statuses.add("ACTIVE");
            java.util.Collections.shuffle(statuses, rnd);
            for (int i = 0; i < liveCount; i++) licenses.add(buildLicense(order.get(i), statuses.get(i)));
            int endedCount = Math.min(spec.ended(), order.size() - liveCount);
            for (int i = 0; i < endedCount; i++) licenses.add(buildLicense(order.get(liveCount + i), "ENDED"));
            List<ConsultantLicense> saved = licenseRepo.saveAll(licenses);
            licenses.clear();
            licenses.addAll(saved);
            // features
            List<LicenseFeature> feats = new ArrayList<>();
            Map<String, Integer> featureSeen = new HashMap<>();
            for (ConsultantLicense l : licenses) {
                String tier = productCodeOf(l);
                double r = rnd.nextDouble();
                int n;
                if (tier.equals("DEMO_BASE_STANDARD")) n = r < 0.45 ? 0 : r < 0.85 ? 1 : 2;
                else if (tier.equals("DEMO_BASE_PROFESSIONAL")) n = r < 0.2 ? 0 : r < 0.7 ? 1 : 2;
                else n = r < 0.35 ? 1 : r < 0.75 ? 2 : 3;
                List<String> chosen = new ArrayList<>();
                while (chosen.size() < n) {
                    String k = weightedFeature();
                    if (!chosen.contains(k)) chosen.add(k);
                }
                for (String k : chosen) {
                    feats.add(buildFeature(l, k));
                    featureSeen.merge(k, 1, Integer::sum);
                }
            }
            // every one of the 12 features is on at least one live ACTIVE license (so "Total Active Features" is 12 for Acme)
            if (spec.orgAddons()) {
                for (Feat f : FEATS) {
                    if (featureSeen.containsKey(f.key())) continue;
                    for (ConsultantLicense l : licenses) {
                        if (!"ACTIVE".equals(l.getStatus())) continue;
                        boolean has = false;
                        for (LicenseFeature x : feats) if (x.getLicenseId().equals(l.getId()) && x.getFeatureKey().equals(f.key())) has = true;
                        if (has) continue;
                        feats.add(buildFeature(l, f.key()));
                        featureSeen.merge(f.key(), 1, Integer::sum);
                        break;
                    }
                }
            }
            for (LicenseFeature lf : licenseFeatureRepo.saveAll(feats)) featuresOf.computeIfAbsent(lf.getLicenseId(), k -> new ArrayList<>()).add(lf);
        }

        String weightedFeature() {
            int total = 0;
            for (Feat f : FEATS) total += f.weight();
            int r = rnd.nextInt(total);
            for (Feat f : FEATS) {
                r -= f.weight();
                if (r < 0) return f.key();
            }
            return FEATS.get(0).key();
        }

        String productCodeOf(ConsultantLicense l) {
            for (Map.Entry<String, Product> e : productByCode.entrySet()) if (e.getValue().getId().equals(l.getBaseProductId())) return e.getKey();
            throw new IllegalStateException("unknown base product " + l.getBaseProductId());
        }

        ConsultantLicense buildLicense(ConsultantProfile c, String status) {
            String tier = tierFor(rnd.nextDouble());
            ConsultantLicense l = new ConsultantLicense();
            l.setOrgId(orgId);
            l.setConsultantId(c.getId());
            l.setMemberId(c.getMemberId());
            l.setStatus(status);
            l.setBaseProductId(productByCode.get(tier).getId());
            l.setContractPriceId(contractPriceOf(tier).getId());
            l.setBaseAmountMinor(priceOf(tier));
            l.setCreatedByMemberId(actorA);
            Instant start;
            switch (status) {
                case "PENDING" -> {
                    start = daysAhead(1 + rnd.nextInt(10));
                    l.setRenewsAt(start.plus(365, ChronoUnit.DAYS));
                }
                case "ENDED" -> {
                    start = startInBucket(Math.min(spec.months(), between(3, Math.max(3, spec.months()))));
                    Instant lo = start.plus(45, ChronoUnit.DAYS);
                    Instant hi = daysAgo(5);
                    Instant end = lo.isBefore(hi) ? randIn(lo, hi) : hi;
                    if (!end.isAfter(start)) start = end.minus(60, ChronoUnit.DAYS);
                    l.setEndsAt(end);
                    l.setPaidThroughAt(end);
                    l.setEndReason("REMOVED");
                }
                case "CANCEL_AT_PERIOD_END" -> {
                    start = startInBucket(Math.max(1, startBucket()));
                    Instant end = daysAhead(1 + rnd.nextInt(29));
                    l.setEndsAt(end);
                    l.setRenewsAt(end);
                }
                case "SUSPENDED" -> {
                    start = startInBucket(Math.max(1, startBucket()));
                    l.setSuspendedAt(daysAgo(2 + rnd.nextInt(18)));
                    l.setSuspendReason(pick(SUSPEND_REASONS));
                }
                default -> start = startInBucket(oldestLeft-- > 0 ? spec.months() : startBucket());
            }
            l.setStartsAt(start);
            if (l.getRenewsAt() == null) {
                Instant renew = start.plus(365, ChronoUnit.DAYS);
                while (renew.isBefore(now)) renew = renew.plus(365, ChronoUnit.DAYS);
                l.setRenewsAt(renew);
            }
            if (!"ENDED".equals(status) && !"PENDING".equals(status)) l.setPaidThroughAt(at(firstThis));
            l.setCreatedAt(start.isAfter(now) ? now : start);
            l.setUpdatedAt(l.getSuspendedAt() != null ? l.getSuspendedAt() : l.getCreatedAt());
            return l;
        }

        LicenseFeature buildFeature(ConsultantLicense l, String featureKey) {
            LicenseFeature f = new LicenseFeature();
            f.setOrgId(orgId);
            f.setLicenseId(l.getId());
            f.setFeatureKey(featureKey);
            String code = featCode(featureKey);
            f.setProductId(productByCode.get(code).getId());
            f.setContractPriceId(contractPriceOf(code).getId());
            f.setUnitAmountMinor(priceOf(code));
            f.setQuantity(1);
            Instant start = l.getStartsAt();
            if (!"PENDING".equals(l.getStatus()) && rnd.nextDouble() < 0.5) {
                Instant later = start.plus(2, ChronoUnit.DAYS);
                Instant upper = now.minus(1, ChronoUnit.HOURS);
                if (later.isBefore(upper)) start = randIn(later, upper);
            }
            f.setStartsAt(start);
            boolean ended = "ENDED".equals(l.getStatus());
            f.setLive(!ended);
            if (ended || "CANCEL_AT_PERIOD_END".equals(l.getStatus())) f.setEndsAt(l.getEndsAt());
            if (rnd.nextDouble() < 0.05) f.setAllowanceOverride((long) (featByKey.get(featureKey).allowance() * 1.5));
            f.setAddedByMemberId(actorA);
            f.setCreatedAt(start.isAfter(now) ? now : start);
            return f;
        }

        // ---- license history + pending scheduled changes ----

        LicenseChange change(ConsultantLicense l, String kind, String featureKey, String summary, long delta, Instant effective, String status, Long actor, Instant created) {
            LicenseChange c = new LicenseChange();
            c.setOrgId(orgId);
            c.setLicenseId(l.getId());
            c.setBatchId(java.util.UUID.nameUUIDFromBytes((orgId + ":" + l.getId() + ":" + kind + ":" + effective).getBytes()).toString());
            c.setKind(kind);
            c.setFeatureKey(featureKey);
            c.setSummary(summary);
            c.setAmountDeltaMinor(delta);
            c.setEffectiveAt(effective);
            c.setStatus(status);
            c.setActorMemberId(actor);
            c.setCreatedAt(created.isAfter(now) ? now : created);
            if ("APPLIED".equals(status)) c.setAppliedAt(effective.isAfter(now) ? now : effective);
            return c;
        }

        void seedLicenseChanges() {
            List<LicenseChange> out = new ArrayList<>();
            String tierName;
            for (ConsultantLicense l : licenses) {
                String tierCode = productCodeOf(l);
                tierName = TIERS.stream().filter(t -> t.code().equals(tierCode)).findFirst().orElseThrow().name();
                List<LicenseFeature> fs = featuresOf.getOrDefault(l.getId(), List.of());
                long monthly = l.getBaseAmountMinor();
                for (LicenseFeature f : fs) monthly += f.getUnitAmountMinor() * f.getQuantity();
                boolean pendingLicense = "PENDING".equals(l.getStatus());
                out.add(change(l, "CREATE", null, tierName + " license assigned", monthly, l.getStartsAt(), pendingLicense ? "PENDING" : "APPLIED", actorA, pendingLicense ? now : l.getStartsAt()));
                for (LicenseFeature f : fs) {
                    if (f.getStartsAt().isAfter(l.getStartsAt().plus(1, ChronoUnit.HOURS)) && !pendingLicense) {
                        out.add(change(l, "ADD_FEATURE", f.getFeatureKey(), featByKey.get(f.getFeatureKey()).name() + " added", f.getUnitAmountMinor() * f.getQuantity(), f.getStartsAt(), "APPLIED", actorB, f.getStartsAt()));
                    }
                }
                switch (l.getStatus()) {
                    case "CANCEL_AT_PERIOD_END" -> out.add(change(l, "CANCEL", null, "License ends at the end of the term", -monthly, l.getEndsAt(), "PENDING", actorC, daysAgo(1 + rnd.nextInt(10))));
                    case "SUSPENDED" -> out.add(change(l, "SUSPEND", null, "Suspended: " + l.getSuspendReason(), 0, l.getSuspendedAt(), "APPLIED", actorA, l.getSuspendedAt()));
                    case "ENDED" -> out.add(change(l, "END", null, "License removed", -monthly, l.getEndsAt(), "APPLIED", actorA, l.getEndsAt()));
                    default -> { }
                }
            }
            // scheduled (pending) additions and upgrades on ACTIVE licenses
            List<ConsultantLicense> active = new ArrayList<>();
            for (ConsultantLicense l : licenses) if ("ACTIVE".equals(l.getStatus())) active.add(l);
            java.util.Collections.shuffle(active, rnd);
            int idx = 0;
            for (int i = 0; i < spec.pendingAdds() && idx < active.size(); i++, idx++) {
                ConsultantLicense l = active.get(idx);
                Feat f = featByKey.get(weightedFeature());
                out.add(change(l, "ADD_FEATURE", f.key(), f.name() + " scheduled", f.price(), daysAhead(2 + rnd.nextInt(25)), "PENDING", actorB, daysAgo(rnd.nextInt(5))));
            }
            for (int i = 0; i < spec.pendingUpgrades() && idx < active.size(); i++, idx++) {
                ConsultantLicense l = active.get(idx);
                out.add(change(l, "UPGRADE_BASE", null, "Upgrade to Enterprise scheduled", priceOf("DEMO_BASE_ENTERPRISE") - l.getBaseAmountMinor(), daysAhead(3 + rnd.nextInt(25)), "PENDING", actorB, daysAgo(rnd.nextInt(5))));
            }
            licenseChangeRepo.saveAll(out);
        }

        // ---- subscription mirror ----

        void seedSubscription() {
            Tier plan = TIERS.get(1);
            OrgSubscription s = new OrgSubscription();
            s.setOrgId(orgId);
            s.setStatus("ACTIVE");
            s.setPlanCode(plan.name().toUpperCase());
            s.setPlanName(plan.name());
            s.setPlanDescription("Designed for growing organizations with advanced collaboration and management tools.");
            s.setPlanProductId(productByCode.get(plan.code()).getId());
            s.setUnitAmountMinor(priceOf(plan.code()));
            s.setLicensedCapacity(spec.capacity());
            s.setCurrentPeriodStart(firstThis);
            s.setCurrentPeriodEnd(firstThis.plusMonths(1).minusDays(1));
            s.setLastEventAt(now);
            s.setDemoData(true);
            s.setCreatedAt(at(firstThis.minusMonths(spec.months() + 1)));
            s = subscriptionRepo.save(s);
            short order = 0;
            List<OrgPlanFeature> pf = new ArrayList<>();
            for (String label : PLAN_FEATURES) {
                OrgPlanFeature p = new OrgPlanFeature();
                p.setOrgId(orgId);
                p.setSubscriptionId(s.getId());
                p.setLabel(label);
                p.setIncluded(true);
                p.setSortOrder((int) ++order);
                pf.add(p);
            }
            planFeatureRepo.saveAll(pf);
            // items: aggregated from the BILLABLE licenses
            List<OrgSubscriptionItem> items = new ArrayList<>();
            for (Object[] row : licenseRepo.baseBreakdown(orgId, BILLABLE)) {
                Product p = products.findById((Long) row[0]).orElseThrow();
                Tier t = TIERS.stream().filter(x -> x.code().equals(p.getCode())).findFirst().orElseThrow();
                long qty = (Long) row[1];
                items.add(item(s, p, "BASE_LICENSE", t.name() + " Consultant License", t.detail(), (int) qty, 10 + t.rank()));
            }
            for (Object[] row : licenseFeatureRepo.featureBreakdown(orgId, BILLABLE)) {
                String key = (String) row[0];
                Feat f = featByKey.get(key);
                Product p = productByCode.get(featCode(key));
                items.add(item(s, p, "FEATURE", f.name(), f.desc(), (int) (long) (Long) row[2], 20 + FEATS.indexOf(f)));
            }
            if (spec.orgAddons()) {
                for (OrgAddon a : ORG_ADDONS) items.add(item(s, productByCode.get(a.code()), "ORG_ADDON", a.name(), a.detail(), 1, 60 + ORG_ADDONS.indexOf(a)));
            }
            itemRepo.saveAll(items);
        }

        OrgSubscriptionItem item(OrgSubscription s, Product p, String kind, String label, String detail, int qty, int sort) {
            OrgSubscriptionItem i = new OrgSubscriptionItem();
            i.setOrgId(orgId);
            i.setSubscriptionId(s.getId());
            i.setProductId(p.getId());
            i.setKind(kind);
            i.setLabel(label);
            i.setDetail(detail);
            OrgContractPrice cp = priceByProduct.get(p.getId());
            i.setUnitAmountMinor(cp.getOverrideAmountMinor());
            i.setContractPriceId(cp.getId());
            i.setQuantity(qty);
            i.setSortOrder(sort);
            i.setUpdatedAt(now);
            return i;
        }

        // ---- invoices, lines, payments, adjustments ----

        final class Line {
            String kind;
            String description;
            String detail;
            int qty;
            long unit;
            Long productId;
            String featureKey;

            long amount() {
                return qty * unit;
            }
        }

        final class Draft {
            String kind = "RECURRING";
            LocalDate periodStart;
            LocalDate periodEnd;
            LocalDate issue;
            LocalDate due;
            boolean paid;
            Instant paidAt;
            String description;
            final List<Line> lines = new ArrayList<>();
            final List<OrgPayment> payments = new ArrayList<>();
            OrgBillingAdjustment adjustment;
            OrgPaymentMethod method;

            long amount() {
                long s = 0;
                for (Line l : lines) s += l.amount();
                return s;
            }
        }

        Line line(Draft d, String kind, String desc, String detail, int qty, long unit, Long productId, String featureKey) {
            Line l = new Line();
            l.kind = kind;
            l.description = desc;
            l.detail = detail;
            l.qty = qty;
            l.unit = unit;
            l.productId = productId;
            l.featureKey = featureKey;
            d.lines.add(l);
            return l;
        }

        OrgPayment payment(Draft d, String status, Instant when, OrgPaymentMethod m, String reason) {
            OrgPayment p = new OrgPayment();
            p.setOrgId(orgId);
            p.setPaymentMethodId(m == null ? null : m.getId());
            p.setStatus(status);
            p.setKind("CHARGE");
            p.setOccurredAt(when);
            p.setFailureReason(reason);
            d.payments.add(p);
            return p;
        }

        void seedInvoices() {
            List<Draft> drafts = new ArrayList<>();
            for (int k = 1; k <= spec.months(); k++) {
                LocalDate ps = firstThis.minusMonths(k);
                LocalDate pe = ps.plusMonths(1);
                Instant from = at(ps);
                Instant to = at(pe);
                List<ConsultantLicense> ls = licenseRepo.findBillableDuring(orgId, from, to);
                if (ls.isEmpty()) continue;
                Draft d = new Draft();
                d.periodStart = ps;
                d.periodEnd = pe.minusDays(1);
                d.issue = pe;
                d.due = pe.plusDays(14);
                Map<Long, Integer> baseCount = new LinkedHashMap<>();
                for (ConsultantLicense l : ls) baseCount.merge(l.getBaseProductId(), 1, Integer::sum);
                for (Tier t : TIERS) {
                    Product p = productByCode.get(t.code());
                    Integer n = baseCount.get(p.getId());
                    if (n == null) continue;
                    line(d, "BASE_LICENSE", t.name() + " licenses (" + n + ")", n + " active consultant licenses × " + money(priceOf(t.code())), n, priceOf(t.code()), p.getId(), null);
                }
                Map<String, Integer> featCount = new HashMap<>();
                for (LicenseFeature f : licenseFeatureRepo.findBillableDuring(orgId, from, to)) featCount.merge(f.getFeatureKey(), f.getQuantity(), Integer::sum);
                boolean anyFeature = false;
                for (Feat f : FEATS) {
                    Integer n = featCount.get(f.key());
                    if (n == null) continue;
                    anyFeature = true;
                    line(d, "FEATURE", f.name() + " add-on", n + " licenses × " + money(priceOf(featCode(f.key()))), n, priceOf(featCode(f.key())), productByCode.get(featCode(f.key())).getId(), f.key());
                }
                if (spec.orgAddons()) {
                    for (OrgAddon a : ORG_ADDONS) {
                        if (k <= a.startMonthsAgo()) line(d, "ORG_ADDON", a.name(), "1 organization", 1, priceOf(a.code()), productByCode.get(a.code()).getId(), null);
                    }
                }
                if (spec.orgAddons() && k == 7) {
                    Line cl = line(d, "CREDIT", "Service credit (demo)", "Goodwill credit after a support incident", 1, -25000, null, null);
                    d.adjustment = adjustment("CREDIT", cl.amount(), "Service credit (demo): goodwill after a support incident", "APPLIED", daysAgoFrom(d.issue));
                }
                if (spec.orgAddons() && k == 10) {
                    Line al = line(d, "ADJUSTMENT", "Onboarding services (demo)", "One-time onboarding session", 1, 18000, null, null);
                    d.adjustment = adjustment("DEBIT", al.amount(), "Onboarding services (demo): one-time onboarding session", "APPLIED", daysAgoFrom(d.issue));
                }
                int baseTotal = 0;
                for (Integer n : baseCount.values()) baseTotal += n;
                d.description = "Consultant licenses (" + baseTotal + ")" + (anyFeature || spec.orgAddons() && k <= 8 ? " + Add-on features" : "");
                if (k == 1) {
                    d.paid = false; // the latest invoice is still open
                    d.method = defaultMethod;
                } else {
                    d.paid = true;
                    Instant when = at(d.issue).plus(3 + rnd.nextInt(7), ChronoUnit.DAYS).plus(10, ChronoUnit.HOURS);
                    boolean failedFirst = (spec.orgAddons() && k == 4) || (!spec.orgAddons() && k == 3);
                    d.method = defaultMethod;
                    if (failedFirst) {
                        d.payments.add(failedPayment(d, when.minus(2, ChronoUnit.DAYS)));
                        if (backupMethod != null) d.method = backupMethod;
                    }
                    d.paidAt = when;
                    payment(d, "SUCCEEDED", when, d.method, null);
                }
                drafts.add(d);
            }
            if (spec.orgAddons()) {
                // current-month proration invoice, paid two days after issue when that is already past
                Draft a1 = new Draft();
                a1.kind = "ADJUSTMENT";
                a1.periodStart = firstThis;
                a1.periodEnd = firstThis.plusMonths(1).minusDays(1);
                a1.issue = firstThis;
                a1.due = firstThis.plusDays(14);
                a1.description = "Mid-cycle license additions (prorated)";
                line(a1, "PRORATION", "Prorated: Professional licenses (5)", "5 licenses, part of the month", 5, 4900, productByCode.get("DEMO_BASE_PROFESSIONAL").getId(), null);
                line(a1, "PRORATION", "Prorated: AI Assistant add-on (3)", "3 licenses, part of the month", 3, 1300, productByCode.get(featCode("ai_assistant")).getId(), "ai_assistant");
                a1.method = defaultMethod;
                Instant paid = at(a1.issue).plus(2, ChronoUnit.DAYS).plus(11, ChronoUnit.HOURS);
                if (!paid.isAfter(now)) {
                    a1.paid = true;
                    a1.paidAt = paid;
                    payment(a1, "SUCCEEDED", paid, defaultMethod, null);
                }
                drafts.add(a1);
                // an overdue invoice: issued 45 days ago, due 30 days ago, one failed attempt, still open
                Draft a2 = new Draft();
                a2.kind = "ADJUSTMENT";
                a2.issue = today.minusDays(45);
                a2.due = today.minusDays(30);
                a2.periodStart = a2.issue;
                a2.periodEnd = a2.issue;
                a2.description = "Onboarding and training services (demo)";
                line(a2, "ADJUSTMENT", "Onboarding and training services (demo)", "Two half-day workshops", 2, 75000, null, null);
                a2.method = defaultMethod;
                a2.payments.add(failedPayment(a2, at(a2.issue).plus(5, ChronoUnit.DAYS).plus(9, ChronoUnit.HOURS)));
                drafts.add(a2);
            }
            drafts.sort(Comparator.comparing((Draft x) -> x.issue).thenComparing(x -> x.kind));
            Map<Integer, Integer> seqByYear = new HashMap<>();
            for (Draft d : drafts) {
                int seq = seqByYear.merge(d.issue.getYear(), 1, Integer::sum);
                OrgInvoice inv = new OrgInvoice();
                inv.setOrgId(orgId);
                inv.setInvoiceNumber(String.format("INV-%d-%04d", d.issue.getYear(), seq));
                inv.setKind(d.kind);
                inv.setPeriodStart(d.periodStart);
                inv.setPeriodEnd(d.periodEnd);
                inv.setIssueDate(d.issue);
                inv.setDueDate(d.due);
                inv.setStatus(d.paid ? "PAID" : "OPEN");
                inv.setDescription(d.description);
                inv.setAmountMinor(d.amount());
                inv.setAmountPaidMinor(d.paid ? d.amount() : 0L);
                inv.setPaidAt(d.paid ? d.paidAt : null);
                inv.setPaymentMethodId(d.method == null ? null : d.method.getId());
                inv.setCreatedAt(at(d.issue).plus(6, ChronoUnit.HOURS));
                inv = invoiceRepo.save(inv);
                short order = 0;
                List<OrgInvoiceLine> lines = new ArrayList<>();
                for (Line l : d.lines) {
                    OrgInvoiceLine x = new OrgInvoiceLine();
                    x.setOrgId(orgId);
                    x.setInvoiceId(inv.getId());
                    x.setLineKind(l.kind);
                    x.setDescription(l.description);
                    x.setDetail(l.detail);
                    x.setQuantity(l.qty);
                    x.setUnitAmountMinor(l.unit);
                    x.setAmountMinor(l.amount());
                    x.setProductId(l.productId);
                    x.setFeatureKey(l.featureKey);
                    x.setSortOrder((int) ++order);
                    lines.add(x);
                }
                lineRepo.saveAll(lines);
                for (OrgPayment p : d.payments) {
                    p.setInvoiceId(inv.getId());
                    p.setAmountMinor(d.amount());
                }
                paymentRepo.saveAll(d.payments);
                if (d.adjustment != null) {
                    d.adjustment.setAppliedInvoiceId(inv.getId());
                    d.adjustment.setAppliedAt(at(d.issue));
                    adjustmentRepo.save(d.adjustment);
                }
            }
            // pending credit that lands on the next invoice (the "Credits / Adjustments" line)
            adjustmentRepo.save(adjustment("CREDIT", spec.orgAddons() ? -400000L : -10000L, spec.orgAddons() ? "Annual commitment credit (demo)" : "Welcome credit (demo)", "PENDING", daysAgo(4)));
        }

        Instant daysAgoFrom(LocalDate d) {
            return at(d.minusDays(2));
        }

        OrgPayment failedPayment(Draft d, Instant when) {
            OrgPayment p = new OrgPayment();
            p.setOrgId(orgId);
            p.setPaymentMethodId(defaultMethod.getId());
            p.setStatus("FAILED");
            p.setKind("CHARGE");
            p.setOccurredAt(when);
            p.setFailureReason("card_declined");
            return p;
        }

        OrgBillingAdjustment adjustment(String kind, long amount, String reason, String status, Instant created) {
            OrgBillingAdjustment a = new OrgBillingAdjustment();
            a.setOrgId(orgId);
            a.setKind(kind);
            a.setAmountMinor(amount);
            a.setReason(reason);
            a.setStatus(status);
            a.setCreatedByMemberId(actorA);
            a.setCreatedAt(created);
            return a;
        }

        // ---- usage ----

        void seedUsage() {
            LocalDate curStart = firstThis;
            List<UsageCounter> counters = new ArrayList<>();
            List<UsageEvent> events = new ArrayList<>();
            // pass 1: counters for every live feature row, six months, current and previous also as events
            record Cell(LicenseFeature f, ConsultantLicense l, UsageCounter cur) {}
            List<Cell> curCells = new ArrayList<>();
            Map<Long, ConsultantLicense> licById = new HashMap<>();
            for (ConsultantLicense l : licenses) licById.put(l.getId(), l);
            for (Map.Entry<Long, List<LicenseFeature>> e : featuresOf.entrySet()) {
                ConsultantLicense l = licById.get(e.getKey());
                if ("PENDING".equals(l.getStatus())) continue;
                for (LicenseFeature f : e.getValue()) {
                    long allowance = f.getAllowanceOverride() != null ? f.getAllowanceOverride() : defByKey.get(f.getFeatureKey()).getDefaultAllowance();
                    double p0 = 0.12 + Math.pow(rnd.nextDouble(), 1.3) * 0.75;
                    long prev = 0;
                    for (int j = 1; j <= 5; j++) {
                        LocalDate ms = curStart.minusMonths(j);
                        LocalDate me = ms.plusMonths(1);
                        if (!f.getStartsAt().isBefore(at(me))) continue; // feature not active yet
                        if (l.getEndsAt() != null && "ENDED".equals(l.getStatus()) && l.getEndsAt().isBefore(at(ms))) continue;
                        double frac = 1.0;
                        if (f.getStartsAt().isAfter(at(ms))) frac = Math.max(0.1, (at(me).getEpochSecond() - f.getStartsAt().getEpochSecond()) / (double) (at(me).getEpochSecond() - at(ms).getEpochSecond()));
                        double scale = Math.pow(0.88, j - 1) * (0.9 + rnd.nextDouble() * 0.2);
                        long used = Math.min(allowance, Math.round(allowance * p0 * scale * frac));
                        if (used <= 0) continue;
                        if (j == 1) prev = used;
                        counters.add(counter(l, f, key(ms), used, allowance));
                        if (j <= 1) events.addAll(eventsFor(l, f, ms, me, used));
                    }
                    if ("SUSPENDED".equals(l.getStatus()) || "ENDED".equals(l.getStatus()) || !f.getLive()) continue;
                    LocalDate me = curStart.plusMonths(1);
                    double frac = 1.0;
                    if (f.getStartsAt().isAfter(at(curStart))) {
                        double span = Math.max(1, now.getEpochSecond() - at(curStart).getEpochSecond());
                        frac = Math.max(0.1, Math.min(1.0, (now.getEpochSecond() - f.getStartsAt().getEpochSecond()) / span));
                    }
                    long used;
                    // month to date is seeded at full-month pace so that "vs last month" is a real +24 % (+/- noise), not a partial-month dip
                    if (prev > 0) used = Math.round(prev * (1.0 + 0.24 + (rnd.nextDouble() - 0.5) * 0.5));
                    else used = Math.round(allowance * p0 * frac);
                    used = Math.max(1, Math.min(allowance, used));
                    UsageCounter c = counter(l, f, key(curStart), used, allowance);
                    counters.add(c);
                    curCells.add(new Cell(f, l, c));
                }
            }
            // credits on a few of the busy counters (allowance includes them)
            List<FeatureCredit> credits = new ArrayList<>();
            List<Cell> pool = new ArrayList<>(curCells);
            java.util.Collections.shuffle(pool, rnd);
            int nCredits = spec.orgAddons() ? 3 : 1;
            for (int i = 0; i < nCredits && i < pool.size(); i++) {
                Cell cell = pool.get(i);
                long q = Math.max(50, Math.round(cell.cur().getAllowance() * 0.2 / 50.0) * 50);
                FeatureCredit fc = new FeatureCredit();
                fc.setOrgId(orgId);
                fc.setConsultantId(cell.l().getConsultantId());
                fc.setFeatureKey(cell.f().getFeatureKey());
                fc.setQuantity(q);
                fc.setPeriodKey(key(curStart));
                fc.setReason("Extra credits for a busy month (demo)");
                fc.setCreatedByMemberId(actorA);
                fc.setCreatedAt(daysAgo(1 + rnd.nextInt(10)));
                credits.add(fc);
                cell.cur().setAllowance(cell.cur().getAllowance() + q);
            }
            // a few counters near / at the limit (the Recent Alerts)
            int near = spec.orgAddons() ? 4 : 1;
            for (int i = nCredits; i < pool.size() && near > 0; i++) {
                UsageCounter c = pool.get(i).cur();
                if (c.getAllowance() < 200) continue;
                long used = near == 1 && spec.orgAddons() ? c.getAllowance() : Math.round(c.getAllowance() * (0.8 + rnd.nextDouble() * 0.12));
                c.setUsed(used);
                near--;
            }
            // the current month's events must equal the final counter values: build them after the adjustments
            for (Cell cell : curCells) events.addAll(eventsFor(cell.l(), cell.f(), curStart, curStart.plusMonths(1), cell.cur().getUsed()));
            counterRepo.saveAll(counters);
            eventRepo.saveAll(events);
            creditRepo.saveAll(credits);
            List<UsageAlert> alerts = new ArrayList<>();
            for (Cell cell : curCells) {
                UsageCounter c = cell.cur();
                long pct = c.getAllowance() == 0 ? 0 : c.getUsed() * 100 / c.getAllowance();
                if (pct < ALERT_PCT) continue;
                UsageAlert a = new UsageAlert();
                a.setOrgId(orgId);
                a.setConsultantId(c.getConsultantId());
                a.setFeatureKey(c.getFeatureKey());
                a.setKind(pct >= 100 ? "LIMIT_REACHED" : "APPROACHING_LIMIT");
                a.setThresholdPct((int) (pct >= 100 ? 100 : ALERT_PCT));
                a.setPeriodKey(c.getPeriodKey());
                String name = featByKey.get(c.getFeatureKey()).name();
                a.setMessage(pct >= 100 ? "You have used 100% of your " + name + " allowance." : "You've used " + ALERT_PCT + "% of your " + name + " allowance.");
                a.setCreatedAt(daysAgo(0.1 + rnd.nextDouble() * 5));
                alerts.add(a);
            }
            alertRepo.saveAll(alerts);
        }

        UsageCounter counter(ConsultantLicense l, LicenseFeature f, String period, long used, long allowance) {
            UsageCounter c = new UsageCounter();
            c.setOrgId(orgId);
            c.setConsultantId(l.getConsultantId());
            c.setFeatureKey(f.getFeatureKey());
            c.setPeriodKey(period);
            c.setUsed(used);
            c.setAllowance(allowance);
            c.setUpdatedAt(now);
            return c;
        }

        /** Splits {@code used} into 2..5 events inside the month (current month: up to now). The quantities sum to used exactly. */
        List<UsageEvent> eventsFor(ConsultantLicense l, LicenseFeature f, LocalDate ms, LocalDate me, long used) {
            List<UsageEvent> out = new ArrayList<>();
            if (used <= 0) return out;
            int n = (int) Math.min(used, 2 + rnd.nextInt(4));
            Instant lo = at(ms);
            if (f.getStartsAt().isAfter(lo)) lo = f.getStartsAt();
            Instant hi = at(me).isAfter(now) ? now : at(me).minus(1, ChronoUnit.MINUTES);
            if (!lo.isBefore(hi)) lo = hi.minus(1, ChronoUnit.HOURS);
            long left = used;
            for (int i = 0; i < n; i++) {
                long q = i == n - 1 ? left : Math.max(1, Math.min(left - (n - 1 - i), Math.round(used * (0.5 + rnd.nextDouble()) / n)));
                left -= q;
                UsageEvent e = new UsageEvent();
                e.setOrgId(orgId);
                e.setConsultantId(l.getConsultantId());
                e.setFeatureKey(f.getFeatureKey());
                e.setQuantity(q);
                e.setPeriodKey(key(ms));
                e.setStatus("COMMITTED");
                e.setSource(rnd.nextBoolean() ? "WEB" : "EXTENSION");
                e.setOccurredAt(randIn(lo, hi));
                out.add(e);
            }
            return out;
        }

        // ---- consistency with the talent boards, change log, account ----

        /** The Consultants board's license chip follows the license: ACTIVE, EXPIRING, PENDING; suspended and unlicensed need review. */
        void syncConsultantProfiles() {
            Map<Long, ConsultantLicense> live = new HashMap<>();
            for (ConsultantLicense l : licenses) if (!"ENDED".equals(l.getStatus())) live.put(l.getConsultantId(), l);
            for (ConsultantProfile c : cons) {
                ConsultantLicense l = live.get(c.getId());
                String status = l == null ? "NEEDS_REVIEW" : switch (l.getStatus()) {
                    case "ACTIVE" -> "ACTIVE";
                    case "CANCEL_AT_PERIOD_END" -> "EXPIRING";
                    case "PENDING" -> "PENDING";
                    default -> "NEEDS_REVIEW";
                };
                java.sql.Date until = l == null ? null : java.sql.Date.valueOf(LocalDate.ofInstant(l.getEndsAt() != null ? l.getEndsAt() : l.getRenewsAt(), ZoneOffset.UTC));
                jdbc.update("update consultant_profile set license_status = ?, license_valid_until = ? where org_id = ? and id = ?", status, until, orgId, c.getId());
            }
        }

        void seedSubscriptionChanges() {
            List<SubscriptionChange> out = new ArrayList<>();
            double[] days = { 3, 26, 52, 80 };
            for (double d : days) {
                Instant t = daysAgo(d);
                long total = licenseRepo.countLiveAt(orgId, t);
                long before = licenseRepo.countLiveAt(orgId, t.minus(14, ChronoUnit.DAYS));
                long delta = total - before;
                if (delta == 0) delta = 1;
                out.add(change(delta > 0 ? "ADDED" : "REMOVED", (delta > 0 ? "+" : "") + delta + " Consultant Licenses (Total: " + total + ")", (int) delta, (int) total, d > 50 ? actorC : actorA, t));
            }
            out.add(change("UPDATED", "Upgraded to Professional Plan", 0, (int) licenseRepo.countLiveAt(orgId, daysAgo(40)), actorB, daysAgo(40)));
            if (spec.orgAddons()) {
                for (OrgAddon a : ORG_ADDONS) out.add(change("ADDED", "Added " + a.name(), 0, null, actorA, at(firstThis.minusMonths(a.startMonthsAgo())).plus(10, ChronoUnit.HOURS)));
            }
            subscriptionChangeRepo.saveAll(out);
        }

        SubscriptionChange change(String kind, String summary, int delta, Integer totalAfter, Long actor, Instant at) {
            SubscriptionChange c = new SubscriptionChange();
            c.setOrgId(orgId);
            c.setKind(kind);
            c.setSummary(summary);
            c.setLicensesDelta(delta);
            c.setLicensesTotalAfter(totalAfter);
            c.setActorMemberId(actor);
            c.setOccurredAt(at);
            return c;
        }

        void seedAccount() {
            OrgBillingAccount a = new OrgBillingAccount();
            a.setOrgId(orgId);
            a.setBillingEmail("billing@" + spec.key() + ".example.com");
            a.setStatus("ACTIVE");
            a.setBillingCycle("MONTH");
            a.setCurrentPeriodStart(firstThis);
            a.setCurrentPeriodEnd(firstThis.plusMonths(1).minusDays(1));
            a.setNextInvoiceOn(firstThis.plusMonths(1));
            a.setPaidThroughOn(firstThis);
            a.setDefaultPaymentMethodId(defaultMethod.getId());
            a.setSeatsPurchased(spec.capacity());
            a.setCreatedAt(at(firstThis.minusMonths(spec.months() + 1)));
            a.setUpdatedAt(now);
            accountRepo.save(a);
        }
    }

    /** Org-owned billing tables, in dependency order (used for the per-org row counts and by BillingSchemaIT). */
    public static final List<String> TABLES = List.of(
        "org_contract", "org_contract_price", "org_payment_method", "org_billing_account", "org_subscription", "org_plan_feature", "org_subscription_item",
        "subscription_change", "consultant_license", "license_feature", "license_change", "org_invoice", "org_invoice_line", "org_payment",
        "org_billing_adjustment", "usage_event", "usage_counter", "usage_alert", "feature_credit"
    );
}
