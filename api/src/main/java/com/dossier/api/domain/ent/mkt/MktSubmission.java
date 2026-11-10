package com.dossier.api.domain.ent.mkt;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * A RECORD of a profile package a marketer prepared for a job (consultant + job + resume version) and where it stands. Table {@code mkt_submission}.
 * E1: the row is never a submission to a client; the consultant submits and the marketer records that fact. Every query goes through
 * {@code MktSubmissionRepository}, whose methods all take the organization id first.
 */
@Entity
@Table(name = "mkt_submission")
public class MktSubmission implements Serializable {

    private static final long serialVersionUID = 1L;

    /** approval_state values. */
    public static final String DRAFT = "DRAFT";
    public static final String AWAITING_APPROVAL = "AWAITING_APPROVAL";
    public static final String APPROVED = "APPROVED";
    public static final String REJECTED = "REJECTED";
    /** status values (DRAFT and REJECTED are shared with the approval names). */
    public static final String SUBMITTED = "SUBMITTED";
    public static final String CLIENT_REVIEW = "CLIENT_REVIEW";
    public static final String INTERVIEW_REQUESTED = "INTERVIEW_REQUESTED";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "code", length = 30, nullable = false)
    private String code;

    @Column(name = "consultant_id", nullable = false)
    private Long consultantId;

    @Column(name = "requirement_id", nullable = false)
    private Long requirementId;

    @Column(name = "client_id", nullable = false)
    private Long clientId;

    @Column(name = "resume_id")
    private Long resumeId;

    @Column(name = "resume_version")
    private Integer resumeVersion;

    @Column(name = "resume_minor")
    private Integer resumeMinor;

    @Column(name = "resume_updated_at")
    private Instant resumeUpdatedAt;

    @Column(name = "approval_state", length = 20, nullable = false)
    private String approvalState = DRAFT;

    @Column(name = "status", length = 24, nullable = false)
    private String status = DRAFT;

    @Column(name = "submitted_on")
    private Instant submittedOn;

    @Column(name = "prepared_by_member_id")
    private Long preparedByMemberId;

    @Column(name = "note", length = 300)
    private String note;

    @Column(name = "archived_at")
    private Instant archivedAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    // Change audit (docs/change-audit/README.md section 2.2): the seat that made / last wrote this row. No foreign key: a row outlives an erased seat.
    @Column(name = "created_by_member_id")
    private Long createdByMemberId;

    @Column(name = "updated_by_member_id")
    private Long updatedByMemberId;

    @PreUpdate
    void touch() {
        updatedAt = Instant.now();
    }

    /** The date the board shows: when the consultant's submission was recorded, otherwise when the package was prepared. */
    public Instant shownAt() {
        return submittedOn != null ? submittedOn : createdAt;
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }
    public Long getConsultantId() { return consultantId; }
    public void setConsultantId(Long consultantId) { this.consultantId = consultantId; }
    public Long getRequirementId() { return requirementId; }
    public void setRequirementId(Long requirementId) { this.requirementId = requirementId; }
    public Long getClientId() { return clientId; }
    public void setClientId(Long clientId) { this.clientId = clientId; }
    public Long getResumeId() { return resumeId; }
    public void setResumeId(Long resumeId) { this.resumeId = resumeId; }
    public Integer getResumeVersion() { return resumeVersion; }
    public void setResumeVersion(Integer resumeVersion) { this.resumeVersion = resumeVersion; }
    public Integer getResumeMinor() { return resumeMinor; }
    public void setResumeMinor(Integer resumeMinor) { this.resumeMinor = resumeMinor; }
    public Instant getResumeUpdatedAt() { return resumeUpdatedAt; }
    public void setResumeUpdatedAt(Instant resumeUpdatedAt) { this.resumeUpdatedAt = resumeUpdatedAt; }
    public String getApprovalState() { return approvalState; }
    public void setApprovalState(String approvalState) { this.approvalState = approvalState; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public Instant getSubmittedOn() { return submittedOn; }
    public void setSubmittedOn(Instant submittedOn) { this.submittedOn = submittedOn; }
    public Long getPreparedByMemberId() { return preparedByMemberId; }
    public void setPreparedByMemberId(Long preparedByMemberId) { this.preparedByMemberId = preparedByMemberId; }
    public String getNote() { return note; }
    public void setNote(String note) { this.note = note; }
    public Instant getArchivedAt() { return archivedAt; }
    public void setArchivedAt(Instant archivedAt) { this.archivedAt = archivedAt; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
    public Long getCreatedByMemberId() { return createdByMemberId; }
    public void setCreatedByMemberId(Long createdByMemberId) { this.createdByMemberId = createdByMemberId; }
    public Long getUpdatedByMemberId() { return updatedByMemberId; }
    public void setUpdatedByMemberId(Long updatedByMemberId) { this.updatedByMemberId = updatedByMemberId; }
}
