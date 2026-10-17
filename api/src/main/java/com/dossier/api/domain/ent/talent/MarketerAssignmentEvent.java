package com.dossier.api.domain.ent.talent;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * One line of the history of a consultant's marketer assignment (Sprint 2 / B1): who changed it, when, why, what it was and what it became, and how
 * much open work moved with it. Append-only: the application never updates or deletes a row. Table {@code marketer_assignment_event}. The reason is
 * free text typed by a person and is scanned for sensitive data before it is stored.
 */
@Entity
@Table(name = "marketer_assignment_event")
public class MarketerAssignmentEvent implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final String ASSIGN = "ASSIGN";
    public static final String REASSIGN = "REASSIGN";
    public static final String UNASSIGN = "UNASSIGN";
    public static final String BACKUP = "BACKUP";
    public static final String PAUSE = "PAUSE";
    public static final String RESUME = "RESUME";
    public static final String PRIORITY = "PRIORITY";
    public static final String RESTORE = "RESTORE";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "consultant_id", nullable = false)
    private Long consultantId;

    @Column(name = "action", length = 20, nullable = false)
    private String action;

    @Column(name = "from_marketer_member_id")
    private Long fromMarketerMemberId;

    @Column(name = "to_marketer_member_id")
    private Long toMarketerMemberId;

    @Column(name = "from_backup_member_id")
    private Long fromBackupMemberId;

    @Column(name = "to_backup_member_id")
    private Long toBackupMemberId;

    @Column(name = "reason", length = 200)
    private String reason;

    @Column(name = "actor_member_id")
    private Long actorMemberId;

    @Column(name = "handover_summary", length = 300)
    private String handoverSummary;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getConsultantId() { return consultantId; }
    public void setConsultantId(Long consultantId) { this.consultantId = consultantId; }
    public String getAction() { return action; }
    public void setAction(String action) { this.action = action; }
    public Long getFromMarketerMemberId() { return fromMarketerMemberId; }
    public void setFromMarketerMemberId(Long v) { this.fromMarketerMemberId = v; }
    public Long getToMarketerMemberId() { return toMarketerMemberId; }
    public void setToMarketerMemberId(Long v) { this.toMarketerMemberId = v; }
    public Long getFromBackupMemberId() { return fromBackupMemberId; }
    public void setFromBackupMemberId(Long v) { this.fromBackupMemberId = v; }
    public Long getToBackupMemberId() { return toBackupMemberId; }
    public void setToBackupMemberId(Long v) { this.toBackupMemberId = v; }
    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }
    public Long getActorMemberId() { return actorMemberId; }
    public void setActorMemberId(Long actorMemberId) { this.actorMemberId = actorMemberId; }
    public String getHandoverSummary() { return handoverSummary; }
    public void setHandoverSummary(String handoverSummary) { this.handoverSummary = handoverSummary; }
    public Instant getOccurredAt() { return occurredAt; }
    public void setOccurredAt(Instant occurredAt) { this.occurredAt = occurredAt; }
}
