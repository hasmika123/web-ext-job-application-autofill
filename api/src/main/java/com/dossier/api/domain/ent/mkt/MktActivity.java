package com.dossier.api.domain.ent.mkt;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;
import java.util.List;

/**
 * One MANUAL entry of the Marketing Activities feed ("Log Activity"). Table {@code mkt_activity}. Record only: it notes work a marketer did for one of
 * their consultants and never submits, mails or signs in for anyone (E1). Every other line of the feed is read from the existing event tables.
 * Every query goes through an org-scoped {@code MktActivityRepository} method.
 */
@Entity
@Table(name = "mkt_activity")
public class MktActivity implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final String COMPLETED = "COMPLETED";
    public static final String SCHEDULED = "SCHEDULED";
    public static final String CANCELLED = "CANCELLED";
    public static final List<String> STATUSES = List.of(COMPLETED, SCHEDULED, CANCELLED);

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "consultant_id", nullable = false)
    private Long consultantId;

    @Column(name = "client_account_id")
    private Long clientAccountId;

    @Column(name = "activity_type", length = 40, nullable = false)
    private String activityType;

    @Column(name = "title", length = 160, nullable = false)
    private String title;

    @Column(name = "detail", length = 200)
    private String detail;

    /** Comma-separated short labels (the board shows the first two as chips). */
    @Column(name = "tags", length = 100)
    private String tags;

    @Column(name = "status", length = 12, nullable = false)
    private String status = COMPLETED;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt = Instant.now();

    @Column(name = "actor_member_id", nullable = false)
    private Long actorMemberId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getConsultantId() { return consultantId; }
    public void setConsultantId(Long consultantId) { this.consultantId = consultantId; }
    public Long getClientAccountId() { return clientAccountId; }
    public void setClientAccountId(Long clientAccountId) { this.clientAccountId = clientAccountId; }
    public String getActivityType() { return activityType; }
    public void setActivityType(String activityType) { this.activityType = activityType; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getDetail() { return detail; }
    public void setDetail(String detail) { this.detail = detail; }
    public String getTags() { return tags; }
    public void setTags(String tags) { this.tags = tags; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public Instant getOccurredAt() { return occurredAt; }
    public void setOccurredAt(Instant occurredAt) { this.occurredAt = occurredAt; }
    public Long getActorMemberId() { return actorMemberId; }
    public void setActorMemberId(Long actorMemberId) { this.actorMemberId = actorMemberId; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
