package com.dossier.api.domain.ent.consultantws;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * A submission a marketer prepared for one consultant and one job (table {@code cws_submission}). The consultant approves or declines it;
 * the later states are written by the marketer / client side (demo-seeded stand-ins while that side is not built, {@code sampleData}).
 * Kiwiply never submits anything: a row reaching APPROVED only records the consultant's attestation.
 */
@Entity
@Table(name = "cws_submission")
public class CwsSubmission implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final String PENDING = "PENDING_APPROVAL";
    public static final String APPROVED = "APPROVED";
    public static final String DECLINED = "DECLINED";
    public static final String SUBMITTED = "SUBMITTED_TO_CLIENT";
    public static final String INTERVIEW = "CLIENT_INTERVIEW";
    public static final String NOT_SELECTED = "NOT_SELECTED";
    public static final String CLOSED = "CLOSED";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "consultant_id", nullable = false)
    private Long consultantId;

    @Column(name = "requirement_id", nullable = false)
    private Long requirementId;

    @Column(name = "resume_id")
    private Long resumeId;

    @Column(name = "resume_version_no")
    private Integer resumeVersionNo;

    @Column(name = "marketer_member_id")
    private Long marketerMemberId;

    @Column(name = "marketer_note", length = 500)
    private String marketerNote;

    @Column(name = "due_at")
    private Instant dueAt;

    @Column(name = "status", length = 24, nullable = false)
    private String status = PENDING;

    @Column(name = "decided_at")
    private Instant decidedAt;

    @Column(name = "decline_reason", length = 300)
    private String declineReason;

    @Column(name = "client_update", length = 300)
    private String clientUpdate;

    @Column(name = "client_update_at")
    private Instant clientUpdateAt;

    @Column(name = "submitted_on")
    private Instant submittedOn;

    @Column(name = "sample_data", nullable = false)
    private boolean sampleData = false;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getConsultantId() { return consultantId; }
    public void setConsultantId(Long consultantId) { this.consultantId = consultantId; }
    public Long getRequirementId() { return requirementId; }
    public void setRequirementId(Long requirementId) { this.requirementId = requirementId; }
    public Long getResumeId() { return resumeId; }
    public void setResumeId(Long resumeId) { this.resumeId = resumeId; }
    public Integer getResumeVersionNo() { return resumeVersionNo; }
    public void setResumeVersionNo(Integer resumeVersionNo) { this.resumeVersionNo = resumeVersionNo; }
    public Long getMarketerMemberId() { return marketerMemberId; }
    public void setMarketerMemberId(Long marketerMemberId) { this.marketerMemberId = marketerMemberId; }
    public String getMarketerNote() { return marketerNote; }
    public void setMarketerNote(String marketerNote) { this.marketerNote = marketerNote; }
    public Instant getDueAt() { return dueAt; }
    public void setDueAt(Instant dueAt) { this.dueAt = dueAt; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public Instant getDecidedAt() { return decidedAt; }
    public void setDecidedAt(Instant decidedAt) { this.decidedAt = decidedAt; }
    public String getDeclineReason() { return declineReason; }
    public void setDeclineReason(String declineReason) { this.declineReason = declineReason; }
    public String getClientUpdate() { return clientUpdate; }
    public void setClientUpdate(String clientUpdate) { this.clientUpdate = clientUpdate; }
    public Instant getClientUpdateAt() { return clientUpdateAt; }
    public void setClientUpdateAt(Instant clientUpdateAt) { this.clientUpdateAt = clientUpdateAt; }
    public Instant getSubmittedOn() { return submittedOn; }
    public void setSubmittedOn(Instant submittedOn) { this.submittedOn = submittedOn; }
    public boolean isSampleData() { return sampleData; }
    public void setSampleData(boolean sampleData) { this.sampleData = sampleData; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
