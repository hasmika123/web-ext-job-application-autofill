package com.dossier.api.domain.ent.mkt;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;
import java.util.List;

/**
 * One follow-up item of the Marketing workspace (a call, email or chat the marketer owes a client or recruiter about a consultant). Table
 * {@code mkt_followup}. Overdue is DERIVED: not COMPLETED and {@code due_at} before now; no status stores it. Read by the Follow-ups page now and by
 * the Tasks page and the Home board later. Every query goes through an org-scoped {@code MktFollowupRepository} method.
 */
@Entity
@Table(name = "mkt_followup")
public class MktFollowup implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final String PHONE = "PHONE";
    public static final String EMAIL = "EMAIL";
    public static final String TEAMS = "TEAMS";
    public static final String CHAT = "CHAT";
    public static final String NOTE = "NOTE";
    public static final List<String> CHANNELS = List.of(PHONE, EMAIL, TEAMS, CHAT, NOTE);
    public static final List<String> PRIORITIES = List.of("HIGH", "MEDIUM", "LOW");
    public static final String COMPLETED = "COMPLETED";
    public static final String WAITING = "WAITING";
    public static final List<String> STATUSES = List.of("PENDING", "IN_PROGRESS", "SCHEDULED", "NOT_STARTED", WAITING, COMPLETED);

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "consultant_id", nullable = false)
    private Long consultantId;

    @Column(name = "application_id")
    private Long applicationId;

    @Column(name = "client_account_id")
    private Long clientAccountId;

    @Column(name = "title", length = 160, nullable = false)
    private String title;

    @Column(name = "detail", length = 200)
    private String detail;

    @Column(name = "counterpart_label", length = 120)
    private String counterpartLabel;

    @Column(name = "channel", length = 10, nullable = false)
    private String channel = PHONE;

    @Column(name = "priority", length = 10, nullable = false)
    private String priority = "MEDIUM";

    @Column(name = "status", length = 15, nullable = false)
    private String status = "PENDING";

    @Column(name = "due_at", nullable = false)
    private Instant dueAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    @Column(name = "owner_member_id")
    private Long ownerMemberId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @PreUpdate
    void touch() {
        updatedAt = Instant.now();
    }

    /** Derived: not completed and past due at {@code now}. */
    public boolean isOverdueAt(Instant now) {
        return !COMPLETED.equals(status) && dueAt != null && dueAt.isBefore(now);
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getConsultantId() { return consultantId; }
    public void setConsultantId(Long consultantId) { this.consultantId = consultantId; }
    public Long getApplicationId() { return applicationId; }
    public void setApplicationId(Long applicationId) { this.applicationId = applicationId; }
    public Long getClientAccountId() { return clientAccountId; }
    public void setClientAccountId(Long clientAccountId) { this.clientAccountId = clientAccountId; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getDetail() { return detail; }
    public void setDetail(String detail) { this.detail = detail; }
    public String getCounterpartLabel() { return counterpartLabel; }
    public void setCounterpartLabel(String counterpartLabel) { this.counterpartLabel = counterpartLabel; }
    public String getChannel() { return channel; }
    public void setChannel(String channel) { this.channel = channel; }
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
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
