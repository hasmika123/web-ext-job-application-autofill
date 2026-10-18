package com.dossier.api.domain.ent.mgmt;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * Something a Marketing Manager should look at (docs/enterprise-v2/deferred/marketing-manager.md section 3.2), table {@code mkt_escalation}: raised by a
 * rule of the 15-minute job (stalled opportunity, overdue follow-up, unanswered question, overloaded marketer, aging approval) or by hand. A rule re-checks
 * its open rows and clears them when the condition goes away. Metadata and short notes only; free text is scanned for sensitive content on write.
 * Every query goes through an org-scoped repository method.
 */
@Entity
@Table(name = "mkt_escalation")
public class MktEscalation implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final String KIND_STALLED_OPPORTUNITY = "STALLED_OPPORTUNITY";
    public static final String KIND_OVERDUE_FOLLOWUP = "OVERDUE_FOLLOWUP";
    public static final String KIND_UNANSWERED_QUESTION = "UNANSWERED_QUESTION";
    public static final String KIND_OVERLOADED_MARKETER = "OVERLOADED_MARKETER";
    public static final String KIND_MANUAL = "MANUAL";
    public static final String KIND_APPROVAL_AGING = "APPROVAL_AGING";

    public static final String STATUS_OPEN = "OPEN";
    public static final String STATUS_ACKNOWLEDGED = "ACKNOWLEDGED";
    public static final String STATUS_SNOOZED = "SNOOZED";
    public static final String STATUS_RESOLVED = "RESOLVED";
    public static final String STATUS_DISMISSED = "DISMISSED";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "kind", length = 30, nullable = false)
    private String kind;

    @Column(name = "severity", length = 10, nullable = false)
    private String severity;

    @Column(name = "subject_type", length = 30, nullable = false)
    private String subjectType;

    @Column(name = "subject_id", nullable = false)
    private Long subjectId;

    @Column(name = "consultant_id")
    private Long consultantId;

    @Column(name = "marketer_member_id")
    private Long marketerMemberId;

    @Column(name = "title", length = 160, nullable = false)
    private String title;

    @Column(name = "detail", length = 500)
    private String detail;

    @Column(name = "rule_key", length = 40)
    private String ruleKey;

    @Column(name = "raised_by_member_id")
    private Long raisedByMemberId;

    @Column(name = "raised_at", nullable = false)
    private Instant raisedAt = Instant.now();

    @Column(name = "status", length = 20, nullable = false)
    private String status = STATUS_OPEN;

    @Column(name = "assignee_member_id")
    private Long assigneeMemberId;

    @Column(name = "snoozed_until")
    private Instant snoozedUntil;

    @Column(name = "resolved_by_member_id")
    private Long resolvedByMemberId;

    @Column(name = "resolved_at")
    private Instant resolvedAt;

    @Column(name = "resolution", length = 300)
    private String resolution;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @PreUpdate
    void touch() {
        updatedAt = Instant.now();
    }

    /** Still needs attention (OPEN, ACKNOWLEDGED or SNOOZED): the states the open_key covers. */
    public boolean isLive() {
        return STATUS_OPEN.equals(status) || STATUS_ACKNOWLEDGED.equals(status) || STATUS_SNOOZED.equals(status);
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public String getKind() { return kind; }
    public void setKind(String kind) { this.kind = kind; }
    public String getSeverity() { return severity; }
    public void setSeverity(String severity) { this.severity = severity; }
    public String getSubjectType() { return subjectType; }
    public void setSubjectType(String subjectType) { this.subjectType = subjectType; }
    public Long getSubjectId() { return subjectId; }
    public void setSubjectId(Long subjectId) { this.subjectId = subjectId; }
    public Long getConsultantId() { return consultantId; }
    public void setConsultantId(Long consultantId) { this.consultantId = consultantId; }
    public Long getMarketerMemberId() { return marketerMemberId; }
    public void setMarketerMemberId(Long marketerMemberId) { this.marketerMemberId = marketerMemberId; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getDetail() { return detail; }
    public void setDetail(String detail) { this.detail = detail; }
    public String getRuleKey() { return ruleKey; }
    public void setRuleKey(String ruleKey) { this.ruleKey = ruleKey; }
    public Long getRaisedByMemberId() { return raisedByMemberId; }
    public void setRaisedByMemberId(Long raisedByMemberId) { this.raisedByMemberId = raisedByMemberId; }
    public Instant getRaisedAt() { return raisedAt; }
    public void setRaisedAt(Instant raisedAt) { this.raisedAt = raisedAt; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public Long getAssigneeMemberId() { return assigneeMemberId; }
    public void setAssigneeMemberId(Long assigneeMemberId) { this.assigneeMemberId = assigneeMemberId; }
    public Instant getSnoozedUntil() { return snoozedUntil; }
    public void setSnoozedUntil(Instant snoozedUntil) { this.snoozedUntil = snoozedUntil; }
    public Long getResolvedByMemberId() { return resolvedByMemberId; }
    public void setResolvedByMemberId(Long resolvedByMemberId) { this.resolvedByMemberId = resolvedByMemberId; }
    public Instant getResolvedAt() { return resolvedAt; }
    public void setResolvedAt(Instant resolvedAt) { this.resolvedAt = resolvedAt; }
    public String getResolution() { return resolution; }
    public void setResolution(String resolution) { this.resolution = resolution; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
