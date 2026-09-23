package com.dossier.api.domain;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * A cached job-fit report (Phase 13.3): one resume against one job. {@code cacheKey} hashes the
 * job description, the resume's content and the profile facts the red flags read, so any change is
 * a new key; {@code resultJson} holds only the report — score, one-line summary, short keyword lists
 * — never the job or resume text. See the changelog.
 */
@Entity
@Table(name = "job_fit")
public class JobFit implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

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
        if (!(o instanceof JobFit)) return false;
        return id != null && id.equals(((JobFit) o).id);
    }

    @Override
    public int hashCode() {
        return getClass().hashCode();
    }
}
