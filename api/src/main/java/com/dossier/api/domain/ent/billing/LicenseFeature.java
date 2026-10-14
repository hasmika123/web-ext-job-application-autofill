package com.dossier.api.domain.ent.billing;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;
import java.time.LocalDate;

/** An add-on feature on a license, priced per consultant per month (price pinned as unit_amount_minor). One live row per (license, feature). Table {@code license_feature}; see docs/enterprise-v2/billing-data-foundation.md. Every query goes through an org-scoped repository method. */
@Entity
@Table(name = "license_feature")
public class LicenseFeature implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", nullable = false)
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "license_id", nullable = false)
    private Long licenseId;

    @Column(name = "feature_key", length = 60, nullable = false)
    private String featureKey;

    @Column(name = "product_id", nullable = false)
    private Long productId;

    @Column(name = "contract_price_id")
    private Long contractPriceId;

    @Column(name = "unit_amount_minor", nullable = false)
    private Long unitAmountMinor;

    @Column(name = "quantity", nullable = false)
    private Integer quantity = 1;

    @Column(name = "allowance_override")
    private Long allowanceOverride;

    @Column(name = "starts_at", nullable = false)
    private Instant startsAt;

    @Column(name = "ends_at")
    private Instant endsAt;

    @Column(name = "live", nullable = false)
    private Boolean live = true;

    @Column(name = "added_by_member_id")
    private Long addedByMemberId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getLicenseId() { return licenseId; }
    public void setLicenseId(Long licenseId) { this.licenseId = licenseId; }
    public String getFeatureKey() { return featureKey; }
    public void setFeatureKey(String featureKey) { this.featureKey = featureKey; }
    public Long getProductId() { return productId; }
    public void setProductId(Long productId) { this.productId = productId; }
    public Long getContractPriceId() { return contractPriceId; }
    public void setContractPriceId(Long contractPriceId) { this.contractPriceId = contractPriceId; }
    public Long getUnitAmountMinor() { return unitAmountMinor; }
    public void setUnitAmountMinor(Long unitAmountMinor) { this.unitAmountMinor = unitAmountMinor; }
    public Integer getQuantity() { return quantity; }
    public void setQuantity(Integer quantity) { this.quantity = quantity; }
    public Long getAllowanceOverride() { return allowanceOverride; }
    public void setAllowanceOverride(Long allowanceOverride) { this.allowanceOverride = allowanceOverride; }
    public Instant getStartsAt() { return startsAt; }
    public void setStartsAt(Instant startsAt) { this.startsAt = startsAt; }
    public Instant getEndsAt() { return endsAt; }
    public void setEndsAt(Instant endsAt) { this.endsAt = endsAt; }
    public Boolean getLive() { return live; }
    public void setLive(Boolean live) { this.live = live; }
    public Long getAddedByMemberId() { return addedByMemberId; }
    public void setAddedByMemberId(Long addedByMemberId) { this.addedByMemberId = addedByMemberId; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
