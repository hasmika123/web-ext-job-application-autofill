package com.dossier.api.domain;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * A pending admin MFA (email-OTP) challenge (Phase 9.X.3). Created after a correct password when
 * admin MFA is enabled; the user must submit the emailed code (verified against {@code codeHash})
 * before tokens are issued. Short-lived, single-use, and attempt-limited. The authenticated
 * subject's authorities + id are stashed so token issuance after verification matches a normal login.
 */
@Entity
@Table(name = "admin_mfa_challenge")
public class AdminMfaChallenge implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Opaque handle returned to the client; the OTP is sent by email, never returned. */
    @Column(name = "mfa_token", length = 64, nullable = false, unique = true)
    private String mfaToken;

    @Column(name = "login", length = 50, nullable = false)
    private String login;

    @Column(name = "user_id")
    private Long userId;

    @Column(name = "authorities", length = 1000)
    private String authorities;

    /** Hash of the 6-digit code (bcrypt) — the plaintext code is only ever emailed. */
    @Column(name = "code_hash", length = 100, nullable = false)
    private String codeHash;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "attempts", nullable = false)
    private int attempts;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getMfaToken() {
        return mfaToken;
    }

    public void setMfaToken(String mfaToken) {
        this.mfaToken = mfaToken;
    }

    public String getLogin() {
        return login;
    }

    public void setLogin(String login) {
        this.login = login;
    }

    public Long getUserId() {
        return userId;
    }

    public void setUserId(Long userId) {
        this.userId = userId;
    }

    public String getAuthorities() {
        return authorities;
    }

    public void setAuthorities(String authorities) {
        this.authorities = authorities;
    }

    public String getCodeHash() {
        return codeHash;
    }

    public void setCodeHash(String codeHash) {
        this.codeHash = codeHash;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public void setExpiresAt(Instant expiresAt) {
        this.expiresAt = expiresAt;
    }

    public int getAttempts() {
        return attempts;
    }

    public void setAttempts(int attempts) {
        this.attempts = attempts;
    }
}
