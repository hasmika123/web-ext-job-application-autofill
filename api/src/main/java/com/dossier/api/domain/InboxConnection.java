package com.dossier.api.domain;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * A user's connected inbox (Phase 14.1): their dedicated Gmail address and its app password,
 * encrypted by {@code SecretBox} and bound to this user — never stored as typed, never returned by
 * any API. One per user, keyed by user id. See the changelog.
 */
@Entity
@Table(name = "inbox_connection")
public class InboxConnection implements Serializable {

    private static final long serialVersionUID = 1L;

    /** Polling normally. */
    public static final String CONNECTED = "CONNECTED";
    /** Gmail rejected the app password (revoked, or the account changed): the user must reconnect. */
    public static final String NEEDS_RECONNECT = "NEEDS_RECONNECT";
    /** Repeated other failures; the poller is backing off. */
    public static final String ERROR = "ERROR";
    /**
     * Nothing includes inbox tracking for this person any more (their Pro plan lapsed, and their organization's license no longer grants it or they
     * left): the poller stops reading. Kept (not deleted) so reading resumes if it comes back; the person is told why.
     */
    public static final String NO_ENTITLEMENT = "NO_ENTITLEMENT";

    @Id
    @Column(name = "user_id")
    private Long userId;

    @Column(name = "address", nullable = false, length = 254)
    private String address;

    @Column(name = "password_enc", nullable = false, length = 512)
    private String passwordEnc;

    @Column(name = "sent_folder", length = 200)
    private String sentFolder;

    @Column(name = "status", nullable = false, length = 20)
    private String status = CONNECTED;

    @Column(name = "last_checked_at")
    private Instant lastCheckedAt;

    @Column(name = "last_error", length = 255)
    private String lastError;

    @Column(name = "consecutive_failures", nullable = false)
    private int consecutiveFailures;

    /** Email the user about interviews and offers (14.6). */
    @Column(name = "notify_email", nullable = false)
    private boolean notifyEmail = true;

    /** "Apply rejections automatically" (inbox-safety): off by default, a rejection read from mail waits for the person's confirmation. */
    @Column(name = "auto_apply_rejections", nullable = false)
    private boolean autoApplyRejections = false;

    /** The organization whose license allowed this connection (ent-inbox); null = made on the personal plan. Never shown to the organization. */
    @Column(name = "connected_via_org_id")
    private Long connectedViaOrgId;

    @Column(name = "connected_at", nullable = false)
    private Instant connectedAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    public InboxConnection() {}

    public InboxConnection(Long userId) {
        this.userId = userId;
    }

    public Long getUserId() {
        return userId;
    }

    public String getAddress() {
        return address;
    }

    public void setAddress(String address) {
        this.address = address;
    }

    public String getPasswordEnc() {
        return passwordEnc;
    }

    public void setPasswordEnc(String passwordEnc) {
        this.passwordEnc = passwordEnc;
    }

    public String getSentFolder() {
        return sentFolder;
    }

    public void setSentFolder(String sentFolder) {
        this.sentFolder = sentFolder;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
        this.updatedAt = Instant.now();
    }

    public Instant getLastCheckedAt() {
        return lastCheckedAt;
    }

    public void setLastCheckedAt(Instant lastCheckedAt) {
        this.lastCheckedAt = lastCheckedAt;
    }

    public String getLastError() {
        return lastError;
    }

    public void setLastError(String lastError) {
        this.lastError = lastError == null || lastError.length() <= 255 ? lastError : lastError.substring(0, 255);
    }

    public int getConsecutiveFailures() {
        return consecutiveFailures;
    }

    public void setConsecutiveFailures(int consecutiveFailures) {
        this.consecutiveFailures = consecutiveFailures;
    }

    public boolean isAutoApplyRejections() {
        return autoApplyRejections;
    }

    public void setAutoApplyRejections(boolean autoApplyRejections) {
        this.autoApplyRejections = autoApplyRejections;
    }

    public boolean isNotifyEmail() {
        return notifyEmail;
    }

    public void setNotifyEmail(boolean notifyEmail) {
        this.notifyEmail = notifyEmail;
    }

    public Long getConnectedViaOrgId() {
        return connectedViaOrgId;
    }

    public void setConnectedViaOrgId(Long connectedViaOrgId) {
        this.connectedViaOrgId = connectedViaOrgId;
    }

    public Instant getConnectedAt() {
        return connectedAt;
    }

    public void setConnectedAt(Instant connectedAt) {
        this.connectedAt = connectedAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }
}
