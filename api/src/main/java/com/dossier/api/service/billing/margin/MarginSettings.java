package com.dossier.api.service.billing.margin;

/**
 * A snapshot of the settings the guard reads (registry keys billing.fees.model, billing.fees.schedule, catalog.stripe.*,
 * catalog.margin_floor_*_pct, catalog.org_above_individual_pct). The defaults are the registry defaults; the hard minimums live in
 * the registry, not here.
 */
public record MarginSettings(
    FeeModelKind feeModel,
    int stripePctBp,
    long stripeFixedCents,
    int invoicingBp,
    FeeSchedule schedule,
    int floorSubscriptionPct,
    int floorServicePct,
    int orgAboveIndividualPct
) {
    public static final MarginSettings DEFAULTS = new MarginSettings(FeeModelKind.SIMPLE, 290, 30, 40, FeeSchedule.DEFAULTS, 80, 20, 25);

    public MarginSettings {
        if (floorSubscriptionPct < 0 || floorSubscriptionPct > 100 || floorServicePct < 0 || floorServicePct > 100 || orgAboveIndividualPct < 0) {
            throw new IllegalArgumentException("floors are percentages within 0..100");
        }
    }

    public long floorSubscriptionBp() {
        return floorSubscriptionPct * 100L;
    }

    public long floorServiceBp() {
        return floorServicePct * 100L;
    }

    public FeeModel feeModelInstance() {
        return feeModel == FeeModelKind.SCHEDULE ? new ScheduleFeeModel(schedule, invoicingBp) : new SimpleFeeModel(stripePctBp, stripeFixedCents, invoicingBp);
    }

    public MarginSettings withFeeModel(FeeModelKind kind) {
        return new MarginSettings(kind, stripePctBp, stripeFixedCents, invoicingBp, schedule, floorSubscriptionPct, floorServicePct, orgAboveIndividualPct);
    }
}
