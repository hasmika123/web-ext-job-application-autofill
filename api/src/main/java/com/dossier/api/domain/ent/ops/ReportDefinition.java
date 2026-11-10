package com.dossier.api.domain.ent.ops;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/** A saved report (Reports Library row): type, owner, description, schedule and the last-run summary. source_key names the built-in computation. Table {@code report_definition}; see docs/enterprise-v2/ops-data-foundation.md. Every query goes through an org-scoped repository method. */
@Entity
@Table(name = "report_definition")
public class ReportDefinition implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "name", length = 120, nullable = false)
    private String name;

    @Column(name = "description", length = 300)
    private String description;

    @Column(name = "report_type", length = 20, nullable = false)
    private String reportType;

    @Column(name = "source_key", length = 40, nullable = false)
    private String sourceKey;

    @Column(name = "owner_member_id")
    private Long ownerMemberId;

    @Column(name = "status", length = 20, nullable = false)
    private String status = "ACTIVE";

    @Column(name = "schedule_frequency", length = 10, nullable = false)
    private String scheduleFrequency = "NONE";

    @Column(name = "schedule_day")
    private Integer scheduleDay;

    @Column(name = "schedule_time", length = 5)
    private String scheduleTime;

    @Column(name = "last_run_at")
    private Instant lastRunAt;

    @Column(name = "last_run_status", length = 20)
    private String lastRunStatus;

    @Column(name = "last_run_summary", length = 200)
    private String lastRunSummary;

    @Column(name = "next_run_at")
    private Instant nextRunAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

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
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getReportType() { return reportType; }
    public void setReportType(String reportType) { this.reportType = reportType; }
    public String getSourceKey() { return sourceKey; }
    public void setSourceKey(String sourceKey) { this.sourceKey = sourceKey; }
    public Long getOwnerMemberId() { return ownerMemberId; }
    public void setOwnerMemberId(Long ownerMemberId) { this.ownerMemberId = ownerMemberId; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getScheduleFrequency() { return scheduleFrequency; }
    public void setScheduleFrequency(String scheduleFrequency) { this.scheduleFrequency = scheduleFrequency; }
    public Integer getScheduleDay() { return scheduleDay; }
    public void setScheduleDay(Integer scheduleDay) { this.scheduleDay = scheduleDay; }
    public String getScheduleTime() { return scheduleTime; }
    public void setScheduleTime(String scheduleTime) { this.scheduleTime = scheduleTime; }
    public Instant getLastRunAt() { return lastRunAt; }
    public void setLastRunAt(Instant lastRunAt) { this.lastRunAt = lastRunAt; }
    public String getLastRunStatus() { return lastRunStatus; }
    public void setLastRunStatus(String lastRunStatus) { this.lastRunStatus = lastRunStatus; }
    public String getLastRunSummary() { return lastRunSummary; }
    public void setLastRunSummary(String lastRunSummary) { this.lastRunSummary = lastRunSummary; }
    public Instant getNextRunAt() { return nextRunAt; }
    public void setNextRunAt(Instant nextRunAt) { this.nextRunAt = nextRunAt; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
