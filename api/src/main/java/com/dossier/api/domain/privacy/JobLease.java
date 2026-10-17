package com.dossier.api.domain.privacy;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/** One row per background job: who holds it until when, and what its last run did. Written only through {@code JobLeaseService}. */
@Entity
@Table(name = "job_lease")
public class JobLease {

    @Id
    @Column(name = "name", length = 100, nullable = false)
    private String name;

    @Column(name = "locked_until")
    private Instant lockedUntil;

    @Column(name = "locked_by", length = 100)
    private String lockedBy;

    @Column(name = "last_run_at")
    private Instant lastRunAt;

    @Column(name = "last_summary", length = 500)
    private String lastSummary;

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public Instant getLockedUntil() { return lockedUntil; }
    public void setLockedUntil(Instant lockedUntil) { this.lockedUntil = lockedUntil; }
    public String getLockedBy() { return lockedBy; }
    public void setLockedBy(String lockedBy) { this.lockedBy = lockedBy; }
    public Instant getLastRunAt() { return lastRunAt; }
    public void setLastRunAt(Instant lastRunAt) { this.lastRunAt = lastRunAt; }
    public String getLastSummary() { return lastSummary; }
    public void setLastSummary(String lastSummary) { this.lastSummary = lastSummary; }
}
