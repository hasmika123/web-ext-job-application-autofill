package com.dossier.api.domain.ent.ops;

import jakarta.persistence.*;
import java.io.Serializable;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

/** Forecast tab inputs per future month (assumptions the page multiplies with the current run rate). Table {@code finance_forecast_input}; see docs/enterprise-v2/ops-data-foundation.md. Every query goes through an org-scoped repository method. */
@Entity
@Table(name = "finance_forecast_input")
public class FinanceForecastInput implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "month_start", nullable = false)
    private LocalDate monthStart;

    @Column(name = "expected_placements", nullable = false)
    private Integer expectedPlacements = 0;

    @Column(name = "expected_hours_per_placement", precision = 9, scale = 2, nullable = false)
    private BigDecimal expectedHoursPerPlacement = BigDecimal.ZERO;

    @Column(name = "bill_rate_change_bps", nullable = false)
    private Integer billRateChangeBps = 0;

    @Column(name = "pay_rate_change_bps", nullable = false)
    private Integer payRateChangeBps = 0;

    @Column(name = "notes", length = 200)
    private String notes;

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
    public LocalDate getMonthStart() { return monthStart; }
    public void setMonthStart(LocalDate monthStart) { this.monthStart = monthStart; }
    public Integer getExpectedPlacements() { return expectedPlacements; }
    public void setExpectedPlacements(Integer expectedPlacements) { this.expectedPlacements = expectedPlacements; }
    public BigDecimal getExpectedHoursPerPlacement() { return expectedHoursPerPlacement; }
    public void setExpectedHoursPerPlacement(BigDecimal expectedHoursPerPlacement) { this.expectedHoursPerPlacement = expectedHoursPerPlacement; }
    public Integer getBillRateChangeBps() { return billRateChangeBps; }
    public void setBillRateChangeBps(Integer billRateChangeBps) { this.billRateChangeBps = billRateChangeBps; }
    public Integer getPayRateChangeBps() { return payRateChangeBps; }
    public void setPayRateChangeBps(Integer payRateChangeBps) { this.payRateChangeBps = payRateChangeBps; }
    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
