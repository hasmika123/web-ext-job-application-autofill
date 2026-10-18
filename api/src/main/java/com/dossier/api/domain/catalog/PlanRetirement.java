package com.dossier.api.domain.catalog;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * One retirement of a plan, a plan version or an add-on service (docs/subscriptions/11-plan-retirement.md section 10, story K10.1): the audited object whose
 * items carry each subscriber's effective date. {@code status} DRAFT, NOTICING, COMPLETING, COMPLETED or CANCELLED; {@code mode} RETIRE_AT_RENEWAL (default) or
 * KEEP_INDEFINITELY; {@code defaultOutcome} FREE (default, S-19), MIGRATE_AT_RENEWAL or CANCEL.
 */
@Entity
@Table(name = "plan_retirement")
public class PlanRetirement implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final String KIND_PLAN = "PLAN";
    public static final String KIND_ADDON = "ADDON";
    public static final String KIND_PRICE = "PRICE";

    public static final String DRAFT = "DRAFT";
    public static final String NOTICING = "NOTICING";
    public static final String COMPLETING = "COMPLETING";
    public static final String COMPLETED = "COMPLETED";
    public static final String CANCELLED = "CANCELLED";

    public static final String MODE_RETIRE_AT_RENEWAL = "RETIRE_AT_RENEWAL";
    public static final String MODE_KEEP_INDEFINITELY = "KEEP_INDEFINITELY";

    public static final String OUTCOME_FREE = "FREE";
    public static final String OUTCOME_MIGRATE = "MIGRATE_AT_RENEWAL";
    public static final String OUTCOME_CANCEL = "CANCEL";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", nullable = false)
    private Long id;

    @Column(name = "kind", length = 12, nullable = false)
    private String kind;

    @Column(name = "plan_id")
    private Long planId;

    @Column(name = "plan_version_id")
    private Long planVersionId;

    @Column(name = "feature_key", length = 60)
    private String featureKey;

    @Column(name = "price_id")
    private Long priceId;

    @Column(name = "audience", length = 12, nullable = false)
    private String audience;

    @Column(name = "status", length = 12, nullable = false)
    private String status = DRAFT;

    @Column(name = "mode", length = 20, nullable = false)
    private String mode = MODE_RETIRE_AT_RENEWAL;

    @Column(name = "default_outcome", length = 20, nullable = false)
    private String defaultOutcome = OUTCOME_FREE;

    @Column(name = "notice_schedule_json", columnDefinition = "json", nullable = false)
    private String noticeScheduleJson = "[60,30,7,1]";

    @Column(name = "min_notice_days", nullable = false)
    private Integer minNoticeDays = 30;

    @Column(name = "channels_json", columnDefinition = "json", nullable = false)
    private String channelsJson = "[\"EMAIL\",\"IN_APP\"]";

    @Column(name = "message_md", length = 2000)
    private String messageMd;

    @Column(name = "reason", length = 500, nullable = false)
    private String reason;

    @Column(name = "plan_status_before", length = 12)
    private String planStatusBefore;

    @Column(name = "version_status_before", length = 12)
    private String versionStatusBefore;

    @Column(name = "started_at")
    private Instant startedAt;

    @Column(name = "started_by", length = 50)
    private String startedBy;

    @Column(name = "approved_by", length = 50)
    private String approvedBy;

    @Column(name = "cancelled_at")
    private Instant cancelledAt;

    @Column(name = "cancelled_by", length = 50)
    private String cancelledBy;

    @Column(name = "completed_at")
    private Instant completedAt;

    @Column(name = "impact_json", columnDefinition = "json")
    private String impactJson;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "created_by", length = 50, nullable = false)
    private String createdBy;

    /** True while subscribers are being noticed or moved. */
    public boolean isLive() {
        return NOTICING.equals(status) || COMPLETING.equals(status);
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getKind() { return kind; }
    public void setKind(String kind) { this.kind = kind; }
    public Long getPlanId() { return planId; }
    public void setPlanId(Long planId) { this.planId = planId; }
    public Long getPlanVersionId() { return planVersionId; }
    public void setPlanVersionId(Long planVersionId) { this.planVersionId = planVersionId; }
    public String getFeatureKey() { return featureKey; }
    public void setFeatureKey(String featureKey) { this.featureKey = featureKey; }
    public Long getPriceId() { return priceId; }
    public void setPriceId(Long priceId) { this.priceId = priceId; }
    public String getAudience() { return audience; }
    public void setAudience(String audience) { this.audience = audience; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getMode() { return mode; }
    public void setMode(String mode) { this.mode = mode; }
    public String getDefaultOutcome() { return defaultOutcome; }
    public void setDefaultOutcome(String defaultOutcome) { this.defaultOutcome = defaultOutcome; }
    public String getNoticeScheduleJson() { return noticeScheduleJson; }
    public void setNoticeScheduleJson(String noticeScheduleJson) { this.noticeScheduleJson = noticeScheduleJson; }
    public Integer getMinNoticeDays() { return minNoticeDays; }
    public void setMinNoticeDays(Integer minNoticeDays) { this.minNoticeDays = minNoticeDays; }
    public String getChannelsJson() { return channelsJson; }
    public void setChannelsJson(String channelsJson) { this.channelsJson = channelsJson; }
    public String getMessageMd() { return messageMd; }
    public void setMessageMd(String messageMd) { this.messageMd = messageMd; }
    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }
    public String getPlanStatusBefore() { return planStatusBefore; }
    public void setPlanStatusBefore(String planStatusBefore) { this.planStatusBefore = planStatusBefore; }
    public String getVersionStatusBefore() { return versionStatusBefore; }
    public void setVersionStatusBefore(String versionStatusBefore) { this.versionStatusBefore = versionStatusBefore; }
    public Instant getStartedAt() { return startedAt; }
    public void setStartedAt(Instant startedAt) { this.startedAt = startedAt; }
    public String getStartedBy() { return startedBy; }
    public void setStartedBy(String startedBy) { this.startedBy = startedBy; }
    public String getApprovedBy() { return approvedBy; }
    public void setApprovedBy(String approvedBy) { this.approvedBy = approvedBy; }
    public Instant getCancelledAt() { return cancelledAt; }
    public void setCancelledAt(Instant cancelledAt) { this.cancelledAt = cancelledAt; }
    public String getCancelledBy() { return cancelledBy; }
    public void setCancelledBy(String cancelledBy) { this.cancelledBy = cancelledBy; }
    public Instant getCompletedAt() { return completedAt; }
    public void setCompletedAt(Instant completedAt) { this.completedAt = completedAt; }
    public String getImpactJson() { return impactJson; }
    public void setImpactJson(String impactJson) { this.impactJson = impactJson; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }
}
