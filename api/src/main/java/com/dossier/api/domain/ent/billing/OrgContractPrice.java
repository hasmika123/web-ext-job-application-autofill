package com.dossier.api.domain.ent.billing;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;
import java.time.LocalDate;

/** Contract price rows (23 s2.2): override_amount_minor REPLACES the list price. Never UPDATEd; an amendment closes it with version_to. Table {@code org_contract_price}; see docs/enterprise-v2/billing-data-foundation.md. Every query goes through an org-scoped repository method. */
@Entity
@Table(name = "org_contract_price")
public class OrgContractPrice implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", nullable = false)
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "contract_id", nullable = false)
    private Long contractId;

    @Column(name = "product_id", nullable = false)
    private Long productId;

    @Column(name = "version_from", nullable = false)
    private Integer versionFrom = 1;

    @Column(name = "version_to")
    private Integer versionTo;

    @Column(name = "override_amount_minor", nullable = false)
    private Long overrideAmountMinor;

    @Column(name = "currency", length = 3, nullable = false)
    private String currency = "USD";

    @Column(name = "allowance_override")
    private Long allowanceOverride;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getContractId() { return contractId; }
    public void setContractId(Long contractId) { this.contractId = contractId; }
    public Long getProductId() { return productId; }
    public void setProductId(Long productId) { this.productId = productId; }
    public Integer getVersionFrom() { return versionFrom; }
    public void setVersionFrom(Integer versionFrom) { this.versionFrom = versionFrom; }
    public Integer getVersionTo() { return versionTo; }
    public void setVersionTo(Integer versionTo) { this.versionTo = versionTo; }
    public Long getOverrideAmountMinor() { return overrideAmountMinor; }
    public void setOverrideAmountMinor(Long overrideAmountMinor) { this.overrideAmountMinor = overrideAmountMinor; }
    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }
    public Long getAllowanceOverride() { return allowanceOverride; }
    public void setAllowanceOverride(Long allowanceOverride) { this.allowanceOverride = allowanceOverride; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
