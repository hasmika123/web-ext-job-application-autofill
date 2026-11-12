package com.dossier.api.domain.ent.billing;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;
import java.time.LocalDate;

/** One billing account per org (26 s2). Mirror written by webhooks (source STRIPE) or the local applier (source LOCAL). Table {@code org_billing_account}; see docs/enterprise-v2/billing-data-foundation.md. Every query goes through an org-scoped repository method. */
@Entity
@Table(name = "org_billing_account")
public class OrgBillingAccount implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", nullable = false)
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "currency", length = 3, nullable = false)
    private String currency = "USD";

    @Column(name = "billing_email", length = 254)
    private String billingEmail;

    @Column(name = "collection_method", length = 24, nullable = false)
    private String collectionMethod = "SEND_INVOICE";

    @Column(name = "status", length = 12, nullable = false)
    private String status = "ACTIVE";

    @Column(name = "billing_cycle", length = 10, nullable = false)
    private String billingCycle = "MONTH";

    @Column(name = "current_period_start")
    private LocalDate currentPeriodStart;

    @Column(name = "current_period_end")
    private LocalDate currentPeriodEnd;

    @Column(name = "next_invoice_on")
    private LocalDate nextInvoiceOn;

    @Column(name = "paid_through_on")
    private LocalDate paidThroughOn;

    @Column(name = "default_payment_method_id")
    private Long defaultPaymentMethodId;

    @Column(name = "seats_purchased", nullable = false)
    private Integer seatsPurchased = 0;

    @Column(name = "source", length = 10, nullable = false)
    private String source = "LOCAL";

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @Column(name = "stripe_customer_id", length = 64)
    private String stripeCustomerId;

    @Column(name = "setup_fee_status", length = 12)
    private String setupFeeStatus;

    @Column(name = "setup_fee_amount_minor")
    private Long setupFeeAmountMinor;

    @Column(name = "setup_fee_item_id", length = 64)
    private String setupFeeItemId;

    @Column(name = "setup_fee_note", length = 200)
    private String setupFeeNote;

    @Column(name = "started_by_login", length = 100)
    private String startedByLogin;

    @Column(name = "started_at")
    private java.time.Instant startedAt;

    @Column(name = "features_paused_from")
    private java.time.LocalDate featuresPausedFrom;

    @Column(name = "last_reminder_at")
    private java.time.Instant lastReminderAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }
    public String getBillingEmail() { return billingEmail; }
    public void setBillingEmail(String billingEmail) { this.billingEmail = billingEmail; }
    public String getCollectionMethod() { return collectionMethod; }
    public void setCollectionMethod(String collectionMethod) { this.collectionMethod = collectionMethod; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getBillingCycle() { return billingCycle; }
    public void setBillingCycle(String billingCycle) { this.billingCycle = billingCycle; }
    public LocalDate getCurrentPeriodStart() { return currentPeriodStart; }
    public void setCurrentPeriodStart(LocalDate currentPeriodStart) { this.currentPeriodStart = currentPeriodStart; }
    public LocalDate getCurrentPeriodEnd() { return currentPeriodEnd; }
    public void setCurrentPeriodEnd(LocalDate currentPeriodEnd) { this.currentPeriodEnd = currentPeriodEnd; }
    public LocalDate getNextInvoiceOn() { return nextInvoiceOn; }
    public void setNextInvoiceOn(LocalDate nextInvoiceOn) { this.nextInvoiceOn = nextInvoiceOn; }
    public LocalDate getPaidThroughOn() { return paidThroughOn; }
    public void setPaidThroughOn(LocalDate paidThroughOn) { this.paidThroughOn = paidThroughOn; }
    public Long getDefaultPaymentMethodId() { return defaultPaymentMethodId; }
    public void setDefaultPaymentMethodId(Long defaultPaymentMethodId) { this.defaultPaymentMethodId = defaultPaymentMethodId; }
    public Integer getSeatsPurchased() { return seatsPurchased; }
    public void setSeatsPurchased(Integer seatsPurchased) { this.seatsPurchased = seatsPurchased; }
    public String getSource() { return source; }
    public void setSource(String source) { this.source = source; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
    public String getStripeCustomerId() { return stripeCustomerId; }
    public void setStripeCustomerId(String stripeCustomerId) { this.stripeCustomerId = stripeCustomerId; }
    public String getSetupFeeStatus() { return setupFeeStatus; }
    public void setSetupFeeStatus(String setupFeeStatus) { this.setupFeeStatus = setupFeeStatus; }
    public Long getSetupFeeAmountMinor() { return setupFeeAmountMinor; }
    public void setSetupFeeAmountMinor(Long setupFeeAmountMinor) { this.setupFeeAmountMinor = setupFeeAmountMinor; }
    public String getSetupFeeItemId() { return setupFeeItemId; }
    public void setSetupFeeItemId(String setupFeeItemId) { this.setupFeeItemId = setupFeeItemId; }
    public String getSetupFeeNote() { return setupFeeNote; }
    public void setSetupFeeNote(String setupFeeNote) { this.setupFeeNote = setupFeeNote; }
    public String getStartedByLogin() { return startedByLogin; }
    public void setStartedByLogin(String startedByLogin) { this.startedByLogin = startedByLogin; }
    public java.time.Instant getStartedAt() { return startedAt; }
    public void setStartedAt(java.time.Instant startedAt) { this.startedAt = startedAt; }
    public java.time.LocalDate getFeaturesPausedFrom() { return featuresPausedFrom; }
    public void setFeaturesPausedFrom(java.time.LocalDate featuresPausedFrom) { this.featuresPausedFrom = featuresPausedFrom; }
    public java.time.Instant getLastReminderAt() { return lastReminderAt; }
    public void setLastReminderAt(java.time.Instant lastReminderAt) { this.lastReminderAt = lastReminderAt; }
}
