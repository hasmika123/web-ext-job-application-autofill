package com.dossier.api.domain.ent.mkt;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;
import java.util.List;

/**
 * One task of the Marketing workspace (Tasks board): something the marketer owes, about a consultant, a client or neither. Table {@code mkt_task}.
 * Overdue is DERIVED (not COMPLETED and {@code due_at} before now); no status stores it. A task only RECORDS work; it never submits for a consultant
 * and never mails anyone (E1). Every query goes through an org-scoped {@code MktTaskRepository} method.
 */
@Entity
@Table(name = "mkt_task")
public class MktTask implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final List<String> CATEGORIES =
        List.of("JOB_OPPORTUNITY", "RESUME", "CLIENT", "JOB_MATCH", "APPLICATION", "JOB_STREAM", "INTERVIEW", "CONTENT", "MARKETING", "FOLLOW_UP");
    public static final List<String> PRIORITIES = List.of("HIGH", "MEDIUM", "LOW");
    public static final String NOT_STARTED = "NOT_STARTED";
    public static final String PENDING = "PENDING";
    public static final String IN_PROGRESS = "IN_PROGRESS";
    public static final String COMPLETED = "COMPLETED";
    public static final List<String> STATUSES = List.of(NOT_STARTED, PENDING, IN_PROGRESS, COMPLETED);

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "consultant_id")
    private Long consultantId;

    @Column(name = "client_account_id")
    private Long clientAccountId;

    /** Free label for a task about neither a consultant nor a client record ("All Consultants", an ATS name). */
    @Column(name = "related_label", length = 120)
    private String relatedLabel;

    @Column(name = "title", length = 160, nullable = false)
    private String title;

    @Column(name = "detail", length = 200)
    private String detail;

    @Column(name = "category", length = 20, nullable = false)
    private String category = "FOLLOW_UP";

    @Column(name = "priority", length = 10, nullable = false)
    private String priority = "MEDIUM";

    @Column(name = "status", length = 15, nullable = false)
    private String status = NOT_STARTED;

    @Column(name = "due_at", nullable = false)
    private Instant dueAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    @Column(name = "owner_member_id", nullable = false)
    private Long ownerMemberId;

    @Column(name = "created_by_member_id")
    private Long createdByMemberId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @PreUpdate
    void touch() {
        updatedAt = Instant.now();
    }

    public boolean isOpen() {
        return !COMPLETED.equals(status);
    }

    /** Derived: not completed and past due at {@code now}. */
    public boolean isOverdueAt(Instant now) {
        return isOpen() && dueAt != null && dueAt.isBefore(now);
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getConsultantId() { return consultantId; }
    public void setConsultantId(Long consultantId) { this.consultantId = consultantId; }
    public Long getClientAccountId() { return clientAccountId; }
    public void setClientAccountId(Long clientAccountId) { this.clientAccountId = clientAccountId; }
    public String getRelatedLabel() { return relatedLabel; }
    public void setRelatedLabel(String relatedLabel) { this.relatedLabel = relatedLabel; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getDetail() { return detail; }
    public void setDetail(String detail) { this.detail = detail; }
    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }
    public String getPriority() { return priority; }
    public void setPriority(String priority) { this.priority = priority; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public Instant getDueAt() { return dueAt; }
    public void setDueAt(Instant dueAt) { this.dueAt = dueAt; }
    public Instant getCompletedAt() { return completedAt; }
    public void setCompletedAt(Instant completedAt) { this.completedAt = completedAt; }
    public Long getOwnerMemberId() { return ownerMemberId; }
    public void setOwnerMemberId(Long ownerMemberId) { this.ownerMemberId = ownerMemberId; }
    public Long getCreatedByMemberId() { return createdByMemberId; }
    public void setCreatedByMemberId(Long createdByMemberId) { this.createdByMemberId = createdByMemberId; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
