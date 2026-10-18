package com.dossier.api.domain.ent.ops;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;
import java.time.LocalDate;

/** One onboarding checklist item of an employee (title, due date, done). Table {@code hr_onboarding_item}; see docs/enterprise-v2/ops-data-foundation.md. Every query goes through an org-scoped repository method. */
@Entity
@Table(name = "hr_onboarding_item")
public class HrOnboardingItem implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "employee_id", nullable = false)
    private Long employeeId;

    @Column(name = "title", length = 120, nullable = false)
    private String title;

    @Column(name = "due_date")
    private LocalDate dueDate;

    @Column(name = "done", nullable = false)
    private boolean done = false;

    @Column(name = "done_at")
    private Instant doneAt;

    @Column(name = "required", nullable = false)
    private boolean required = true;

    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder = 0;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getEmployeeId() { return employeeId; }
    public void setEmployeeId(Long employeeId) { this.employeeId = employeeId; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public LocalDate getDueDate() { return dueDate; }
    public void setDueDate(LocalDate dueDate) { this.dueDate = dueDate; }
    public boolean isDone() { return done; }
    public void setDone(boolean done) { this.done = done; }
    public Instant getDoneAt() { return doneAt; }
    public void setDoneAt(Instant doneAt) { this.doneAt = doneAt; }
    public boolean isRequired() { return required; }
    public void setRequired(boolean required) { this.required = required; }
    public Integer getSortOrder() { return sortOrder; }
    public void setSortOrder(Integer sortOrder) { this.sortOrder = sortOrder; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
