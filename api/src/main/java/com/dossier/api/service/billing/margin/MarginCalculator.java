package com.dossier.api.service.billing.margin;

import com.dossier.api.service.billing.margin.MarginInputs.Component;
import com.dossier.api.service.billing.margin.MarginInputs.PlanComposition;
import com.dossier.api.service.billing.margin.MarginInputs.Preset;
import com.dossier.api.service.billing.margin.MarginInputs.PresetItem;
import com.dossier.api.service.billing.margin.MarginInputs.Role;
import com.dossier.api.service.billing.margin.MarginInputs.Tier;
import com.dossier.api.service.pricing.AnnualPrices;
import com.dossier.api.service.pricing.Audience;
import com.dossier.api.service.pricing.BillingInterval;
import com.dossier.api.service.pricing.Minor;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.LongPredicate;
import java.util.function.LongUnaryOperator;

/**
 * THE margin guard (docs/subscriptions/03 section 7; docs/enterprise-v2/21 section 5; docs/design/pay/fee-model-and-margin-guard.md):
 * one calculator for every price, add-on, seat configuration, preset, tier and discount. Pure: settings come in through
 * {@link MarginSettingsPort}, nothing is read from tables. Basis points, floor division, all money in minor units.
 *
 * <pre>
 * margin_bp(p, ai, fee) = floor((p - fee - ai) * 10000 / p)         pass = margin_bp >= floor_bp
 * </pre>
 */
public final class MarginCalculator {

    /** Margin reported when there is no revenue but there is a cost. */
    public static final long NO_REVENUE_BP = -1_000_000L;

    static final String BELOW_FLOOR = "MARGIN_BELOW_FLOOR";
    static final String TIER_BELOW_FLOOR = "TIER_BELOW_FLOOR";
    static final String PRESET_BELOW_INDIVIDUAL = "PRESET_BELOW_INDIVIDUAL";
    static final int MIN_REASON_LENGTH = 10;
    /** Upper bound of the lever search (10 billion major units): keeps basis-point arithmetic far from overflow. */
    static final long MAX_SEARCH_MINOR = 1_000_000_000_000L;

    private final MarginSettingsPort settings;

    public MarginCalculator(MarginSettingsPort settings) {
        this.settings = settings;
    }

    // ---- the arithmetic -------------------------------------------------------------------------------------------------

    public static long marginBp(long amountMinor, long feeMinor, long aiMinor) {
        if (amountMinor <= 0) {
            return (feeMinor == 0 && aiMinor == 0) ? 10_000 : NO_REVENUE_BP;
        }
        return Math.floorDiv(Math.multiplyExact(amountMinor - feeMinor - aiMinor, 10_000L), amountMinor);
    }

    private static boolean passes(long amountMinor, long feeMinor, long aiMinor, long floorBp) {
        return marginBp(amountMinor, feeMinor, aiMinor) >= floorBp;
    }

    /** Monthly AI cents times the interval factor: the default budget of a whole period. */
    public static long window(BillingInterval interval, long aiPerMonth) {
        return Math.multiplyExact(aiPerMonth, (long) interval.factor());
    }

    // ---- single-price checks ---------------------------------------------------------------------------------------------

    /** Check 1: a base price with the AI cap it includes (aiWindowCents: the whole period, see {@link #window}). */
    public MarginCheck checkBase(String featureKey, Audience audience, BillingInterval interval, String currency, long amountMinor, long aiWindowCents) {
        return single(settings.current(), featureKey, CheckKind.BASE, audience, interval, currency, amountMinor, aiWindowCents, true, true, null);
    }

    /** Check 2: an optional price alone (it sits on an invoice with a base, so it never carries the fixed fees). */
    public MarginCheck checkFeature(String featureKey, Audience audience, BillingInterval interval, String currency, long amountMinor, long aiWindowCents) {
        return single(settings.current(), featureKey, CheckKind.OPTIONAL, audience, interval, currency, amountMinor, aiWindowCents, false, true, null);
    }

    /**
     * A price after a discount (org_discount, promo_code, derived annual row), checked on the NET amount with its own AI budget.
     * Never overridable. isBaseLine chooses whether the net price carries the fixed fees.
     */
    public MarginCheck checkDiscountedPrice(String featureKey, Audience audience, BillingInterval interval, String currency, long netAmountMinor, long aiWindowCents, boolean isBaseLine) {
        return single(settings.current(), featureKey, CheckKind.DISCOUNT, audience, interval, currency, netAmountMinor, aiWindowCents, isBaseLine, false, null);
    }

    /** FEE or ONE_TIME price: informational (no AI unless it carries a budget such as a top-up), reported against the subscription floor. */
    public MarginCheck checkOneTime(String featureKey, Audience audience, String currency, long amountMinor, long aiCents) {
        MarginSettings s = settings.current();
        FeeModel model = s.feeModelInstance();
        List<FeeLine> fees = model.oneTimeFees(amountMinor, audience);
        long fee = FeeModel.sum(fees);
        long bp = marginBp(amountMinor, fee, aiCents);
        return new MarginCheck(featureKey, CheckKind.ONE_TIME, BillingInterval.ONE_TIME, currency, audience, amountMinor, aiCents, fee, fees, bp, s.floorSubscriptionBp(), true, true, null, null);
    }

    /**
     * A service: net = list less the subscriber discount; margin = (net - payout - fees - ai) / net against the service floor.
     * A discounted service is a discount row (not overridable).
     */
    public MarginCheck checkService(String serviceKey, Audience audience, String currency, long listMinor, int subscriberDiscountBp, long payoutMinor, long aiCents) {
        MarginSettings s = settings.current();
        FeeModel model = s.feeModelInstance();
        long net = Minor.pctOff(listMinor, subscriberDiscountBp);
        List<FeeLine> fees = model.oneTimeFees(net, audience);
        long fee = FeeModel.sum(fees);
        long cost = Math.addExact(Math.addExact(payoutMinor, fee), aiCents);
        long bp = marginBp(net, cost, 0);
        long floor = s.floorServiceBp();
        boolean pass = bp >= floor;
        MarginLevers levers = null;
        if (!pass) {
            Long minPrice = smallestPassing(p -> passes(p, FeeModel.sum(model.oneTimeFees(p, audience)) + payoutMinor, aiCents, floor), 1);
            levers = new MarginLevers(minPrice, null, null);
        }
        return new MarginCheck(serviceKey, CheckKind.SERVICE, BillingInterval.ONE_TIME, currency, audience, net, Math.addExact(payoutMinor, aiCents), fee, fees, bp, floor, pass, subscriberDiscountBp == 0, pass ? null : BELOW_FLOOR, levers);
    }

    private MarginCheck single(
        MarginSettings s,
        String key,
        CheckKind kind,
        Audience audience,
        BillingInterval interval,
        String currency,
        long amount,
        long ai,
        boolean base,
        boolean overridable,
        Long monthAmountForDiscountLever
    ) {
        FeeModel model = s.feeModelInstance();
        List<FeeLine> fees = base ? model.baseFees(amount, audience) : model.featureFees(amount, audience);
        long fee = FeeModel.sum(fees);
        long floor = s.floorSubscriptionBp();
        long bp = marginBp(amount, fee, ai);
        boolean pass = bp >= floor;
        MarginLevers levers = pass ? null : levers(model, audience, base, amount, ai, floor, interval, monthAmountForDiscountLever);
        String code = pass ? null : (kind == CheckKind.TIER ? TIER_BELOW_FLOOR : BELOW_FLOOR);
        return new MarginCheck(key, kind, interval, currency, audience, amount, ai, fee, fees, bp, floor, pass, overridable, code, levers);
    }

    // ---- levers (exact, against the real rounding) ------------------------------------------------------------------------

    private static LongUnaryOperator feeFn(FeeModel model, Audience audience, boolean base) {
        return base ? p -> model.feeBase(p, audience) : p -> model.feeFeature(p, audience);
    }

    /**
     * The three levers of 03 section 7.3. The closed forms there are the estimate; the values here are verified against the
     * own rounding of the guard, so the price returned always passes and the one below it fails (see decisions-for-user.md).
     */
    MarginLevers levers(FeeModel model, Audience audience, boolean base, long amount, long ai, long floorBp, BillingInterval interval, Long monthAmount) {
        LongUnaryOperator fee = feeFn(model, audience, base);
        Long minPrice = smallestPassing(p -> passes(p, fee.applyAsLong(p), ai, floorBp), Math.max(1, ai));
        long headroom = amount - fee.applyAsLong(amount) - Minor.ceilDiv(Math.multiplyExact(floorBp, amount), 10_000);
        Long maxAi = null;
        if (amount > 0 && headroom >= 0) {
            maxAi = Math.floorDiv(headroom, Math.max(1, interval.factor()));
        }
        Long maxDiscount = null;
        if (interval == BillingInterval.YEAR && monthAmount != null) {
            maxDiscount = largestPassingDiscount(monthAmount, fee, ai, floorBp);
        }
        return new MarginLevers(minPrice, maxAi, maxDiscount);
    }

    /** Smallest p >= from that passes; the predicate is monotone up to one-cent rounding noise, which the walk-down absorbs. */
    static Long smallestPassing(LongPredicate passes, long from) {
        long lo = Math.max(1, from);
        long hi = lo;
        int guard = 0;
        while (!passes.test(hi)) {
            if (++guard > 50 || hi > MAX_SEARCH_MINOR) {
                return null;
            }
            hi = hi * 2;
        }
        long low = lo;
        while (low < hi) {
            long mid = low + (hi - low) / 2;
            if (passes.test(mid)) {
                hi = mid;
            } else {
                low = mid + 1;
            }
        }
        long best = hi;
        for (int i = 0; i < 16 && best > lo && passes.test(best - 1); i++) {
            best--;
        }
        return best;
    }

    /** Largest d in 0..10000 for which the derived YEAR price passes; null when even no discount fails. */
    static Long largestPassingDiscount(long monthAmount, LongUnaryOperator fee, long aiYear, long floorBp) {
        LongPredicate ok = d -> {
            long p = AnnualPrices.derive(monthAmount, (int) d);
            return p > 0 && passes(p, fee.applyAsLong(p), aiYear, floorBp);
        };
        if (!ok.test(0)) {
            return null;
        }
        long lo = 0;
        long hi = AnnualPrices.MAX_DISCOUNT_BP;
        while (lo < hi) {
            long mid = lo + (hi - lo + 1) / 2;
            if (ok.test(mid)) {
                lo = mid;
            } else {
                hi = mid - 1;
            }
        }
        long best = lo;
        for (int i = 0; i < 16 && best < AnnualPrices.MAX_DISCOUNT_BP && ok.test(best + 1); i++) {
            best++;
        }
        return best;
    }

    // ---- plans, presets, tiers (checks 1 to 5) ---------------------------------------------------------------------------

    /**
     * Checks 1, 2, 3 and 5 for every interval the composition lists: each base with its included AI, each optional alone, and the
     * composition worst case (base plus every optional at max quantity, on one invoice so one fixed fee). YEAR rows use ai x 12 and
     * their derived amount; a derived row is a discount row (not overridable) and carries the maxDiscountBp lever.
     */
    public MarginReport checkPlan(PlanComposition c) {
        MarginSettings s = settings.current();
        List<MarginCheck> out = new ArrayList<>();
        for (BillingInterval interval : BillingInterval.values()) {
            if (c.intervals().contains(interval)) {
                planChecksAt(s, c, interval, 0, null, out);
            }
        }
        return new MarginReport(out, List.of());
    }

    /** Shared by checkPlan and tiers: a tier reduces every in-scope price first and turns the checks into tier checks. */
    private void planChecksAt(MarginSettings s, PlanComposition c, BillingInterval interval, int tierBp, Tier tier, List<MarginCheck> out) {
        long sumP = 0;
        long sumAi = 0;
        boolean hasBase = false;
        boolean anyOptional = false;
        boolean anyDerived = false;
        for (Component comp : c.components()) {
            Long listed = comp.amountByInterval().get(interval);
            if (listed == null) {
                continue; // not offered at this interval
            }
            boolean inScope = tier == null || tier.featureKeys().isEmpty() || tier.featureKeys().contains(comp.featureKey());
            long p = (tier != null && inScope) ? Minor.pctOff(listed, tierBp) : listed;
            boolean derived = tier == null && comp.derivedIntervals().contains(interval);
            boolean base = comp.role() == Role.BASE;
            long qty = base ? 1 : comp.quantityAtMax();
            sumP = Math.addExact(sumP, Math.multiplyExact(p, qty));
            sumAi = Math.addExact(sumAi, Math.multiplyExact(comp.aiWindow(interval), qty));
            hasBase |= base;
            anyOptional |= !base;
            anyDerived |= derived;
            if (p == 0 || (tier != null && !inScope)) {
                continue; // included at no charge, or untouched by this tier
            }
            CheckKind kind = tier != null ? CheckKind.TIER : derived ? CheckKind.DISCOUNT : base ? CheckKind.BASE : CheckKind.OPTIONAL;
            boolean overridable = tier == null && !derived;
            out.add(single(s, comp.featureKey(), kind, c.audience(), interval, c.currency(), p, comp.aiWindow(interval), base, overridable, comp.amountByInterval().get(BillingInterval.MONTH)));
        }
        if (hasBase && anyOptional && sumP > 0) {
            CheckKind kind = tier != null ? CheckKind.TIER : CheckKind.COMPOSITION;
            out.add(single(s, c.planKey(), kind, c.audience(), interval, c.currency(), sumP, sumAi, true, tier == null && !anyDerived, null));
        }
    }

    /** Check 4 (preset): above the individual price when mirrored, and the margin of the preset as a whole with one base fee. */
    public MarginReport checkPreset(Preset p) {
        MarginSettings s = settings.current();
        long sum = 0;
        long ai = 0;
        for (PresetItem i : p.items()) {
            sum = Math.addExact(sum, i.amountMinor());
            ai = Math.addExact(ai, window(p.interval(), i.aiBudgetCentsPerMonth()));
        }
        List<MarginCheck> checks = List.of(single(s, p.presetKey(), CheckKind.PRESET, Audience.ORG, p.interval(), p.currency(), sum, ai, true, true, null));
        List<PresetFinding> findings = new ArrayList<>();
        if (p.individualMonthPriceMinor() != null && p.interval() == BillingInterval.MONTH) {
            long uplift = 10_000L + s.orgAboveIndividualPct() * 100L;
            long required = p.mirrored() ? Minor.mulDivHalfEven(p.individualMonthPriceMinor(), uplift, 10_000) : p.individualMonthPriceMinor();
            if (sum < required) {
                findings.add(new PresetFinding(p.presetKey(), PRESET_BELOW_INDIVIDUAL, sum, required, p.mirrored()));
            }
        }
        return new MarginReport(checks, findings);
    }

    /** Check 4 (tier): every in-scope price and the composition at the tier discount; a tier that pushes a row under is refused outright. */
    public MarginReport checkTier(PlanComposition c, Tier tier) {
        MarginSettings s = settings.current();
        List<MarginCheck> out = new ArrayList<>();
        for (BillingInterval interval : BillingInterval.values()) {
            if (c.intervals().contains(interval)) {
                planChecksAt(s, c, interval, tier.pctOffBp(), tier, out);
            }
        }
        return new MarginReport(out, List.of());
    }

    // ---- publish decision, re-evaluation ---------------------------------------------------------------------------------

    /**
     * The publish rule (Phase 18 D4): a failing row blocks the publish unless overrideReason has at least 10 characters (B-05) (HIGH audit
     * CATALOG_MARGIN_OVERRIDE, written by the caller when this returns true). Discount rows, tier rows and mirrored presets are
     * refused outright. Returns true when an override was needed and given.
     */
    public boolean requirePublishable(MarginReport report, String overrideReason) {
        List<MarginCheck> failures = report.failures();
        boolean presetHard = report.presetFindings().stream().anyMatch(PresetFinding::hard);
        if (failures.isEmpty() && !presetHard) {
            return false;
        }
        if (presetHard || !report.hardFailures().isEmpty()) {
            throw new MarginBelowFloorException(failures, report.presetFindings(), false, false);
        }
        if (overrideReason == null || overrideReason.trim().length() < MIN_REASON_LENGTH) {
            throw new MarginBelowFloorException(failures, report.presetFindings(), true, true);
        }
        return true;
    }

    /** One row of the re-evaluation list that PUT fee-model returns: a check that fails under the new settings. */
    public record Reevaluation(String planKey, MarginCheck after, boolean passedBefore) {}

    /** Rows that fall below the floor under after, flagged with whether they passed under before. */
    public static List<Reevaluation> reevaluate(List<PlanComposition> plans, MarginSettings before, MarginSettings after) {
        MarginCalculator b = new MarginCalculator(() -> before);
        MarginCalculator a = new MarginCalculator(() -> after);
        List<Reevaluation> out = new ArrayList<>();
        for (PlanComposition plan : plans) {
            Map<String, Boolean> passedBefore = new java.util.HashMap<>();
            for (MarginCheck w : b.checkPlan(plan).checks()) {
                passedBefore.put(rowId(w), w.pass());
            }
            for (MarginCheck n : a.checkPlan(plan).checks()) {
                if (!n.pass()) {
                    out.add(new Reevaluation(plan.planKey(), n, passedBefore.getOrDefault(rowId(n), Boolean.TRUE)));
                }
            }
        }
        return out;
    }

    private static String rowId(MarginCheck c) {
        return c.featureKey() + "#" + c.kind() + "#" + c.interval();
    }
}
