package com.dossier.api.domain.ent.mgmt;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/** One line of an escalation's append-only trail (RAISED, ACKNOWLEDGED, ASSIGNED, SNOOZED, COMMENTED, RESOLVED, DISMISSED, REOPENED). Table {@code mkt_escalation_event}; the note is a short, scanned text. Every query goes through an org-scoped repository method. */
@Entity
@Table(name = "mkt_escalation_event")
public class MktEscalationEvent implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final String RAISED = "RAISED";
    public static final String ACKNOWLEDGED = "ACKNOWLEDGED";
    public static final String ASSIGNED = "ASSIGNED";
    public static final String SNOOZED = "SNOOZED";
    public static final String COMMENTED = "COMMENTED";
    public static final String RESOLVED = "RESOLVED";
    public static final String DISMISSED = "DISMISSED";
    public static final String REOPENED = "REOPENED";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "escalation_id", nullable = false)
    private Long escalationId;

    @Column(name = "kind", length = 20, nullable = false)
    private String kind;

    @Column(name = "actor_member_id")
    private Long actorMemberId;

    @Column(name = "note", length = 500)
    private String note;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getEscalationId() { return escalationId; }
    public void setEscalationId(Long escalationId) { this.escalationId = escalationId; }
    public String getKind() { return kind; }
    public void setKind(String kind) { this.kind = kind; }
    public Long getActorMemberId() { return actorMemberId; }
    public void setActorMemberId(Long actorMemberId) { this.actorMemberId = actorMemberId; }
    public String getNote() { return note; }
    public void setNote(String note) { this.note = note; }
    public Instant getOccurredAt() { return occurredAt; }
    public void setOccurredAt(Instant occurredAt) { this.occurredAt = occurredAt; }
}
