package com.dossier.api.domain;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * One fresh posting scored for one user (Phase 13.6b): the match % and a one-line reason, and the
 * user's verdict — NEW, DISMISSED (hidden) or SAVED (added to their board). Every posting sent for
 * scoring gets a row, so nothing is scored twice. See the changelog.
 */
@Entity
@Table(name = "job_match")
public class JobMatch implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final String NEW = "NEW";
    public static final String DISMISSED = "DISMISSED";
    public static final String SAVED = "SAVED";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "posting_id", nullable = false)
    private JobPosting posting;

    @Column(name = "score", nullable = false)
    private int score;

    @Column(name = "reason", length = 300)
    private String reason;

    @Column(name = "status", nullable = false, length = 20)
    private String status = NEW;

    @Column(name = "model", length = 80)
    private String model;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    public Long getId() {
        return id;
    }

    public User getUser() {
        return user;
    }

    public void setUser(User user) {
        this.user = user;
    }

    public JobPosting getPosting() {
        return posting;
    }

    public void setPosting(JobPosting posting) {
        this.posting = posting;
    }

    public int getScore() {
        return score;
    }

    public void setScore(int score) {
        this.score = score;
    }

    public String getReason() {
        return reason;
    }

    public void setReason(String reason) {
        this.reason = reason;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
        this.updatedAt = Instant.now();
    }

    public String getModel() {
        return model;
    }

    public void setModel(String model) {
        this.model = model;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
