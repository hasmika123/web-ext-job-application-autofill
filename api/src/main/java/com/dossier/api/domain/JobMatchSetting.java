package com.dossier.api.domain;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * A user's daily-job-match switch (Phase 13.6b): the standing opt-in — off until they turn it on,
 * because matching sends their resume summary and preferences to the AI provider every night without
 * a click — and what the last nightly match did for them. Keyed by user id. See the changelog.
 */
@Entity
@Table(name = "job_match_setting")
public class JobMatchSetting implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @Column(name = "user_id")
    private Long userId;

    @Column(name = "enabled", nullable = false)
    private boolean enabled;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @Column(name = "last_run_at")
    private Instant lastRunAt;

    /** OK, NO_CANDIDATES, NO_RESUME, NOT_PRO, BUDGET_EXHAUSTED, DISABLED or ERROR. */
    @Column(name = "last_status", length = 30)
    private String lastStatus;

    /** Postings sent for scoring on the last run. */
    @Column(name = "last_candidates")
    private Integer lastCandidates;

    /** Of those, how many scored high enough to show. */
    @Column(name = "last_matched")
    private Integer lastMatched;

    public JobMatchSetting() {}

    public JobMatchSetting(Long userId) {
        this.userId = userId;
    }

    public Long getUserId() {
        return userId;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
        this.updatedAt = Instant.now();
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public Instant getLastRunAt() {
        return lastRunAt;
    }

    public void setLastRunAt(Instant lastRunAt) {
        this.lastRunAt = lastRunAt;
    }

    public String getLastStatus() {
        return lastStatus;
    }

    public void setLastStatus(String lastStatus) {
        this.lastStatus = lastStatus;
    }

    public Integer getLastCandidates() {
        return lastCandidates;
    }

    public void setLastCandidates(Integer lastCandidates) {
        this.lastCandidates = lastCandidates;
    }

    public Integer getLastMatched() {
        return lastMatched;
    }

    public void setLastMatched(Integer lastMatched) {
        this.lastMatched = lastMatched;
    }
}
