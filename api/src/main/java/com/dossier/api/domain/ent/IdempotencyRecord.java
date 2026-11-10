package com.dossier.api.domain.ent;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * One reply of the {@code Idempotency-Key} ledger (40-api-specs.md section 6): who sent which key, a hash of what they asked for
 * (method, path, canonical body), and the status and body that went back, kept 24 hours. The key itself is never stored, only its
 * hash (prefixed with the organization, so two tenants can never collide), and the stored body is what the first call returned
 * (a replay returns it again without doing the work twice).
 */
@Entity
@Table(name = "idempotency_record")
public class IdempotencyRecord implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final String DONE = "DONE";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id")
    private Long orgId;

    @Column(name = "actor_login", length = 254, nullable = false)
    private String actorLogin;

    @Column(name = "key_hash", length = 64, columnDefinition = "char(64)", nullable = false)
    private String keyHash;

    @Column(name = "request_hash", length = 64, columnDefinition = "char(64)", nullable = false)
    private String requestHash;

    @Column(name = "status", nullable = false)
    private int status;

    @Column(name = "response_json", columnDefinition = "text")
    private String responseJson;

    @Column(name = "state", length = 12, nullable = false)
    private String state = DONE;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public String getActorLogin() { return actorLogin; }
    public void setActorLogin(String actorLogin) { this.actorLogin = actorLogin; }
    public String getKeyHash() { return keyHash; }
    public void setKeyHash(String keyHash) { this.keyHash = keyHash; }
    public String getRequestHash() { return requestHash; }
    public void setRequestHash(String requestHash) { this.requestHash = requestHash; }
    public int getStatus() { return status; }
    public void setStatus(int status) { this.status = status; }
    public String getResponseJson() { return responseJson; }
    public void setResponseJson(String responseJson) { this.responseJson = responseJson; }
    public String getState() { return state; }
    public void setState(String state) { this.state = state; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getExpiresAt() { return expiresAt; }
    public void setExpiresAt(Instant expiresAt) { this.expiresAt = expiresAt; }
}
