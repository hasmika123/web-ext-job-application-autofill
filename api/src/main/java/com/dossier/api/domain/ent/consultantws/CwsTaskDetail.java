package com.dossier.api.domain.ent.consultantws;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * The extra facts the Consultant workspace Tasks page keeps for one {@link CwsTask}: its type, an optional linked job and who assigned it.
 * Table {@code cws_task_detail}. Every query goes through an org-scoped repository method; a task without a row is a general self-made task.
 */
@Entity
@Table(name = "cws_task_detail")
public class CwsTaskDetail implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "consultant_id", nullable = false)
    private Long consultantId;

    @Column(name = "task_id", nullable = false)
    private Long taskId;

    @Column(name = "task_type", length = 30, nullable = false)
    private String taskType = "OTHER";

    @Column(name = "requirement_id")
    private Long requirementId;

    @Column(name = "assigned_by_member_id")
    private Long assignedByMemberId;

    @Column(name = "assigned_by_label", length = 120)
    private String assignedByLabel;

    @Column(name = "sample_data", nullable = false)
    private boolean sampleData;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getConsultantId() { return consultantId; }
    public void setConsultantId(Long consultantId) { this.consultantId = consultantId; }
    public Long getTaskId() { return taskId; }
    public void setTaskId(Long taskId) { this.taskId = taskId; }
    public String getTaskType() { return taskType; }
    public void setTaskType(String taskType) { this.taskType = taskType; }
    public Long getRequirementId() { return requirementId; }
    public void setRequirementId(Long requirementId) { this.requirementId = requirementId; }
    public Long getAssignedByMemberId() { return assignedByMemberId; }
    public void setAssignedByMemberId(Long assignedByMemberId) { this.assignedByMemberId = assignedByMemberId; }
    public String getAssignedByLabel() { return assignedByLabel; }
    public void setAssignedByLabel(String assignedByLabel) { this.assignedByLabel = assignedByLabel; }
    public boolean isSampleData() { return sampleData; }
    public void setSampleData(boolean sampleData) { this.sampleData = sampleData; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
