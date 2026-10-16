package com.dossier.api.service.catalog.plan;

import com.dossier.api.service.catalog.CatalogSettings;
import com.dossier.api.service.pricing.Audience;
import com.dossier.api.service.pricing.BillingInterval;
import com.dossier.api.service.pricing.IntervalPolicy;
import com.dossier.api.service.pricing.PricingException;
import com.dossier.api.service.pricing.PricingInputs;
import com.dossier.api.service.pricing.PricingInputs.LineGroup;
import com.dossier.api.service.pricing.PricingInputs.LineRequest;
import java.time.Instant;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Component;

/**
 * Builds the plain {@link PricingInputs} of a plan version (the engine takes no repositories): the interval policy comes from the admin settings, the
 * lines from the version's base and the add-ons asked for. An individual basket is one {@code "plan"} group; an organization basket is one group per seat
 * (see {@link #orgSeat}) plus an optional group for the one-time fee. Quotes (K3.3) call this with the subscription state on top.
 */
@Component
public class PricingInputsLoader {

    private final CatalogSettings settings;

    public PricingInputsLoader(CatalogSettings settings) {
        this.settings = settings;
    }

    /** The interval policy of the settings registry (billing.intervals.*, billing.annual.enabled). */
    public IntervalPolicy policy() {
        return new IntervalPolicy(parse(settings.intervals("INDIVIDUAL")), parse(settings.intervals("ORG")), settings.annualEnabled());
    }

    private static Set<BillingInterval> parse(List<String> names) {
        Set<BillingInterval> out = EnumSet.noneOf(BillingInterval.class);
        for (String n : names) {
            try {
                out.add(BillingInterval.valueOf(n));
            } catch (IllegalArgumentException ignored) {
                // an unknown name in the setting is ignored
            }
        }
        return out;
    }

    /** An individual basket: the plan base once plus {@code addons} (feature key to quantity). Refuses an add-on the version does not offer. */
    public PricingInputs individual(PlanModel m, BillingInterval interval, String currency, Instant at, Map<String, Integer> addons) {
        List<LineRequest> lines = new ArrayList<>();
        if (m.baseProductCode() != null) lines.add(new LineRequest(m.baseProductCode(), m.baseProductCode(), 1, 1));
        lines.addAll(addonLines(m, addons));
        return new PricingInputs(Audience.INDIVIDUAL, currency, interval, at, List.of(new LineGroup(PricingInputs.PLAN_GROUP, lines)), null, null, null, 0, policy());
    }

    /** One seat group: the seat base plus the seat add-ons picked. */
    public LineGroup orgSeat(PlanModel m, String groupKey, Map<String, Integer> seatAddons) {
        List<LineRequest> lines = new ArrayList<>();
        for (PlanModel.Comp c : m.components()) {
            if (PlanModel.SEAT_BASE.equals(c.role()) && c.productCode() != null) lines.add(new LineRequest(c.productCode(), c.productCode(), 1, 1));
        }
        lines.addAll(addonLines(m, seatAddons));
        return new LineGroup(groupKey, lines);
    }

    /** An organization basket from prepared groups. */
    public PricingInputs org(String currency, BillingInterval interval, Instant at, List<LineGroup> groups) {
        return new PricingInputs(Audience.ORG, currency, interval, at, groups, null, null, null, groups.size(), policy());
    }

    private static List<LineRequest> addonLines(PlanModel m, Map<String, Integer> addons) {
        List<LineRequest> out = new ArrayList<>();
        if (addons == null) return out;
        for (Map.Entry<String, Integer> a : addons.entrySet()) {
            if (a.getValue() == null || a.getValue() <= 0) continue;
            PlanModel.Comp c = m.components().stream().filter(x -> x.featureKey().equals(a.getKey()) && x.optional()).findFirst().orElse(null);
            if (c == null || c.productCode() == null) {
                throw new PricingException("ADDON_NOT_IN_PLAN", a.getKey() + " is not an add-on of " + m.planKey(), Map.of("featureKey", a.getKey()));
            }
            out.add(new LineRequest(c.featureKey(), c.productCode(), a.getValue(), Math.max(1, c.maxQuantity())));
        }
        return out;
    }
}
