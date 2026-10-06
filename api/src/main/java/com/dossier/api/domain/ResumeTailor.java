package com.dossier.api.domain;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * A checked tailoring proposal (Phase 13.4): rewrites of one resume's existing bullets and summary
 * for one job, plus a reordering of its skills. Pinned to the exact resume content it came from by
 * {@code resumeId} + {@code resumeHash}; applying it builds the new resume from this row, never from
 * client text. See the changelog.
 */
@Entity
@Table(name = "resume_tailor")
public class ResumeTailor implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "resume_id", nullable = false)
    private Long resumeId;

    @Column(name = "resume_hash", nullable = false, length = 64)
    private String resumeHash;

    @Column(name = "cache_key", nullable = false, length = 64)
    private String cacheKey;

    @Lob
    @Column(name = "result_json", nullable = false)
    private String resultJson;

    @Column(name = "model", length = 80)
    private String model;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    public Long getId() {
        return id;
    }

    public User getUser() {
        return user;
    }

    public void setUser(User user) {
        this.user = user;
    }

    public Long getResumeId() {
        return resumeId;
    }

    public void setResumeId(Long resumeId) {
        this.resumeId = resumeId;
    }

    public String getResumeHash() {
        return resumeHash;
    }

    public void setResumeHash(String resumeHash) {
        this.resumeHash = resumeHash;
    }

    public String getCacheKey() {
        return cacheKey;
    }

    public void setCacheKey(String cacheKey) {
        this.cacheKey = cacheKey;
    }

    public String getResultJson() {
        return resultJson;
    }

    public void setResultJson(String resultJson) {
        this.resultJson = resultJson;
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

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof ResumeTailor)) return false;
        return id != null && id.equals(((ResumeTailor) o).id);
    }

    @Override
    public int hashCode() {
        return getClass().hashCode();
    }
}
