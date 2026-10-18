package com.dossier.api.domain.sub;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * One add-on a subscriber holds beyond the plan base (docs/subscriptions/08-data-model.md section 4.2): at most one LIVE row per (subscription, feature).
 * {@code quantity} is what the subscriber is entitled to now; {@code endsAt} marks a scheduled removal (the add-on works until then, no refund). Written by the
 * webhook mirror and the change service only. Platform data keyed by user, no org_id: an enterprise account never has one.
 */
@Entity
@Table(name = "subscription_addon")
public class SubscriptionAddon implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", nullable = false)
    private Long id;

    @Column(name = "subscription_id", nullable = false)
    private Long subscriptionId;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "feature_key", length = 60, nullable = false)
    private String featureKey;

    @Column(name = "product_id", nullable = false)
    private Long productId;

    @Column(name = "price_id", nullable = false)
    private Long priceId;

    @Column(name = "quantity", nullable = false)
    private Integer quantity;

    @Column(name = "allowance_override")
    private Long allowanceOverride;

    @Column(name = "stripe_item_id")
    private String stripeItemId;

    @Column(name = "starts_at", nullable = false)
    private Instant startsAt;

    @Column(name = "ends_at")
    private Instant endsAt;

    @Column(name = "live", nullable = false)
    private boolean live;

    @Column(name = "change_id")
    private Long changeId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

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

    public Integer getQuantity() {
        return quantity;
    }

    public void setQuantity(Integer quantity) {
        this.quantity = quantity;
    }

    public Long getAllowanceOverride() {
        return allowanceOverride;
    }

    public void setAllowanceOverride(Long allowanceOverride) {
        this.allowanceOverride = allowanceOverride;
    }

    public String getStripeItemId() {
        return stripeItemId;
    }

    public void setStripeItemId(String stripeItemId) {
        this.stripeItemId = stripeItemId;
    }

    public Instant getStartsAt() {
        return startsAt;
    }

    public void setStartsAt(Instant startsAt) {
        this.startsAt = startsAt;
    }

    public Instant getEndsAt() {
        return endsAt;
    }

    public void setEndsAt(Instant endsAt) {
        this.endsAt = endsAt;
    }

    public boolean isLive() {
        return live;
    }

    public void setLive(boolean live) {
        this.live = live;
    }

    public Long getChangeId() {
        return changeId;
    }

    public void setChangeId(Long changeId) {
        this.changeId = changeId;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }

}
