package com.dossier.api.domain.sub;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * A priced personal basket kept so checkout and confirm apply exactly the numbers the person saw (docs/subscriptions/08-data-model.md section 4.3).
 * {@code userId} is null for an anonymous pricing-page quote. {@code linesJson} holds the full PlanQuoteDTO plus the request it came from.
 */
@Entity
@Table(name = "subscription_quote")
public class SubscriptionQuote implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", nullable = false)
    private Long id;

    @Column(name = "user_id")
    private Long userId;

    @Column(name = "subscription_id")
    private Long subscriptionId;

    @Column(name = "kind", length = 12, nullable = false)
    private String kind;

    @Column(name = "plan_version_id", nullable = false)
    private Long planVersionId;

    @Column(name = "billing_interval", length = 10, nullable = false)
    private String billingInterval;

    @Column(name = "currency", length = 3, nullable = false, columnDefinition = "char(3)")
    private String currency;

    @Column(name = "catalog_version", nullable = false)
    private Integer catalogVersion;

    @Column(name = "promo_code", length = 40)
    private String promoCode;

    @Column(name = "inputs_hash", length = 64, nullable = false, columnDefinition = "char(64)")
    private String inputsHash;

    @Column(name = "lines_json", columnDefinition = "json", nullable = false)
    private String linesJson;

    @Column(name = "current_recurring_minor", nullable = false)
    private Long currentRecurringMinor;

    @Column(name = "proposed_recurring_minor", nullable = false)
    private Long proposedRecurringMinor;

    @Column(name = "delta_minor", nullable = false)
    private Long deltaMinor;

    @Column(name = "monthly_equivalent_minor", nullable = false)
    private Long monthlyEquivalentMinor;

    @Column(name = "savings_minor", nullable = false)
    private Long savingsMinor;

    @Column(name = "proration_estimate_minor", nullable = false)
    private Long prorationEstimateMinor;

    @Column(name = "next_invoice_estimate_minor")
    private Long nextInvoiceEstimateMinor;

    @Column(name = "tax_estimate_minor")
    private Long taxEstimateMinor;

    @Column(name = "tax_source", length = 16, nullable = false)
    private String taxSource;

    @Column(name = "effective_at")
    private Instant effectiveAt;

    @Column(name = "period_end_at")
    private Instant periodEndAt;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "status", length = 12, nullable = false)
    private String status;

    @Column(name = "applied_batch_id", length = 36, columnDefinition = "char(36)")
    private String appliedBatchId;

    @Column(name = "stripe_session_id")
    private String stripeSessionId;

    @Column(name = "warnings_json", columnDefinition = "json")
    private String warningsJson;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getUserId() {
        return userId;
    }

    public void setUserId(Long userId) {
        this.userId = userId;
    }

    public Long getSubscriptionId() {
        return subscriptionId;
    }

    public void setSubscriptionId(Long subscriptionId) {
        this.subscriptionId = subscriptionId;
    }

    public String getKind() {
        return kind;
    }

    public void setKind(String kind) {
        this.kind = kind;
    }

    public Long getPlanVersionId() {
        return planVersionId;
    }

    public void setPlanVersionId(Long planVersionId) {
        this.planVersionId = planVersionId;
    }

    public String getBillingInterval() {
        return billingInterval;
    }

    public void setBillingInterval(String billingInterval) {
        this.billingInterval = billingInterval;
    }

    public String getCurrency() {
        return currency;
    }

    public void setCurrency(String currency) {
        this.currency = currency;
    }

    public Integer getCatalogVersion() {
        return catalogVersion;
    }

    public void setCatalogVersion(Integer catalogVersion) {
        this.catalogVersion = catalogVersion;
    }

    public String getPromoCode() {
        return promoCode;
    }

    public void setPromoCode(String promoCode) {
        this.promoCode = promoCode;
    }

    public String getInputsHash() {
        return inputsHash;
    }

    public void setInputsHash(String inputsHash) {
        this.inputsHash = inputsHash;
    }

    public String getLinesJson() {
        return linesJson;
    }

    public void setLinesJson(String linesJson) {
        this.linesJson = linesJson;
    }

    public Long getCurrentRecurringMinor() {
        return currentRecurringMinor;
    }

    public void setCurrentRecurringMinor(Long currentRecurringMinor) {
        this.currentRecurringMinor = currentRecurringMinor;
    }

    public Long getProposedRecurringMinor() {
        return proposedRecurringMinor;
    }

    public void setProposedRecurringMinor(Long proposedRecurringMinor) {
        this.proposedRecurringMinor = proposedRecurringMinor;
    }

    public Long getDeltaMinor() {
        return deltaMinor;
    }

    public void setDeltaMinor(Long deltaMinor) {
        this.deltaMinor = deltaMinor;
    }

    public Long getMonthlyEquivalentMinor() {
        return monthlyEquivalentMinor;
    }

    public void setMonthlyEquivalentMinor(Long monthlyEquivalentMinor) {
        this.monthlyEquivalentMinor = monthlyEquivalentMinor;
    }

    public Long getSavingsMinor() {
        return savingsMinor;
    }

    public void setSavingsMinor(Long savingsMinor) {
        this.savingsMinor = savingsMinor;
    }

    public Long getProrationEstimateMinor() {
        return prorationEstimateMinor;
    }

    public void setProrationEstimateMinor(Long prorationEstimateMinor) {
        this.prorationEstimateMinor = prorationEstimateMinor;
    }

    public Long getNextInvoiceEstimateMinor() {
        return nextInvoiceEstimateMinor;
    }

    public void setNextInvoiceEstimateMinor(Long nextInvoiceEstimateMinor) {
        this.nextInvoiceEstimateMinor = nextInvoiceEstimateMinor;
    }

    public Long getTaxEstimateMinor() {
        return taxEstimateMinor;
    }

    public void setTaxEstimateMinor(Long taxEstimateMinor) {
        this.taxEstimateMinor = taxEstimateMinor;
    }

    public String getTaxSource() {
        return taxSource;
    }

    public void setTaxSource(String taxSource) {
        this.taxSource = taxSource;
    }

    public Instant getEffectiveAt() {
        return effectiveAt;
    }

    public void setEffectiveAt(Instant effectiveAt) {
        this.effectiveAt = effectiveAt;
    }

    public Instant getPeriodEndAt() {
        return periodEndAt;
    }

    public void setPeriodEndAt(Instant periodEndAt) {
        this.periodEndAt = periodEndAt;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public void setExpiresAt(Instant expiresAt) {
        this.expiresAt = expiresAt;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getAppliedBatchId() {
        return appliedBatchId;
    }

    public void setAppliedBatchId(String appliedBatchId) {
        this.appliedBatchId = appliedBatchId;
    }

    public String getStripeSessionId() {
        return stripeSessionId;
    }

    public void setStripeSessionId(String stripeSessionId) {
        this.stripeSessionId = stripeSessionId;
    }

    public String getWarningsJson() {
        return warningsJson;
    }

    public void setWarningsJson(String warningsJson) {
        this.warningsJson = warningsJson;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

}
