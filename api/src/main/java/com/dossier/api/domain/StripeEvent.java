package com.dossier.api.domain;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;
import org.springframework.data.domain.Persistable;

/**
 * One received Stripe webhook event (Phase 12).
 *
 * <p>This table exists for <b>idempotency</b>. Stripe delivers at least once and retries on any
 * non-2xx, so the same {@code evt_…} will arrive twice sooner or later. The Stripe event id is
 * this entity's {@code @Id}, so a replay collides on insert and is recognised as a duplicate
 * rather than applied a second time — charging state can't be double-applied by a retry.
 *
 * <p>It doubles as an audit trail: what arrived, when, and why a handler failed.
 */
@Entity
@Table(name = "stripe_event")
public class StripeEvent implements Serializable, Persistable<String> {

    private static final long serialVersionUID = 1L;

    public static final String STATUS_OK = "ok";
    public static final String STATUS_FAILED = "failed";
    public static final String STATUS_DUPLICATE = "duplicate";

    /** The Stripe event id (`evt_…`) — deliberately the primary key. */
    @Id
    @Column(name = "id", nullable = false)
    private String id;

    @Column(name = "type", nullable = false)
    private String type;

    @Column(name = "received_at", nullable = false)
    private Instant receivedAt = Instant.now();

    @Column(name = "processed_at")
    private Instant processedAt;

    @Column(name = "status", nullable = false)
    private String status = STATUS_OK;

    @Lob
    @Column(name = "error")
    private String error;

    /** Who and what the event was about (9.C1) — what turns this log into a customer timeline. */
    @Column(name = "customer_id")
    private String customerId;

    /** Our user, when the event could be tied to one. Not a foreign key; cleared on account deletion. */
    @Column(name = "user_id")
    private Long userId;

    /** Invoice amount in the smallest currency unit: paid for {@code invoice.paid}, due for a failure. */
    @Column(name = "amount_cents")
    private Long amountCents;

    @Column(name = "currency", length = 3)
    private String currency;

    /** A one-line, human description for the timeline, e.g. "Subscription updated: active". */
    @Column(name = "detail")
    private String detail;

    /** Stripe's own timestamp for the event — the timeline's order, not our receive time. */
    @Column(name = "occurred_at")
    private Instant occurredAt;

    /**
     * Not a column — it makes the id actually behave as an idempotency key.
     *
     * <p>Spring Data decides "new entity?" from whether the id is null. With an assigned String
     * id it would always answer "existing", turn {@code save()} into a merge, and a replayed
     * event would quietly <b>update</b> its row instead of colliding. Declaring newness
     * explicitly makes {@code save()} a {@code persist()}, so a duplicate id raises a constraint
     * violation — which is what the handler catches to recognise a replay.
     */
    @Transient
    private boolean isNew = true;

    @Override
    public boolean isNew() {
        return isNew;
    }

    @PostLoad
    @PostPersist
    void markNotNew() {
        this.isNew = false;
    }

    @Override
    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    public Instant getReceivedAt() {
        return receivedAt;
    }

    public void setReceivedAt(Instant receivedAt) {
        this.receivedAt = receivedAt;
    }

    public Instant getProcessedAt() {
        return processedAt;
    }

    public void setProcessedAt(Instant processedAt) {
        this.processedAt = processedAt;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getError() {
        return error;
    }

    public void setError(String error) {
        this.error = error;
    }

    public String getCustomerId() {
        return customerId;
    }

    public void setCustomerId(String customerId) {
        this.customerId = customerId;
    }

    public Long getUserId() {
        return userId;
    }

    public void setUserId(Long userId) {
        this.userId = userId;
    }

    public Long getAmountCents() {
        return amountCents;
    }

    public void setAmountCents(Long amountCents) {
        this.amountCents = amountCents;
    }

    public String getCurrency() {
        return currency;
    }

    public void setCurrency(String currency) {
        this.currency = currency;
    }

    public String getDetail() {
        return detail;
    }

    public void setDetail(String detail) {
        this.detail = detail;
    }

    public Instant getOccurredAt() {
        return occurredAt;
    }

    public void setOccurredAt(Instant occurredAt) {
        this.occurredAt = occurredAt;
    }

    @Override
    public String toString() {
        return "StripeEvent{id='" + id + "', type='" + type + "', status='" + status + "'}";
    }
}
