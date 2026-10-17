package com.dossier.api.domain.privacy;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/**
 * A pending erasure of one account (the undo window). While it is PENDING the account is whole and its use is unaffected; the person (or an admin on
 * their behalf) can cancel until {@code purgeAfter}; after that the purge job erases the account and writes an {@code AccountDeletionReport}.
 */
@Entity
@Table(name = "account_deletion_request")
public class AccountDeletionRequest {

    public static final String PENDING = "PENDING";
    public static final String RUNNING = "RUNNING";
    public static final String CANCELLED = "CANCELLED";
    public static final String SELF = "SELF";
    public static final String ADMIN = "ADMIN";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false, unique = true)
    private Long userId;

    @Column(name = "status", length = 12, nullable = false)
    private String status;

    @Column(name = "source", length = 10, nullable = false)
    private String source;

    @Column(name = "requested_at", nullable = false)
    private Instant requestedAt;

    @Column(name = "purge_after", nullable = false)
    private Instant purgeAfter;

    @Column(name = "cancelled_at")
    private Instant cancelledAt;

    @Column(name = "lease_until")
    private Instant leaseUntil;

    @Column(name = "attempts", nullable = false)
    private int attempts;

    @Column(name = "last_error", length = 200)
    private String lastError;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getSource() { return source; }
    public void setSource(String source) { this.source = source; }
    public Instant getRequestedAt() { return requestedAt; }
    public void setRequestedAt(Instant requestedAt) { this.requestedAt = requestedAt; }
    public Instant getPurgeAfter() { return purgeAfter; }
    public void setPurgeAfter(Instant purgeAfter) { this.purgeAfter = purgeAfter; }
    public Instant getCancelledAt() { return cancelledAt; }
    public void setCancelledAt(Instant cancelledAt) { this.cancelledAt = cancelledAt; }
    public Instant getLeaseUntil() { return leaseUntil; }
    public void setLeaseUntil(Instant leaseUntil) { this.leaseUntil = leaseUntil; }
    public int getAttempts() { return attempts; }
    public void setAttempts(int attempts) { this.attempts = attempts; }
    public String getLastError() { return lastError; }
    public void setLastError(String lastError) { this.lastError = lastError; }
}
