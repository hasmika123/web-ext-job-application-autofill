package com.dossier.api.service.pricing;

import com.dossier.api.service.pricing.PricingInputs.LineGroup;
import com.dossier.api.service.pricing.PricingInputs.LineRequest;
import com.dossier.api.service.pricing.PricingResult.Applied;
import com.dossier.api.service.pricing.PricingResult.GroupResult;
import com.dossier.api.service.pricing.PricingResult.LineResult;
import com.dossier.api.service.pricing.PricingTerms.ContractRow;
import com.dossier.api.service.pricing.PricingTerms.ContractTerms;
import com.dossier.api.service.pricing.PricingTerms.DiscountKind;
import com.dossier.api.service.pricing.PricingTerms.OrgDiscount;
import com.dossier.api.service.pricing.PricingTerms.VolumeTier;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeSet;

/**
 * THE price calculator (docs/subscriptions/03 sections 3, 4, 6; docs/enterprise-v2/22). Pure: no repositories, no clock, no Stripe.
 * One chain per line: list, contract, one discount, volume tier; each step is rounded once per unit (half-even) and totals are sums
 * of rounded units times integer quantities. The annual discount is not in the chain: it is the YEAR list price.
 */
public final class PricingEngine {

    private final CatalogPort catalog;

    public PricingEngine(CatalogPort catalog) {
        this.catalog = catalog;
    }

    // ---- pricing -----------------------------------------------------------------------------------------------------

    public PricingResult price(PricingInputs in) {
        validate(in);
        Map<String, PriceRow> rows = resolvePrices(in);
        OrgDiscount best = in.audience() == Audience.ORG ? chooseDiscount(in, rows) : null;
        return compute(in, rows, best);
    }

    /** Total, monthly equivalent and savings against the MONTH price of the same basket (03 section 4.3). */
    public IntervalSummary summarize(PricingInputs in) {
        PricingResult r = price(in);
        BillingInterval interval = in.interval();
        if (!interval.isRecurring()) {
            return new IntervalSummary(interval, r.recurringMinor(), r.recurringMinor(), null, null, null);
        }
        long monthlyEquiv = Minor.mulDivHalfEven(r.recurringMinor(), 1, interval.factor());
        if (interval == BillingInterval.MONTH) {
            return new IntervalSummary(interval, r.recurringMinor(), monthlyEquiv, r.recurringMinor(), 0L, 0);
        }
        long monthTotal;
        try {
            monthTotal = price(in.withInterval(BillingInterval.MONTH)).recurringMinor();
        } catch (PricingException e) {
            if ("PRICE_MISSING".equals(e.code()) || "INTERVAL_NOT_ALLOWED".equals(e.code())) {
                return new IntervalSummary(interval, r.recurringMinor(), monthlyEquiv, null, null, null);
            }
            throw e;
        }
        long monthSpan = Minor.mul(monthTotal, interval.factor());
        long savings = monthSpan - r.recurringMinor();
        int bp = monthSpan == 0 ? 0 : (int) Minor.mulDivHalfEven(savings, 10_000, monthSpan);
        return new IntervalSummary(interval, r.recurringMinor(), monthlyEquiv, monthTotal, savings, bp);
    }

    private void validate(PricingInputs in) {
        if (in.currency() == null || in.currency().isBlank() || in.interval() == null || in.at() == null) {
            throw new PricingException("INVALID_INPUT", "currency, interval and at are required");
        }
        if (!in.policy().allows(in.audience(), in.interval())) {
            throw new PricingException("INTERVAL_NOT_ALLOWED", in.interval() + " is not offered to " + in.audience(), Map.of("interval", in.interval().name()));
        }
        if (in.audience() == Audience.INDIVIDUAL && (in.contract() != null || !in.eligibleDiscounts().isEmpty() || !in.tiers().isEmpty())) {
            throw new PricingException("INVALID_INPUT", "contracts, org discounts and volume tiers apply to organizations only");
        }
        if (in.contract() != null && !in.currency().equals(in.contract().currency())) {
            throw new PricingException("CURRENCY_MISMATCH", "contract currency differs from " + in.currency());
        }
    }

    private Map<String, PriceRow> resolvePrices(PricingInputs in) {
        Map<String, PriceRow> rows = new HashMap<>();
        for (LineGroup g : in.groups()) {
            for (LineRequest l : g.lines()) {
                if (l.quantity() < 0) {
                    throw new PricingException("INVALID_INPUT", "negative quantity for " + l.productCode());
                }
                if (l.maxQuantity() > 0 && l.quantity() > l.maxQuantity()) {
                    throw new PricingException("QUANTITY_LIMIT", l.productCode() + " allows at most " + l.maxQuantity(), Map.of("max", l.maxQuantity()));
                }
                if (!rows.containsKey(l.productCode())) {
                    PriceRow row = catalog
                        .activePrice(l.productCode(), in.audience(), in.interval(), in.currency(), in.at())
                        .orElseThrow(() ->
                            new PricingException(
                                "PRICE_MISSING",
                                "no active " + in.interval() + " " + in.currency() + " price for " + l.productCode(),
                                Map.of("productCode", l.productCode(), "interval", in.interval().name(), "currency", in.currency())
                            )
                        );
                    if (!in.currency().equals(row.currency())) {
                        throw new PricingException("CURRENCY_MISMATCH", "price row currency differs for " + l.productCode());
                    }
                    rows.put(l.productCode(), row);
                }
            }
        }
        return rows;
    }

    /** At most one promotion per quote and none under a non-stackable contract; the best is the largest reduction, ties to the lowest id. */
    private OrgDiscount chooseDiscount(PricingInputs in, Map<String, PriceRow> rows) {
        ContractTerms c = in.contract();
        boolean orgContracted = c != null && !c.rows().isEmpty();
        if ((orgContracted && !c.stackable()) || in.eligibleDiscounts().isEmpty()) {
            return null;
        }
        long bestTotal = compute(in, rows, null).recurringMinor();
        OrgDiscount best = null;
        List<OrgDiscount> sorted = new ArrayList<>(in.eligibleDiscounts());
        sorted.sort(Comparator.comparingLong(OrgDiscount::id));
        for (OrgDiscount d : sorted) {
            if (d.kind() == DiscountKind.AMOUNT_PER_UNIT && !in.currency().equals(d.currency())) {
                throw new PricingException("CURRENCY_MISMATCH", "discount " + d.name() + " is not in " + in.currency());
            }
            long total = compute(in, rows, d).recurringMinor();
            if (total < bestTotal) {
                bestTotal = total;
                best = d;
            }
        }
        return best;
    }

    private PricingResult compute(PricingInputs in, Map<String, PriceRow> rows, OrgDiscount discount) {
        boolean org = in.audience() == Audience.ORG;
        ContractTerms contract = in.contract();
        boolean orgContracted = org && contract != null && !contract.rows().isEmpty();
        List<GroupResult> groups = new ArrayList<>();
        Set<Long> tierIds = new TreeSet<>();
        Integer topTierMin = null;
        long recurring = 0;
        long list = 0;
        long contractMinor = 0;
        long promoMinor = 0;
        long tierMinor = 0;
        long ai = 0;
        for (LineGroup g : in.groups()) {
            List<LineResult> lines = new ArrayList<>();
            long groupTotal = 0;
            long groupList = 0;
            for (LineRequest l : g.lines()) {
                PriceRow row = rows.get(l.productCode());
                long unitList = row.amountMinor();
                long unitContract = unitList;
                if (orgContracted) {
                    ContractRow cr = contractRow(contract, l.productCode());
                    if (cr != null) {
                        unitContract = cr.overrideAmountMinor() != null ? cr.overrideAmountMinor() : Minor.pctOff(unitList, cr.overridePctOffBp());
                    }
                }
                long unitDiscount = unitContract;
                if (discount != null && discount.appliesTo(row)) {
                    unitDiscount =
                        discount.kind() == DiscountKind.PERCENT ? Minor.pctOff(unitContract, discount.pctOffBp()) : Math.max(0, unitContract - discount.amountOffMinor());
                }
                long unitEffective = unitDiscount;
                if (org && (!orgContracted || contract.volumeApplies())) {
                    VolumeTier t = tierFor(in, l.productCode());
                    if (t != null) {
                        unitEffective = Minor.pctOff(unitDiscount, t.pctOffBp());
                        tierIds.add(t.id());
                        topTierMin = topTierMin == null ? t.minLicensed() : Math.max(topTierMin, t.minLicensed());
                    }
                }
                List<Applied> applied = new ArrayList<>();
                if (unitContract != unitList) {
                    applied.add(Applied.CONTRACT);
                }
                if (unitDiscount != unitContract) {
                    applied.add(Applied.DISCOUNT);
                }
                if (unitEffective != unitDiscount) {
                    applied.add(Applied.TIER);
                }
                long qty = l.quantity();
                long lineTotal = Minor.mul(unitEffective, qty);
                groupTotal = Minor.add(groupTotal, lineTotal);
                groupList = Minor.add(groupList, Minor.mul(unitList, qty));
                contractMinor = Minor.add(contractMinor, Minor.mul(unitList - unitContract, qty));
                promoMinor = Minor.add(promoMinor, Minor.mul(unitContract - unitDiscount, qty));
                tierMinor = Minor.add(tierMinor, Minor.mul(unitDiscount - unitEffective, qty));
                ai = Minor.add(ai, Minor.mul(row.aiBudgetCentsPerWindow(), qty));
                lines.add(
                    new LineResult(
                        g.groupKey(),
                        l.lineKey(),
                        l.productCode(),
                        row.priceId(),
                        l.quantity(),
                        unitList,
                        unitContract,
                        unitDiscount,
                        unitEffective,
                        lineTotal,
                        List.copyOf(applied),
                        row.aiBudgetCentsPerWindow()
                    )
                );
            }
            groups.add(new GroupResult(g.groupKey(), List.copyOf(lines), groupTotal, groupList));
            recurring = Minor.add(recurring, groupTotal);
            list = Minor.add(list, groupList);
        }
        long window = ai; // the rows already carry the budget of one whole billing period
        long monthly = in.interval().isRecurring() ? Math.floorDiv(window, in.interval().factor()) : window;
        boolean promoUsed = discount != null && promoMinor > 0;
        return new PricingResult(
            in.audience(),
            in.currency(),
            in.interval(),
            List.copyOf(groups),
            recurring,
            list,
            list - recurring,
            contractMinor,
            promoMinor,
            tierMinor,
            promoUsed ? discount.name() : null,
            promoUsed ? discount.id() : null,
            Set.copyOf(tierIds),
            topTierMin,
            monthly,
            window
        );
    }

    private static ContractRow contractRow(ContractTerms c, String productCode) {
        ContractRow generic = null;
        for (ContractRow r : c.rows()) {
            if (productCode.equals(r.productCode())) {
                return r;
            }
            if (r.productCode() == null) {
                generic = r;
            }
        }
        return generic;
    }

    /** Highest tier whose minimum is reached; a tier scoped to the product beats an all-products tier. */
    private static VolumeTier tierFor(PricingInputs in, String productCode) {
        VolumeTier specific = null;
        VolumeTier generic = null;
        for (VolumeTier t : in.tiers()) {
            if (t.minLicensed() > in.licensedCountNextPeriod()) {
                continue;
            }
            if (t.productCodes().isEmpty()) {
                generic = better(generic, t);
            } else if (t.productCodes().contains(productCode)) {
                specific = better(specific, t);
            }
        }
        return specific != null ? specific : generic;
    }

    private static VolumeTier better(VolumeTier a, VolumeTier b) {
        if (a == null || b.minLicensed() > a.minLicensed()) {
            return b;
        }
        if (b.minLicensed() == a.minLicensed() && b.id() < a.id()) {
            return b;
        }
        return a;
    }

    // ---- proration and change impact ---------------------------------------------------------------------------------

    /** Kiwiply is the proration authority: amount * remaining / period, half-even, remaining clamped to [0, period]. */
    public static long prorate(long unitEffectiveMinor, long quantityAdded, Instant periodStart, Instant periodEnd, Instant effectiveAt) {
        long period = periodEnd.getEpochSecond() - periodStart.getEpochSecond();
        if (period <= 0) {
            throw new PricingException("INVALID_INPUT", "period end must be after period start");
        }
        long remaining = Math.min(period, Math.max(0, periodEnd.getEpochSecond() - effectiveAt.getEpochSecond()));
        return Minor.mulDivHalfEven(Minor.mul(unitEffectiveMinor, quantityAdded), remaining, period);
    }

    private static String lineId(String groupKey, String lineKey) {
        return groupKey + "#" + lineKey;
    }

    /**
     * Proposed vs current (pending removals still in current, already out of proposed); proration per added unit,
     * removals, downgrades and cancels are 0. Added units are compared per (group, line) so a new license is all additions.
     */
    public ChangeImpact impact(PricingResult current, PricingResult proposed, Instant periodStart, Instant periodEnd, Instant effectiveAt) {
        Map<String, Integer> have = new HashMap<>();
        for (GroupResult g : current.groups()) {
            for (LineResult l : g.lines()) {
                have.merge(lineId(g.groupKey(), l.lineKey()), l.quantity(), Integer::sum);
            }
        }
        List<ChangeImpact.ProrationLine> prorations = new ArrayList<>();
        long total = 0;
        for (GroupResult g : proposed.groups()) {
            for (LineResult l : g.lines()) {
                int added = l.quantity() - have.getOrDefault(lineId(g.groupKey(), l.lineKey()), 0);
                if (added > 0) {
                    long p = prorate(l.unitEffectiveMinor(), added, periodStart, periodEnd, effectiveAt);
                    prorations.add(new ChangeImpact.ProrationLine(g.groupKey(), l.lineKey(), l.productCode(), added, l.unitEffectiveMinor(), p));
                    total = Minor.add(total, p);
                }
            }
        }
        boolean tierChange = !Objects.equals(current.appliedTierMinLicensed(), proposed.appliedTierMinLicensed());
        return new ChangeImpact(
            current.recurringMinor(),
            proposed.recurringMinor(),
            proposed.recurringMinor() - current.recurringMinor(),
            total,
            List.copyOf(prorations),
            Minor.add(proposed.recurringMinor(), total),
            tierChange,
            tierChange ? current.appliedTierMinLicensed() : null,
            tierChange ? proposed.appliedTierMinLicensed() : null
        );
    }

    /** Seat transfer (03 section 6.3): same paid lines, proration 0, recurring unchanged. */
    public static ChangeImpact transferImpact(PricingResult current) {
        return new ChangeImpact(current.recurringMinor(), current.recurringMinor(), 0, 0, List.of(), current.recurringMinor(), false, null, null);
    }
}
