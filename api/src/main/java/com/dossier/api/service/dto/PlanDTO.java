package com.dossier.api.service.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.io.Serializable;
import java.time.Instant;
import java.util.List;

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
 *
 * <p>v3 (docs/subscriptions/09-apis.md section 3.3, story K5.7): the fields after {@code hasCustomer} are ADDED only once the subscription is linked to a
 * plan version, and are absent (not null) otherwise, so the body of a Free or a not-yet-linked subscriber is byte-identical to v1.
 * {@code recurringMinor} is what the subscription bills each period (base plus held add-ons at the prices they were bought at); {@code addons} are the
 * add-ons the subscriber is entitled to now; {@code pendingChanges} are scheduled removals and decreases that can still be undone.
 */
public record PlanDTO(
    String plan,
    String status,
    Instant currentPeriodEnd,
    boolean cancelAtPeriodEnd,
    boolean billingEnabled,
    boolean hasCustomer,
    @JsonInclude(JsonInclude.Include.NON_NULL) String planKey,
    @JsonInclude(JsonInclude.Include.NON_NULL) Integer planVersion,
    @JsonInclude(JsonInclude.Include.NON_NULL) String planName,
    @JsonInclude(JsonInclude.Include.NON_NULL) String interval,
    @JsonInclude(JsonInclude.Include.NON_NULL) String currency,
    @JsonInclude(JsonInclude.Include.NON_NULL) Instant currentPeriodStart,
    @JsonInclude(JsonInclude.Include.NON_NULL) Long recurringMinor,
    @JsonInclude(JsonInclude.Include.NON_NULL) List<Addon> addons,
    @JsonInclude(JsonInclude.Include.NON_NULL) List<String> features,
    @JsonInclude(JsonInclude.Include.NON_NULL) List<PendingChange> pendingChanges
) implements Serializable {
    /** The v1 shape: no plan link, so none of the v3 fields. */
    public PlanDTO(String plan, String status, Instant currentPeriodEnd, boolean cancelAtPeriodEnd, boolean billingEnabled, boolean hasCustomer) {
        this(plan, status, currentPeriodEnd, cancelAtPeriodEnd, billingEnabled, hasCustomer, null, null, null, null, null, null, null, null, null, null);
    }

    /** An add-on the subscriber holds; {@code endsAt} is set when it is scheduled for removal (it works until then); {@code pendingQuantity} when a decrease is scheduled. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Addon(String featureKey, String name, int quantity, Long unitMinor, Instant endsAt, Integer pendingQuantity) implements Serializable {}

    /** A scheduled change the subscriber can still undo ({@code DELETE /api/billing/changes/{id}}). */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record PendingChange(Long id, String kind, String featureKey, Integer quantityFrom, Integer quantityTo, Instant effectiveAt, String status) implements Serializable {}

    public boolean isPro() {
        return "PRO".equals(plan);
    }
}
