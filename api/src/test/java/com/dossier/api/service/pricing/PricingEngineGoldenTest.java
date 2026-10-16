package com.dossier.api.service.pricing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dossier.api.service.pricing.PricingInputs.LineGroup;
import com.dossier.api.service.pricing.PricingInputs.LineRequest;
import com.dossier.api.service.pricing.PricingTerms.ContractRow;
import com.dossier.api.service.pricing.PricingTerms.ContractTerms;
import com.dossier.api.service.pricing.PricingTerms.DiscountKind;
import com.dossier.api.service.pricing.PricingTerms.OrgDiscount;
import com.dossier.api.service.pricing.PricingTerms.VolumeTier;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.InputStream;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Set;
import java.util.stream.Stream;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;

/** Golden tables: S1 to S3 (docs/subscriptions/03 section 8), G1 to G14 (docs/enterprise-v2/22 section 9). */
class PricingEngineGoldenTest {

    static final Instant NOW = Instant.parse("2026-11-20T12:00:00Z");
    static final String USD = "USD";

    // ---- G1 to G9 from the JSON fixture ----------------------------------------------------------------------------------

    @TestFactory
    Stream<DynamicTest> orgGoldenTablesFromFixture() throws Exception {
        JsonNode root;
        try (InputStream in = getClass().getResourceAsStream("/pricing/golden-org-g1-g9.json")) {
            root = new ObjectMapper().readTree(in);
        }
        PricingEngine engine = new PricingEngine(Draft.org());
        List<DynamicTest> tests = new ArrayList<>();
        for (JsonNode sc : root.get("scenarios")) {
            tests.add(DynamicTest.dynamicTest(sc.get("id").asText(), () -> runScenario(engine, root.get("consultants"), sc)));
        }
        return tests.stream();
    }

    private void runScenario(PricingEngine engine, JsonNode consultants, JsonNode sc) {
        ContractTerms contract = null;
        if (sc.has("contract")) {
            List<ContractRow> rows = new ArrayList<>();
            for (JsonNode r : sc.get("contract").get("rows")) {
                String product = r.get("product").isNull() ? null : r.get("product").asText();
                rows.add(r.has("amount") ? new ContractRow(product, r.get("amount").asLong(), null) : new ContractRow(product, null, r.get("pctOffBp").asInt()));
            }
            contract = new ContractTerms("c1", 1, USD, sc.get("contract").get("stackable").asBoolean(), sc.get("contract").get("volumeApplies").asBoolean(), rows);
        }
        List<OrgDiscount> discounts = new ArrayList<>();
        if (sc.has("discounts")) {
            for (JsonNode d : sc.get("discounts")) {
                Set<String> kinds = new HashSet<>();
                d.get("scopeKinds").forEach(k -> kinds.add(k.asText()));
                discounts.add(new OrgDiscount(d.get("id").asLong(), d.get("name").asText(), DiscountKind.PERCENT, d.get("pctOffBp").asInt(), 0, USD, kinds, Set.of()));
            }
        }
        List<VolumeTier> tiers = new ArrayList<>();
        if (sc.has("tiers")) {
            for (JsonNode t : sc.get("tiers")) {
                tiers.add(new VolumeTier(t.get("id").asLong(), t.get("min").asInt(), t.get("pctOffBp").asInt(), Set.of()));
            }
        }
        List<LineGroup> groups = new ArrayList<>();
        Iterator<String> names = consultants.fieldNames();
        while (names.hasNext()) {
            String name = names.next();
            List<LineRequest> lines = new ArrayList<>();
            consultants.get(name).forEach(p -> lines.add(new LineRequest(p.asText(), 1)));
            groups.add(new LineGroup(name, lines));
        }
        PricingInputs in = new PricingInputs(Audience.ORG, USD, BillingInterval.MONTH, NOW, groups, contract, discounts, tiers, sc.get("licensedCount").asInt(), null);
        PricingResult r = engine.price(in);
        String id = sc.get("id").asText();
        JsonNode expect = sc.get("expect");
        Iterator<String> keys = expect.fieldNames();
        while (keys.hasNext()) {
            String k = keys.next();
            switch (k) {
                case "recurring" -> assertThat(r.recurringMinor()).as(id + " recurring").isEqualTo(expect.get(k).asLong());
                case "discountTotal" -> assertThat(r.discountTotalMinor()).as(id + " discount_total").isEqualTo(expect.get(k).asLong());
                case "promo" -> assertThat(r.appliedDiscountName()).as(id + " promo").isEqualTo(expect.get(k).isNull() ? null : expect.get(k).asText());
                default -> assertThat(r.groupTotal(k)).as(id + " consultant " + k).isEqualTo(expect.get(k).asLong());
            }
        }
    }

    static PricingInputs orgInputs(List<LineGroup> groups, int licensed, List<VolumeTier> tiers) {
        return new PricingInputs(Audience.ORG, USD, BillingInterval.MONTH, NOW, groups, null, null, tiers, licensed, null);
    }

    static LineGroup g(String key, String... products) {
        List<LineRequest> lines = new ArrayList<>();
        for (String p : products) {
            lines.add(new LineRequest(p, 1));
        }
        return new LineGroup(key, lines);
    }

    @Test
    void g1StripeItemsReproduceTheRecurringToTheCent() {
        PricingResult r = new PricingEngine(Draft.org()).price(orgInputs(List.of(g("A", "BASE", "JM", "RT"), g("B", "BASE", "INB", "MKT", "INT"), g("C", "BASE")), 3, null));
        long fromItems = 3 * 1499 + 499 + 799 + 499 + 699 + 999; // BASE x3, JM, RT, INB, MKT, INT: 6 Stripe items
        assertThat(fromItems).isEqualTo(7992);
        assertThat(r.recurringMinor()).isEqualTo(fromItems);
        assertThat(r.discountTotalMinor()).isZero();
    }

    @Test
    void g7RemovingConsultantCDropsTheTierAndWarns() {
        PricingEngine engine = new PricingEngine(Draft.org());
        List<VolumeTier> tiers = List.of(new VolumeTier(1, 3, 500, Set.of()));
        PricingResult three = engine.price(orgInputs(List.of(g("A", "BASE", "JM", "RT"), g("B", "BASE", "INB", "MKT", "INT"), g("C", "BASE")), 3, tiers));
        PricingResult two = engine.price(orgInputs(List.of(g("A", "BASE", "JM", "RT"), g("B", "BASE", "INB", "MKT", "INT")), 2, tiers));
        assertThat(three.recurringMinor()).isEqualTo(7592);
        assertThat(two.recurringMinor()).isEqualTo(6493);
        ChangeImpact impact = engine.impact(three, two, Instant.parse("2026-11-05T00:00:00Z"), Instant.parse("2026-12-05T00:00:00Z"), NOW);
        assertThat(impact.volumeTierChanges()).isTrue();
        assertThat(impact.tierFromMinLicensed()).isEqualTo(3);
        assertThat(impact.tierToMinLicensed()).isNull();
        assertThat(impact.prorationTotalMinor()).isZero(); // removals prorate to 0
    }

    @Test
    void g11ProrationQuoteAndConfirm() {
        PricingEngine engine = new PricingEngine(Draft.org());
        Instant start = Instant.parse("2026-11-05T00:00:00Z");
        Instant end = Instant.parse("2026-12-05T00:00:00Z");
        PricingResult current = engine.price(orgInputs(List.of(g("A", "BASE", "JM", "RT"), g("B", "BASE", "INB", "MKT", "INT"), g("C", "BASE"), g("D")), 3, null));
        PricingResult proposed = engine.price(orgInputs(List.of(g("A", "BASE", "JM", "RT"), g("B", "BASE", "INB", "MKT"), g("C", "BASE", "RT"), g("D", "BASE", "JM", "ALR")), 4, null));
        assertThat(current.recurringMinor()).isEqualTo(7992);

        ChangeImpact quote = engine.impact(current, proposed, start, end, Instant.parse("2026-11-20T12:00:00Z"));
        assertThat(quote.proposedRecurringMinor()).isEqualTo(9989);
        assertThat(quote.deltaMinor()).isEqualTo(1997);
        assertThat(quote.prorationTotalMinor()).isEqualTo(1448);
        assertThat(quote.nextInvoiceEstimateMinor()).isEqualTo(11437);
        // RT on C = 386; the preset on D is 1062 as a whole and also per line (725 + 241 + 96)
        assertThat(quote.prorationLines()).filteredOn(l -> l.groupKey().equals("C")).singleElement().satisfies(l -> assertThat(l.prorationMinor()).isEqualTo(386));
        assertThat(quote.prorationLines()).filteredOn(l -> l.groupKey().equals("D")).extracting(ChangeImpact.ProrationLine::prorationMinor).containsExactly(725L, 241L, 96L);
        assertThat(PricingEngine.prorate(2197, 1, start, end, Instant.parse("2026-11-20T12:00:00Z"))).isEqualTo(1062);

        ChangeImpact confirm = engine.impact(current, proposed, start, end, Instant.parse("2026-11-20T18:00:00Z"));
        assertThat(confirm.prorationTotalMinor()).isEqualTo(1424).isLessThanOrEqualTo(quote.prorationTotalMinor());
        assertThat(PricingEngine.prorate(799, 1, start, end, Instant.parse("2026-11-20T18:00:00Z"))).isEqualTo(380);
    }

    @Test
    void seatTransferProratesZeroAndKeepsTheTotal() {
        PricingResult r = new PricingEngine(Draft.org()).price(orgInputs(List.of(g("A", "BASE", "JM")), 1, null));
        ChangeImpact t = PricingEngine.transferImpact(r);
        assertThat(t.prorationTotalMinor()).isZero();
        assertThat(t.deltaMinor()).isZero();
        assertThat(t.proposedRecurringMinor()).isEqualTo(r.recurringMinor());
    }

    @Test
    void prorationIsClampedToThePeriod() {
        Instant start = Instant.parse("2026-11-05T00:00:00Z");
        Instant end = Instant.parse("2026-12-05T00:00:00Z");
        assertThat(PricingEngine.prorate(799, 1, start, end, start.minusSeconds(86_400))).isEqualTo(799); // never more than a full period
        assertThat(PricingEngine.prorate(799, 1, start, end, end)).isZero();
        assertThat(PricingEngine.prorate(799, 1, start, end, end.plusSeconds(5))).isZero();
        assertThatThrownBy(() -> PricingEngine.prorate(1, 1, end, start, start)).isInstanceOf(PricingException.class);
    }

    // ---- G12 currencies --------------------------------------------------------------------------------------------------

    @Test
    void g12EurAndJpyAndMixedCurrencyContract() {
        InMemoryCatalog c = new InMemoryCatalog();
        c.add("BASE", "BASE_LICENSE", Audience.ORG, BillingInterval.MONTH, "EUR", 1399, 0);
        c.add("JM", "FEATURE", Audience.ORG, BillingInterval.MONTH, "EUR", 449, 75);
        c.add("BASE", "BASE_LICENSE", Audience.ORG, BillingInterval.MONTH, "JPY", 1999, 0);
        PricingEngine engine = new PricingEngine(c);
        PricingInputs eur = new PricingInputs(Audience.ORG, "EUR", BillingInterval.MONTH, NOW, List.of(g("A", "BASE", "JM")), null, null, null, 1, null);
        assertThat(engine.price(eur).recurringMinor()).isEqualTo(1848);

        PricingInputs jpy = new PricingInputs(Audience.ORG, "JPY", BillingInterval.MONTH, NOW, List.of(g("A", "BASE")), null, null, List.of(new VolumeTier(1, 1, 500, Set.of())), 1, null);
        assertThat(engine.price(jpy).recurringMinor()).isEqualTo(1899); // 1899.05, whole yen

        PricingInputs notPublished = new PricingInputs(Audience.ORG, "GBP", BillingInterval.MONTH, NOW, List.of(g("A", "BASE")), null, null, null, 1, null);
        assertThatThrownBy(() -> engine.price(notPublished)).isInstanceOfSatisfying(PricingException.class, e -> assertThat(e.code()).isEqualTo("PRICE_MISSING"));

        ContractTerms usdContract = new ContractTerms("c", 1, USD, false, false, List.of(new ContractRow("BASE", 100L, null)));
        PricingInputs mixed = new PricingInputs(Audience.ORG, "EUR", BillingInterval.MONTH, NOW, List.of(g("A", "BASE")), usdContract, null, null, 1, null);
        assertThatThrownBy(() -> engine.price(mixed)).isInstanceOfSatisfying(PricingException.class, e -> assertThat(e.code()).isEqualTo("CURRENCY_MISMATCH"));
    }

    // ---- G13 stackable feature -------------------------------------------------------------------------------------------

    @Test
    void g13StackableCreditsAndTheAiBudgetOfTheWindow() {
        PricingEngine engine = new PricingEngine(Draft.org());
        List<LineRequest> lines = List.of(new LineRequest("BASE", 1), new LineRequest("JM", 1), new LineRequest("RT", 1), new LineRequest("CREDIT", "CREDIT", 3, 4));
        PricingResult r = engine.price(orgInputs(List.of(new LineGroup("A", lines)), 1, null));
        assertThat(r.groupTotal("A")).isEqualTo(4294); // 2797 + 3 x 499
        assertThat(r.aiMonthlyCents()).isEqualTo(425); // 75 + 125 + 3 x 75
        List<LineRequest> five = List.of(new LineRequest("BASE", 1), new LineRequest("CREDIT", "CREDIT", 5, 4));
        assertThatThrownBy(() -> engine.price(orgInputs(List.of(new LineGroup("A", five)), 1, null))).isInstanceOfSatisfying(PricingException.class, e -> {
            assertThat(e.code()).isEqualTo("QUANTITY_LIMIT");
            assertThat(e.details()).containsEntry("max", 4);
        });
    }

    // ---- S1 / S2 / S3 ----------------------------------------------------------------------------------------------------

    private List<LineRequest> proPlusCredits() {
        return List.of(new LineRequest("PRO", 1), new LineRequest("CREDITS", 2));
    }

    @Test
    void s1ProPlusTwoCreditsMonthly() {
        PricingEngine engine = new PricingEngine(Draft.individual(1000));
        PricingResult r = engine.price(PricingInputs.individual(USD, BillingInterval.MONTH, NOW, proPlusCredits()));
        assertThat(r.recurringMinor()).isEqualTo(2997);
        assertThat(r.aiMonthlyCents()).isEqualTo(450);
        assertThat(r.aiWindowCents()).isEqualTo(450);
        assertThat(r.group("plan").lines()).extracting(PricingResult.LineResult::lineTotalMinor).containsExactly(1999L, 998L);
        IntervalSummary s = engine.summarize(PricingInputs.individual(USD, BillingInterval.MONTH, NOW, proPlusCredits()));
        assertThat(s.monthlyEquivalentMinor()).isEqualTo(2997);
        assertThat(s.savingsMinor()).isZero();
    }

    @Test
    void s1QuarterVariantUsesTheExplicitQuarterRows() {
        PricingEngine engine = new PricingEngine(Draft.individual(1000));
        PricingResult base = engine.price(PricingInputs.individual(USD, BillingInterval.QUARTER, NOW, List.of(new LineRequest("PRO", 1))));
        assertThat(base.recurringMinor()).isEqualTo(4999);
        assertThat(base.aiWindowCents()).isEqualTo(800); // the quarterly cap is 8 dollars, not 3 x 3
        PricingResult withCredits = engine.price(PricingInputs.individual(USD, BillingInterval.QUARTER, NOW, List.of(new LineRequest("PRO", 1), new LineRequest("CREDITS", 3))));
        assertThat(withCredits.recurringMinor()).isEqualTo(4999 + 3 * 1497);
        // no QUARTER row for AUTOPILOT: it is simply not offered quarterly
        assertThatThrownBy(() -> engine.price(PricingInputs.individual(USD, BillingInterval.QUARTER, NOW, List.of(new LineRequest("AUTOPILOT", 1)))))
            .isInstanceOfSatisfying(PricingException.class, e -> assertThat(e.code()).isEqualTo("PRICE_MISSING"));
    }

    @Test
    void s2ProPlusTwoCreditsAnnual() {
        PricingEngine engine = new PricingEngine(Draft.individual(1000));
        PricingInputs in = PricingInputs.individual(USD, BillingInterval.YEAR, NOW, proPlusCredits());
        PricingResult r = engine.price(in);
        assertThat(r.group("plan").lines()).extracting(PricingResult.LineResult::unitEffectiveMinor).containsExactly(21589L, 5389L);
        assertThat(r.recurringMinor()).isEqualTo(32367);
        assertThat(r.aiMonthlyCents()).isEqualTo(450);
        assertThat(r.aiWindowCents()).isEqualTo(5400);
        IntervalSummary s = engine.summarize(in);
        assertThat(s.monthlyEquivalentMinor()).isEqualTo(2697);
        assertThat(s.monthTotalMinor()).isEqualTo(2997);
        assertThat(s.savingsMinor()).isEqualTo(3597);
        assertThat(s.savingsBp()).isEqualTo(1000);
    }

    @Test
    void s3OrganizationAnnualWithComponentDiscounts() {
        InMemoryCatalog c = new InMemoryCatalog();
        int[][] rows = { { 1499, 0, 1000 }, { 499, 75, 900 }, { 799, 125, 600 }, { 499, 60, 1000 }, { 699, 75, 1000 }, { 999, 150, 1000 }, { 199, 0, 1000 } };
        String[] codes = { "BASE", "JM", "RT", "INB", "MKT", "INT", "ALR" };
        for (int i = 0; i < codes.length; i++) {
            String kind = i == 0 ? "BASE_LICENSE" : "FEATURE";
            c.add(codes[i], kind, Audience.ORG, BillingInterval.MONTH, USD, rows[i][0], rows[i][1]);
            c.add(codes[i], kind, Audience.ORG, BillingInterval.YEAR, USD, AnnualPrices.derive(rows[i][0], rows[i][2]), rows[i][1]);
        }
        PricingEngine engine = new PricingEngine(c);
        List<LineGroup> groups = List.of(g("A", "BASE", "JM", "RT"), g("B", "BASE", "INB", "MKT", "INT"), g("C", "BASE"));
        PricingInputs year = new PricingInputs(Audience.ORG, USD, BillingInterval.YEAR, NOW, groups, null, null, null, 3, null);
        PricingResult r = engine.price(year);
        assertThat(r.groupTotal("A")).isEqualTo(30651);
        assertThat(r.groupTotal("B")).isEqualTo(39916);
        assertThat(r.groupTotal("C")).isEqualTo(16189);
        assertThat(r.recurringMinor()).isEqualTo(86756);
        IntervalSummary s = engine.summarize(year);
        assertThat(s.monthlyEquivalentMinor()).isEqualTo(7230);
        assertThat(s.savingsMinor()).isEqualTo(9148); // 12 x 7992 = 95904 less 86756
        assertThat(s.savingsBp()).isEqualTo(954);

        // mid-term seat D on day 100 of a 365 day term
        List<LineGroup> four = List.of(groups.get(0), groups.get(1), groups.get(2), g("D", "BASE", "JM", "ALR"));
        PricingResult withD = engine.price(new PricingInputs(Audience.ORG, USD, BillingInterval.YEAR, NOW, four, null, null, null, 4, null));
        Instant start = Instant.parse("2026-01-01T00:00:00Z");
        Instant end = start.plusSeconds(365L * 86_400);
        Instant day100 = start.plusSeconds(100L * 86_400);
        ChangeImpact add = engine.impact(r, withD, start, end, day100);
        assertThat(withD.groupTotal("D")).isEqualTo(23787);
        assertThat(add.prorationLines()).extracting(ChangeImpact.ProrationLine::unitEffectiveMinor).containsExactly(16189L, 5449L, 2149L);
        assertThat(add.prorationTotalMinor()).isBetween(17269L, 17271L); // per line; the whole seat as one amount is exactly 17270
        assertThat(PricingEngine.prorate(23787, 1, start, end, day100)).isEqualTo(17270);
        assertThat(withD.recurringMinor()).isEqualTo(110543);
    }

    @Test
    void annualIsRefusedWhenTheSwitchIsOffAndOrgQuarterIsAlwaysRefused() {
        PricingEngine engine = new PricingEngine(Draft.individual(1000));
        IntervalPolicy off = new IntervalPolicy(IntervalPolicy.DEFAULTS.individual(), IntervalPolicy.DEFAULTS.org(), false);
        PricingInputs in = new PricingInputs(Audience.INDIVIDUAL, USD, BillingInterval.YEAR, NOW, List.of(g("plan", "PRO")), null, null, null, 0, off);
        assertThatThrownBy(() -> engine.price(in)).isInstanceOfSatisfying(PricingException.class, e -> assertThat(e.code()).isEqualTo("INTERVAL_NOT_ALLOWED"));
        PricingInputs orgQuarter = new PricingInputs(Audience.ORG, USD, BillingInterval.QUARTER, NOW, List.of(g("A", "BASE")), null, null, null, 1, null);
        assertThatThrownBy(() -> new PricingEngine(Draft.org()).price(orgQuarter)).isInstanceOfSatisfying(PricingException.class, e -> assertThat(e.code()).isEqualTo("INTERVAL_NOT_ALLOWED"));
    }

    @Test
    void individualsRefuseContractsDiscountsAndTiers() {
        PricingEngine engine = new PricingEngine(Draft.individual(1000));
        PricingInputs in = new PricingInputs(Audience.INDIVIDUAL, USD, BillingInterval.MONTH, NOW, List.of(g("plan", "PRO")), null, null, List.of(new VolumeTier(1, 1, 500, Set.of())), 1, null);
        assertThatThrownBy(() -> engine.price(in)).isInstanceOfSatisfying(PricingException.class, e -> assertThat(e.code()).isEqualTo("INVALID_INPUT"));
    }

    @Test
    void theBestDiscountWinsAndTiesGoToTheLowestId() {
        PricingEngine engine = new PricingEngine(Draft.org());
        OrgDiscount ten = new OrgDiscount(7, "TEN", DiscountKind.PERCENT, 1000, 0, USD, Set.of("FEATURE"), Set.of());
        OrgDiscount twentyB = new OrgDiscount(9, "TWENTY-B", DiscountKind.PERCENT, 2000, 0, USD, Set.of("FEATURE"), Set.of());
        OrgDiscount twentyA = new OrgDiscount(3, "TWENTY-A", DiscountKind.PERCENT, 2000, 0, USD, Set.of("FEATURE"), Set.of());
        List<LineGroup> groups = List.of(g("A", "BASE", "JM", "RT"));
        PricingInputs in = new PricingInputs(Audience.ORG, USD, BillingInterval.MONTH, NOW, groups, null, List.of(ten, twentyB, twentyA), null, 1, null);
        PricingResult r = engine.price(in);
        assertThat(r.appliedDiscountName()).isEqualTo("TWENTY-A");
        assertThat(r.appliedDiscountId()).isEqualTo(3L);
        // exactly one discount: the single best reduction, not a stack (JM 499 to 399, RT 799 to 639)
        assertThat(r.promotionalDiscountMinor()).isEqualTo((499 - 399) + (799 - 639));
    }

    @Test
    void anAmountOffDiscountClampsAtZeroAndCurrencyMustMatch() {
        PricingEngine engine = new PricingEngine(Draft.org());
        OrgDiscount big = new OrgDiscount(1, "BIG", DiscountKind.AMOUNT_PER_UNIT, 0, 5000, USD, Set.of("FEATURE"), Set.of());
        PricingInputs in = new PricingInputs(Audience.ORG, USD, BillingInterval.MONTH, NOW, List.of(g("A", "BASE", "JM")), null, List.of(big), null, 1, null);
        assertThat(engine.price(in).groupTotal("A")).isEqualTo(1499);
        OrgDiscount eur = new OrgDiscount(2, "EURO", DiscountKind.AMOUNT_PER_UNIT, 0, 100, "EUR", Set.of(), Set.of());
        PricingInputs bad = new PricingInputs(Audience.ORG, USD, BillingInterval.MONTH, NOW, List.of(g("A", "BASE", "JM")), null, List.of(eur), null, 1, null);
        assertThatThrownBy(() -> engine.price(bad)).isInstanceOfSatisfying(PricingException.class, e -> assertThat(e.code()).isEqualTo("CURRENCY_MISMATCH"));
    }

    @Test
    void aProductTierBeatsAnAllProductsTier() {
        PricingEngine engine = new PricingEngine(Draft.org());
        List<VolumeTier> tiers = List.of(new VolumeTier(1, 2, 500, Set.of()), new VolumeTier(2, 2, 2000, Set.of("JM")), new VolumeTier(3, 5, 9000, Set.of()));
        PricingInputs in = new PricingInputs(Audience.ORG, USD, BillingInterval.MONTH, NOW, List.of(g("A", "BASE", "JM")), null, null, tiers, 3, null);
        PricingResult r = engine.price(in);
        assertThat(r.group("A").lines()).extracting(PricingResult.LineResult::unitEffectiveMinor).containsExactly(1424L, 399L); // BASE 5 percent, JM 20 percent
        assertThat(r.appliedTierIds()).containsExactlyInAnyOrder(1L, 2L);
    }
}
