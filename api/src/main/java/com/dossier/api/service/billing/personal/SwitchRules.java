package com.dossier.api.service.billing.personal;

import com.dossier.api.service.BillingException;
import com.dossier.api.service.pricing.BillingInterval;
import com.dossier.api.service.pricing.PricingEngine;
import java.time.Instant;
import java.util.Map;

/**
 * The plan and interval switch rules of an individual subscription (docs/subscriptions/03-pricing-model.md sections 5.2 and 6.2, 07 section 2.3; stories K5.6
 * and K9.2), as pure functions so the table can be tested without a database or Stripe.
 *
 * <pre>
 *   same interval, dearer base      UPGRADE_PLAN     now        prorate the new base over the remaining seconds of the current period or annual term
 *   same interval, other/cheaper    DOWNGRADE_PLAN   period end nothing is charged or credited
 *   interval differs                CHANGE_INTERVAL  period end MONTH to QUARTER or YEAR at the next renewal; YEAR to MONTH or QUARTER at term end (S-04);
 *                                                              no partial-period mixing, no credit (a plan change that comes with it waits too)
 * </pre>
 * "Period end" of a yearly subscription is its term end, so one rule covers monthly, quarterly and annual terms. Nothing is ever refunded.
 */
public final class SwitchRules {

    public enum Kind {
        UPGRADE_PLAN,
        DOWNGRADE_PLAN,
        CHANGE_INTERVAL;

        /** Only an upgrade starts now; everything else waits for the end of what the customer paid for. */
        public boolean immediate() {
            return this == UPGRADE_PLAN;
        }
    }

    /** {@code billing.upgrade.proration}: NEW_BASE charges the new base for the remaining time (the design's table); DIFFERENCE charges only the price difference. */
    public static final String PRORATION_NEW_BASE = "NEW_BASE";
    public static final String PRORATION_DIFFERENCE = "DIFFERENCE";

    private SwitchRules() {}

    /**
     * Classify a switch. {@code fromBaseMinor} and {@code toBaseMinor} are the base prices at the SAME interval when the interval does not change (the only
     * case where they are compared).
     */
    public static Kind classify(boolean planChanges, BillingInterval from, BillingInterval to, long fromBaseMinor, long toBaseMinor) {
        if (from != to) return Kind.CHANGE_INTERVAL;
        if (!planChanges) throw new BillingException(422, "NO_CHANGE", "Nothing would change");
        return toBaseMinor > fromBaseMinor ? Kind.UPGRADE_PLAN : Kind.DOWNGRADE_PLAN;
    }

    /** Refuse an interval move the settings do not allow: YEAR needs annual billing on; leaving YEAR waits for the term end (the only value today). */
    public static void requireAllowed(BillingInterval from, BillingInterval to, boolean annualEnabled, String switchToMonthly) {
        if (from == to) return;
        if (to == BillingInterval.YEAR && !annualEnabled) {
            throw new BillingException(422, "INTERVAL_NOT_AVAILABLE", "Yearly billing isn't offered right now", Map.of("interval", "YEAR"));
        }
        if (from == BillingInterval.YEAR && !"AT_TERM_END".equals(switchToMonthly)) {
            throw new BillingException(422, "INTERVAL_NOT_AVAILABLE", "Leaving a yearly term is only possible at the end of the term", Map.of("interval", to.name()));
        }
    }

    /** When a switch of this kind takes effect: now, or the end of the current period or term. */
    public static Instant effectiveAt(Kind kind, Instant now, Instant periodEnd) {
        return kind.immediate() ? now : periodEnd;
    }

    /**
     * The charge for an upgrade now, on the unit of the current period or term (a year for an annual subscription) over its remaining seconds: the whole new
     * base (NEW_BASE, the old base is already paid and is not credited) or only the difference (DIFFERENCE). Half-even, to the minor unit.
     */
    public static long upgradeProration(String mode, long newUnitMinor, long oldUnitMinor, Instant periodStart, Instant periodEnd, Instant now) {
        long unit = PRORATION_DIFFERENCE.equals(mode) ? Math.max(0, newUnitMinor - oldUnitMinor) : newUnitMinor;
        return PricingEngine.prorate(unit, 1, periodStart, periodEnd, now);
    }
}
