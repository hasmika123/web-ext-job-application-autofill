package com.dossier.api.domain;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * What a user said about a job posting (E2E-U4.0): HIDE this posting or HIDE_COMPANY (every posting of that
 * company). A hidden posting never shows in that user's search. {@code companyKey} is the normalised company
 * name, kept after the posting is purged (then {@code postingId} is NULL). Goes with the account. See the changelog.
 */
@Entity
@Table(name = "job_feedback")
public class JobFeedback implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final String HIDE = "HIDE";
    public static final String HIDE_COMPANY = "HIDE_COMPANY";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "posting_id")
    private Long postingId;

    @Column(name = "kind", nullable = false, length = 12)
    private String signal;

    @Column(name = "company_key", length = 160)
    private String companyKey;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    public Long getId() {
        return id;
    }

    public Long getUserId() {
        return userId;
    }

    public void setUserId(Long userId) {
        this.userId = userId;
    }

    public Long getPostingId() {
        return postingId;
    }

    public void setPostingId(Long postingId) {
        this.postingId = postingId;
    }

    public String getSignal() {
        return signal;
    }

    public void setSignal(String signal) {
        this.signal = signal;
    }

    public String getCompanyKey() {
        return companyKey;
    }

    public void setCompanyKey(String companyKey) {
        this.companyKey = companyKey;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
}
