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
}
