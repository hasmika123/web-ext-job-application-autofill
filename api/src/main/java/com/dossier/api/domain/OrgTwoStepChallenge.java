package com.dossier.api.domain;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * A pending second step of a sign-in on an organization's host (gap D-2): the emailed 6-digit code, stored as a bcrypt hash, bound to the
 * organization and the hostname it was asked for. Single use, attempt-limited, short-lived; deleted on success, expiry or too many tries.
 */
@Entity
@Table(name = "org_two_step_challenge")
public class OrgTwoStepChallenge implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "challenge_token", length = 64, nullable = false, unique = true)
    private String challengeToken;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "hostname_id")
    private Long hostnameId;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "login", length = 100, nullable = false)
    private String login;

    @Column(name = "authorities", length = 1000)
    private String authorities;

    @Column(name = "code_hash", length = 100, nullable = false)
    private String codeHash;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "attempts", nullable = false)
    private int attempts;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getChallengeToken() { return challengeToken; }
    public void setChallengeToken(String challengeToken) { this.challengeToken = challengeToken; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getHostnameId() { return hostnameId; }
    public void setHostnameId(Long hostnameId) { this.hostnameId = hostnameId; }
    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
    public String getLogin() { return login; }
    public void setLogin(String login) { this.login = login; }
    public String getAuthorities() { return authorities; }
    public void setAuthorities(String authorities) { this.authorities = authorities; }
    public String getCodeHash() { return codeHash; }
    public void setCodeHash(String codeHash) { this.codeHash = codeHash; }
    public Instant getExpiresAt() { return expiresAt; }
    public void setExpiresAt(Instant expiresAt) { this.expiresAt = expiresAt; }
    public int getAttempts() { return attempts; }
    public void setAttempts(int attempts) { this.attempts = attempts; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
