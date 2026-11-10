package com.dossier.api.domain.sub;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * A service a subscriber held and Free does not include, locked read-only after a retirement fallback (docs/subscriptions/11 sections 7.1 and 7.2; story K10.5).
 * One live row per (user, feature). A lock is an overlay on the resolved set and never a source of entitlement: a feature that is held again is simply ALLOWED,
 * whatever the row says, so unlocking after an upgrade is instant.
 */
@Entity
@Table(name = "service_lock")
public class ServiceLock implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final String REASON_FALLBACK = "FALLBACK";
    public static final String REASON_ADMIN = "ADMIN";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", nullable = false)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "feature_key", length = 60, nullable = false)
    private String featureKey;

    @Column(name = "locked_at", nullable = false)
    private Instant lockedAt;

    @Column(name = "locked_from_plan_version_id")
    private Long lockedFromPlanVersionId;

    @Column(name = "retirement_id")
    private Long retirementId;

    @Column(name = "reason", length = 12, nullable = false)
    private String reason = REASON_FALLBACK;

    @Column(name = "released_at")
    private Instant releasedAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
    public String getFeatureKey() { return featureKey; }
    public void setFeatureKey(String featureKey) { this.featureKey = featureKey; }
    public Instant getLockedAt() { return lockedAt; }
    public void setLockedAt(Instant lockedAt) { this.lockedAt = lockedAt; }
    public Long getLockedFromPlanVersionId() { return lockedFromPlanVersionId; }
    public void setLockedFromPlanVersionId(Long lockedFromPlanVersionId) { this.lockedFromPlanVersionId = lockedFromPlanVersionId; }
    public Long getRetirementId() { return retirementId; }
    public void setRetirementId(Long retirementId) { this.retirementId = retirementId; }
    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }
    public Instant getReleasedAt() { return releasedAt; }
    public void setReleasedAt(Instant releasedAt) { this.releasedAt = releasedAt; }
}
