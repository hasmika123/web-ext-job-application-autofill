package com.dossier.api.domain;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * One public company job board we read for daily job matches (Phase 13.6a): a Greenhouse, Lever or
 * Ashby board, named by its token (the company slug in the board's URL). {@code origin} is SEED (the
 * verified starter list), DISCOVERED (a company a user applied to — the company only, never who) or
 * ADMIN. Boards that keep failing are switched off, not deleted. See the changelog.
 */
@Entity
@Table(name = "job_source")
public class JobSource implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final String SEED = "SEED";
    public static final String DISCOVERED = "DISCOVERED";
    public static final String ADMIN = "ADMIN";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "ats", nullable = false, length = 20)
    private String ats;

    @Column(name = "board_token", nullable = false, length = 100)
    private String boardToken;

    @Column(name = "company_name", nullable = false, length = 200)
    private String companyName;

    @Column(name = "origin", nullable = false, length = 20)
    private String origin;

    @Column(name = "enabled", nullable = false)
    private boolean enabled = true;

    @Column(name = "last_fetched_at")
    private Instant lastFetchedAt;

    /** OK or FAILED — the last read's outcome for this board. */
    @Column(name = "last_status", length = 20)
    private String lastStatus;

    @Column(name = "last_error", length = 255)
    private String lastError;

    /** Open jobs on the board at the last read (all of them, not just fresh ones). */
    @Column(name = "last_job_count")
    private Integer lastJobCount;

    @Column(name = "consecutive_failures", nullable = false)
    private int consecutiveFailures;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    public JobSource() {}

    public JobSource(String ats, String boardToken, String companyName, String origin) {
        this.ats = ats;
        this.boardToken = boardToken;
        this.companyName = companyName;
        this.origin = origin;
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getAts() {
        return ats;
    }

    public String getBoardToken() {
        return boardToken;
    }

    public String getCompanyName() {
        return companyName;
    }

    public void setCompanyName(String companyName) {
        this.companyName = companyName;
    }

    public String getOrigin() {
        return origin;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public Instant getLastFetchedAt() {
        return lastFetchedAt;
    }

    public void setLastFetchedAt(Instant lastFetchedAt) {
        this.lastFetchedAt = lastFetchedAt;
    }

    public String getLastStatus() {
        return lastStatus;
    }

    public void setLastStatus(String lastStatus) {
        this.lastStatus = lastStatus;
    }

    public String getLastError() {
        return lastError;
    }

    public void setLastError(String lastError) {
        this.lastError = lastError == null || lastError.length() <= 255 ? lastError : lastError.substring(0, 255);
    }

    public Integer getLastJobCount() {
        return lastJobCount;
    }

    public void setLastJobCount(Integer lastJobCount) {
        this.lastJobCount = lastJobCount;
    }

    public int getConsecutiveFailures() {
        return consecutiveFailures;
    }

    public void setConsecutiveFailures(int consecutiveFailures) {
        this.consecutiveFailures = consecutiveFailures;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
