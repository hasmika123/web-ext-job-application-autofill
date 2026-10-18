package com.dossier.api.domain.ent.billing;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;
import java.time.LocalDate;

/** Transactions tab: charges and manually recorded payments (we record money, never move it). Success rate = SUCCEEDED / (SUCCEEDED + FAILED). Table {@code org_payment}; see docs/enterprise-v2/billing-data-foundation.md. Every query goes through an org-scoped repository method. */
@Entity
@Table(name = "org_payment")
public class OrgPayment implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", nullable = false)
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "invoice_id", nullable = false)
    private Long invoiceId;

    @Column(name = "payment_method_id")
    private Long paymentMethodId;

    @Column(name = "amount_minor", nullable = false)
    private Long amountMinor;

    @Column(name = "currency", length = 3, nullable = false)
    private String currency = "USD";

    @Column(name = "status", length = 12, nullable = false)
    private String status;

    @Column(name = "kind", length = 14, nullable = false)
    private String kind = "CHARGE";

    @Column(name = "provider_ref", length = 80)
    private String providerRef;

    @Column(name = "failure_reason", length = 80)
    private String failureReason;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt;

    @Column(name = "recorded_by_member_id")
    private Long recordedByMemberId;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getInvoiceId() { return invoiceId; }
    public void setInvoiceId(Long invoiceId) { this.invoiceId = invoiceId; }
    public Long getPaymentMethodId() { return paymentMethodId; }
    public void setPaymentMethodId(Long paymentMethodId) { this.paymentMethodId = paymentMethodId; }
    public Long getAmountMinor() { return amountMinor; }
    public void setAmountMinor(Long amountMinor) { this.amountMinor = amountMinor; }
    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getKind() { return kind; }
    public void setKind(String kind) { this.kind = kind; }
    public String getProviderRef() { return providerRef; }
    public void setProviderRef(String providerRef) { this.providerRef = providerRef; }
    public String getFailureReason() { return failureReason; }
    public void setFailureReason(String failureReason) { this.failureReason = failureReason; }
    public Instant getOccurredAt() { return occurredAt; }
    public void setOccurredAt(Instant occurredAt) { this.occurredAt = occurredAt; }
    public Long getRecordedByMemberId() { return recordedByMemberId; }
    public void setRecordedByMemberId(Long recordedByMemberId) { this.recordedByMemberId = recordedByMemberId; }
}
