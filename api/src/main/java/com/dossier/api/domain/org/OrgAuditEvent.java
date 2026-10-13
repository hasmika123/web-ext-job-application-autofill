package com.dossier.api.domain.org;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * Immutable, append-only record of something an org actor did (tenant-model.md section 2.7); the org twin of
 * {@code AdminAuditEvent}. Keyed by login strings (no FK to {@code jhi_user}) so the trail survives account
 * erasure. Rows are never updated or deleted: the repository exposes no way to do either.
 */
@Entity
@Table(name = "org_audit_event")
public class OrgAuditEvent implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "actor_login", length = 50, nullable = false)
    private String actorLogin;

    /** The actor's role in the org at the time ({@code OrgRole} name), or null for a system action. */
    @Column(name = "actor_role", length = 20)
    private String actorRole;

    @Column(name = "action", length = 100, nullable = false)
    private String action;

    @Column(name = "target_type", length = 50, nullable = false)
    private String targetType;

    @Column(name = "target_login", length = 50)
    private String targetLogin;

    @Column(name = "target_id", length = 191)
    private String targetId;

    @Column(name = "details", length = 2000)
    private String details;

    /** SHA-256 of the caller's address, never the address itself. */
    @Column(name = "ip_hash", length = 64, columnDefinition = "char(64)")
    private String ipHash;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public String getActorLogin() { return actorLogin; }
    public void setActorLogin(String actorLogin) { this.actorLogin = actorLogin; }
    public String getActorRole() { return actorRole; }
    public void setActorRole(String actorRole) { this.actorRole = actorRole; }
    public String getAction() { return action; }
    public void setAction(String action) { this.action = action; }
    public String getTargetType() { return targetType; }
    public void setTargetType(String targetType) { this.targetType = targetType; }
    public String getTargetLogin() { return targetLogin; }
    public void setTargetLogin(String targetLogin) { this.targetLogin = targetLogin; }
    public String getTargetId() { return targetId; }
    public void setTargetId(String targetId) { this.targetId = targetId; }
    public String getDetails() { return details; }
    public void setDetails(String details) { this.details = details; }
    public String getIpHash() { return ipHash; }
    public void setIpHash(String ipHash) { this.ipHash = ipHash; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
