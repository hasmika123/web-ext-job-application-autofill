package com.dossier.api.domain.usage;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/** A cache of the personal ledger for one (user, feature, limit, period): the row the reserve statement locks (FOR UPDATE) so two parallel calls cannot both pass with one unit left. */
@Entity
@Table(name = "personal_usage_counter")
public class PersonalUsageCounter implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", nullable = false)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "feature_key", length = 60, nullable = false)
    private String featureKey;

    @Column(name = "limit_key", length = 40, nullable = false)
    private String limitKey = "default";

    @Column(name = "period_key", length = 32, nullable = false)
    private String periodKey;

    @Column(name = "used", nullable = false)
    private Long used = 0L;

    @Column(name = "allowance", nullable = false)
    private Long allowance;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
    public String getFeatureKey() { return featureKey; }
    public void setFeatureKey(String featureKey) { this.featureKey = featureKey; }
    public String getLimitKey() { return limitKey; }
    public void setLimitKey(String limitKey) { this.limitKey = limitKey; }
    public String getPeriodKey() { return periodKey; }
    public void setPeriodKey(String periodKey) { this.periodKey = periodKey; }
    public Long getUsed() { return used; }
    public void setUsed(Long used) { this.used = used; }
    public Long getAllowance() { return allowance; }
    public void setAllowance(Long allowance) { this.allowance = allowance; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
