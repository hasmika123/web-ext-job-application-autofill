package com.dossier.api.domain.privacy;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/** Proof of consent (T0.2): this account accepted this version of the terms (or the privacy notice) at this moment. One row per account, document and version. */
@Entity
@Table(name = "terms_acceptance")
public class TermsAcceptance {

    public static final String TERMS = "TERMS";
    public static final String PRIVACY = "PRIVACY";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "document", length = 12, nullable = false)
    private String document;

    @Column(name = "version", length = 30, nullable = false)
    private String version;

    /** Where the acceptance came from: SIGNUP (the sign-up screen), ACCOUNT (the account page) or RECONFIRM (a re-accept after a change). */
    @Column(name = "source", length = 12, nullable = false)
    private String source;

    @Column(name = "accepted_at", nullable = false)
    private Instant acceptedAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
    public String getDocument() { return document; }
    public void setDocument(String document) { this.document = document; }
    public String getVersion() { return version; }
    public void setVersion(String version) { this.version = version; }
    public String getSource() { return source; }
    public void setSource(String source) { this.source = source; }
    public Instant getAcceptedAt() { return acceptedAt; }
    public void setAcceptedAt(Instant acceptedAt) { this.acceptedAt = acceptedAt; }
}
