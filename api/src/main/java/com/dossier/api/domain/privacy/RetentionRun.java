package com.dossier.api.domain.privacy;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/** The record of one retention sweep (a dry run included): which job, which window, how many rows qualified and how many went. Counts only. */
@Entity
@Table(name = "retention_run")
public class RetentionRun {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "job", length = 60, nullable = false)
    private String job;

    /** SCHEDULE or ADMIN. */
    @Column(name = "trigger_kind", length = 12, nullable = false)
    private String triggerKind;

    /** The admin login for an ADMIN run, null for a scheduled one. */
    @Column(name = "actor", length = 50)
    private String actor;

    @Column(name = "dry_run", nullable = false)
    private boolean dryRun;

    /** DONE, PARTIAL (batch cap reached, more remain), SKIPPED (switched off, or another instance held the lease) or FAILED. */
    @Column(name = "status", length = 12, nullable = false)
    private String status;

    @Column(name = "window_value")
    private Integer windowValue;

    @Column(name = "window_unit", length = 10)
    private String windowUnit;

    @Column(name = "cutoff_at")
    private Instant cutoffAt;

    @Column(name = "candidates", nullable = false)
    private long candidates;

    @Column(name = "deleted", nullable = false)
    private long deleted;

    @Column(name = "note", length = 300)
    private String note;

    @Column(name = "started_at", nullable = false)
    private Instant startedAt;

    @Column(name = "finished_at")
    private Instant finishedAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getJob() { return job; }
    public void setJob(String job) { this.job = job; }
    public String getTriggerKind() { return triggerKind; }
    public void setTriggerKind(String triggerKind) { this.triggerKind = triggerKind; }
    public String getActor() { return actor; }
    public void setActor(String actor) { this.actor = actor; }
    public boolean isDryRun() { return dryRun; }
    public void setDryRun(boolean dryRun) { this.dryRun = dryRun; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public Integer getWindowValue() { return windowValue; }
    public void setWindowValue(Integer windowValue) { this.windowValue = windowValue; }
    public String getWindowUnit() { return windowUnit; }
    public void setWindowUnit(String windowUnit) { this.windowUnit = windowUnit; }
    public Instant getCutoffAt() { return cutoffAt; }
    public void setCutoffAt(Instant cutoffAt) { this.cutoffAt = cutoffAt; }
    public long getCandidates() { return candidates; }
    public void setCandidates(long candidates) { this.candidates = candidates; }
    public long getDeleted() { return deleted; }
    public void setDeleted(long deleted) { this.deleted = deleted; }
    public String getNote() { return note; }
    public void setNote(String note) { this.note = note; }
    public Instant getStartedAt() { return startedAt; }
    public void setStartedAt(Instant startedAt) { this.startedAt = startedAt; }
    public Instant getFinishedAt() { return finishedAt; }
    public void setFinishedAt(Instant finishedAt) { this.finishedAt = finishedAt; }
}
