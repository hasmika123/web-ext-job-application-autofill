package com.dossier.api.domain.ent.talent;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/** Append-only application history (timeline, activity, stage-change deltas). Table {@code talent_application_event}; see docs/enterprise-v2/talent-foundation.md. Every query goes through an org-scoped repository method. */
@Entity
@Table(name = "talent_application_event")
public class TalentApplicationEvent implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "application_id", nullable = false)
    private Long applicationId;

    @Column(name = "event_type", length = 20, nullable = false)
    private String eventType;

    @Column(name = "from_stage", length = 20)
    private String fromStage;

    @Column(name = "to_stage", length = 20)
    private String toStage;

    @Column(name = "actor_member_id")
    private Long actorMemberId;

    @Column(name = "detail", length = 300)
    private String detail;

    // Change audit: PERSON (actor_member_id names the seat) or SYSTEM (the linker, a seed: no actor); changes is a JSON array of {f, from, to}.
    @Column(name = "actor_kind", length = 12, nullable = false)
    private String actorKind = "PERSON";

    @Column(name = "changes", length = 1000)
    private String changes;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getApplicationId() { return applicationId; }
    public void setApplicationId(Long applicationId) { this.applicationId = applicationId; }
    public String getEventType() { return eventType; }
    public void setEventType(String eventType) { this.eventType = eventType; }
    public String getFromStage() { return fromStage; }
    public void setFromStage(String fromStage) { this.fromStage = fromStage; }
    public String getToStage() { return toStage; }
    public void setToStage(String toStage) { this.toStage = toStage; }
    public Long getActorMemberId() { return actorMemberId; }
    public void setActorMemberId(Long actorMemberId) {
        this.actorMemberId = actorMemberId;
        this.actorKind = actorMemberId == null ? "SYSTEM" : "PERSON"; // no seat behind the row: the platform did it (setActorKind still wins when called after)
    }
    public String getActorKind() { return actorKind; }
    public void setActorKind(String actorKind) { this.actorKind = actorKind == null ? "PERSON" : actorKind; }
    public String getChanges() { return changes; }
    public void setChanges(String changes) { this.changes = changes; }
    public String getDetail() { return detail; }
    public void setDetail(String detail) { this.detail = detail; }
    public Instant getOccurredAt() { return occurredAt; }
    public void setOccurredAt(Instant occurredAt) { this.occurredAt = occurredAt; }
}
