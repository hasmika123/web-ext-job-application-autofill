package com.dossier.api.domain.ent.mkt;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/** Append-only record of what the marketer did on an interview (kinds: RESCHEDULE_PROPOSED, SLOT_CONFIRMED, FEEDBACK_RECORDED, REMINDER_REQUESTED). Table {@code mkt_interview_event}. */
@Entity
@Table(name = "mkt_interview_event")
public class MktInterviewEvent implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final String RESCHEDULE_PROPOSED = "RESCHEDULE_PROPOSED";
    public static final String SLOT_CONFIRMED = "SLOT_CONFIRMED";
    public static final String FEEDBACK_RECORDED = "FEEDBACK_RECORDED";
    public static final String REMINDER_REQUESTED = "REMINDER_REQUESTED";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "interview_id", nullable = false)
    private Long interviewId;

    @Column(name = "kind", length = 30, nullable = false)
    private String kind;

    @Column(name = "actor_member_id")
    private Long actorMemberId;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt = Instant.now();

    @Column(name = "detail", length = 400)
    private String detail;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getInterviewId() { return interviewId; }
    public void setInterviewId(Long interviewId) { this.interviewId = interviewId; }
    public String getKind() { return kind; }
    public void setKind(String kind) { this.kind = kind; }
    public Long getActorMemberId() { return actorMemberId; }
    public void setActorMemberId(Long actorMemberId) { this.actorMemberId = actorMemberId; }
    public Instant getOccurredAt() { return occurredAt; }
    public void setOccurredAt(Instant occurredAt) { this.occurredAt = occurredAt; }
    public String getDetail() { return detail; }
    public void setDetail(String detail) { this.detail = detail; }
}
