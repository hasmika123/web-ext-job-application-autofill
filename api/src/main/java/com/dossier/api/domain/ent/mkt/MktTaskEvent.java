package com.dossier.api.domain.ent.mkt;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/** Append-only log of what happened to a task: CREATED, UPDATED, COMPLETED, REOPENED, REASSIGNED. Table {@code mkt_task_event}. Record only. */
@Entity
@Table(name = "mkt_task_event")
public class MktTaskEvent implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final String CREATED = "CREATED";
    public static final String UPDATED = "UPDATED";
    public static final String COMPLETED = "COMPLETED";
    public static final String REOPENED = "REOPENED";
    public static final String REASSIGNED = "REASSIGNED";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "task_id", nullable = false)
    private Long taskId;

    @Column(name = "kind", length = 20, nullable = false)
    private String kind;

    @Column(name = "note", length = 500)
    private String note;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt = Instant.now();

    @Column(name = "by_member_id")
    private Long byMemberId;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getTaskId() { return taskId; }
    public void setTaskId(Long taskId) { this.taskId = taskId; }
    public String getKind() { return kind; }
    public void setKind(String kind) { this.kind = kind; }
    public String getNote() { return note; }
    public void setNote(String note) { this.note = note; }
    public Instant getOccurredAt() { return occurredAt; }
    public void setOccurredAt(Instant occurredAt) { this.occurredAt = occurredAt; }
    public Long getByMemberId() { return byMemberId; }
    public void setByMemberId(Long byMemberId) { this.byMemberId = byMemberId; }
}
