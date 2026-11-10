package com.dossier.api.domain.ent.billing;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;
import java.time.LocalDate;

/** Invoice line snapshot (description, quantity x unit = amount). Sum of lines = org_invoice.amount_minor. Table {@code org_invoice_line}; see docs/enterprise-v2/billing-data-foundation.md. Every query goes through an org-scoped repository method. */
@Entity
@Table(name = "org_invoice_line")
public class OrgInvoiceLine implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", nullable = false)
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "invoice_id", nullable = false)
    private Long invoiceId;

    @Column(name = "line_kind", length = 16, nullable = false)
    private String lineKind;

    @Column(name = "description", length = 200, nullable = false)
    private String description;

    @Column(name = "detail", length = 200)
    private String detail;

    @Column(name = "quantity", nullable = false)
    private Integer quantity = 1;

    @Column(name = "unit_amount_minor", nullable = false)
    private Long unitAmountMinor;

    @Column(name = "amount_minor", nullable = false)
    private Long amountMinor;

    @Column(name = "product_id")
    private Long productId;

    @Column(name = "feature_key", length = 60)
    private String featureKey;

    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder = 0;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getInvoiceId() { return invoiceId; }
    public void setInvoiceId(Long invoiceId) { this.invoiceId = invoiceId; }
    public String getLineKind() { return lineKind; }
    public void setLineKind(String lineKind) { this.lineKind = lineKind; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getDetail() { return detail; }
    public void setDetail(String detail) { this.detail = detail; }
    public Integer getQuantity() { return quantity; }
    public void setQuantity(Integer quantity) { this.quantity = quantity; }
    public Long getUnitAmountMinor() { return unitAmountMinor; }
    public void setUnitAmountMinor(Long unitAmountMinor) { this.unitAmountMinor = unitAmountMinor; }
    public Long getAmountMinor() { return amountMinor; }
    public void setAmountMinor(Long amountMinor) { this.amountMinor = amountMinor; }
    public Long getProductId() { return productId; }
    public void setProductId(Long productId) { this.productId = productId; }
    public String getFeatureKey() { return featureKey; }
    public void setFeatureKey(String featureKey) { this.featureKey = featureKey; }
    public Integer getSortOrder() { return sortOrder; }
    public void setSortOrder(Integer sortOrder) { this.sortOrder = sortOrder; }
}
