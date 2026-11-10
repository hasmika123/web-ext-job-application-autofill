package com.dossier.api.domain;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * A status change a mail PROPOSED but the inbox did not apply (inbox-safety): a rejection, a reading below the apply threshold, an ambiguous match or
 * a move backwards. It waits for the person ({@code PENDING}) until they accept it, dismiss it or it expires. One hold per mail (unique user + message),
 * so a dismissed mail never asks again. The evidence is a scrubbed snippet of at most 200 characters; the full mail is never copied here.
 */
@Entity
@Table(name = "inbox_hold")
public class InboxHold implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final String PENDING = "PENDING";
    public static final String ACCEPTED = "ACCEPTED";
    public static final String DISMISSED = "DISMISSED";
    public static final String EXPIRED = "EXPIRED";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "message_id", nullable = false)
    private Long messageId;

    /** AMBIGUOUS | LOW_CONFIDENCE | DESTRUCTIVE | BACKWARDS. */
    @Column(name = "reason", nullable = false, length = 20)
    private String reason;

    /** The mail's category (REJECTED, INTERVIEW, ...). */
    @Column(name = "category", nullable = false, length = 20)
    private String category;

    @Column(name = "proposed_status", length = 20)
    private String proposedStatus;

    @Column(name = "confidence", nullable = false)
    private int confidence;

    @Column(name = "evidence", length = 200)
    private String evidence;

    @Column(name = "company", length = 200)
    private String company;

    @Column(name = "role", length = 300)
    private String role;

    @Column(name = "application_id")
    private Long applicationId;

    /** Comma separated application ids a person can choose between. */
    @Column(name = "candidate_ids", length = 200)
    private String candidateIds;

    @Column(name = "state", nullable = false, length = 10)
    private String state = PENDING;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "resolved_at")
    private Instant resolvedAt;

    @Column(name = "resolved_application_id")
    private Long resolvedApplicationId;

    public Long getId() { return id; }
    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
    public Long getMessageId() { return messageId; }
    public void setMessageId(Long messageId) { this.messageId = messageId; }
    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }
    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }
    public String getProposedStatus() { return proposedStatus; }
    public void setProposedStatus(String proposedStatus) { this.proposedStatus = proposedStatus; }
    public int getConfidence() { return confidence; }
    public void setConfidence(int confidence) { this.confidence = confidence; }
    public String getEvidence() { return evidence; }
    public void setEvidence(String evidence) { this.evidence = evidence; }
    public String getCompany() { return company; }
    public void setCompany(String company) { this.company = company; }
    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }
    public Long getApplicationId() { return applicationId; }
    public void setApplicationId(Long applicationId) { this.applicationId = applicationId; }
    public String getCandidateIds() { return candidateIds; }
    public void setCandidateIds(String candidateIds) { this.candidateIds = candidateIds; }
    public String getState() { return state; }
    public void setState(String state) { this.state = state; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getExpiresAt() { return expiresAt; }
    public void setExpiresAt(Instant expiresAt) { this.expiresAt = expiresAt; }
    public Instant getResolvedAt() { return resolvedAt; }
    public void setResolvedAt(Instant resolvedAt) { this.resolvedAt = resolvedAt; }
    public Long getResolvedApplicationId() { return resolvedApplicationId; }
    public void setResolvedApplicationId(Long resolvedApplicationId) { this.resolvedApplicationId = resolvedApplicationId; }
}
