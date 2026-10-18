package com.dossier.api.domain.ent.talent;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/** Feedback a team member recorded about an interview (rating, recommendation and a short note). Table {@code talent_interview_feedback}; see docs/enterprise-v2/page-interviews.md. Every query goes through an org-scoped repository method. */
@Entity
@Table(name = "talent_interview_feedback")
public class TalentInterviewFeedback implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "interview_id", nullable = false)
    private Long interviewId;

    @Column(name = "author_member_id")
    private Long authorMemberId;

    @Column(name = "rating", nullable = false)
    private Integer rating;

    @Column(name = "recommendation", length = 12, nullable = false)
    private String recommendation;

    @Column(name = "note", length = 1000)
    private String note;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getInterviewId() { return interviewId; }
    public void setInterviewId(Long interviewId) { this.interviewId = interviewId; }
    public Long getAuthorMemberId() { return authorMemberId; }
    public void setAuthorMemberId(Long authorMemberId) { this.authorMemberId = authorMemberId; }
    public Integer getRating() { return rating; }
    public void setRating(Integer rating) { this.rating = rating; }
    public String getRecommendation() { return recommendation; }
    public void setRecommendation(String recommendation) { this.recommendation = recommendation; }
    public String getNote() { return note; }
    public void setNote(String note) { this.note = note; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
