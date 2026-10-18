package com.dossier.api.domain.ent.mkt;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * What the Interviews board needs beyond a {@code talent_interview} slot: type, recruiter, coordination status, when feedback is due, and
 * reschedule bookkeeping. One row per interview ({@code uk_mkt_interview_meta_interview}), created lazily. Table {@code mkt_interview_meta}.
 * E1: {@code proposedFor} is a PROPOSAL; the slot's own time only changes when the marketer records that the new slot was confirmed.
 */
@Entity
@Table(name = "mkt_interview_meta")
public class MktInterviewMeta implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "interview_id", nullable = false)
    private Long interviewId;

    @Column(name = "interview_type", length = 20, nullable = false)
    private String interviewType = "VIDEO";

    @Column(name = "recruiter_name", length = 120)
    private String recruiterName;

    @Column(name = "coordination_status", length = 30, nullable = false)
    private String coordinationStatus = "SCHEDULED";

    @Column(name = "feedback_due_at")
    private Instant feedbackDueAt;

    @Column(name = "reschedule_count", nullable = false)
    private Integer rescheduleCount = 0;

    @Column(name = "proposed_for")
    private Instant proposedFor;

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
    public Long getInterviewId() { return interviewId; }
    public void setInterviewId(Long interviewId) { this.interviewId = interviewId; }
    public String getInterviewType() { return interviewType; }
    public void setInterviewType(String interviewType) { this.interviewType = interviewType; }
    public String getRecruiterName() { return recruiterName; }
    public void setRecruiterName(String recruiterName) { this.recruiterName = recruiterName; }
    public String getCoordinationStatus() { return coordinationStatus; }
    public void setCoordinationStatus(String coordinationStatus) { this.coordinationStatus = coordinationStatus; }
    public Instant getFeedbackDueAt() { return feedbackDueAt; }
    public void setFeedbackDueAt(Instant feedbackDueAt) { this.feedbackDueAt = feedbackDueAt; }
    public Integer getRescheduleCount() { return rescheduleCount; }
    public void setRescheduleCount(Integer rescheduleCount) { this.rescheduleCount = rescheduleCount; }
    public Instant getProposedFor() { return proposedFor; }
    public void setProposedFor(Instant proposedFor) { this.proposedFor = proposedFor; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
