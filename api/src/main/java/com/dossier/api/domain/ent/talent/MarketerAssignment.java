package com.dossier.api.domain.ent.talent;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/** One current marketer (+ optional backup) per consultant for the Marketing Assignments board; consultants need not be seats, so org_assignment cannot hold it. Table {@code marketer_assignment}; see docs/enterprise-v2/talent-foundation.md. Every query goes through an org-scoped repository method. */
@Entity
@Table(name = "marketer_assignment")
public class MarketerAssignment implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "consultant_id", nullable = false)
    private Long consultantId;

    @Column(name = "marketer_member_id", nullable = false)
    private Long marketerMemberId;

    @Column(name = "backup_member_id")
    private Long backupMemberId;

    @Column(name = "priority", length = 10, nullable = false)
    private String priority = "MEDIUM";

    @Column(name = "status", length = 20, nullable = false)
    private String status = "ACTIVE";

    @Column(name = "assigned_at", nullable = false)
    private Instant assignedAt = Instant.now();

    @Column(name = "assigned_by_member_id")
    private Long assignedByMemberId;

    @Column(name = "last_activity_at")
    private Instant lastActivityAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @PreUpdate
    void touch() {
        updatedAt = Instant.now();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getConsultantId() { return consultantId; }
    public void setConsultantId(Long consultantId) { this.consultantId = consultantId; }
    public Long getMarketerMemberId() { return marketerMemberId; }
    public void setMarketerMemberId(Long marketerMemberId) { this.marketerMemberId = marketerMemberId; }
    public Long getBackupMemberId() { return backupMemberId; }
    public void setBackupMemberId(Long backupMemberId) { this.backupMemberId = backupMemberId; }
    public String getPriority() { return priority; }
    public void setPriority(String priority) { this.priority = priority; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public Instant getAssignedAt() { return assignedAt; }
    public void setAssignedAt(Instant assignedAt) { this.assignedAt = assignedAt; }
    public Long getAssignedByMemberId() { return assignedByMemberId; }
    public void setAssignedByMemberId(Long assignedByMemberId) { this.assignedByMemberId = assignedByMemberId; }
    public Instant getLastActivityAt() { return lastActivityAt; }
    public void setLastActivityAt(Instant lastActivityAt) { this.lastActivityAt = lastActivityAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
