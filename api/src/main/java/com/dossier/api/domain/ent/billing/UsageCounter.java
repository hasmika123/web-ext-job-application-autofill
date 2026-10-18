package com.dossier.api.domain.ent.billing;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;
import java.time.LocalDate;

/** Per consultant x feature x month: used and the allowance in force (incl. credits). Current and previous months equal the sum of usage_event; older months are counters only. Table {@code usage_counter}; see docs/enterprise-v2/billing-data-foundation.md. Every query goes through an org-scoped repository method. */
@Entity
@Table(name = "usage_counter")
public class UsageCounter implements Serializable {

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

    @Column(name = "period_key", length = 8, nullable = false)
    private String periodKey;

    @Column(name = "used", nullable = false)
    private Long used;

    @Column(name = "allowance", nullable = false)
    private Long allowance;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getConsultantId() { return consultantId; }
    public void setConsultantId(Long consultantId) { this.consultantId = consultantId; }
    public String getFeatureKey() { return featureKey; }
    public void setFeatureKey(String featureKey) { this.featureKey = featureKey; }
    public String getPeriodKey() { return periodKey; }
    public void setPeriodKey(String periodKey) { this.periodKey = periodKey; }
    public Long getUsed() { return used; }
    public void setUsed(Long used) { this.used = used; }
    public Long getAllowance() { return allowance; }
    public void setAllowance(Long allowance) { this.allowance = allowance; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
