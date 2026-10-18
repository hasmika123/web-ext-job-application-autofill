package com.dossier.api.domain.ent.billing;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;
import java.time.LocalDate;

/** One row per product on the subscription (the 'License Packages and Add-ons' table): quantity = licensed, capacity = purchased (null = n/a). Table {@code org_subscription_item}; see docs/enterprise-v2/billing-data-foundation.md. Every query goes through an org-scoped repository method. */
@Entity
@Table(name = "org_subscription_item")
public class OrgSubscriptionItem implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", nullable = false)
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "subscription_id", nullable = false)
    private Long subscriptionId;

    @Column(name = "product_id", nullable = false)
    private Long productId;

    @Column(name = "kind", length = 20, nullable = false)
    private String kind;

    @Column(name = "label", length = 120, nullable = false)
    private String label;

    @Column(name = "detail", length = 200)
    private String detail;

    @Column(name = "unit_amount_minor", nullable = false)
    private Long unitAmountMinor;

    @Column(name = "currency", length = 3, nullable = false)
    private String currency = "USD";

    @Column(name = "quantity", nullable = false)
    private Integer quantity = 0;

    @Column(name = "capacity")
    private Integer capacity;

    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder = 0;

    @Column(name = "source", length = 10, nullable = false)
    private String source = "LOCAL";

    @Column(name = "contract_price_id")
    private Long contractPriceId;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getSubscriptionId() { return subscriptionId; }
    public void setSubscriptionId(Long subscriptionId) { this.subscriptionId = subscriptionId; }
    public Long getProductId() { return productId; }
    public void setProductId(Long productId) { this.productId = productId; }
    public String getKind() { return kind; }
    public void setKind(String kind) { this.kind = kind; }
    public String getLabel() { return label; }
    public void setLabel(String label) { this.label = label; }
    public String getDetail() { return detail; }
    public void setDetail(String detail) { this.detail = detail; }
    public Long getUnitAmountMinor() { return unitAmountMinor; }
    public void setUnitAmountMinor(Long unitAmountMinor) { this.unitAmountMinor = unitAmountMinor; }
    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }
    public Integer getQuantity() { return quantity; }
    public void setQuantity(Integer quantity) { this.quantity = quantity; }
    public Integer getCapacity() { return capacity; }
    public void setCapacity(Integer capacity) { this.capacity = capacity; }
    public Integer getSortOrder() { return sortOrder; }
    public void setSortOrder(Integer sortOrder) { this.sortOrder = sortOrder; }
    public String getSource() { return source; }
    public void setSource(String source) { this.source = source; }
    public Long getContractPriceId() { return contractPriceId; }
    public void setContractPriceId(Long contractPriceId) { this.contractPriceId = contractPriceId; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
