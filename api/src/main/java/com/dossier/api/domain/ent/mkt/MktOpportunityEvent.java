package com.dossier.api.domain.ent.mkt;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/** One line of the opportunity activity feed (who did what to an opportunity, when). Table {@code mkt_opportunity_event}; {@code text} is a short verb phrase, never free text. Every query goes through an org-scoped repository method. */
@Entity
@Table(name = "mkt_opportunity_event")
public class MktOpportunityEvent implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "opportunity_id", nullable = false)
    private Long opportunityId;

    @Column(name = "kind", length = 30, nullable = false)
    private String kind;

    @Column(name = "actor_member_id")
    private Long actorMemberId;

    @Column(name = "text", length = 200, nullable = false)
    private String text;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getOpportunityId() { return opportunityId; }
    public void setOpportunityId(Long opportunityId) { this.opportunityId = opportunityId; }
    public String getKind() { return kind; }
    public void setKind(String kind) { this.kind = kind; }
    public Long getActorMemberId() { return actorMemberId; }
    public void setActorMemberId(Long actorMemberId) { this.actorMemberId = actorMemberId; }
    public String getText() { return text; }
    public void setText(String text) { this.text = text; }
    public Instant getOccurredAt() { return occurredAt; }
    public void setOccurredAt(Instant occurredAt) { this.occurredAt = occurredAt; }
}
