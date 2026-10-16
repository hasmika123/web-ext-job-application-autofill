package com.dossier.api.service.pricing;

import java.util.EnumSet;
import java.util.Set;

/**
 * billing.intervals.individual / billing.intervals.org / billing.annual.enabled, read by the caller from the settings registry.
 * ONE_TIME is always allowed; ORG + QUARTER is refused regardless of settings (decision E17); YEAR needs annualEnabled
 * (pass {@code true} when pricing an existing annual term that runs to its end).
 */
public record IntervalPolicy(Set<BillingInterval> individual, Set<BillingInterval> org, boolean annualEnabled) {
    public static final IntervalPolicy DEFAULTS = new IntervalPolicy(
        EnumSet.of(BillingInterval.MONTH, BillingInterval.QUARTER, BillingInterval.YEAR),
        EnumSet.of(BillingInterval.MONTH, BillingInterval.YEAR),
        true
    );

    public IntervalPolicy {
        individual = Set.copyOf(individual);
        org = Set.copyOf(org);
    }

    public boolean allows(Audience audience, BillingInterval interval) {
        if (interval == BillingInterval.ONE_TIME) {
            return true;
        }
        if (interval == BillingInterval.YEAR && !annualEnabled) {
            return false;
        }
        if (audience == Audience.ORG) {
            return interval != BillingInterval.QUARTER && org.contains(interval);
        }
        return individual.contains(interval);
    }
}
