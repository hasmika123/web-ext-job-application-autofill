package com.dossier.api.domain.catalog;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * One affected subscription of a retirement (docs/subscriptions/11 sections 3 and 10; story K10.1). {@code retireEffectiveAt} is computed once when the retirement
 * starts and only ever moves later. {@code status}: PENDING (undecided, notices keep coming), SWITCHED_NOW, SWITCH_SCHEDULED, CANCELLED, FELL_BACK, MIGRATED or
 * EXCLUDED. Scope PERSONAL only today; the ORG columns wait for the enterprise story K10.7.
 */
@Entity
@Table(name = "plan_retirement_item")
public class PlanRetirementItem implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final String PENDING = "PENDING";
    public static final String SWITCHED_NOW = "SWITCHED_NOW";
    public static final String SWITCH_SCHEDULED = "SWITCH_SCHEDULED";
    public static final String CANCELLED = "CANCELLED";
    public static final String FELL_BACK = "FELL_BACK";
    public static final String MIGRATED = "MIGRATED";
    public static final String EXCLUDED = "EXCLUDED";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", nullable = false)
    private Long id;

    @Column(name = "retirement_id", nullable = false)
    private Long retirementId;

    @Column(name = "scope", length = 8, nullable = false)
    private String scope = "PERSONAL";

    @Column(name = "user_id")
    private Long userId;

    @Column(name = "subscription_id")
    private Long subscriptionId;

    @Column(name = "org_id")
    private Long orgId;

    @Column(name = "org_subscription_id")
    private Long orgSubscriptionId;

    @Column(name = "license_id")
    private Long licenseId;

    @Column(name = "retire_effective_at", nullable = false)
    private Instant retireEffectiveAt;

    @Column(name = "billing_interval", length = 10, nullable = false)
    private String billingInterval;

    @Column(name = "previous_version_id")
    private Long previousVersionId;

    @Column(name = "monthly_minor", nullable = false)
    private Long monthlyMinor = 0L;

    @Column(name = "suggestion_json", columnDefinition = "json")
    private String suggestionJson;

    @Column(name = "suggested_quote_id")
    private Long suggestedQuoteId;

    @Column(name = "status", length = 16, nullable = false)
    private String status = PENDING;

    @Column(name = "choice_kind", length = 24)
    private String choiceKind;

    @Column(name = "note", length = 200)
    private String note;

    @Column(name = "decided_at")
    private Instant decidedAt;

    @Column(name = "decided_change_id")
    private Long decidedChangeId;

    @Column(name = "stripe_ref")
    private String stripeRef;

    @Column(name = "cancel_set_at")
    private Instant cancelSetAt;

    @Column(name = "applied_at")
    private Instant appliedAt;

    @Column(name = "last_notice_days")
    private Integer lastNoticeDays;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getRetirementId() { return retirementId; }
    public void setRetirementId(Long retirementId) { this.retirementId = retirementId; }
    public String getScope() { return scope; }
    public void setScope(String scope) { this.scope = scope; }
    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
    public Long getSubscriptionId() { return subscriptionId; }
    public void setSubscriptionId(Long subscriptionId) { this.subscriptionId = subscriptionId; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getOrgSubscriptionId() { return orgSubscriptionId; }
    public void setOrgSubscriptionId(Long orgSubscriptionId) { this.orgSubscriptionId = orgSubscriptionId; }
    public Long getLicenseId() { return licenseId; }
    public void setLicenseId(Long licenseId) { this.licenseId = licenseId; }
    public Instant getRetireEffectiveAt() { return retireEffectiveAt; }
    public void setRetireEffectiveAt(Instant retireEffectiveAt) { this.retireEffectiveAt = retireEffectiveAt; }
    public String getBillingInterval() { return billingInterval; }
    public void setBillingInterval(String billingInterval) { this.billingInterval = billingInterval; }
    public Long getPreviousVersionId() { return previousVersionId; }
    public void setPreviousVersionId(Long previousVersionId) { this.previousVersionId = previousVersionId; }
    public Long getMonthlyMinor() { return monthlyMinor; }
    public void setMonthlyMinor(Long monthlyMinor) { this.monthlyMinor = monthlyMinor; }
    public String getSuggestionJson() { return suggestionJson; }
    public void setSuggestionJson(String suggestionJson) { this.suggestionJson = suggestionJson; }
    public Long getSuggestedQuoteId() { return suggestedQuoteId; }
    public void setSuggestedQuoteId(Long suggestedQuoteId) { this.suggestedQuoteId = suggestedQuoteId; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getChoiceKind() { return choiceKind; }
    public void setChoiceKind(String choiceKind) { this.choiceKind = choiceKind; }
    public String getNote() { return note; }
    public void setNote(String note) { this.note = note; }
    public Instant getDecidedAt() { return decidedAt; }
    public void setDecidedAt(Instant decidedAt) { this.decidedAt = decidedAt; }
    public Long getDecidedChangeId() { return decidedChangeId; }
    public void setDecidedChangeId(Long decidedChangeId) { this.decidedChangeId = decidedChangeId; }
    public String getStripeRef() { return stripeRef; }
    public void setStripeRef(String stripeRef) { this.stripeRef = stripeRef; }
    public Instant getCancelSetAt() { return cancelSetAt; }
    public void setCancelSetAt(Instant cancelSetAt) { this.cancelSetAt = cancelSetAt; }
    public Instant getAppliedAt() { return appliedAt; }
    public void setAppliedAt(Instant appliedAt) { this.appliedAt = appliedAt; }
    public Integer getLastNoticeDays() { return lastNoticeDays; }
    public void setLastNoticeDays(Integer lastNoticeDays) { this.lastNoticeDays = lastNoticeDays; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
