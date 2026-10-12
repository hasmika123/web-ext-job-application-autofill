package com.dossier.api.domain;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;
import java.util.List;
import java.util.Set;

/**
 * One interview for one application (APP-E2E U6.1/U6.4). Keyed by {@code userId} as well as the
 * application so the date-range feeds (dashboard, prep page) never join through the application and
 * another user's row is a 404 by construction. {@code startsAt}/{@code endsAt} are instants; {@code tz}
 * is the IANA zone the user thinks in (the .ics export and the UI render with it). The two reminder
 * columns are the idempotence markers U7 will use; nothing here sends a reminder.
 */
@Entity
@Table(name = "interview")
public class Interview implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final List<String> KINDS = List.of("PHONE", "VIDEO", "ONSITE", "TECHNICAL", "BEHAVIORAL", "PANEL", "OTHER");
    public static final String PENDING = "PENDING";
    public static final String PASSED = "PASSED";
    public static final String REJECTED = "REJECTED";
    public static final String NO_SHOW = "NO_SHOW";
    public static final Set<String> OUTCOMES = Set.of(PENDING, PASSED, REJECTED, NO_SHOW);

    public static final String SRC_WEB = "WEB";
    public static final String SRC_INBOX = "INBOX";
    public static final String SRC_ASSISTANT = "ASSISTANT";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "application_id", nullable = false)
    private Long applicationId;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "kind", nullable = false, length = 16)
    private String kind;

    @Column(name = "starts_at", nullable = false)
    private Instant startsAt;

    @Column(name = "ends_at")
    private Instant endsAt;

    @Column(name = "tz", length = 48)
    private String tz;

    @Column(name = "location", length = 200)
    private String location;

    @Column(name = "interviewer", length = 120)
    private String interviewer;

    @Lob
    @Column(name = "notes")
    private String notes;

    @Column(name = "outcome", length = 12)
    private String outcome;

    @Column(name = "reminder_24h_sent_at")
    private Instant reminder24hSentAt;

    @Column(name = "reminder_1h_sent_at")
    private Instant reminder1hSentAt;

    @Column(name = "source", nullable = false, length = 12)
    private String source = SRC_WEB;

    @Column(name = "inbox_message_id")
    private Long inboxMessageId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    public Long getId() {
        return id;
    }

    public Long getApplicationId() {
        return applicationId;
    }

    public void setApplicationId(Long applicationId) {
        this.applicationId = applicationId;
    }

    public Long getUserId() {
        return userId;
    }

    public void setUserId(Long userId) {
        this.userId = userId;
    }

    public String getKind() {
        return kind;
    }

    public void setKind(String kind) {
        this.kind = kind;
    }

    public Instant getStartsAt() {
        return startsAt;
    }

    public void setStartsAt(Instant startsAt) {
        this.startsAt = startsAt;
    }

    public Instant getEndsAt() {
        return endsAt;
    }

    public void setEndsAt(Instant endsAt) {
        this.endsAt = endsAt;
    }

    public String getTz() {
        return tz;
    }

    public void setTz(String tz) {
        this.tz = tz;
    }

    public String getLocation() {
        return location;
    }

    public void setLocation(String location) {
        this.location = location;
    }

    public String getInterviewer() {
        return interviewer;
    }

    public void setInterviewer(String interviewer) {
        this.interviewer = interviewer;
    }

    public String getNotes() {
        return notes;
    }

    public void setNotes(String notes) {
        this.notes = notes;
    }

    public String getOutcome() {
        return outcome;
    }

    public void setOutcome(String outcome) {
        this.outcome = outcome;
    }

    public Instant getReminder24hSentAt() {
        return reminder24hSentAt;
    }

    public void setReminder24hSentAt(Instant reminder24hSentAt) {
        this.reminder24hSentAt = reminder24hSentAt;
    }

    public Instant getReminder1hSentAt() {
        return reminder1hSentAt;
    }

    public void setReminder1hSentAt(Instant reminder1hSentAt) {
        this.reminder1hSentAt = reminder1hSentAt;
    }

    public String getSource() {
        return source;
    }

    public void setSource(String source) {
        this.source = source;
    }

    public Long getInboxMessageId() {
        return inboxMessageId;
    }

    public void setInboxMessageId(Long inboxMessageId) {
        this.inboxMessageId = inboxMessageId;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }
}
