package com.dossier.api.service.pricing;

import com.dossier.api.service.pricing.PricingTerms.ContractTerms;
import com.dossier.api.service.pricing.PricingTerms.OrgDiscount;
import com.dossier.api.service.pricing.PricingTerms.VolumeTier;
import java.time.Instant;
import java.util.List;

/**
 * Everything the engine needs, as plain values (no repositories). Built by the inputs loader from a plan-version snapshot (K2.2)
 * and the subscription state; golden tests build it in memory.
 *
 * <p>Individual: one group (usually {@code "plan"}) with the base and the add-ons. Org: one group per consultant license, plus
 * optional groups for modules and the platform fee.
 */
public record PricingInputs(
    Audience audience,
    String currency,
    BillingInterval interval,
    Instant at,
    List<LineGroup> groups,
    ContractTerms contract,
    List<OrgDiscount> eligibleDiscounts,
    List<VolumeTier> tiers,
    int licensedCountNextPeriod,
    IntervalPolicy policy
) {
    public static final String PLAN_GROUP = "plan";

    public record LineRequest(String lineKey, String productCode, int quantity, int maxQuantity) {
        public LineRequest(String productCode, int quantity) {
            this(productCode, productCode, quantity, 0);
        }
    }

    public record LineGroup(String groupKey, List<LineRequest> lines) {
        public LineGroup {
            lines = List.copyOf(lines);
        }
    }

    public PricingInputs {
        groups = List.copyOf(groups);
        eligibleDiscounts = eligibleDiscounts == null ? List.of() : List.copyOf(eligibleDiscounts);
        tiers = tiers == null ? List.of() : List.copyOf(tiers);
        policy = policy == null ? IntervalPolicy.DEFAULTS : policy;
    }

    /** An individual basket: no contract, discount or tier. */
    public static PricingInputs individual(String currency, BillingInterval interval, Instant at, List<LineRequest> lines) {
        return new PricingInputs(Audience.INDIVIDUAL, currency, interval, at, List.of(new LineGroup(PLAN_GROUP, lines)), null, null, null, 0, null);
    }

    public PricingInputs withInterval(BillingInterval other) {
        return new PricingInputs(audience, currency, other, at, groups, contract, eligibleDiscounts, tiers, licensedCountNextPeriod, policy);
    }
}
