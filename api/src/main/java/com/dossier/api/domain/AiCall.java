package com.dossier.api.domain;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * One successful AI provider call, as spend (Phase 13.1a): the kind of request, the model that
 * answered, the tokens billed and their cost in millionths of a US dollar. Never the prompt or the
 * answer. {@code login} is nulled on account deletion so the spend stays in the totals without
 * pointing at a person. See the changelog.
 */
@Entity
@Table(name = "ai_call")
public class AiCall implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "login", length = 50)
    private String login;

    @Column(name = "task", nullable = false, length = 12)
    private String task;

    @Column(name = "model", nullable = false, length = 80)
    private String model;

    @Column(name = "input_tokens", nullable = false)
    private int inputTokens;

    @Column(name = "cached_tokens", nullable = false)
    private int cachedTokens;

    @Column(name = "output_tokens", nullable = false)
    private int outputTokens;

    @Column(name = "cost_micros", nullable = false)
    private long costMicros;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    /** Which provider served (or failed) the call; rows from before I1.10 are {@code gemini}. */
    @Column(name = "provider", nullable = false, length = 20)
    private String provider = "gemini";

    @Column(name = "latency_ms")
    private Integer latencyMs;

    /** False for a FAILED attempt (cost 0): the ledger also records errors so the admin page can show them. */
    @Column(name = "success", nullable = false)
    private boolean success = true;

    /** Short code of why it failed (an {@code AiErrorKind}); never a provider message. */
    @Column(name = "error_kind", length = 24)
    private String errorKind;

    public Long getId() {
        return id;
    }

    public String getLogin() {
        return login;
    }

    public void setLogin(String login) {
        this.login = login;
    }

    public String getTask() {
        return task;
    }

    public void setTask(String task) {
        this.task = task;
    }

    public String getModel() {
        return model;
    }

    public void setModel(String model) {
        this.model = model;
    }

    public int getInputTokens() {
        return inputTokens;
    }

    public void setInputTokens(int inputTokens) {
        this.inputTokens = inputTokens;
    }

    public int getCachedTokens() {
        return cachedTokens;
    }

    public void setCachedTokens(int cachedTokens) {
        this.cachedTokens = cachedTokens;
    }

    public int getOutputTokens() {
        return outputTokens;
    }

    public void setOutputTokens(int outputTokens) {
        this.outputTokens = outputTokens;
    }

    public long getCostMicros() {
        return costMicros;
    }

    public void setCostMicros(long costMicros) {
        this.costMicros = costMicros;
    }

    public String getProvider() {
        return provider;
    }

    public void setProvider(String provider) {
        this.provider = provider;
    }

    public Integer getLatencyMs() {
        return latencyMs;
    }

    public void setLatencyMs(Integer latencyMs) {
        this.latencyMs = latencyMs;
    }

    public boolean isSuccess() {
        return success;
    }

    public void setSuccess(boolean success) {
        this.success = success;
    }

    public String getErrorKind() {
        return errorKind;
    }

    public void setErrorKind(String errorKind) {
        this.errorKind = errorKind;
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
        if (!(o instanceof AiCall)) return false;
        return id != null && id.equals(((AiCall) o).id);
    }

    @Override
    public int hashCode() {
        return getClass().hashCode();
    }
}
