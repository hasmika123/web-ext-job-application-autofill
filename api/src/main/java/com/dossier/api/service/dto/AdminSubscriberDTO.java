package com.dossier.api.service.dto;

import com.dossier.api.domain.EmailSubscriber;
import com.dossier.api.domain.enumeration.SubscriberStatus;
import java.io.Serializable;
import java.time.Instant;

/**
 * Admin view of a newsletter subscriber (Phase 9.A4.3). Deliberately omits the confirm/unsubscribe
 * tokens — those are secrets, never exposed to the admin UI.
 */
public class AdminSubscriberDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long id;
    private String email;
    private SubscriberStatus status;
    private String consentSource;
    private Instant consentAt;
    private Instant confirmedAt;
    private Instant unsubscribedAt;
    private Instant createdDate;

    public AdminSubscriberDTO() {}

    public AdminSubscriberDTO(EmailSubscriber s) {
        this.id = s.getId();
        this.email = s.getEmail();
        this.status = s.getStatus();
        this.consentSource = s.getConsentSource();
        this.consentAt = s.getConsentAt();
        this.confirmedAt = s.getConfirmedAt();
        this.unsubscribedAt = s.getUnsubscribedAt();
        this.createdDate = s.getCreatedDate();
    }

    public Long getId() {
        return id;
    }

    public String getEmail() {
        return email;
    }

    public SubscriberStatus getStatus() {
        return status;
    }

    public String getConsentSource() {
        return consentSource;
    }

    public Instant getConsentAt() {
        return consentAt;
    }

    public Instant getConfirmedAt() {
        return confirmedAt;
    }

    public Instant getUnsubscribedAt() {
        return unsubscribedAt;
    }

    public Instant getCreatedDate() {
        return createdDate;
    }
}
