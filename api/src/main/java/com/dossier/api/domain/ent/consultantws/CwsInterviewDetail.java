package com.dossier.api.domain.ent.consultantws;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * How the consultant joins one of their own interviews: mode (video, onsite, phone), the meeting link (https only), what they know about the
 * interviewer's title and their own preparation note. Table {@code cws_interview_detail}; only that consultant reads or writes it. It never
 * creates or moves an interview (the marketer or client does that on {@code talent_interview}).
 */
@Entity
@Table(name = "cws_interview_detail")
public class CwsInterviewDetail implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "interview_id", nullable = false)
    private Long interviewId;

    @Column(name = "consultant_id", nullable = false)
    private Long consultantId;

    @Column(name = "mode", length = 10)
    private String mode;

    @Column(name = "meeting_url", length = 500)
    private String meetingUrl;

    @Column(name = "interviewer_title", length = 120)
    private String interviewerTitle;

    @Column(name = "prep_note", length = 2000)
    private String prepNote;

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
    public Long getConsultantId() { return consultantId; }
    public void setConsultantId(Long consultantId) { this.consultantId = consultantId; }
    public String getMode() { return mode; }
    public void setMode(String mode) { this.mode = mode; }
    public String getMeetingUrl() { return meetingUrl; }
    public void setMeetingUrl(String meetingUrl) { this.meetingUrl = meetingUrl; }
    public String getInterviewerTitle() { return interviewerTitle; }
    public void setInterviewerTitle(String interviewerTitle) { this.interviewerTitle = interviewerTitle; }
    public String getPrepNote() { return prepNote; }
    public void setPrepNote(String prepNote) { this.prepNote = prepNote; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
