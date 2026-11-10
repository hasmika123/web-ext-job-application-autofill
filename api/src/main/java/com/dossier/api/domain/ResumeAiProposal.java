package com.dossier.api.domain;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * A checked AI proposal against one resume document (Resume Builder, DESIGN 5.6); generalises
 * {@link ResumeTailor}. Pinned to the document it was made from by {@code contentHash}; applying
 * it to a document that has since changed is refused. {@code resultJson} never holds the job
 * description. {@code resumeId} is deliberately not a foreign key (see the changelog).
 */
@Entity
@Table(name = "resume_ai_proposal")
public class ResumeAiProposal implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final String STATUS_OPEN = "OPEN";
    public static final String STATUS_APPLIED = "APPLIED";
    public static final String STATUS_DISMISSED = "DISMISSED";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "resume_id", nullable = false)
    private Long resumeId;

    @Column(name = "content_hash", nullable = false, length = 64)
    private String contentHash;

    /** tailor | rewrite | summary | fit | cover | translate */
    @Column(name = "task", nullable = false, length = 12)
    private String task;

    /** rewrite only: stronger | shorter | formal | plain | grammar */
    @Column(name = "mode", length = 16)
    private String mode;

    @Column(name = "cache_key", nullable = false, length = 64)
    private String cacheKey;

    @Column(name = "result_json", nullable = false, columnDefinition = "json")
    private String resultJson;

    @Column(name = "status", nullable = false, length = 10)
    private String status = STATUS_OPEN;

    @Column(name = "model", length = 80)
    private String model;

    /** Suggestion cards: the one-line headline ("Make your summary stronger"). */
    @Column(name = "title", length = 80)
    private String title;

    /** Suggestion cards: the one-line explanation. */
    @Column(name = "body", length = 240)
    private String body;

    /** Suggestion cards: summary | bullets | skills | section | keywords. */
    @Column(name = "kind", length = 12)
    private String kind;

    /** Provenance: the AI call that made it (no foreign key). */
    @Column(name = "ai_call_id")
    private Long aiCallId;

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

    public String getContentHash() {
        return contentHash;
    }

    public void setContentHash(String contentHash) {
        this.contentHash = contentHash;
    }

    public String getTask() {
        return task;
    }

    public void setTask(String task) {
        this.task = task;
    }

    public String getMode() {
        return mode;
    }

    public void setMode(String mode) {
        this.mode = mode;
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

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getModel() {
        return model;
    }

    public void setModel(String model) {
        this.model = model;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getBody() {
        return body;
    }

    public void setBody(String body) {
        this.body = body;
    }

    public String getKind() {
        return kind;
    }

    public void setKind(String kind) {
        this.kind = kind;
    }

    public Long getAiCallId() {
        return aiCallId;
    }

    public void setAiCallId(Long aiCallId) {
        this.aiCallId = aiCallId;
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
        if (!(o instanceof ResumeAiProposal)) return false;
        return id != null && id.equals(((ResumeAiProposal) o).id);
    }

    @Override
    public int hashCode() {
        return getClass().hashCode();
    }
}
