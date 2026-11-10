package com.dossier.api.domain.usage;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * One reservation/commit/release in the personal usage ledger (docs/subscriptions/08-data-model.md section 4.6; decision S-14): the doc-25 shape keyed
 * by {@code user_id}. The organization tables ({@code usage_event}) are tenant-only and never hold a personal row. Status RESERVED, COMMITTED or RELEASED;
 * release reason FAILED, TIMEOUT, DENIED, CANCELLED or PARTIAL.
 */
@Entity
@Table(name = "personal_usage_event")
public class PersonalUsageEvent implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final String RESERVED = "RESERVED";
    public static final String COMMITTED = "COMMITTED";
    public static final String RELEASED = "RELEASED";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", nullable = false)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "login", length = 50, nullable = false)
    private String login;

    @Column(name = "feature_key", length = 60, nullable = false)
    private String featureKey;

    @Column(name = "limit_key", length = 40, nullable = false)
    private String limitKey = "default";

    @Column(name = "quantity", nullable = false)
    private Long quantity;

    @Column(name = "reserved_quantity", nullable = false)
    private Long reservedQuantity;

    @Column(name = "unit", length = 24, nullable = false)
    private String unit;

    @Column(name = "status", length = 12, nullable = false)
    private String status = RESERVED;

    @Column(name = "release_reason", length = 16)
    private String releaseReason;

    @Column(name = "allowance_snapshot", nullable = false)
    private Long allowanceSnapshot;

    @Column(name = "period_key", length = 32, nullable = false)
    private String periodKey;

    @Column(name = "period_start_at", nullable = false)
    private Instant periodStartAt;

    @Column(name = "period_end_at", nullable = false)
    private Instant periodEndAt;

    @Column(name = "idempotency_key", length = 120, nullable = false)
    private String idempotencyKey;

    @Column(name = "reference_type", length = 30)
    private String referenceType;

    @Column(name = "reference_id")
    private Long referenceId;

    @Column(name = "ai_call_id")
    private Long aiCallId;

    @Column(name = "expires_at")
    private Instant expiresAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "committed_at")
    private Instant committedAt;

    @Column(name = "released_at")
    private Instant releasedAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
    public String getLogin() { return login; }
    public void setLogin(String login) { this.login = login; }
    public String getFeatureKey() { return featureKey; }
    public void setFeatureKey(String featureKey) { this.featureKey = featureKey; }
    public String getLimitKey() { return limitKey; }
    public void setLimitKey(String limitKey) { this.limitKey = limitKey; }
    public Long getQuantity() { return quantity; }
    public void setQuantity(Long quantity) { this.quantity = quantity; }
    public Long getReservedQuantity() { return reservedQuantity; }
    public void setReservedQuantity(Long reservedQuantity) { this.reservedQuantity = reservedQuantity; }
    public String getUnit() { return unit; }
    public void setUnit(String unit) { this.unit = unit; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getReleaseReason() { return releaseReason; }
    public void setReleaseReason(String releaseReason) { this.releaseReason = releaseReason; }
    public Long getAllowanceSnapshot() { return allowanceSnapshot; }
    public void setAllowanceSnapshot(Long allowanceSnapshot) { this.allowanceSnapshot = allowanceSnapshot; }
    public String getPeriodKey() { return periodKey; }
    public void setPeriodKey(String periodKey) { this.periodKey = periodKey; }
    public Instant getPeriodStartAt() { return periodStartAt; }
    public void setPeriodStartAt(Instant periodStartAt) { this.periodStartAt = periodStartAt; }
    public Instant getPeriodEndAt() { return periodEndAt; }
    public void setPeriodEndAt(Instant periodEndAt) { this.periodEndAt = periodEndAt; }
    public String getIdempotencyKey() { return idempotencyKey; }
    public void setIdempotencyKey(String idempotencyKey) { this.idempotencyKey = idempotencyKey; }
    public String getReferenceType() { return referenceType; }
    public void setReferenceType(String referenceType) { this.referenceType = referenceType; }
    public Long getReferenceId() { return referenceId; }
    public void setReferenceId(Long referenceId) { this.referenceId = referenceId; }
    public Long getAiCallId() { return aiCallId; }
    public void setAiCallId(Long aiCallId) { this.aiCallId = aiCallId; }
    public Instant getExpiresAt() { return expiresAt; }
    public void setExpiresAt(Instant expiresAt) { this.expiresAt = expiresAt; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getCommittedAt() { return committedAt; }
    public void setCommittedAt(Instant committedAt) { this.committedAt = committedAt; }
    public Instant getReleasedAt() { return releasedAt; }
    public void setReleasedAt(Instant releasedAt) { this.releasedAt = releasedAt; }
}
