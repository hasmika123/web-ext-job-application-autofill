package com.dossier.api.service.catalog.plan;

import com.dossier.api.service.pricing.Audience;
import com.dossier.api.service.pricing.BillingInterval;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * A plan version as plain values (no entities): what the guard, the preview and the snapshot are computed from. Built by {@link PlanLoader} from the
 * tables, or in memory by tests. {@code baseProductCode} is the individual plan base (null for FREE and for organization plans, whose base is the
 * SEAT_BASE component). {@code aiWindowByInterval} holds explicit whole-period AI budgets (Pro: 800 for a quarter, not 3 x 300, E-2).
 */
public record PlanModel(
    String planKey,
    int version,
    String status,
    Audience audience,
    String name,
    Set<BillingInterval> intervals,
    Integer annualDiscountBp,
    int aiBudgetCapCents,
    Map<BillingInterval, Long> aiWindowByInterval,
    String baseProductCode,
    List<Comp> components,
    List<String> presetKeys
) {
    public static final String BASE = "BASE";
    public static final String INCLUDED = "INCLUDED";
    public static final String OPTIONAL = "OPTIONAL";
    public static final String SEAT_BASE = "SEAT_BASE";
    public static final String SEAT_INCLUDED = "SEAT_INCLUDED";
    public static final String SEAT_OPTIONAL = "SEAT_OPTIONAL";
    public static final String FEE = "FEE";

    public PlanModel {
        intervals = Set.copyOf(intervals);
        aiWindowByInterval = aiWindowByInterval == null ? Map.of() : Map.copyOf(aiWindowByInterval);
        components = List.copyOf(components);
        presetKeys = presetKeys == null ? List.of() : List.copyOf(presetKeys);
    }

    /** One service inside the version; {@code productCode} is null for an INCLUDED service (it has no price of its own). */
    public record Comp(
        String featureKey,
        String role,
        String productCode,
        String productKind,
        int aiBudgetCentsPerMonth,
        int maxQuantity,
        int defaultQuantity,
        Integer componentDiscountBp
    ) {
        public boolean priced() {
            return productCode != null && !INCLUDED.equals(role) && !SEAT_INCLUDED.equals(role);
        }

        public boolean optional() {
            return OPTIONAL.equals(role) || SEAT_OPTIONAL.equals(role);
        }

        public boolean base() {
            return BASE.equals(role) || SEAT_BASE.equals(role);
        }

        public boolean fee() {
            return FEE.equals(role);
        }
    }

    public boolean isOrg() {
        return audience == Audience.ORG;
    }

    /** The products whose prices the version sells: the base product and every priced component, in component order. */
    public List<String> pricedProductCodes() {
        java.util.LinkedHashSet<String> out = new java.util.LinkedHashSet<>();
        if (baseProductCode != null) out.add(baseProductCode);
        for (Comp c : components) if (c.priced()) out.add(c.productCode());
        return List.copyOf(out);
    }
}
