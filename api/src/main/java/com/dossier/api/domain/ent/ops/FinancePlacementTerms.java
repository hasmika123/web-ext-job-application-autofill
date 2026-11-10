package com.dossier.api.domain.ent.ops;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/** Finance terms of a placement that talent_placement does not carry: pay rate, account manager, payment terms. Rates are records, never money movement. Table {@code finance_placement_terms}; see docs/enterprise-v2/ops-data-foundation.md. Every query goes through an org-scoped repository method. */
@Entity
@Table(name = "finance_placement_terms")
public class FinancePlacementTerms implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "placement_id", nullable = false)
    private Long placementId;

    @Column(name = "pay_rate_minor", nullable = false)
    private Long payRateMinor;

    @Column(name = "rate_unit", length = 10, nullable = false)
    private String rateUnit = "HOUR";

    @Column(name = "currency", length = 3, nullable = false)
    private String currency = "USD";

    @Column(name = "account_manager_member_id")
    private Long accountManagerMemberId;

    @Column(name = "terms_days", nullable = false)
    private Integer termsDays = 30;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @PreUpdate
    void touch() {
        updatedAt = Instant.now();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getPlacementId() { return placementId; }
    public void setPlacementId(Long placementId) { this.placementId = placementId; }
    public Long getPayRateMinor() { return payRateMinor; }
    public void setPayRateMinor(Long payRateMinor) { this.payRateMinor = payRateMinor; }
    public String getRateUnit() { return rateUnit; }
    public void setRateUnit(String rateUnit) { this.rateUnit = rateUnit; }
    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }
    public Long getAccountManagerMemberId() { return accountManagerMemberId; }
    public void setAccountManagerMemberId(Long accountManagerMemberId) { this.accountManagerMemberId = accountManagerMemberId; }
    public Integer getTermsDays() { return termsDays; }
    public void setTermsDays(Integer termsDays) { this.termsDays = termsDays; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
