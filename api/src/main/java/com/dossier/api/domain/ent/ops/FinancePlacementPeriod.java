package com.dossier.api.domain.ent.ops;

import jakarta.persistence.*;
import java.io.Serializable;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

/** The Placement Finance row: one placement in one calendar month (rate snapshot, hours, revenue, payout, margin, invoice status). The month series are sums over these rows. Table {@code finance_placement_period}; see docs/enterprise-v2/ops-data-foundation.md. Every query goes through an org-scoped repository method. */
@Entity
@Table(name = "finance_placement_period")
public class FinancePlacementPeriod implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "placement_id", nullable = false)
    private Long placementId;

    @Column(name = "client_id", nullable = false)
    private Long clientId;

    @Column(name = "consultant_id", nullable = false)
    private Long consultantId;

    @Column(name = "period_start", nullable = false)
    private LocalDate periodStart;

    @Column(name = "bill_rate_minor", nullable = false)
    private Long billRateMinor;

    @Column(name = "pay_rate_minor", nullable = false)
    private Long payRateMinor;

    @Column(name = "rate_unit", length = 10, nullable = false)
    private String rateUnit = "HOUR";

    @Column(name = "currency", length = 3, nullable = false)
    private String currency = "USD";

    @Column(name = "hours", precision = 9, scale = 2, nullable = false)
    private BigDecimal hours = BigDecimal.ZERO;

    @Column(name = "revenue_minor", nullable = false)
    private Long revenueMinor;

    @Column(name = "payout_minor", nullable = false)
    private Long payoutMinor;

    @Column(name = "margin_bps", nullable = false)
    private Integer marginBps = 0;

    @Column(name = "invoice_status", length = 20, nullable = false)
    private String invoiceStatus = "PENDING_INVOICE";

    @Column(name = "invoice_id")
    private Long invoiceId;

    @Column(name = "timesheet_id")
    private Long timesheetId;

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
    public Long getClientId() { return clientId; }
    public void setClientId(Long clientId) { this.clientId = clientId; }
    public Long getConsultantId() { return consultantId; }
    public void setConsultantId(Long consultantId) { this.consultantId = consultantId; }
    public LocalDate getPeriodStart() { return periodStart; }
    public void setPeriodStart(LocalDate periodStart) { this.periodStart = periodStart; }
    public Long getBillRateMinor() { return billRateMinor; }
    public void setBillRateMinor(Long billRateMinor) { this.billRateMinor = billRateMinor; }
    public Long getPayRateMinor() { return payRateMinor; }
    public void setPayRateMinor(Long payRateMinor) { this.payRateMinor = payRateMinor; }
    public String getRateUnit() { return rateUnit; }
    public void setRateUnit(String rateUnit) { this.rateUnit = rateUnit; }
    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }
    public BigDecimal getHours() { return hours; }
    public void setHours(BigDecimal hours) { this.hours = hours; }
    public Long getRevenueMinor() { return revenueMinor; }
    public void setRevenueMinor(Long revenueMinor) { this.revenueMinor = revenueMinor; }
    public Long getPayoutMinor() { return payoutMinor; }
    public void setPayoutMinor(Long payoutMinor) { this.payoutMinor = payoutMinor; }
    public Integer getMarginBps() { return marginBps; }
    public void setMarginBps(Integer marginBps) { this.marginBps = marginBps; }
    public String getInvoiceStatus() { return invoiceStatus; }
    public void setInvoiceStatus(String invoiceStatus) { this.invoiceStatus = invoiceStatus; }
    public Long getInvoiceId() { return invoiceId; }
    public void setInvoiceId(Long invoiceId) { this.invoiceId = invoiceId; }
    public Long getTimesheetId() { return timesheetId; }
    public void setTimesheetId(Long timesheetId) { this.timesheetId = timesheetId; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
