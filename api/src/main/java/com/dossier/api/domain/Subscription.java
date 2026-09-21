package com.dossier.api.domain;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * A user's billing state — a <b>mirror of Stripe</b>, not an authority (Phase 12).
 *
 * <p>Only the webhook ({@code BillingWebhookResource}, 12.2) writes this. The checkout return
 * page never does: it can be skipped, replayed or forged, so it must not be what makes someone
 * Pro. A user with no row is simply Free.
 *
 * <p>{@link #status} holds Stripe's own string verbatim so nothing is lost in translation;
 * {@link #plan} is our derived tier. Whether a given status still counts as Pro is
 * {@code EntitlementService}'s call, not a column — notably {@code past_due} stays Pro until
 * {@link #currentPeriodEnd} so Stripe's Smart Retries get their window.
 */
@Entity
@Table(name = "subscription")
public class Subscription implements Serializable {

    private static final long serialVersionUID = 1L;

    /** Our own value for "never checked out" — Stripe never sends this. */
    public static final String STATUS_NONE = "none";

    public static final String PLAN_FREE = "FREE";
    public static final String PLAN_PRO = "PRO";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    /** One row per user, enforced by a unique constraint. */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false, unique = true)
    private User user;

    /** Null until the user's first checkout creates the Stripe customer. */
    @Column(name = "stripe_customer_id", unique = true)
    private String stripeCustomerId;

    @Column(name = "stripe_subscription_id", unique = true)
    private String stripeSubscriptionId;

    @Column(name = "plan", nullable = false)
    private String plan = PLAN_FREE;

    @Column(name = "status", nullable = false)
    private String status = STATUS_NONE;

    @Column(name = "price_id")
    private String priceId;

    @Column(name = "current_period_end")
    private Instant currentPeriodEnd;

    @Column(name = "cancel_at_period_end", nullable = false)
    private boolean cancelAtPeriodEnd = false;

    /** `created` of the newest event applied here — Stripe doesn't guarantee delivery order. */
    @Column(name = "last_event_at")
    private Instant lastEventAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public User getUser() {
        return user;
    }

    public void setUser(User user) {
        this.user = user;
    }

    public String getStripeCustomerId() {
        return stripeCustomerId;
    }

    public void setStripeCustomerId(String stripeCustomerId) {
        this.stripeCustomerId = stripeCustomerId;
    }

    public String getStripeSubscriptionId() {
        return stripeSubscriptionId;
    }

    public void setStripeSubscriptionId(String stripeSubscriptionId) {
        this.stripeSubscriptionId = stripeSubscriptionId;
    }

    public String getPlan() {
        return plan;
    }

    public void setPlan(String plan) {
        this.plan = plan;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getPriceId() {
        return priceId;
    }

    public void setPriceId(String priceId) {
        this.priceId = priceId;
    }

    public Instant getCurrentPeriodEnd() {
        return currentPeriodEnd;
    }

    public void setCurrentPeriodEnd(Instant currentPeriodEnd) {
        this.currentPeriodEnd = currentPeriodEnd;
    }

    public boolean isCancelAtPeriodEnd() {
        return cancelAtPeriodEnd;
    }

    public void setCancelAtPeriodEnd(boolean cancelAtPeriodEnd) {
        this.cancelAtPeriodEnd = cancelAtPeriodEnd;
    }

    public Instant getLastEventAt() {
        return lastEventAt;
    }

    public void setLastEventAt(Instant lastEventAt) {
        this.lastEventAt = lastEventAt;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }

    @Override
    public String toString() {
        return (
            "Subscription{id=" +
            id +
            ", plan='" +
            plan +
            "', status='" +
            status +
            "', currentPeriodEnd=" +
            currentPeriodEnd +
            ", cancelAtPeriodEnd=" +
            cancelAtPeriodEnd +
            "}"
        );
    }
}
