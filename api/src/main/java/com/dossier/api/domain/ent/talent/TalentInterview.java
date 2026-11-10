package com.dossier.api.domain.ent.talent;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/** Interview slots (33 precursor): feeds Upcoming Interviews and Next Interview. Table {@code talent_interview}; see docs/enterprise-v2/talent-foundation.md. Every query goes through an org-scoped repository method. */
@Entity
@Table(name = "talent_interview")
public class TalentInterview implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "application_id")
    private Long applicationId;

    @Column(name = "consultant_id", nullable = false)
    private Long consultantId;

    @Column(name = "client_id", nullable = false)
    private Long clientId;

    @Column(name = "scheduled_at", nullable = false)
    private Instant scheduledAt = Instant.now();

    @Column(name = "duration_minutes", nullable = false)
    private Integer durationMinutes = 45;

    @Column(name = "status", length = 20, nullable = false)
    private String status = "SCHEDULED";

    @Column(name = "round_label", length = 40)
    private String roundLabel;

    @Column(name = "interviewer_name", length = 120)
    private String interviewerName;

    @Column(name = "round_no")
    private Integer roundNo;

    @Column(name = "mode", length = 12, nullable = false)
    private String mode = "VIDEO";

    @Column(name = "meeting_link", length = 300)
    private String meetingLink;

    @Column(name = "location", length = 200)
    private String location;

    @Column(name = "notes", length = 1000)
    private String notes;

    @Column(name = "next_step", length = 120)
    private String nextStep;

    @Column(name = "reminder_requested_at")
    private Instant reminderRequestedAt;

    /** The consultant's own (personal) interview this row follows, when it came from their inbox; null for every other row. */
    @Column(name = "personal_interview_id")
    private Long personalInterviewId;

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

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getApplicationId() { return applicationId; }
    public void setApplicationId(Long applicationId) { this.applicationId = applicationId; }
    public Long getConsultantId() { return consultantId; }
    public void setConsultantId(Long consultantId) { this.consultantId = consultantId; }
    public Long getClientId() { return clientId; }
    public void setClientId(Long clientId) { this.clientId = clientId; }
    public Instant getScheduledAt() { return scheduledAt; }
    public void setScheduledAt(Instant scheduledAt) { this.scheduledAt = scheduledAt; }
    public Integer getDurationMinutes() { return durationMinutes; }
    public void setDurationMinutes(Integer durationMinutes) { this.durationMinutes = durationMinutes; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getRoundLabel() { return roundLabel; }
    public void setRoundLabel(String roundLabel) { this.roundLabel = roundLabel; }
    public String getInterviewerName() { return interviewerName; }
    public void setInterviewerName(String interviewerName) { this.interviewerName = interviewerName; }
    public Integer getRoundNo() { return roundNo; }
    public void setRoundNo(Integer roundNo) { this.roundNo = roundNo; }
    public String getMode() { return mode; }
    public void setMode(String mode) { this.mode = mode; }
    public String getMeetingLink() { return meetingLink; }
    public void setMeetingLink(String meetingLink) { this.meetingLink = meetingLink; }
    public String getLocation() { return location; }
    public void setLocation(String location) { this.location = location; }
    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
    public String getNextStep() { return nextStep; }
    public void setNextStep(String nextStep) { this.nextStep = nextStep; }
    public Instant getReminderRequestedAt() { return reminderRequestedAt; }
    public void setReminderRequestedAt(Instant reminderRequestedAt) { this.reminderRequestedAt = reminderRequestedAt; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
    public Long getCreatedByMemberId() { return createdByMemberId; }
    public void setCreatedByMemberId(Long createdByMemberId) { this.createdByMemberId = createdByMemberId; }
    public Long getUpdatedByMemberId() { return updatedByMemberId; }
    public void setUpdatedByMemberId(Long updatedByMemberId) { this.updatedByMemberId = updatedByMemberId; }

    public Long getPersonalInterviewId() {
        return personalInterviewId;
    }

    public void setPersonalInterviewId(Long personalInterviewId) {
        this.personalInterviewId = personalInterviewId;
    }
}
