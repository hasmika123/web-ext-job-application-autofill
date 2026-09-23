package com.dossier.api.domain;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * One message read from a connected inbox (Phase 14.3): headers always; body text only for job
 * mail; never attachments. {@code direction} is IN (Inbox) or OUT (Sent) — from the folder, not the
 * From header, since replies can go out under an alias. See the changelog.
 */
@Entity
@Table(name = "inbox_message")
public class InboxMessage implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final String IN = "IN";
    public static final String OUT = "OUT";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "folder", nullable = false, length = 200)
    private String folder;

    @Column(name = "direction", nullable = false, length = 3)
    private String direction;

    @Column(name = "uid", nullable = false)
    private long uid;

    @Column(name = "dedup_key", nullable = false, length = 64)
    private String dedupKey;

    @Column(name = "message_id", length = 500)
    private String messageId;

    @Column(name = "in_reply_to", length = 500)
    private String inReplyTo;

    @Column(name = "from_address", length = 254)
    private String fromAddress;

    @Column(name = "from_name", length = 200)
    private String fromName;

    /** To and Cc, comma-separated. */
    @Column(name = "to_addresses", length = 2000)
    private String toAddresses;

    @Column(name = "subject", length = 500)
    private String subject;

    @Column(name = "sent_at")
    private Instant sentAt;

    @Column(name = "job_mail", nullable = false)
    private boolean jobMail;

    @Lob
    @Column(name = "body_text")
    private String bodyText;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    // ---- 14.4a: what it said, and what it did --------------------------------------------------

    /** APPLIED, INTERVIEW, ASSESSMENT, REJECTED, OFFER, ALERT or OTHER; null until read. */
    @Column(name = "category", length = 20)
    private String category;

    /** RULE, AI or NONE. */
    @Column(name = "classified_by", length = 10)
    private String classifiedBy;

    /** The tracked application it's about (null if none, or that application was deleted). */
    @Column(name = "application_id")
    private Long applicationId;

    /** The status it moved that application to, when it moved it. */
    @Column(name = "status_change", length = 20)
    private String statusChange;

    @Column(name = "company_guess", length = 200)
    private String companyGuess;

    @Column(name = "role_guess", length = 300)
    private String roleGuess;

    /** NEW / ACCEPTED / DISMISSED when this mail suggests an application nothing matched. */
    @Column(name = "suggestion", length = 20)
    private String suggestion;

    @Column(name = "parsed_at")
    private Instant parsedAt;

    public Long getId() {
        return id;
    }

    public Long getUserId() {
        return userId;
    }

    public void setUserId(Long userId) {
        this.userId = userId;
    }

    public String getFolder() {
        return folder;
    }

    public void setFolder(String folder) {
        this.folder = folder;
    }

    public String getDirection() {
        return direction;
    }

    public void setDirection(String direction) {
        this.direction = direction;
    }

    public long getUid() {
        return uid;
    }

    public void setUid(long uid) {
        this.uid = uid;
    }

    public String getDedupKey() {
        return dedupKey;
    }

    public void setDedupKey(String dedupKey) {
        this.dedupKey = dedupKey;
    }

    public String getMessageId() {
        return messageId;
    }

    public void setMessageId(String messageId) {
        this.messageId = messageId;
    }

    public String getInReplyTo() {
        return inReplyTo;
    }

    public void setInReplyTo(String inReplyTo) {
        this.inReplyTo = inReplyTo;
    }

    public String getFromAddress() {
        return fromAddress;
    }

    public void setFromAddress(String fromAddress) {
        this.fromAddress = fromAddress;
    }

    public String getFromName() {
        return fromName;
    }

    public void setFromName(String fromName) {
        this.fromName = fromName;
    }

    public String getToAddresses() {
        return toAddresses;
    }

    public void setToAddresses(String toAddresses) {
        this.toAddresses = toAddresses;
    }

    public String getSubject() {
        return subject;
    }

    public void setSubject(String subject) {
        this.subject = subject;
    }

    public Instant getSentAt() {
        return sentAt;
    }

    public void setSentAt(Instant sentAt) {
        this.sentAt = sentAt;
    }

    public boolean isJobMail() {
        return jobMail;
    }

    public void setJobMail(boolean jobMail) {
        this.jobMail = jobMail;
    }

    public String getBodyText() {
        return bodyText;
    }

    public void setBodyText(String bodyText) {
        this.bodyText = bodyText;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public String getCategory() {
        return category;
    }

    public void setCategory(String category) {
        this.category = category;
    }

    public String getClassifiedBy() {
        return classifiedBy;
    }

    public void setClassifiedBy(String classifiedBy) {
        this.classifiedBy = classifiedBy;
    }

    public Long getApplicationId() {
        return applicationId;
    }

    public void setApplicationId(Long applicationId) {
        this.applicationId = applicationId;
    }

    public String getStatusChange() {
        return statusChange;
    }

    public void setStatusChange(String statusChange) {
        this.statusChange = statusChange;
    }

    public String getCompanyGuess() {
        return companyGuess;
    }

    public void setCompanyGuess(String companyGuess) {
        this.companyGuess = companyGuess == null || companyGuess.length() <= 200 ? companyGuess : companyGuess.substring(0, 200);
    }

    public String getRoleGuess() {
        return roleGuess;
    }

    public void setRoleGuess(String roleGuess) {
        this.roleGuess = roleGuess == null || roleGuess.length() <= 300 ? roleGuess : roleGuess.substring(0, 300);
    }

    public String getSuggestion() {
        return suggestion;
    }

    public void setSuggestion(String suggestion) {
        this.suggestion = suggestion;
    }

    public Instant getParsedAt() {
        return parsedAt;
    }

    public void setParsedAt(Instant parsedAt) {
        this.parsedAt = parsedAt;
    }
}
