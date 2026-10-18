package com.dossier.api.domain.ent.talent;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;
import java.time.LocalDate;

/** One row of the append-only timeline of a placement; the prev fields are the state before the change (what Undo restores). Table {@code placement_event}; see docs/enterprise-v2/page-placements.md. Every query goes through an org-scoped path. */
@Entity
@Table(name = "placement_event")
public class PlacementEvent implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "placement_id", nullable = false)
    private Long placementId;

    @Column(name = "event_type", length = 30, nullable = false)
    private String eventType;

    @Column(name = "actor_member_id")
    private Long actorMemberId;

    @Column(name = "detail", length = 300)
    private String detail;

    @Column(name = "ref_id")
    private Long refId;

    @Column(name = "prev_status", length = 20)
    private String prevStatus;

    @Column(name = "prev_end_date")
    private LocalDate prevEndDate;

    @Column(name = "prev_pool")
    private Boolean prevPool;

    @Column(name = "prev_pool_date")
    private LocalDate prevPoolDate;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getPlacementId() { return placementId; }
    public void setPlacementId(Long placementId) { this.placementId = placementId; }
    public String getEventType() { return eventType; }
    public void setEventType(String eventType) { this.eventType = eventType; }
    public Long getActorMemberId() { return actorMemberId; }
    public void setActorMemberId(Long actorMemberId) { this.actorMemberId = actorMemberId; }
    public String getDetail() { return detail; }
    public void setDetail(String detail) { this.detail = detail; }
    public String getPrevStatus() { return prevStatus; }
    public void setPrevStatus(String prevStatus) { this.prevStatus = prevStatus; }
    public LocalDate getPrevEndDate() { return prevEndDate; }
    public void setPrevEndDate(LocalDate prevEndDate) { this.prevEndDate = prevEndDate; }
    public Boolean getPrevPool() { return prevPool; }
    public void setPrevPool(Boolean prevPool) { this.prevPool = prevPool; }
    public LocalDate getPrevPoolDate() { return prevPoolDate; }
    public void setPrevPoolDate(LocalDate prevPoolDate) { this.prevPoolDate = prevPoolDate; }
    public Instant getOccurredAt() { return occurredAt; }
    public void setOccurredAt(Instant occurredAt) { this.occurredAt = occurredAt; }
    public Long getRefId() { return refId; }
    public void setRefId(Long refId) { this.refId = refId; }
}
