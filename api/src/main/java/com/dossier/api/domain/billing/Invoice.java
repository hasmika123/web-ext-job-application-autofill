package com.dossier.api.domain.billing;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * A personal invoice, mirrored from Stripe's {@code invoice.*} webhooks (docs/subscriptions/08-data-model.md section 4.4, story K8.3). The webhook is the
 * only writer; the row is a snapshot we own, so history never depends on the live catalog. {@code userId} is nulled (pseudonymised) when the account is
 * deleted, the money record stays. Money is minor units.
 */
@Entity
@Table(name = "invoice")
public class Invoice implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", nullable = false)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "subscription_id")
    private Long subscriptionId;

    @Column(name = "stripe_invoice_id", length = 255, nullable = false)
    private String stripeInvoiceId;

    @Column(name = "stripe_subscription_id", length = 255)
    private String stripeSubscriptionId;

    @Column(name = "number", length = 64)
    private String number;

    @Column(name = "status", length = 20, nullable = false)
    private String status;

    @Column(name = "billing_reason", length = 40)
    private String billingReason;

    @Column(name = "currency", length = 3, nullable = false, columnDefinition = "char(3)")
    private String currency;

    @Column(name = "amount_due_minor", nullable = false)
    private long amountDueMinor;

    @Column(name = "amount_paid_minor", nullable = false)
    private long amountPaidMinor;

    @Column(name = "tax_minor", nullable = false)
    private long taxMinor;

    @Column(name = "discount_minor", nullable = false)
    private long discountMinor;

    @Column(name = "amount_refunded_minor", nullable = false)
    private long amountRefundedMinor;

    @Column(name = "period_start")
    private Instant periodStart;

    @Column(name = "period_end")
    private Instant periodEnd;

    @Column(name = "paid_at")
    private Instant paidAt;

    @Column(name = "attempt_count", nullable = false)
    private int attemptCount;

    @Column(name = "next_payment_attempt")
    private Instant nextPaymentAttempt;

    @Column(name = "hosted_invoice_url", length = 1024)
    private String hostedInvoiceUrl;

    @Column(name = "invoice_pdf_url", length = 1024)
    private String invoicePdfUrl;

    @Column(name = "disputed", nullable = false)
    private boolean disputed;

    @Column(name = "last_event_at", nullable = false)
    private Instant lastEventAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
    public Long getSubscriptionId() { return subscriptionId; }
    public void setSubscriptionId(Long subscriptionId) { this.subscriptionId = subscriptionId; }
    public String getStripeInvoiceId() { return stripeInvoiceId; }
    public void setStripeInvoiceId(String stripeInvoiceId) { this.stripeInvoiceId = stripeInvoiceId; }
    public String getStripeSubscriptionId() { return stripeSubscriptionId; }
    public void setStripeSubscriptionId(String stripeSubscriptionId) { this.stripeSubscriptionId = stripeSubscriptionId; }
    public String getNumber() { return number; }
    public void setNumber(String number) { this.number = number; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getBillingReason() { return billingReason; }
    public void setBillingReason(String billingReason) { this.billingReason = billingReason; }
    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }
    public long getAmountDueMinor() { return amountDueMinor; }
    public void setAmountDueMinor(long amountDueMinor) { this.amountDueMinor = amountDueMinor; }
    public long getAmountPaidMinor() { return amountPaidMinor; }
    public void setAmountPaidMinor(long amountPaidMinor) { this.amountPaidMinor = amountPaidMinor; }
    public long getTaxMinor() { return taxMinor; }
    public void setTaxMinor(long taxMinor) { this.taxMinor = taxMinor; }
    public long getDiscountMinor() { return discountMinor; }
    public void setDiscountMinor(long discountMinor) { this.discountMinor = discountMinor; }
    public long getAmountRefundedMinor() { return amountRefundedMinor; }
    public void setAmountRefundedMinor(long amountRefundedMinor) { this.amountRefundedMinor = amountRefundedMinor; }
    public Instant getPeriodStart() { return periodStart; }
    public void setPeriodStart(Instant periodStart) { this.periodStart = periodStart; }
    public Instant getPeriodEnd() { return periodEnd; }
    public void setPeriodEnd(Instant periodEnd) { this.periodEnd = periodEnd; }
    public Instant getPaidAt() { return paidAt; }
    public void setPaidAt(Instant paidAt) { this.paidAt = paidAt; }
    public int getAttemptCount() { return attemptCount; }
    public void setAttemptCount(int attemptCount) { this.attemptCount = attemptCount; }
    public Instant getNextPaymentAttempt() { return nextPaymentAttempt; }
    public void setNextPaymentAttempt(Instant nextPaymentAttempt) { this.nextPaymentAttempt = nextPaymentAttempt; }
    public String getHostedInvoiceUrl() { return hostedInvoiceUrl; }
    public void setHostedInvoiceUrl(String hostedInvoiceUrl) { this.hostedInvoiceUrl = hostedInvoiceUrl; }
    public String getInvoicePdfUrl() { return invoicePdfUrl; }
    public void setInvoicePdfUrl(String invoicePdfUrl) { this.invoicePdfUrl = invoicePdfUrl; }
    public boolean isDisputed() { return disputed; }
    public void setDisputed(boolean disputed) { this.disputed = disputed; }
    public Instant getLastEventAt() { return lastEventAt; }
    public void setLastEventAt(Instant lastEventAt) { this.lastEventAt = lastEventAt; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
