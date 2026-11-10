package com.dossier.api.domain;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * The resumable working copy of the {@code /profiles/setup} flow (Onboarding v2, DESIGN 8.1): one row
 * per user, keyed by the user's id. {@code stateJson} is the web's {@code SetupState} (candidates, the
 * Keep / Skip decisions, the cursor) and never the uploaded file or the raw resume text. It is not the
 * profile: nothing here reaches {@code bio.payload}, so the extension's mirror ({@code ProfileVersion})
 * never moves for a draft. {@code updatedAt} is the conflict token of {@code PUT /draft};
 * {@code expiresAt} = {@code updatedAt} + {@code onboarding.draft.ttlDays}, after which the nightly purge
 * deletes the row. See the changelog.
 */
@Entity
@Table(name = "onboarding_draft")
public class OnboardingDraft implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @Column(name = "user_id")
    private Long userId;

    /** The state schema version (2). */
    @Column(name = "v", nullable = false)
    private int v;

    @Column(name = "step", nullable = false, length = 16)
    private String step;

    /** Mirror of {@code bio.meta_json.onboarding.persona} for the card query; the truth is the meta. */
    @Column(name = "persona", length = 16)
    private String persona;

    @Column(name = "steps_done", nullable = false)
    private int stepsDone;

    @Column(name = "steps_total", nullable = false)
    private int stepsTotal = 7;

    @Lob
    @Column(name = "state_json", nullable = false)
    private String stateJson;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    public Long getUserId() {
        return userId;
    }

    public void setUserId(Long userId) {
        this.userId = userId;
    }

    public int getV() {
        return v;
    }

    public void setV(int v) {
        this.v = v;
    }

    public String getStep() {
        return step;
    }

    public void setStep(String step) {
        this.step = step;
    }

    public String getPersona() {
        return persona;
    }

    public void setPersona(String persona) {
        this.persona = persona;
    }

    public int getStepsDone() {
        return stepsDone;
    }

    public void setStepsDone(int stepsDone) {
        this.stepsDone = stepsDone;
    }

    public int getStepsTotal() {
        return stepsTotal;
    }

    public void setStepsTotal(int stepsTotal) {
        this.stepsTotal = stepsTotal;
    }

    public String getStateJson() {
        return stateJson;
    }

    public void setStateJson(String stateJson) {
        this.stateJson = stateJson;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public void setExpiresAt(Instant expiresAt) {
        this.expiresAt = expiresAt;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof OnboardingDraft other)) return false;
        return userId != null && userId.equals(other.userId);
    }

    @Override
    public int hashCode() {
        return getClass().hashCode();
    }
}
