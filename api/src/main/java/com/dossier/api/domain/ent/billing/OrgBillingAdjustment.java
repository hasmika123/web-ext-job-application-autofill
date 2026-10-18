package com.dossier.api.domain.ent.billing;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;
import java.time.LocalDate;

/** Signed adjustment (CREDIT negative, DEBIT/DISCOUNT per kind) that lands on the next invoice when PENDING or on applied_invoice_id when APPLIED. Table {@code org_billing_adjustment}; see docs/enterprise-v2/billing-data-foundation.md. Every query goes through an org-scoped repository method. */
@Entity
@Table(name = "org_billing_adjustment")
public class OrgBillingAdjustment implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", nullable = false)
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "kind", length = 12, nullable = false)
    private String kind;

    @Column(name = "amount_minor", nullable = false)
    private Long amountMinor;

    @Column(name = "currency", length = 3, nullable = false)
    private String currency = "USD";

    @Column(name = "reason", length = 200, nullable = false)
    private String reason;

    @Column(name = "status", length = 12, nullable = false)
    private String status = "PENDING";

    @Column(name = "applied_invoice_id")
    private Long appliedInvoiceId;

    @Column(name = "created_by_member_id")
    private Long createdByMemberId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "applied_at")
    private Instant appliedAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public String getKind() { return kind; }
    public void setKind(String kind) { this.kind = kind; }
    public Long getAmountMinor() { return amountMinor; }
    public void setAmountMinor(Long amountMinor) { this.amountMinor = amountMinor; }
    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }
    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public Long getAppliedInvoiceId() { return appliedInvoiceId; }
    public void setAppliedInvoiceId(Long appliedInvoiceId) { this.appliedInvoiceId = appliedInvoiceId; }
    public Long getCreatedByMemberId() { return createdByMemberId; }
    public void setCreatedByMemberId(Long createdByMemberId) { this.createdByMemberId = createdByMemberId; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getAppliedAt() { return appliedAt; }
    public void setAppliedAt(Instant appliedAt) { this.appliedAt = appliedAt; }
}
