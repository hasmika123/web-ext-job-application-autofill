package com.dossier.api.service.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.swagger.v3.oas.annotations.media.Schema;
import java.io.Serializable;
import java.time.Instant;

/**
 * The state of a built resume's stored PDF (Resume Builder DESIGN 8.5): what the editor's top bar, the
 * list chips and the extension read, so nobody guesses. {@code status} is the stored job status
 * ({@code NONE | PENDING | RUNNING | READY | FAILED}) except that a READY file whose render hash no
 * longer matches the document is reported as {@code STALE}.
 *
 * <p>{@code pollMs} / {@code pollWindowMs} are only set on the editor's endpoints: the server tells the
 * editor how often to ask again and for how long after a save, so those intervals stay settings.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ResumePdfDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    @Schema(allowableValues = { "NONE", "PENDING", "RUNNING", "READY", "FAILED", "STALE" })
    private String status;

    @Schema(description = "Render hash of the stored PDF (null when there is none).")
    private String hash;

    @Schema(description = "When the stored PDF was generated.")
    private Instant generatedAt;

    private int attempts;
    private String error;

    @Schema(description = "Editor endpoints only: milliseconds between status polls.")
    private Integer pollMs;

    @Schema(description = "Editor endpoints only: how long after the last save to keep polling, in milliseconds.")
    private Integer pollWindowMs;

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getHash() {
        return hash;
    }

    public void setHash(String hash) {
        this.hash = hash;
    }

    public Instant getGeneratedAt() {
        return generatedAt;
    }

    public void setGeneratedAt(Instant generatedAt) {
        this.generatedAt = generatedAt;
    }

    public int getAttempts() {
        return attempts;
    }

    public void setAttempts(int attempts) {
        this.attempts = attempts;
    }

    public String getError() {
        return error;
    }

    public void setError(String error) {
        this.error = error;
    }

    public Integer getPollMs() {
        return pollMs;
    }

    public void setPollMs(Integer pollMs) {
        this.pollMs = pollMs;
    }

    public Integer getPollWindowMs() {
        return pollWindowMs;
    }

    public void setPollWindowMs(Integer pollWindowMs) {
        this.pollWindowMs = pollWindowMs;
    }
}
