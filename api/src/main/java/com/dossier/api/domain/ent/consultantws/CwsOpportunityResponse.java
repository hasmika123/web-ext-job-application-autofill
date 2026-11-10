package com.dossier.api.domain.ent.consultantws;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;
import java.time.LocalDate;

/**
 * A consultant's response to a job their marketer assigned (Consultant workspace, Assigned Opportunities). Table {@code cws_opportunity_response};
 * one row per (consultant, assigned match); only that consultant reads or writes it. {@code priority} and {@code dueOn} are the marketer's inputs
 * (null = not set, the page then derives them). Every query goes through an org-scoped repository method.
 */
@Entity
@Table(name = "cws_opportunity_response")
public class CwsOpportunityResponse implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final String NEW = "NEW";
    public static final String AWAITING_RESPONSE = "AWAITING_RESPONSE";
    public static final String IN_REVIEW = "IN_REVIEW";
    public static final String DECLINED = "DECLINED";

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

    @Column(name = "status", length = 20, nullable = false)
    private String status = NEW;

    @Column(name = "priority", length = 10)
    private String priority;

    @Column(name = "due_on")
    private LocalDate dueOn;

    @Column(name = "decline_reason", length = 300)
    private String declineReason;

    @Column(name = "info_request", length = 300)
    private String infoRequest;

    @Column(name = "resume_update_note", length = 300)
    private String resumeUpdateNote;

    @Column(name = "resume_update_requested_at")
    private Instant resumeUpdateRequestedAt;

    @Column(name = "responded_at")
    private Instant respondedAt;

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
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getPriority() { return priority; }
    public void setPriority(String priority) { this.priority = priority; }
    public LocalDate getDueOn() { return dueOn; }
    public void setDueOn(LocalDate dueOn) { this.dueOn = dueOn; }
    public String getDeclineReason() { return declineReason; }
    public void setDeclineReason(String declineReason) { this.declineReason = declineReason; }
    public String getInfoRequest() { return infoRequest; }
    public void setInfoRequest(String infoRequest) { this.infoRequest = infoRequest; }
    public String getResumeUpdateNote() { return resumeUpdateNote; }
    public void setResumeUpdateNote(String resumeUpdateNote) { this.resumeUpdateNote = resumeUpdateNote; }
    public Instant getResumeUpdateRequestedAt() { return resumeUpdateRequestedAt; }
    public void setResumeUpdateRequestedAt(Instant resumeUpdateRequestedAt) { this.resumeUpdateRequestedAt = resumeUpdateRequestedAt; }
    public Instant getRespondedAt() { return respondedAt; }
    public void setRespondedAt(Instant respondedAt) { this.respondedAt = respondedAt; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
