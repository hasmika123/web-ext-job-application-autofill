package com.dossier.api.domain.ent.billing;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;
import java.time.LocalDate;

/** License history (drawer History tab) and the PENDING scheduled changes of the Pending Changes tab. Table {@code license_change}; see docs/enterprise-v2/billing-data-foundation.md. Every query goes through an org-scoped repository method. */
@Entity
@Table(name = "license_change")
public class LicenseChange implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", nullable = false)
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "license_id", nullable = false)
    private Long licenseId;

    @Column(name = "batch_id", length = 36)
    private String batchId;

    @Column(name = "kind", length = 24, nullable = false)
    private String kind;

    @Column(name = "feature_key", length = 60)
    private String featureKey;

    @Column(name = "summary", length = 200, nullable = false)
    private String summary;

    @Column(name = "amount_delta_minor", nullable = false)
    private Long amountDeltaMinor;

    @Column(name = "effective_at", nullable = false)
    private Instant effectiveAt;

    @Column(name = "status", length = 12, nullable = false)
    private String status = "APPLIED";

    @Column(name = "actor_member_id")
    private Long actorMemberId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "applied_at")
    private Instant appliedAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getLicenseId() { return licenseId; }
    public void setLicenseId(Long licenseId) { this.licenseId = licenseId; }
    public String getBatchId() { return batchId; }
    public void setBatchId(String batchId) { this.batchId = batchId; }
    public String getKind() { return kind; }
    public void setKind(String kind) { this.kind = kind; }
    public String getFeatureKey() { return featureKey; }
    public void setFeatureKey(String featureKey) { this.featureKey = featureKey; }
    public String getSummary() { return summary; }
    public void setSummary(String summary) { this.summary = summary; }
    public Long getAmountDeltaMinor() { return amountDeltaMinor; }
    public void setAmountDeltaMinor(Long amountDeltaMinor) { this.amountDeltaMinor = amountDeltaMinor; }
    public Instant getEffectiveAt() { return effectiveAt; }
    public void setEffectiveAt(Instant effectiveAt) { this.effectiveAt = effectiveAt; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public Long getActorMemberId() { return actorMemberId; }
    public void setActorMemberId(Long actorMemberId) { this.actorMemberId = actorMemberId; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getAppliedAt() { return appliedAt; }
    public void setAppliedAt(Instant appliedAt) { this.appliedAt = appliedAt; }
}
