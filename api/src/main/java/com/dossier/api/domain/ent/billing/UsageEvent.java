package com.dossier.api.domain.ent.billing;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/** Append-only usage ledger (25 s1, simplified: COMMITTED quantities). usage_counter is the per-period sum of these (current + previous month kept as events). Table {@code usage_event}; see docs/enterprise-v2/billing-data-foundation.md. Every query goes through an org-scoped repository method. */
@Entity
@Table(name = "usage_event")
public class UsageEvent implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", nullable = false)
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "consultant_id", nullable = false)
    private Long consultantId;

    @Column(name = "feature_key", length = 60, nullable = false)
    private String featureKey;

    @Column(name = "quantity", nullable = false)
    private Long quantity;

    @Column(name = "period_key", length = 32, nullable = false)
    private String periodKey;

    @Column(name = "status", length = 12, nullable = false)
    private String status = "COMMITTED";

    @Column(name = "source", length = 24)
    private String source;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt;

    /** Additive reservation fields used by enterprise feature consumers (X5.7); legacy rows may be null. */
    @Column(name = "member_id")
    private Long memberId;

    @Column(name = "actor_member_id")
    private Long actorMemberId;

    @Column(name = "actor_login", length = 50)
    private String actorLogin;

    @Column(name = "beneficiary_login", length = 50)
    private String beneficiaryLogin;

    @Column(name = "unit", length = 24)
    private String unit;

    @Column(name = "reserved_quantity")
    private Long reservedQuantity;

    /** Allowance in force when this reservation was made; legacy committed rows may be null. */
    @Column(name = "allowance_snapshot")
    private Long allowanceSnapshot;

    @Column(name = "release_reason", length = 16)
    private String releaseReason;

    @Column(name = "period_start_at")
    private Instant periodStartAt;

    @Column(name = "period_end_at")
    private Instant periodEndAt;

    @Column(name = "idempotency_key", length = 120)
    private String idempotencyKey;

    @Column(name = "reference_type", length = 30)
    private String referenceType;

    @Column(name = "reference_id")
    private Long referenceId;

    @Column(name = "ai_call_id")
    private Long aiCallId;

    @Column(name = "expires_at")
    private Instant expiresAt;

    @Column(name = "created_at")
    private Instant createdAt;

    @Column(name = "committed_at")
    private Instant committedAt;

    @Column(name = "released_at")
    private Instant releasedAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getConsultantId() { return consultantId; }
    public void setConsultantId(Long consultantId) { this.consultantId = consultantId; }
    public String getFeatureKey() { return featureKey; }
    public void setFeatureKey(String featureKey) { this.featureKey = featureKey; }
    public Long getQuantity() { return quantity; }
    public void setQuantity(Long quantity) { this.quantity = quantity; }
    public String getPeriodKey() { return periodKey; }
    public void setPeriodKey(String periodKey) { this.periodKey = periodKey; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getSource() { return source; }
    public void setSource(String source) { this.source = source; }
    public Instant getOccurredAt() { return occurredAt; }
    public void setOccurredAt(Instant occurredAt) { this.occurredAt = occurredAt; }
    public Long getMemberId() { return memberId; }
    public void setMemberId(Long memberId) { this.memberId = memberId; }
    public Long getActorMemberId() { return actorMemberId; }
    public void setActorMemberId(Long actorMemberId) { this.actorMemberId = actorMemberId; }
    public String getActorLogin() { return actorLogin; }
    public void setActorLogin(String actorLogin) { this.actorLogin = actorLogin; }
    public String getBeneficiaryLogin() { return beneficiaryLogin; }
    public void setBeneficiaryLogin(String beneficiaryLogin) { this.beneficiaryLogin = beneficiaryLogin; }
    public String getUnit() { return unit; }
    public void setUnit(String unit) { this.unit = unit; }
    public Long getReservedQuantity() { return reservedQuantity; }
    public void setReservedQuantity(Long reservedQuantity) { this.reservedQuantity = reservedQuantity; }
    public Long getAllowanceSnapshot() { return allowanceSnapshot; }
    public void setAllowanceSnapshot(Long allowanceSnapshot) { this.allowanceSnapshot = allowanceSnapshot; }
    public String getReleaseReason() { return releaseReason; }
    public void setReleaseReason(String releaseReason) { this.releaseReason = releaseReason; }
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
