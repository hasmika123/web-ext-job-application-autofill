package com.dossier.api.domain.ent.billing;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;
import java.time.LocalDate;

/** Platform catalog: sellable things (BASE_LICENSE tier, FEATURE add-on, ORG_ADDON). Ships WITHOUT prices; demo prices live in org_contract_price. Table {@code product}; see docs/enterprise-v2/billing-data-foundation.md. Every query goes through the catalog repository (platform data, no org_id). */
@Entity
@Table(name = "product")
public class Product implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", nullable = false)
    private Long id;

    @Column(name = "code", length = 60, nullable = false)
    private String code;

    @Column(name = "name", length = 100, nullable = false)
    private String name;

    @Column(name = "kind", length = 20, nullable = false)
    private String kind;

    @Column(name = "feature_key", length = 60)
    private String featureKey;

    @Column(name = "description", length = 300)
    private String description;

    @Column(name = "tier_rank")
    private Integer tierRank;

    @Column(name = "active", nullable = false)
    private Boolean active = true;

    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder = 0;

    @Column(name = "demo_data", nullable = false)
    private Boolean demoData = false;

    @Column(name = "sold_to", length = 12, nullable = false)
    private String soldTo = "ORG";

    @Column(name = "stripe_product_id", length = 255)
    private String stripeProductId;

    @Column(name = "quantity_basis", length = 10)
    private String quantityBasis;

    @Column(name = "role_key", length = 40)
    private String roleKey;

    @Column(name = "updated_at")
    private Instant updatedAt;

    @Column(name = "updated_by", length = 50)
    private String updatedBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getKind() { return kind; }
    public void setKind(String kind) { this.kind = kind; }
    public String getFeatureKey() { return featureKey; }
    public void setFeatureKey(String featureKey) { this.featureKey = featureKey; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public Integer getTierRank() { return tierRank; }
    public void setTierRank(Integer tierRank) { this.tierRank = tierRank; }
    public Boolean getActive() { return active; }
    public void setActive(Boolean active) { this.active = active; }
    public Integer getSortOrder() { return sortOrder; }
    public void setSortOrder(Integer sortOrder) { this.sortOrder = sortOrder; }
    public Boolean getDemoData() { return demoData; }
    public void setDemoData(Boolean demoData) { this.demoData = demoData; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public String getSoldTo() { return soldTo; }
    public void setSoldTo(String soldTo) { this.soldTo = soldTo; }
    public String getStripeProductId() { return stripeProductId; }
    public void setStripeProductId(String stripeProductId) { this.stripeProductId = stripeProductId; }
    public String getQuantityBasis() { return quantityBasis; }
    public void setQuantityBasis(String quantityBasis) { this.quantityBasis = quantityBasis; }
    public String getRoleKey() { return roleKey; }
    public void setRoleKey(String roleKey) { this.roleKey = roleKey; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
    public String getUpdatedBy() { return updatedBy; }
    public void setUpdatedBy(String updatedBy) { this.updatedBy = updatedBy; }
}
