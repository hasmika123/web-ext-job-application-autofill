package com.dossier.api.domain.billing;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * One line of a mirrored personal invoice (docs/subscriptions/08-data-model.md section 4.4, story K8.3): a snapshot with the catalog price, plan version
 * and service it was sold as, so the line stays explainable after the catalog moves on. {@code lineKind} is BASE, ADDON, PRORATION, DISCOUNT, TAX, CREDIT
 * or OTHER.
 */
@Entity
@Table(name = "invoice_line")
public class InvoiceLine implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final String BASE = "BASE";
    public static final String ADDON = "ADDON";
    public static final String PRORATION = "PRORATION";
    public static final String DISCOUNT = "DISCOUNT";
    public static final String TAX = "TAX";
    public static final String CREDIT = "CREDIT";
    public static final String OTHER = "OTHER";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", nullable = false)
    private Long id;

    @Column(name = "invoice_id", nullable = false)
    private Long invoiceId;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "stripe_line_id", length = 255)
    private String stripeLineId;

    @Column(name = "line_kind", length = 12, nullable = false)
    private String lineKind;

    @Column(name = "price_id")
    private Long priceId;

    @Column(name = "stripe_price_id", length = 255)
    private String stripePriceId;

    @Column(name = "plan_version_id")
    private Long planVersionId;

    @Column(name = "feature_key", length = 60)
    private String featureKey;

    @Column(name = "description", length = 500)
    private String description;

    @Column(name = "quantity", nullable = false)
    private int quantity = 1;

    @Column(name = "unit_amount_minor", nullable = false)
    private long unitAmountMinor;

    @Column(name = "amount_minor", nullable = false)
    private long amountMinor;

    @Column(name = "period_start")
    private Instant periodStart;

    @Column(name = "period_end")
    private Instant periodEnd;

    @Column(name = "proration", nullable = false)
    private boolean proration;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getInvoiceId() { return invoiceId; }
    public void setInvoiceId(Long invoiceId) { this.invoiceId = invoiceId; }
    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
    public String getStripeLineId() { return stripeLineId; }
    public void setStripeLineId(String stripeLineId) { this.stripeLineId = stripeLineId; }
    public String getLineKind() { return lineKind; }
    public void setLineKind(String lineKind) { this.lineKind = lineKind; }
    public Long getPriceId() { return priceId; }
    public void setPriceId(Long priceId) { this.priceId = priceId; }
    public String getStripePriceId() { return stripePriceId; }
    public void setStripePriceId(String stripePriceId) { this.stripePriceId = stripePriceId; }
    public Long getPlanVersionId() { return planVersionId; }
    public void setPlanVersionId(Long planVersionId) { this.planVersionId = planVersionId; }
    public String getFeatureKey() { return featureKey; }
    public void setFeatureKey(String featureKey) { this.featureKey = featureKey; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public int getQuantity() { return quantity; }
    public void setQuantity(int quantity) { this.quantity = quantity; }
    public long getUnitAmountMinor() { return unitAmountMinor; }
    public void setUnitAmountMinor(long unitAmountMinor) { this.unitAmountMinor = unitAmountMinor; }
    public long getAmountMinor() { return amountMinor; }
    public void setAmountMinor(long amountMinor) { this.amountMinor = amountMinor; }
    public Instant getPeriodStart() { return periodStart; }
    public void setPeriodStart(Instant periodStart) { this.periodStart = periodStart; }
    public Instant getPeriodEnd() { return periodEnd; }
    public void setPeriodEnd(Instant periodEnd) { this.periodEnd = periodEnd; }
    public boolean isProration() { return proration; }
    public void setProration(boolean proration) { this.proration = proration; }
    public int getSortOrder() { return sortOrder; }
    public void setSortOrder(int sortOrder) { this.sortOrder = sortOrder; }
}
