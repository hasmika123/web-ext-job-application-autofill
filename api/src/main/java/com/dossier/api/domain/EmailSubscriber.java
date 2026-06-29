package com.dossier.api.domain;

import com.dossier.api.domain.enumeration.SubscriberStatus;
import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * A newsletter subscriber (Phase 9.A4) — the source of truth for marketing-email consent,
 * kept SEPARATE from the service account (a user account does not imply newsletter consent).
 *
 * Double opt-in: a subscribe request creates a PENDING row with a one-time {@code confirmToken};
 * clicking the emailed link flips it to CONFIRMED. A stable {@code unsubscribeToken} powers the
 * one-click unsubscribe link in every email (no login). {@code consentSource}/{@code consentAt}
 * record when/where consent was given (CAN-SPAM / ePrivacy accountability).
 */
@Entity
@Table(name = "email_subscriber")
public class EmailSubscriber implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "email", length = 254, nullable = false, unique = true)
    private String email;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", length = 20, nullable = false)
    private SubscriberStatus status;

    /** Where consent was given, e.g. "footer", "signup". */
    @Column(name = "consent_source", length = 50)
    private String consentSource;

    @Column(name = "consent_at")
    private Instant consentAt;

    /** One-time double-opt-in token; cleared once confirmed. */
    @Column(name = "confirm_token", length = 64)
    private String confirmToken;

    @Column(name = "confirmed_at")
    private Instant confirmedAt;

    /** Stable token for the one-click unsubscribe link in every email. */
    @Column(name = "unsubscribe_token", length = 64, nullable = false)
    private String unsubscribeToken;

    @Column(name = "unsubscribed_at")
    private Instant unsubscribedAt;

    @Column(name = "created_date", nullable = false)
    private Instant createdDate;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public SubscriberStatus getStatus() {
        return status;
    }

    public void setStatus(SubscriberStatus status) {
        this.status = status;
    }

    public String getConsentSource() {
        return consentSource;
    }

    public void setConsentSource(String consentSource) {
        this.consentSource = consentSource;
    }

    public Instant getConsentAt() {
        return consentAt;
    }

    public void setConsentAt(Instant consentAt) {
        this.consentAt = consentAt;
    }

    public String getConfirmToken() {
        return confirmToken;
    }

    public void setConfirmToken(String confirmToken) {
        this.confirmToken = confirmToken;
    }

    public Instant getConfirmedAt() {
        return confirmedAt;
    }

    public void setConfirmedAt(Instant confirmedAt) {
        this.confirmedAt = confirmedAt;
    }

    public String getUnsubscribeToken() {
        return unsubscribeToken;
    }

    public void setUnsubscribeToken(String unsubscribeToken) {
        this.unsubscribeToken = unsubscribeToken;
    }

    public Instant getUnsubscribedAt() {
        return unsubscribedAt;
    }

    public void setUnsubscribedAt(Instant unsubscribedAt) {
        this.unsubscribedAt = unsubscribedAt;
    }

    public Instant getCreatedDate() {
        return createdDate;
    }

    public void setCreatedDate(Instant createdDate) {
        this.createdDate = createdDate;
    }
}
