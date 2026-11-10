package com.dossier.api.domain.ent;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * A scheduled last day (15-employees-and-teams.md section 5, step 2): the seat stays ACTIVE (or SUSPENDED) until {@code effectiveAt},
 * then the hourly offboarding job applies the same transition as an immediate offboard. {@code status} is PENDING, DONE, CANCELLED
 * (the scheduler withdrew it) or FAILED (the job found a guard that no longer allows it, for instance the last administrator); at
 * most one PENDING row per member is a database fact ({@code pending_key}, generated and read-only here).
 */
@Entity
@Table(name = "org_member_offboarding")
public class OrgMemberOffboarding implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final String PENDING = "PENDING";
    public static final String DONE = "DONE";
    public static final String CANCELLED = "CANCELLED";
    public static final String FAILED = "FAILED";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "member_id", nullable = false)
    private Long memberId;

    @Column(name = "effective_at", nullable = false)
    private Instant effectiveAt;

    @Column(name = "reason", length = 500, nullable = false)
    private String reason;

    @Column(name = "created_by_member_id")
    private Long createdByMemberId;

    @Column(name = "status", length = 12, nullable = false)
    private String status = PENDING;

    /** Short machine text of how it ended (a refusal code for FAILED); never a person's data. */
    @Column(name = "outcome", length = 200)
    private String outcome;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "done_at")
    private Instant doneAt;

    @Column(name = "pending_key", insertable = false, updatable = false)
    private Long pendingKey;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getMemberId() { return memberId; }
    public void setMemberId(Long memberId) { this.memberId = memberId; }
    public Instant getEffectiveAt() { return effectiveAt; }
    public void setEffectiveAt(Instant effectiveAt) { this.effectiveAt = effectiveAt; }
    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }
    public Long getCreatedByMemberId() { return createdByMemberId; }
    public void setCreatedByMemberId(Long createdByMemberId) { this.createdByMemberId = createdByMemberId; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getOutcome() { return outcome; }
    public void setOutcome(String outcome) { this.outcome = outcome; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getDoneAt() { return doneAt; }
    public void setDoneAt(Instant doneAt) { this.doneAt = doneAt; }
    public Long getPendingKey() { return pendingKey; }
}
