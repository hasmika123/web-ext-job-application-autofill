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

    @Column(name = "audience", length = 12, nullable = false)
    private String audience = "ORG";

    @Column(name = "category", length = 16)
    private String category;

    @Column(name = "pool_mode", length = 16, nullable = false)
    private String poolMode = "PER_CONSULTANT";

    @Column(name = "ai_budget_cents", nullable = false)
    private Integer aiBudgetCents = 0;

    @Column(name = "consumes_ai", nullable = false)
    private Boolean consumesAi = false;

    @Column(name = "reserve_ttl_seconds", nullable = false)
    private Integer reserveTtlSeconds = 900;

    @Column(name = "stackable", nullable = false)
    private Boolean stackable = false;

    @Column(name = "max_quantity")
    private Integer maxQuantity;

    @Column(name = "additive", nullable = false)
    private Boolean additive = false;

    @Column(name = "eligibility_json", columnDefinition = "json")
    private String eligibilityJson;

    @Column(name = "entitlement_keys_json", columnDefinition = "json")
    private String entitlementKeysJson;

    @Column(name = "limit_key", length = 40)
    private String limitKey;

    @Column(name = "visibility", length = 12, nullable = false)
    private String visibility = "PUBLIC";

    /** ACTIVE, RETIRING or RETIRED (docs/subscriptions/11 section 2.2; story K10.1): a service that is not ACTIVE cannot join a plan version or a new basket. */
    @Column(name = "lifecycle", length = 12, nullable = false)
    private String lifecycle = "ACTIVE";

    @Column(name = "catalog_version", nullable = false)
    private Integer catalogVersion = 0;

    @Column(name = "updated_at")
    private Instant updatedAt;

    @Column(name = "updated_by", length = 50)
    private String updatedBy;

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
    public String getAudience() { return audience; }
    public void setAudience(String audience) { this.audience = audience; }
    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }
    public String getPoolMode() { return poolMode; }
    public void setPoolMode(String poolMode) { this.poolMode = poolMode; }
    public Integer getAiBudgetCents() { return aiBudgetCents; }
    public void setAiBudgetCents(Integer aiBudgetCents) { this.aiBudgetCents = aiBudgetCents; }
    public Boolean getConsumesAi() { return consumesAi; }
    public void setConsumesAi(Boolean consumesAi) { this.consumesAi = consumesAi; }
    public Integer getReserveTtlSeconds() { return reserveTtlSeconds; }
    public void setReserveTtlSeconds(Integer reserveTtlSeconds) { this.reserveTtlSeconds = reserveTtlSeconds; }
    public Boolean getStackable() { return stackable; }
    public void setStackable(Boolean stackable) { this.stackable = stackable; }
    public Integer getMaxQuantity() { return maxQuantity; }
    public void setMaxQuantity(Integer maxQuantity) { this.maxQuantity = maxQuantity; }
    public Boolean getAdditive() { return additive; }
    public void setAdditive(Boolean additive) { this.additive = additive; }
    public String getEligibilityJson() { return eligibilityJson; }
    public void setEligibilityJson(String eligibilityJson) { this.eligibilityJson = eligibilityJson; }
    public String getEntitlementKeysJson() { return entitlementKeysJson; }
    public void setEntitlementKeysJson(String entitlementKeysJson) { this.entitlementKeysJson = entitlementKeysJson; }
    public String getLimitKey() { return limitKey; }
    public void setLimitKey(String limitKey) { this.limitKey = limitKey; }
    public String getVisibility() { return visibility; }
    public void setVisibility(String visibility) { this.visibility = visibility; }
    public Integer getCatalogVersion() { return catalogVersion; }
    public void setCatalogVersion(Integer catalogVersion) { this.catalogVersion = catalogVersion; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
    public String getLifecycle() { return lifecycle; }
    public void setLifecycle(String lifecycle) { this.lifecycle = lifecycle; }
    public String getUpdatedBy() { return updatedBy; }
    public void setUpdatedBy(String updatedBy) { this.updatedBy = updatedBy; }
}
