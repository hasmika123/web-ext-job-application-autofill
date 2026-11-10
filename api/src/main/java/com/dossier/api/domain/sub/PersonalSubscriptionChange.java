package com.dossier.api.domain.sub;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * One confirmed change to a personal subscription (docs/subscriptions/08-data-model.md section 4.3, the personal twin of the organization's subscription_change).
 * A batch groups the changes of one confirmed quote; {@code status} PENDING | APPLYING | APPLIED | CANCELLED | FAILED. A scheduled removal stays PENDING until its
 * effective date (and can be undone until then); an addition goes PENDING, APPLYING, APPLIED once Stripe has it.
 */
@Entity
@Table(name = "personal_subscription_change")
public class PersonalSubscriptionChange implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", nullable = false)
    private Long id;

    @Column(name = "subscription_id", nullable = false)
    private Long subscriptionId;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "quote_id")
    private Long quoteId;

    @Column(name = "batch_id", length = 36, nullable = false, columnDefinition = "char(36)")
    private String batchId;

    @Column(name = "kind", length = 20, nullable = false)
    private String kind;

    @Column(name = "feature_key", length = 60)
    private String featureKey;

    @Column(name = "product_id")
    private Long productId;

    @Column(name = "price_id")
    private Long priceId;

    @Column(name = "quantity_from")
    private Integer quantityFrom;

    @Column(name = "quantity_to")
    private Integer quantityTo;

    @Column(name = "plan_version_from")
    private Long planVersionFrom;

    @Column(name = "plan_version_to")
    private Long planVersionTo;

    @Column(name = "interval_from", length = 10)
    private String intervalFrom;

    @Column(name = "interval_to", length = 10)
    private String intervalTo;

    @Column(name = "payload_json", columnDefinition = "json")
    private String payloadJson;

    @Column(name = "effective_at", nullable = false)
    private Instant effectiveAt;

    @Column(name = "status", length = 12, nullable = false)
    private String status;

    @Column(name = "stripe_ref")
    private String stripeRef;

    @Column(name = "stripe_idempotency_key")
    private String stripeIdempotencyKey;

    @Column(name = "failed_reason", length = 500)
    private String failedReason;

    @Column(name = "attempts", nullable = false)
    private Integer attempts;

    @Column(name = "applied_at")
    private Instant appliedAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getSubscriptionId() {
        return subscriptionId;
    }

    public void setSubscriptionId(Long subscriptionId) {
        this.subscriptionId = subscriptionId;
    }

    public Long getUserId() {
        return userId;
    }

    public void setUserId(Long userId) {
        this.userId = userId;
    }

    public Long getQuoteId() {
        return quoteId;
    }

    public void setQuoteId(Long quoteId) {
        this.quoteId = quoteId;
    }

    public String getBatchId() {
        return batchId;
    }

    public void setBatchId(String batchId) {
        this.batchId = batchId;
    }

    public String getKind() {
        return kind;
    }

    public void setKind(String kind) {
        this.kind = kind;
    }

    public String getFeatureKey() {
        return featureKey;
    }

    public void setFeatureKey(String featureKey) {
        this.featureKey = featureKey;
    }

    public Long getProductId() {
        return productId;
    }

    public void setProductId(Long productId) {
        this.productId = productId;
    }

    public Long getPriceId() {
        return priceId;
    }

    public void setPriceId(Long priceId) {
        this.priceId = priceId;
    }

    public Integer getQuantityFrom() {
        return quantityFrom;
    }

    public void setQuantityFrom(Integer quantityFrom) {
        this.quantityFrom = quantityFrom;
    }

    public Integer getQuantityTo() {
        return quantityTo;
    }

    public void setQuantityTo(Integer quantityTo) {
        this.quantityTo = quantityTo;
    }

    public Long getPlanVersionFrom() {
        return planVersionFrom;
    }

    public void setPlanVersionFrom(Long planVersionFrom) {
        this.planVersionFrom = planVersionFrom;
    }

    public Long getPlanVersionTo() {
        return planVersionTo;
    }

    public void setPlanVersionTo(Long planVersionTo) {
        this.planVersionTo = planVersionTo;
    }

    public String getIntervalFrom() {
        return intervalFrom;
    }

    public void setIntervalFrom(String intervalFrom) {
        this.intervalFrom = intervalFrom;
    }

    public String getIntervalTo() {
        return intervalTo;
    }

    public void setIntervalTo(String intervalTo) {
        this.intervalTo = intervalTo;
    }

    public String getPayloadJson() {
        return payloadJson;
    }

    public void setPayloadJson(String payloadJson) {
        this.payloadJson = payloadJson;
    }

    public Instant getEffectiveAt() {
        return effectiveAt;
    }

    public void setEffectiveAt(Instant effectiveAt) {
        this.effectiveAt = effectiveAt;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getStripeRef() {
        return stripeRef;
    }

    public void setStripeRef(String stripeRef) {
        this.stripeRef = stripeRef;
    }

    public String getStripeIdempotencyKey() {
        return stripeIdempotencyKey;
    }

    public void setStripeIdempotencyKey(String stripeIdempotencyKey) {
        this.stripeIdempotencyKey = stripeIdempotencyKey;
    }

    public String getFailedReason() {
        return failedReason;
    }

    public void setFailedReason(String failedReason) {
        this.failedReason = failedReason;
    }

    public Integer getAttempts() {
        return attempts;
    }

    public void setAttempts(Integer attempts) {
        this.attempts = attempts;
    }

    public Instant getAppliedAt() {
        return appliedAt;
    }

    public void setAppliedAt(Instant appliedAt) {
        this.appliedAt = appliedAt;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

}
