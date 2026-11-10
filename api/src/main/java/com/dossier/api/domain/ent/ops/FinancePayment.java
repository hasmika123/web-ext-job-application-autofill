package com.dossier.api.domain.ent.ops;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;
import java.time.LocalDate;

/** A payment RECORD: IN = received from a client against an invoice, OUT = a consultant payout. Recorded, never moved (no bank data, no payment provider). Table {@code finance_payment}; see docs/enterprise-v2/ops-data-foundation.md. Every query goes through an org-scoped repository method. */
@Entity
@Table(name = "finance_payment")
public class FinancePayment implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "direction", length = 3, nullable = false)
    private String direction;

    @Column(name = "status", length = 20, nullable = false)
    private String status = "PENDING";

    @Column(name = "amount_minor", nullable = false)
    private Long amountMinor;

    @Column(name = "currency", length = 3, nullable = false)
    private String currency = "USD";

    @Column(name = "placement_id", nullable = false)
    private Long placementId;

    @Column(name = "consultant_id")
    private Long consultantId;

    @Column(name = "invoice_id")
    private Long invoiceId;

    @Column(name = "period_start", nullable = false)
    private LocalDate periodStart;

    @Column(name = "due_on")
    private LocalDate dueOn;

    @Column(name = "paid_on")
    private LocalDate paidOn;

    @Column(name = "method_label", length = 40)
    private String methodLabel;

    @Column(name = "memo", length = 120)
    private String memo;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public String getDirection() { return direction; }
    public void setDirection(String direction) { this.direction = direction; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public Long getAmountMinor() { return amountMinor; }
    public void setAmountMinor(Long amountMinor) { this.amountMinor = amountMinor; }
    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }
    public Long getPlacementId() { return placementId; }
    public void setPlacementId(Long placementId) { this.placementId = placementId; }
    public Long getConsultantId() { return consultantId; }
    public void setConsultantId(Long consultantId) { this.consultantId = consultantId; }
    public Long getInvoiceId() { return invoiceId; }
    public void setInvoiceId(Long invoiceId) { this.invoiceId = invoiceId; }
    public LocalDate getPeriodStart() { return periodStart; }
    public void setPeriodStart(LocalDate periodStart) { this.periodStart = periodStart; }
    public LocalDate getDueOn() { return dueOn; }
    public void setDueOn(LocalDate dueOn) { this.dueOn = dueOn; }
    public LocalDate getPaidOn() { return paidOn; }
    public void setPaidOn(LocalDate paidOn) { this.paidOn = paidOn; }
    public String getMethodLabel() { return methodLabel; }
    public void setMethodLabel(String methodLabel) { this.methodLabel = methodLabel; }
    public String getMemo() { return memo; }
    public void setMemo(String memo) { this.memo = memo; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
