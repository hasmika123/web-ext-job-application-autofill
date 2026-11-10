package com.dossier.api.domain.catalog;

import jakarta.persistence.*;
import java.io.Serializable;

/**
 * One service inside one plan version (docs/subscriptions/08-data-model.md section 3). {@code role}: BASE and INCLUDED (inside the base price), OPTIONAL
 * (an add-on the subscriber picks at its own price), SEAT_BASE, SEAT_INCLUDED and SEAT_OPTIONAL (organization seats) and FEE. There is no
 * "on by default": nothing paid is ever pre-selected. A service appears at most once per version. Platform data, no org_id.
 */
@Entity
@Table(name = "plan_component")
public class PlanComponent implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", nullable = false)
    private Long id;

    @Column(name = "plan_version_id", nullable = false)
    private Long planVersionId;

    @Column(name = "feature_key", length = 60, nullable = false)
    private String featureKey;

    @Column(name = "role", length = 16, nullable = false)
    private String role;

    @Column(name = "product_id")
    private Long productId;

    @Column(name = "allowance_override")
    private Long allowanceOverride;

    @Column(name = "limit_overrides_json", columnDefinition = "json")
    private String limitOverridesJson;

    @Column(name = "default_quantity", nullable = false)
    private Integer defaultQuantity = 1;

    @Column(name = "max_quantity")
    private Integer maxQuantity;

    @Column(name = "component_discount_bp")
    private Integer componentDiscountBp;

    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder = 0;

    @Column(name = "marketing_label", length = 120)
    private String marketingLabel;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getPlanVersionId() { return planVersionId; }
    public void setPlanVersionId(Long planVersionId) { this.planVersionId = planVersionId; }
    public String getFeatureKey() { return featureKey; }
    public void setFeatureKey(String featureKey) { this.featureKey = featureKey; }
    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }
    public Long getProductId() { return productId; }
    public void setProductId(Long productId) { this.productId = productId; }
    public Long getAllowanceOverride() { return allowanceOverride; }
    public void setAllowanceOverride(Long allowanceOverride) { this.allowanceOverride = allowanceOverride; }
    public String getLimitOverridesJson() { return limitOverridesJson; }
    public void setLimitOverridesJson(String limitOverridesJson) { this.limitOverridesJson = limitOverridesJson; }
    public Integer getDefaultQuantity() { return defaultQuantity; }
    public void setDefaultQuantity(Integer defaultQuantity) { this.defaultQuantity = defaultQuantity; }
    public Integer getMaxQuantity() { return maxQuantity; }
    public void setMaxQuantity(Integer maxQuantity) { this.maxQuantity = maxQuantity; }
    public Integer getComponentDiscountBp() { return componentDiscountBp; }
    public void setComponentDiscountBp(Integer componentDiscountBp) { this.componentDiscountBp = componentDiscountBp; }
    public Integer getSortOrder() { return sortOrder; }
    public void setSortOrder(Integer sortOrder) { this.sortOrder = sortOrder; }
    public String getMarketingLabel() { return marketingLabel; }
    public void setMarketingLabel(String marketingLabel) { this.marketingLabel = marketingLabel; }
}
