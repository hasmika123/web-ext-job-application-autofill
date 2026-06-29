package com.dossier.api.domain;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * Immutable, append-only record of an admin-console action (Phase 9.A1).
 *
 * Every admin mutation and every reason-gated PII access writes one row: who did it
 * ({@code actorLogin}), what ({@code action}), against which target ({@code targetType} +
 * {@code targetId}), why ({@code reason} — required for PII reads), and when. Rows are never
 * updated or deleted (GDPR Art. 30/32 accountability); the admin UI is read-only over this.
 *
 * Keyed by login strings (no FK to jhi_user) so the trail survives even after a target user
 * is deleted (GDPR erase). Not part of any user's data graph.
 */
@Entity
@Table(name = "admin_audit_event")
public class AdminAuditEvent implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    /** Login of the admin who performed the action. */
    @Column(name = "actor_login", length = 50, nullable = false)
    private String actorLogin;

    /** Machine-readable action key, e.g. {@code USER_DEACTIVATE} (see AdminAuditService constants). */
    @Column(name = "action", length = 100, nullable = false)
    private String action;

    /** Kind of target, e.g. {@code USER}. Nullable for non-targeted actions. */
    @Column(name = "target_type", length = 50)
    private String targetType;

    /** Target identifier (e.g. the affected user's login). Nullable. */
    @Column(name = "target_id", length = 191)
    private String targetId;

    /** Operator-supplied reason — required before any PII content access. Nullable otherwise. */
    @Column(name = "reason", length = 1000)
    private String reason;

    /** Free-form extra context (old→new values, counts, etc.). Nullable. */
    @Column(name = "details", length = 2000)
    private String details;

    @Column(name = "created_date", nullable = false)
    private Instant createdDate;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getActorLogin() {
        return actorLogin;
    }

    public void setActorLogin(String actorLogin) {
        this.actorLogin = actorLogin;
    }

    public String getAction() {
        return action;
    }

    public void setAction(String action) {
        this.action = action;
    }

    public String getTargetType() {
        return targetType;
    }

    public void setTargetType(String targetType) {
        this.targetType = targetType;
    }

    public String getTargetId() {
        return targetId;
    }

    public void setTargetId(String targetId) {
        this.targetId = targetId;
    }

    public String getReason() {
        return reason;
    }

    public void setReason(String reason) {
        this.reason = reason;
    }

    public String getDetails() {
        return details;
    }

    public void setDetails(String details) {
        this.details = details;
    }

    public Instant getCreatedDate() {
        return createdDate;
    }

    public void setCreatedDate(Instant createdDate) {
        this.createdDate = createdDate;
    }
}
