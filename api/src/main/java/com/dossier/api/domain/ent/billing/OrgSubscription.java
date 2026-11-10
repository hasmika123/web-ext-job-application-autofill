package com.dossier.api.domain.ent.billing;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;
import java.time.LocalDate;

/** Subscription mirror: plan name/description/status, committed licensed_capacity (150), period. Written only by the webhook handler / local applier. Table {@code org_subscription}; see docs/enterprise-v2/billing-data-foundation.md. Every query goes through an org-scoped repository method. */
@Entity
@Table(name = "org_subscription")
public class OrgSubscription implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", nullable = false)
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "status", length = 12, nullable = false)
    private String status = "ACTIVE";

    @Column(name = "plan_code", length = 40, nullable = false)
    private String planCode;

    @Column(name = "plan_name", length = 80, nullable = false)
    private String planName;

    @Column(name = "plan_description", length = 300)
    private String planDescription;

    @Column(name = "plan_product_id")
    private Long planProductId;

    @Column(name = "unit_amount_minor", nullable = false)
    private Long unitAmountMinor;

    @Column(name = "currency", length = 3, nullable = false)
    private String currency = "USD";

    @Column(name = "billing_interval", length = 10, nullable = false)
    private String billingInterval = "MONTH";

    @Column(name = "licensed_capacity", nullable = false)
    private Integer licensedCapacity = 0;

    @Column(name = "current_period_start")
    private LocalDate currentPeriodStart;

    @Column(name = "current_period_end")
    private LocalDate currentPeriodEnd;

    @Column(name = "cancel_at_period_end", nullable = false)
    private Boolean cancelAtPeriodEnd = false;

    @Column(name = "source", length = 10, nullable = false)
    private String source = "LOCAL";

    @Column(name = "last_event_at")
    private Instant lastEventAt;

    @Column(name = "demo_data", nullable = false)
    private Boolean demoData = false;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getPlanCode() { return planCode; }
    public void setPlanCode(String planCode) { this.planCode = planCode; }
    public String getPlanName() { return planName; }
    public void setPlanName(String planName) { this.planName = planName; }
    public String getPlanDescription() { return planDescription; }
    public void setPlanDescription(String planDescription) { this.planDescription = planDescription; }
    public Long getPlanProductId() { return planProductId; }
    public void setPlanProductId(Long planProductId) { this.planProductId = planProductId; }
    public Long getUnitAmountMinor() { return unitAmountMinor; }
    public void setUnitAmountMinor(Long unitAmountMinor) { this.unitAmountMinor = unitAmountMinor; }
    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }
    public String getBillingInterval() { return billingInterval; }
    public void setBillingInterval(String billingInterval) { this.billingInterval = billingInterval; }
    public Integer getLicensedCapacity() { return licensedCapacity; }
    public void setLicensedCapacity(Integer licensedCapacity) { this.licensedCapacity = licensedCapacity; }
    public LocalDate getCurrentPeriodStart() { return currentPeriodStart; }
    public void setCurrentPeriodStart(LocalDate currentPeriodStart) { this.currentPeriodStart = currentPeriodStart; }
    public LocalDate getCurrentPeriodEnd() { return currentPeriodEnd; }
    public void setCurrentPeriodEnd(LocalDate currentPeriodEnd) { this.currentPeriodEnd = currentPeriodEnd; }
    public Boolean getCancelAtPeriodEnd() { return cancelAtPeriodEnd; }
    public void setCancelAtPeriodEnd(Boolean cancelAtPeriodEnd) { this.cancelAtPeriodEnd = cancelAtPeriodEnd; }
    public String getSource() { return source; }
    public void setSource(String source) { this.source = source; }
    public Instant getLastEventAt() { return lastEventAt; }
    public void setLastEventAt(Instant lastEventAt) { this.lastEventAt = lastEventAt; }
    public Boolean getDemoData() { return demoData; }
    public void setDemoData(Boolean demoData) { this.demoData = demoData; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
