package com.dossier.api.domain.ent;

import com.dossier.api.domain.enumeration.AssignmentHealth;
import com.dossier.api.domain.enumeration.AssignmentKind;
import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * "The assignee works on this consultant, for this reason, from then until then" (17-consultant-assignments.md section 2,
 * ADR-008). Never a field on the member, never deleted: a reassignment ends the old row and opens a new one. X1.7 ships the table
 * and this mapping as an empty shell so the authorization order has something to read; the lifecycle (create, reassign,
 * delegate, workload) and the two generated unique keys (one open PRIMARY per consultant, no duplicate open triple) arrive with
 * X4.7. A row grants anything only while it is "effective": started, not ended, and health {@code OK}.
 */
@Entity
@Table(name = "org_assignment")
public class OrgAssignment implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    /** The beneficiary. */
    @Column(name = "consultant_member_id", nullable = false)
    private Long consultantMemberId;

    /** The actor. */
    @Column(name = "assignee_member_id", nullable = false)
    private Long assigneeMemberId;

    @Enumerated(EnumType.STRING)
    @Column(name = "kind", length = 20, nullable = false)
    private AssignmentKind kind;

    @Column(name = "starts_at", nullable = false)
    private Instant startsAt;

    /** Null = open. */
    @Column(name = "ends_at")
    private Instant endsAt;

    @Column(name = "reason", length = 200)
    private String reason;

    @Column(name = "end_reason", length = 30)
    private String endReason;

    @Column(name = "replaced_by_assignment_id")
    private Long replacedByAssignmentId;

    @Column(name = "created_by_member_id", nullable = false)
    private Long createdByMemberId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @Enumerated(EnumType.STRING)
    @Column(name = "health", length = 20, nullable = false)
    private AssignmentHealth health = AssignmentHealth.OK;

    @PreUpdate
    void touch() {
        updatedAt = Instant.now();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getConsultantMemberId() { return consultantMemberId; }
    public void setConsultantMemberId(Long consultantMemberId) { this.consultantMemberId = consultantMemberId; }
    public Long getAssigneeMemberId() { return assigneeMemberId; }
    public void setAssigneeMemberId(Long assigneeMemberId) { this.assigneeMemberId = assigneeMemberId; }
    public AssignmentKind getKind() { return kind; }
    public void setKind(AssignmentKind kind) { this.kind = kind; }
    public Instant getStartsAt() { return startsAt; }
    public void setStartsAt(Instant startsAt) { this.startsAt = startsAt; }
    public Instant getEndsAt() { return endsAt; }
    public void setEndsAt(Instant endsAt) { this.endsAt = endsAt; }
    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }
    public String getEndReason() { return endReason; }
    public void setEndReason(String endReason) { this.endReason = endReason; }
    public Long getReplacedByAssignmentId() { return replacedByAssignmentId; }
    public void setReplacedByAssignmentId(Long replacedByAssignmentId) { this.replacedByAssignmentId = replacedByAssignmentId; }
    public Long getCreatedByMemberId() { return createdByMemberId; }
    public void setCreatedByMemberId(Long createdByMemberId) { this.createdByMemberId = createdByMemberId; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
    public AssignmentHealth getHealth() { return health; }
    public void setHealth(AssignmentHealth health) { this.health = health; }
}
