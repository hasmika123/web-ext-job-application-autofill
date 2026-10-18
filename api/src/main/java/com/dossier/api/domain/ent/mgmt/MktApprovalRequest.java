package com.dossier.api.domain.ent.mgmt;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * One manager approval (docs/enterprise-v2/deferred/marketing-manager.md section 3.1), table {@code mkt_approval_request}: a marketer's request that
 * a Marketing Manager release a held PREPARATION step (assigning an opportunity, overriding a duplicate warning, releasing a marketer-made resume to the
 * consultant). It never approves a submission (E1): the consultant submits. Only metadata lives here; {@code payload_json} carries the pending
 * action's arguments and is scanned for sensitive content on write. Every query goes through an org-scoped repository method.
 */
@Entity
@Table(name = "mkt_approval_request")
public class MktApprovalRequest implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final String KIND_OPPORTUNITY_ASSIGN = "OPPORTUNITY_ASSIGN";
    public static final String KIND_DUPLICATE_OVERRIDE = "DUPLICATE_OVERRIDE";
    public static final String KIND_RESUME_RELEASE = "RESUME_RELEASE";

    public static final String STATUS_PENDING = "PENDING";
    public static final String STATUS_APPROVED = "APPROVED";
    public static final String STATUS_REJECTED = "REJECTED";
    public static final String STATUS_WITHDRAWN = "WITHDRAWN";
    public static final String STATUS_EXPIRED = "EXPIRED";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "kind", length = 30, nullable = false)
    private String kind;

    @Column(name = "subject_type", length = 30, nullable = false)
    private String subjectType;

    @Column(name = "subject_id", nullable = false)
    private Long subjectId;

    @Column(name = "consultant_id", nullable = false)
    private Long consultantId;

    @Column(name = "requested_by_member_id", nullable = false)
    private Long requestedByMemberId;

    @Column(name = "requested_at", nullable = false)
    private Instant requestedAt = Instant.now();

    @Column(name = "title", length = 160, nullable = false)
    private String title;

    @Column(name = "note", length = 500)
    private String note;

    @Column(name = "payload_json", columnDefinition = "json")
    private String payloadJson;

    @Column(name = "status", length = 20, nullable = false)
    private String status = STATUS_PENDING;

    @Column(name = "decided_by_member_id")
    private Long decidedByMemberId;

    @Column(name = "decided_at")
    private Instant decidedAt;

    @Column(name = "decision_note", length = 300)
    private String decisionNote;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @PreUpdate
    void touch() {
        updatedAt = Instant.now();
    }

    public boolean isPending() {
        return STATUS_PENDING.equals(status);
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public String getKind() { return kind; }
    public void setKind(String kind) { this.kind = kind; }
    public String getSubjectType() { return subjectType; }
    public void setSubjectType(String subjectType) { this.subjectType = subjectType; }
    public Long getSubjectId() { return subjectId; }
    public void setSubjectId(Long subjectId) { this.subjectId = subjectId; }
    public Long getConsultantId() { return consultantId; }
    public void setConsultantId(Long consultantId) { this.consultantId = consultantId; }
    public Long getRequestedByMemberId() { return requestedByMemberId; }
    public void setRequestedByMemberId(Long requestedByMemberId) { this.requestedByMemberId = requestedByMemberId; }
    public Instant getRequestedAt() { return requestedAt; }
    public void setRequestedAt(Instant requestedAt) { this.requestedAt = requestedAt; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getNote() { return note; }
    public void setNote(String note) { this.note = note; }
    public String getPayloadJson() { return payloadJson; }
    public void setPayloadJson(String payloadJson) { this.payloadJson = payloadJson; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public Long getDecidedByMemberId() { return decidedByMemberId; }
    public void setDecidedByMemberId(Long decidedByMemberId) { this.decidedByMemberId = decidedByMemberId; }
    public Instant getDecidedAt() { return decidedAt; }
    public void setDecidedAt(Instant decidedAt) { this.decidedAt = decidedAt; }
    public String getDecisionNote() { return decisionNote; }
    public void setDecisionNote(String decisionNote) { this.decisionNote = decisionNote; }
    public Instant getExpiresAt() { return expiresAt; }
    public void setExpiresAt(Instant expiresAt) { this.expiresAt = expiresAt; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
