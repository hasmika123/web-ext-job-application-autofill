package com.dossier.api.service.catalog.plan;

import com.dossier.api.service.billing.margin.MarginInputs.Component;
import com.dossier.api.service.billing.margin.MarginInputs.PlanComposition;
import com.dossier.api.service.billing.margin.MarginInputs.Role;
import com.dossier.api.service.pricing.BillingInterval;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Pure: a {@link PlanModel} and its {@link PriceBook} as the plain inputs of the margin guard (one composition per currency). */
public final class PlanCompositions {

    private PlanCompositions() {}

    public static PlanComposition of(PlanModel m, PriceBook book, String currency) {
        List<Component> comps = new ArrayList<>();
        Set<BillingInterval> offered = EnumSet.noneOf(BillingInterval.class);
        offered.addAll(m.intervals());
        if (m.baseProductCode() != null) {
            comps.add(component(m.planKey(), Role.BASE, m.baseProductCode(), m.aiBudgetCapCents(), 1, m.aiWindowByInterval(), m, book, currency));
        }
        for (PlanModel.Comp c : m.components()) {
            if (!c.priced() || c.fee()) continue;
            Role role = c.base() ? Role.BASE : Role.OPTIONAL;
            int max = c.base() ? 1 : Math.max(1, c.maxQuantity());
            comps.add(component(c.featureKey(), role, c.productCode(), c.aiBudgetCentsPerMonth(), max, Map.of(), m, book, currency));
        }
        return new PlanComposition(m.planKey(), m.audience(), currency, offered, comps);
    }

    private static Component component(String featureKey, Role role, String productCode, int aiPerMonth, int max, Map<BillingInterval, Long> aiWindows, PlanModel m, PriceBook book, String currency) {
        Map<BillingInterval, Long> amounts = new EnumMap<>(BillingInterval.class);
        Set<BillingInterval> derived = EnumSet.noneOf(BillingInterval.class);
        for (BillingInterval i : m.intervals()) {
            book.get(productCode, i, currency).ifPresent(e -> {
                amounts.put(i, e.amountMinor());
                if (e.isDerived()) derived.add(i);
            });
        }
        return new Component(featureKey, role, amounts, aiPerMonth, max, derived, aiWindows);
    }

    /** The AI budget of one unit of {@code productCode} over a whole period of {@code interval}, for the pricing engine's catalog port. */
    public static int aiWindow(PlanModel m, String productCode, BillingInterval interval) {
        if (productCode.equals(m.baseProductCode())) {
            Long explicit = m.aiWindowByInterval().get(interval);
            return explicit != null ? Math.toIntExact(explicit) : Math.multiplyExact(m.aiBudgetCapCents(), interval.factor());
        }
        for (PlanModel.Comp c : m.components()) {
            if (productCode.equals(c.productCode())) return Math.multiplyExact(c.aiBudgetCentsPerMonth(), Math.max(1, interval.factor()));
        }
        return 0;
    }
}
