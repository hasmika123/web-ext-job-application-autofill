package com.dossier.api.service.dto;

import java.io.Serializable;
import java.time.Instant;

/**
 * The current user's billing state, as every client should see it (Phase 12).
 *
 * <p>Served by {@code GET /api/billing/me} and echoed on {@code GET /api/profile/version} so the
 * extension picks the plan up inside the version check it already runs (11.3) — no extra
 * round-trip, and no plan claim in the JWT that would go stale for a whole session after an
 * upgrade.
 *
 * @param plan               {@code FREE} or {@code PRO} — the only field a feature gate should read
 * @param status             Stripe's own status verbatim, for display ({@code past_due} is worth showing)
 * @param currentPeriodEnd   when the paid-for period ends; renewal date, or cancellation date when {@code cancelAtPeriodEnd}
 * @param cancelAtPeriodEnd  the user cancelled; they keep Pro until {@code currentPeriodEnd}
 * @param billingEnabled     false when this server has no Stripe key — clients show "coming soon", not an error
 * @param hasCustomer        a Stripe customer exists, so the Billing Portal can be opened
 */
public record PlanDTO(
    String plan,
    String status,
    Instant currentPeriodEnd,
    boolean cancelAtPeriodEnd,
    boolean billingEnabled,
    boolean hasCustomer
) implements Serializable {
    public boolean isPro() {
        return "PRO".equals(plan);
    }
}
