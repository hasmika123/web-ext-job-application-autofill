package com.dossier.api.domain;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * The user's own free text about one application (APP-E2E U6.1). Every write is checked for values the
 * product never collects before it gets here (SensitiveContent). Removed with its application.
 */
@Entity
@Table(name = "application_note")
public class ApplicationNote implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "application_id", nullable = false)
    private Long applicationId;

    @Lob
    @Column(name = "body", nullable = false)
    private String body;

    @Column(name = "pinned", nullable = false)
    private boolean pinned;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    // ---- Change audit (docs/change-audit/README.md section 2.2): who made / last wrote this row. No foreign keys: rows outlive the writer.

    @Column(name = "created_by_user_id")
    private Long createdByUserId;

    @Column(name = "created_by_login", length = 50)
    private String createdByLogin;

    @Column(name = "updated_by_user_id")
    private Long updatedByUserId;

    @Column(name = "updated_by_login", length = 50)
    private String updatedByLogin;

    public Long getId() {
        return id;
    }

    public Long getApplicationId() {
        return applicationId;
    }

    public void setApplicationId(Long applicationId) {
        this.applicationId = applicationId;
    }

    public String getBody() {
        return body;
    }

    public void setBody(String body) {
        this.body = body;
    }

    public boolean isPinned() {
        return pinned;
    }

    public void setPinned(boolean pinned) {
        this.pinned = pinned;
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

    public Long getCreatedByUserId() {
        return createdByUserId;
    }

    public void setCreatedByUserId(Long createdByUserId) {
        this.createdByUserId = createdByUserId;
    }

    public String getCreatedByLogin() {
        return createdByLogin;
    }

    public void setCreatedByLogin(String createdByLogin) {
        this.createdByLogin = createdByLogin;
    }

    public Long getUpdatedByUserId() {
        return updatedByUserId;
    }

    public void setUpdatedByUserId(Long updatedByUserId) {
        this.updatedByUserId = updatedByUserId;
    }

    public String getUpdatedByLogin() {
        return updatedByLogin;
    }

    public void setUpdatedByLogin(String updatedByLogin) {
        this.updatedByLogin = updatedByLogin;
    }
}
