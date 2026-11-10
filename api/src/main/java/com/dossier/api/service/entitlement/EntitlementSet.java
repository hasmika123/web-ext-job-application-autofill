package com.dossier.api.service.entitlement;

import java.time.Instant;
import java.util.Map;
import java.util.Set;

/**
 * The resolved entitlements of one person in one context (06-entitlements-and-enforcement.md section 2): the one shape both readers (personal plan,
 * organization license) produce. Never cached: it is rebuilt from rows on every ask, so a person who just paid sees it at once.
 *
 * @param planKey       the plan the person is on right now (FREE when nothing paid applies)
 * @param planVersionId the plan version that supplied the base services, null when none exists yet
 * @param interval      MONTH, QUARTER or YEAR when a paid term applies, else null
 * @param periodStart   start of the paid term, null when unknown
 * @param periodEnd     end of the paid term, null when none
 * @param features      feature key to what grants it
 * @param capabilities  the legacy capability keys the granted services confer ({@code ai.server}, {@code inbox}, ...)
 * @param limits        limit key to the effective allowance (non-additive services take the largest, additive ones add up)
 * @param aiWindow      the AI budget window, null when the set has no server AI
 * @param state         where the subscription or license stands
 */
public record EntitlementSet(
    String planKey,
    Long planVersionId,
    String interval,
    Instant periodStart,
    Instant periodEnd,
    Map<String, Grant> features,
    Set<String> capabilities,
    Map<String, Long> limits,
    AiBudgetWindow aiWindow,
    SubscriptionState state
) {
    public EntitlementSet {
        features = features == null ? Map.of() : Map.copyOf(features);
        capabilities = capabilities == null ? Set.of() : Set.copyOf(capabilities);
        limits = limits == null ? Map.of() : Map.copyOf(limits);
    }

    /** What put a feature in the set. */
    public enum Source {
        PLAN_INCLUDED,
        ADDON,
        SEAT_INCLUDED,
        SEAT_ADDON,
        MODULE,
        ADMIN_COMP,
    }

    /** One granted feature: where it came from, how many units, its allowance and when it ends. */
    public record Grant(Source source, int quantity, long allowance, Instant endsAt) {}

    /**
     * The AI budget window (06 section 6): spending since {@code start} counts against {@code budgetCents} until {@code resetsAt}. On a quarterly term the
     * budget is pooled for the quarter; on a yearly term it is a monthly sub-window (decision S-10).
     */
    public record AiBudgetWindow(long budgetCents, Instant start, Instant resetsAt, String interval) {}

    /** Where the subscription (or license) stands. {@link #entitled()} is the only question a gate asks. */
    public enum SubscriptionState {
        ACTIVE(true),
        PAST_DUE_ENTITLED(true),
        CANCEL_PENDING(true),
        PAST_DUE_LAPSED(false),
        SUSPENDED(false),
        NONE(false);

        private final boolean entitled;

        SubscriptionState(boolean entitled) {
            this.entitled = entitled;
        }

        /** True when the paid services apply (ACTIVE, PAST_DUE_ENTITLED, CANCEL_PENDING); otherwise the Free set applies. */
        public boolean entitled() {
            return entitled;
        }
    }

    /** True when the feature key, or the legacy capability key, is granted. */
    public boolean has(String key) {
        return key != null && (features.containsKey(key) || capabilities.contains(key));
    }

    /** The effective allowance for a limit key, 0 when absent. */
    public long limit(String limitKey) {
        return limits.getOrDefault(limitKey, 0L);
    }
}
