package com.dossier.api.service.pricing;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.service.pricing.PricingInputs.LineGroup;
import com.dossier.api.service.pricing.PricingInputs.LineRequest;
import com.dossier.api.service.pricing.PricingTerms.ContractRow;
import com.dossier.api.service.pricing.PricingTerms.ContractTerms;
import com.dossier.api.service.pricing.PricingTerms.DiscountKind;
import com.dossier.api.service.pricing.PricingTerms.OrgDiscount;
import com.dossier.api.service.pricing.PricingTerms.VolumeTier;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;
import java.util.Set;
import org.junit.jupiter.api.Test;

/** Property tests of docs/enterprise-v2/22 section 10 and docs/subscriptions/03 section 12 (8 to 10), hand-rolled generators, 1000 cases each. */
class PricingEnginePropertyTest {

    static final int CASES = 1000;
    static final Instant NOW = Instant.parse("2026-11-20T12:00:00Z");
    static final String[] CODES = { "BASE", "JM", "RT", "INB", "MKT", "INT", "ALR" };

    private final PricingEngine engine = new PricingEngine(Draft.org());

    /** A random org basket: 1 to 6 consultants, each BASE plus a random subset, random commercial terms. */
    private PricingInputs random(Random r, boolean withTerms) {
        List<LineGroup> groups = new ArrayList<>();
        int seats = 1 + r.nextInt(6);
        for (int s = 0; s < seats; s++) {
            List<LineRequest> lines = new ArrayList<>();
            lines.add(new LineRequest("BASE", 1));
            for (int i = 1; i < CODES.length; i++) {
                if (r.nextBoolean()) {
                    lines.add(new LineRequest(CODES[i], 1));
                }
            }
            groups.add(new LineGroup("S" + s, lines));
        }
        ContractTerms contract = null;
        List<OrgDiscount> discounts = new ArrayList<>();
        List<VolumeTier> tiers = new ArrayList<>();
        if (withTerms) {
            if (r.nextInt(3) == 0) {
                ContractRow row = r.nextBoolean() ? new ContractRow(CODES[r.nextInt(CODES.length)], (long) r.nextInt(3000), null) : new ContractRow(null, null, r.nextInt(10_001));
                contract = new ContractTerms("c", 1, "USD", r.nextBoolean(), r.nextBoolean(), List.of(row));
            }
            for (int d = r.nextInt(3); d > 0; d--) {
                boolean pct = r.nextBoolean();
                discounts.add(new OrgDiscount(d, "D" + d, pct ? DiscountKind.PERCENT : DiscountKind.AMOUNT_PER_UNIT, r.nextInt(10_001), r.nextInt(2000), "USD", r.nextBoolean() ? Set.of("FEATURE") : Set.of(), Set.of()));
            }
            for (int t = r.nextInt(3); t > 0; t--) {
                tiers.add(new VolumeTier(t, 1 + r.nextInt(5), r.nextInt(10_001), Set.of()));
            }
        }
        return new PricingInputs(Audience.ORG, "USD", BillingInterval.MONTH, NOW, groups, contract, discounts, tiers, seats, null);
    }

    @Test
    void effectiveUnitIsNeverNegativeAndNeverAboveListWithoutAnAmountOverride() {
        Random r = new Random(1);
        for (int i = 0; i < CASES; i++) {
            PricingResult res = engine.price(random(r, true));
            for (PricingResult.GroupResult g : res.groups()) {
                for (PricingResult.LineResult l : g.lines()) {
                    assertThat(l.unitEffectiveMinor()).isGreaterThanOrEqualTo(0);
                    boolean overridden = l.unitContractMinor() > l.unitListMinor();
                    if (!overridden) {
                        assertThat(l.unitEffectiveMinor()).isLessThanOrEqualTo(l.unitListMinor());
                    }
                }
            }
        }
    }

    @Test
    void pricingTwiceGivesTheSameResult() {
        Random r = new Random(2);
        for (int i = 0; i < CASES; i++) {
            PricingInputs in = random(r, true);
            assertThat(engine.price(in)).isEqualTo(engine.price(in));
        }
    }

    @Test
    void recurringIsLinearInQuantities() {
        Random r = new Random(3);
        for (int i = 0; i < CASES; i++) {
            PricingInputs in = random(r, false);
            int extra = 1 + r.nextInt(4);
            List<LineGroup> more = new ArrayList<>();
            for (LineGroup g : in.groups()) {
                List<LineRequest> lines = new ArrayList<>(g.lines());
                lines.add(new LineRequest("ALR_EXTRA", "ALR", extra, 0));
                more.add(new LineGroup(g.groupKey(), lines));
            }
            PricingInputs grown = new PricingInputs(in.audience(), in.currency(), in.interval(), in.at(), more, null, null, null, in.licensedCountNextPeriod(), null);
            long expected = engine.price(in).recurringMinor() + (long) in.groups().size() * extra * 199;
            assertThat(engine.price(grown).recurringMinor()).isEqualTo(expected);
        }
    }

    @Test
    void discountTotalReproducesTheListLessTheRecurringToTheCent() {
        Random r = new Random(4);
        for (int i = 0; i < CASES; i++) {
            PricingResult res = engine.price(random(r, true));
            assertThat(res.discountTotalMinor()).isEqualTo(res.listTotalMinor() - res.recurringMinor());
            assertThat(res.contractDiscountMinor() + res.promotionalDiscountMinor() + res.tierDiscountMinor()).isEqualTo(res.discountTotalMinor());
        }
    }

    @Test
    void confirmProrationNeverExceedsTheQuote() {
        Random r = new Random(5);
        Instant start = Instant.parse("2026-11-05T00:00:00Z");
        Instant end = Instant.parse("2026-12-05T00:00:00Z");
        for (int i = 0; i < CASES; i++) {
            long unit = r.nextInt(5000);
            int qty = 1 + r.nextInt(5);
            long quoteAt = start.getEpochSecond() + r.nextInt(2_592_000);
            long confirmAt = quoteAt + r.nextInt((int) Math.max(1, end.getEpochSecond() - quoteAt));
            long quote = PricingEngine.prorate(unit, qty, start, end, Instant.ofEpochSecond(quoteAt));
            long confirm = PricingEngine.prorate(unit, qty, start, end, Instant.ofEpochSecond(confirmAt));
            assertThat(confirm).isLessThanOrEqualTo(quote);
            assertThat(quote).isBetween(0L, unit * qty);
        }
    }

    @Test
    void groupTotalsAreSumsOfLinesAndRecurringIsTheSumOfGroups() {
        Random r = new Random(6);
        for (int i = 0; i < CASES; i++) {
            PricingResult res = engine.price(random(r, true));
            for (PricingResult.GroupResult g : res.groups()) {
                assertThat(g.lines().stream().mapToLong(PricingResult.LineResult::lineTotalMinor).sum()).isEqualTo(g.totalMinor());
            }
            assertThat(res.groups().stream().mapToLong(PricingResult.GroupResult::totalMinor).sum()).isEqualTo(res.recurringMinor());
        }
    }

    // ---- 03 section 12: (8) (9) (10) -----------------------------------------------------------------------------------

    @Test
    void annualNeverCostsMoreThanTwelveMonthsWhenTheDiscountIsNotNegative() {
        Random r = new Random(8);
        for (int i = 0; i < CASES; i++) {
            int disc = r.nextInt(3001);
            PricingEngine e = new PricingEngine(Draft.individual(disc));
            List<LineRequest> lines = List.of(new LineRequest("PRO", 1), new LineRequest("CREDITS", r.nextInt(5)));
            IntervalSummary s = e.summarize(PricingInputs.individual("USD", BillingInterval.YEAR, NOW, lines));
            assertThat(s.totalMinor()).isLessThanOrEqualTo(s.monthTotalMinor() * 12);
            assertThat(s.savingsMinor()).isGreaterThanOrEqualTo(0L);
            // the monthly equivalent is rounded once: within half a minor unit of the exact value
            assertThat(Math.abs(s.monthlyEquivalentMinor() * 12 - s.totalMinor())).isLessThanOrEqualTo(6L);
        }
    }

    @Test
    void derivedAnnualRowsAreIntegersWithinHalfAMinorUnitOfTheExactValue() {
        Random r = new Random(9);
        for (int i = 0; i < CASES; i++) {
            long month = 1 + r.nextInt(200_000);
            int bp = r.nextInt(10_001);
            long year = AnnualPrices.derive(month, bp);
            assertThat(year).isBetween(0L, month * 12);
            long exactTimes10000 = month * 12 * (10_000 - bp);
            assertThat(Math.abs(year * 10_000 - exactTimes10000)).isLessThanOrEqualTo(5_000);
        }
    }

    @Test
    void savingsEqualTheSumOfPerLineSavings() {
        Random r = new Random(10);
        for (int i = 0; i < CASES; i++) {
            int disc = r.nextInt(2501);
            PricingEngine e = new PricingEngine(Draft.individual(disc));
            int credits = r.nextInt(6);
            List<LineRequest> lines = List.of(new LineRequest("PRO", 1), new LineRequest("CREDITS", credits));
            IntervalSummary s = e.summarize(PricingInputs.individual("USD", BillingInterval.YEAR, NOW, lines));
            long perLine = (1999L * 12 - AnnualPrices.derive(1999, disc)) + credits * (499L * 12 - AnnualPrices.derive(499, disc));
            assertThat(s.savingsMinor()).isEqualTo(perLine);
        }
    }
}
