package com.dossier.api.domain.ent.pipeline;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.io.Serializable;
import java.time.Instant;

/**
 * One durable proposal of a consultant for one organization opportunity. Table {@code opportunity_match}; see
 * enterprise-v2 31 section 4. The unique organization/opportunity/consultant pair is the duplicate guard and status
 * history is kept by reopening this row rather than inserting another one.
 */
@Entity
@Table(name = "opportunity_match")
public class OpportunityMatch implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "opportunity_id", nullable = false)
    private Long opportunityId;

    @Column(name = "consultant_member_id", nullable = false)
    private Long consultantMemberId;

    @Column(name = "score")
    private Integer score;

    @Column(name = "reason", length = 300)
    private String reason;

    @Column(name = "model", length = 80)
    private String model;

    @Column(name = "source", length = 20, nullable = false)
    private String source = "MANUAL";

    @Column(name = "status", length = 20, nullable = false)
    private String status = "SUGGESTED";

    /** Member or system actor that first created the proposal; null is valid for a system suggestion. */
    @Column(name = "created_by_member_id")
    private Long createdByMemberId;

    /** Last member who changed this row; system transitions may leave it null. */
    @Column(name = "updated_by_member_id")
    private Long updatedByMemberId;

    @Column(name = "assigned_by_member_id")
    private Long assignedByMemberId;

    /** A future link to the org assignment active when the proposal was made. */
    @Column(name = "assignment_id")
    private Long assignmentId;

    @Column(name = "assigned_at")
    private Instant assignedAt;

    @Column(name = "note_to_consultant", length = 500)
    private String noteToConsultant;

    /** Snapshot pointer to the person resume approved for this opportunity; the person-owned row is not tenant-owned. */
    @Column(name = "resume_id")
    private Long resumeId;

    @Column(name = "resume_version_no")
    private Integer resumeVersionNo;

    @Column(name = "consultant_decided_at")
    private Instant consultantDecidedAt;

    @Column(name = "decline_reason", length = 40)
    private String declineReason;

    @Column(name = "decline_note", length = 200)
    private String declineNote;

    @Column(name = "authorization", length = 20, nullable = false)
    private String authorization = "NOT_NEEDED";

    @Column(name = "authorized_at")
    private Instant authorizedAt;

    @Column(name = "authorization_scope", length = 20)
    private String authorizationScope;

    @Column(name = "approval_required", nullable = false)
    private boolean approvalRequired;

    @Column(name = "approved_by_member_id")
    private Long approvedByMemberId;

    @Column(name = "approved_at")
    private Instant approvedAt;

    /** Future link to the consultant's own application through pipeline_application_link. */
    @Column(name = "application_id")
    private Long applicationId;

    /** Future link to the organization candidate-submission record. */
    @Column(name = "submission_id")
    private Long submissionId;

    @Column(name = "withdrawn_reason", length = 40)
    private String withdrawnReason;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @PreUpdate
    void touch() {
        updatedAt = Instant.now();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getOpportunityId() { return opportunityId; }
    public void setOpportunityId(Long opportunityId) { this.opportunityId = opportunityId; }
    public Long getConsultantMemberId() { return consultantMemberId; }
    public void setConsultantMemberId(Long consultantMemberId) { this.consultantMemberId = consultantMemberId; }
    public Integer getScore() { return score; }
    public void setScore(Integer score) { this.score = score; }
    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }
    public String getModel() { return model; }
    public void setModel(String model) { this.model = model; }
    public String getSource() { return source; }
    public void setSource(String source) { this.source = source; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public Long getCreatedByMemberId() { return createdByMemberId; }
    public void setCreatedByMemberId(Long createdByMemberId) { this.createdByMemberId = createdByMemberId; }
    public Long getUpdatedByMemberId() { return updatedByMemberId; }
    public void setUpdatedByMemberId(Long updatedByMemberId) { this.updatedByMemberId = updatedByMemberId; }
    public Long getAssignedByMemberId() { return assignedByMemberId; }
    public void setAssignedByMemberId(Long assignedByMemberId) { this.assignedByMemberId = assignedByMemberId; }
    public Long getAssignmentId() { return assignmentId; }
    public void setAssignmentId(Long assignmentId) { this.assignmentId = assignmentId; }
    public Instant getAssignedAt() { return assignedAt; }
    public void setAssignedAt(Instant assignedAt) { this.assignedAt = assignedAt; }
    public String getNoteToConsultant() { return noteToConsultant; }
    public void setNoteToConsultant(String noteToConsultant) { this.noteToConsultant = noteToConsultant; }
    public Long getResumeId() { return resumeId; }
    public void setResumeId(Long resumeId) { this.resumeId = resumeId; }
    public Integer getResumeVersionNo() { return resumeVersionNo; }
    public void setResumeVersionNo(Integer resumeVersionNo) { this.resumeVersionNo = resumeVersionNo; }
    public Instant getConsultantDecidedAt() { return consultantDecidedAt; }
    public void setConsultantDecidedAt(Instant consultantDecidedAt) { this.consultantDecidedAt = consultantDecidedAt; }
    public String getDeclineReason() { return declineReason; }
    public void setDeclineReason(String declineReason) { this.declineReason = declineReason; }
    public String getDeclineNote() { return declineNote; }
    public void setDeclineNote(String declineNote) { this.declineNote = declineNote; }
    public String getAuthorization() { return authorization; }
    public void setAuthorization(String authorization) { this.authorization = authorization; }
    public Instant getAuthorizedAt() { return authorizedAt; }
    public void setAuthorizedAt(Instant authorizedAt) { this.authorizedAt = authorizedAt; }
    public String getAuthorizationScope() { return authorizationScope; }
    public void setAuthorizationScope(String authorizationScope) { this.authorizationScope = authorizationScope; }
    public boolean isApprovalRequired() { return approvalRequired; }
    public void setApprovalRequired(boolean approvalRequired) { this.approvalRequired = approvalRequired; }
    public Long getApprovedByMemberId() { return approvedByMemberId; }
    public void setApprovedByMemberId(Long approvedByMemberId) { this.approvedByMemberId = approvedByMemberId; }
    public Instant getApprovedAt() { return approvedAt; }
    public void setApprovedAt(Instant approvedAt) { this.approvedAt = approvedAt; }
    public Long getApplicationId() { return applicationId; }
    public void setApplicationId(Long applicationId) { this.applicationId = applicationId; }
    public Long getSubmissionId() { return submissionId; }
    public void setSubmissionId(Long submissionId) { this.submissionId = submissionId; }
    public String getWithdrawnReason() { return withdrawnReason; }
    public void setWithdrawnReason(String withdrawnReason) { this.withdrawnReason = withdrawnReason; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
