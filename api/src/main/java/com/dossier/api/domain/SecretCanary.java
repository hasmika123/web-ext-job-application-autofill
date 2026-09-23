package com.dossier.api.domain;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * A known value encrypted with an encryption key, read back at startup to prove the key still
 * matches what's stored (Phase 14.2). One row per key purpose ({@code inbox}). See the changelog.
 */
@Entity
@Table(name = "secret_canary")
public class SecretCanary implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @Column(name = "name", length = 40)
    private String name;

    @Column(name = "ciphertext", nullable = false, length = 255)
    private String ciphertext;

    @Column(name = "key_version", nullable = false)
    private int keyVersion;

    @Column(name = "fingerprint", length = 16)
    private String fingerprint;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    public SecretCanary() {}

    public SecretCanary(String name) {
        this.name = name;
    }

    public String getName() {
        return name;
    }

    public String getCiphertext() {
        return ciphertext;
    }

    public void setCiphertext(String ciphertext) {
        this.ciphertext = ciphertext;
    }

    public int getKeyVersion() {
        return keyVersion;
    }

    public void setKeyVersion(int keyVersion) {
        this.keyVersion = keyVersion;
    }

    public String getFingerprint() {
        return fingerprint;
    }

    public void setFingerprint(String fingerprint) {
        this.fingerprint = fingerprint;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
