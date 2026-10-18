package com.dossier.api.service.billing.margin;

import com.dossier.api.service.pricing.Audience;
import com.dossier.api.service.pricing.BillingInterval;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Plain inputs of the guard, built by the catalog adapter (no tables here). Amounts are minor units per unit per interval. */
public final class MarginInputs {

    private MarginInputs() {}

    public enum Role {
        BASE,
        OPTIONAL,
    }

    /**
     * One component of a plan or seat. {@code amountByInterval} holds the price per offered interval; {@code derivedIntervals} marks
     * the intervals whose row is a derived annual row (a discount, so never overridable). {@code aiBudgetCentsPerMonth} is the AI cost
     * of one unit per month (the base carries the plan cap); {@code aiWindowByInterval} overrides monthly x factor for an interval
     * whose budget is set explicitly. {@code maxQuantity} 0 or 1 means not stackable.
     */
    public record Component(
        String featureKey,
        Role role,
        Map<BillingInterval, Long> amountByInterval,
        int aiBudgetCentsPerMonth,
        int maxQuantity,
        Set<BillingInterval> derivedIntervals,
        Map<BillingInterval, Long> aiWindowByInterval
    ) {
        public Component {
            amountByInterval = Map.copyOf(amountByInterval);
            derivedIntervals = derivedIntervals == null ? Set.of() : Set.copyOf(derivedIntervals);
            aiWindowByInterval = aiWindowByInterval == null ? Map.of() : Map.copyOf(aiWindowByInterval);
        }

        /** Worst-case AI of one unit over a whole period: an explicit per-interval budget (8 dollars a quarter), else monthly x factor. */
        public long aiWindow(BillingInterval interval) {
            Long explicit = aiWindowByInterval.get(interval);
            return explicit != null ? explicit : Math.multiplyExact((long) aiBudgetCentsPerMonth, (long) interval.factor());
        }

        public int quantityAtMax() {
            return Math.max(1, maxQuantity);
        }
    }

    /** A plan version (individual) or a seat configuration (org): the intervals it lists and its components in one currency. */
    public record PlanComposition(String planKey, Audience audience, String currency, Set<BillingInterval> intervals, List<Component> components) {
        public PlanComposition {
            intervals = Set.copyOf(intervals);
            components = List.copyOf(components);
        }
    }

    public record PresetItem(String featureKey, long amountMinor, int aiBudgetCentsPerMonth) {}

    /**
     * An org preset at one interval. {@code individualMonthPriceMinor} is the active INDIVIDUAL MONTH price it is compared with (the
     * mirrored product, or the plain Pro price when the preset has no mirror); {@code mirrored} makes the comparison a hard rule,
     * otherwise it is a warning. Null price: no comparison.
     */
    public record Preset(String presetKey, String currency, BillingInterval interval, List<PresetItem> items, Long individualMonthPriceMinor, boolean mirrored) {
        public Preset {
            items = List.copyOf(items);
        }
    }

    /** A volume tier for the worst-case check; empty {@code featureKeys} means every component. */
    public record Tier(long id, int pctOffBp, Set<String> featureKeys) {
        public Tier {
            featureKeys = featureKeys == null ? Set.of() : Set.copyOf(featureKeys);
        }
    }
}
