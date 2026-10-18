package com.dossier.api.domain.ent.billing;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;
import java.time.LocalDate;

/** Recent alerts (APPROACHING_LIMIT at 80 %, LIMIT_REACHED at 100 %). Table {@code usage_alert}; see docs/enterprise-v2/billing-data-foundation.md. Every query goes through an org-scoped repository method. */
@Entity
@Table(name = "usage_alert")
public class UsageAlert implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", nullable = false)
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "consultant_id")
    private Long consultantId;

    @Column(name = "feature_key", length = 60, nullable = false)
    private String featureKey;

    @Column(name = "kind", length = 20, nullable = false)
    private String kind;

    @Column(name = "threshold_pct", nullable = false)
    private Integer thresholdPct;

    @Column(name = "period_key", length = 8, nullable = false)
    private String periodKey;

    @Column(name = "message", length = 200, nullable = false)
    private String message;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "acknowledged_at")
    private Instant acknowledgedAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getConsultantId() { return consultantId; }
    public void setConsultantId(Long consultantId) { this.consultantId = consultantId; }
    public String getFeatureKey() { return featureKey; }
    public void setFeatureKey(String featureKey) { this.featureKey = featureKey; }
    public String getKind() { return kind; }
    public void setKind(String kind) { this.kind = kind; }
    public Integer getThresholdPct() { return thresholdPct; }
    public void setThresholdPct(Integer thresholdPct) { this.thresholdPct = thresholdPct; }
    public String getPeriodKey() { return periodKey; }
    public void setPeriodKey(String periodKey) { this.periodKey = periodKey; }
    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getAcknowledgedAt() { return acknowledgedAt; }
    public void setAcknowledgedAt(Instant acknowledgedAt) { this.acknowledgedAt = acknowledgedAt; }
}
