package com.dossier.api.domain;

import com.dossier.api.domain.enumeration.ApplicationStatus;
import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * One thing that happened to an application, and where it came from (APP-E2E U6.1). Append-only: the
 * timeline tab, the dashboard's activity bars and "first became X" analytics all read this table, and
 * the ghosted clock is the newest row's {@code createdAt} (mirrored on {@code application.last_event_at}).
 * Removed with its application (FK cascade). See the changelog.
 */
@Entity
@Table(name = "application_event")
public class ApplicationEvent implements Serializable {

    private static final long serialVersionUID = 1L;

    // kind
    public static final String CREATED = "CREATED";
    public static final String STATUS = "STATUS";
    public static final String NOTE = "NOTE";
    public static final String INTERVIEW = "INTERVIEW";
    public static final String MAIL = "MAIL";
    public static final String RESUME = "RESUME";
    public static final String ATTACHMENT = "ATTACHMENT";
    public static final String FIELD = "FIELD";

    // source
    public static final String SRC_EXTENSION = "EXTENSION";
    public static final String SRC_WEB = "WEB";
    public static final String SRC_INBOX = "INBOX";
    public static final String SRC_SYSTEM = "SYSTEM";
    public static final String SRC_ASSISTANT = "ASSISTANT";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "application_id", nullable = false)
    private Long applicationId;

    @Column(name = "kind", nullable = false, length = 24)
    private String kind;

    @Enumerated(EnumType.STRING)
    @Column(name = "from_status", length = 12)
    private ApplicationStatus fromStatus;

    @Enumerated(EnumType.STRING)
    @Column(name = "to_status", length = 12)
    private ApplicationStatus toStatus;

    @Column(name = "source", nullable = false, length = 12)
    private String source;

    // The note / interview / inbox message this event is about.
    @Column(name = "ref_id")
    private Long refId;

    @Column(name = "summary", length = 200)
    private String summary;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    public Long getId() {
        return id;
    }

    public Long getApplicationId() {
        return applicationId;
    }

    public void setApplicationId(Long applicationId) {
        this.applicationId = applicationId;
    }

    public String getKind() {
        return kind;
    }

    public void setKind(String kind) {
        this.kind = kind;
    }

    public ApplicationStatus getFromStatus() {
        return fromStatus;
    }

    public void setFromStatus(ApplicationStatus fromStatus) {
        this.fromStatus = fromStatus;
    }

    public ApplicationStatus getToStatus() {
        return toStatus;
    }

    public void setToStatus(ApplicationStatus toStatus) {
        this.toStatus = toStatus;
    }

    public String getSource() {
        return source;
    }

    public void setSource(String source) {
        this.source = source;
    }

    public Long getRefId() {
        return refId;
    }

    public void setRefId(Long refId) {
        this.refId = refId;
    }

    public String getSummary() {
        return summary;
    }

    public void setSummary(String summary) {
        this.summary = summary;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
}
