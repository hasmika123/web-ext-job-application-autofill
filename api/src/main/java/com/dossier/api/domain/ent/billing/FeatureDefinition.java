package com.dossier.api.domain.ent.billing;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;
import java.time.LocalDate;

/** Platform catalog: what a feature is and its default monthly allowance. NO PRICE here (prices are contract rows). demo_data = seeded by BillingDemoSeeder. Table {@code feature_definition}; see docs/enterprise-v2/billing-data-foundation.md. Every query goes through the catalog repository (platform data, no org_id). */
@Entity
@Table(name = "feature_definition")
public class FeatureDefinition implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @Column(name = "feature_key", length = 60, nullable = false)
    private String featureKey;

    @Column(name = "name", length = 80, nullable = false)
    private String name;

    @Column(name = "description", length = 300)
    private String description;

    @Column(name = "usage_type", length = 20, nullable = false)
    private String usageType;

    @Column(name = "usage_unit", length = 24, nullable = false)
    private String usageUnit;

    @Column(name = "default_allowance", nullable = false)
    private Long defaultAllowance;

    @Column(name = "allowance_period", length = 10, nullable = false)
    private String allowancePeriod = "MONTH";

    @Column(name = "icon_key", length = 40)
    private String iconKey;

    @Column(name = "active", nullable = false)
    private Boolean active = true;

    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder = 0;

    @Column(name = "demo_data", nullable = false)
    private Boolean demoData = false;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    public String getFeatureKey() { return featureKey; }
    public void setFeatureKey(String featureKey) { this.featureKey = featureKey; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getUsageType() { return usageType; }
    public void setUsageType(String usageType) { this.usageType = usageType; }
    public String getUsageUnit() { return usageUnit; }
    public void setUsageUnit(String usageUnit) { this.usageUnit = usageUnit; }
    public Long getDefaultAllowance() { return defaultAllowance; }
    public void setDefaultAllowance(Long defaultAllowance) { this.defaultAllowance = defaultAllowance; }
    public String getAllowancePeriod() { return allowancePeriod; }
    public void setAllowancePeriod(String allowancePeriod) { this.allowancePeriod = allowancePeriod; }
    public String getIconKey() { return iconKey; }
    public void setIconKey(String iconKey) { this.iconKey = iconKey; }
    public Boolean getActive() { return active; }
    public void setActive(Boolean active) { this.active = active; }
    public Integer getSortOrder() { return sortOrder; }
    public void setSortOrder(Integer sortOrder) { this.sortOrder = sortOrder; }
    public Boolean getDemoData() { return demoData; }
    public void setDemoData(Boolean demoData) { this.demoData = demoData; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
