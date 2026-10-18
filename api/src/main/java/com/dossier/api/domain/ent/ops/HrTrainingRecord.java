package com.dossier.api.domain.ent.ops;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;
import java.time.LocalDate;

/** One employee's status on one training: due date and completed date (COMPLETED / PENDING / OVERDUE). Table {@code hr_training_record}; see docs/enterprise-v2/ops-data-foundation.md. Every query goes through an org-scoped repository method. */
@Entity
@Table(name = "hr_training_record")
public class HrTrainingRecord implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "employee_id", nullable = false)
    private Long employeeId;

    @Column(name = "training_id", nullable = false)
    private Long trainingId;

    @Column(name = "status", length = 20, nullable = false)
    private String status = "PENDING";

    @Column(name = "due_on", nullable = false)
    private LocalDate dueOn;

    @Column(name = "completed_on")
    private LocalDate completedOn;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getEmployeeId() { return employeeId; }
    public void setEmployeeId(Long employeeId) { this.employeeId = employeeId; }
    public Long getTrainingId() { return trainingId; }
    public void setTrainingId(Long trainingId) { this.trainingId = trainingId; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public LocalDate getDueOn() { return dueOn; }
    public void setDueOn(LocalDate dueOn) { this.dueOn = dueOn; }
    public LocalDate getCompletedOn() { return completedOn; }
    public void setCompletedOn(LocalDate completedOn) { this.completedOn = completedOn; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
