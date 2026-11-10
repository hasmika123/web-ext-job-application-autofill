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

    // actor_kind: who (or what) did it. PERSON is a signed-in person; the other four have no person behind them.
    public static final String ACTOR_PERSON = "PERSON";
    public static final String ACTOR_EXTENSION = "EXTENSION";
    public static final String ACTOR_MAIL = "MAIL";
    public static final String ACTOR_ASSISTANT = "ASSISTANT";
    public static final String ACTOR_SYSTEM = "SYSTEM";

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

    // ---- Change audit (docs/change-audit/README.md section 2): who did it, for whom, and what changed. No foreign keys: rows outlive the actor.

    @Column(name = "actor_kind", nullable = false, length = 12)
    private String actorKind = ACTOR_SYSTEM;

    // The signed-in person (null for EXTENSION / MAIL / ASSISTANT / SYSTEM).
    @Column(name = "actor_user_id")
    private Long actorUserId;

    // The same person by login: survives the user row, like the resume's and the audit trail's.
    @Column(name = "actor_login", length = 50)
    private String actorLogin;

    // Act-for: the record's owner when the actor is somebody else; null otherwise.
    @Column(name = "on_behalf_of_user_id")
    private Long onBehalfOfUserId;

    // A JSON array of {f, from, to}: field names, and enum / date values only, never free text.
    @Column(name = "changes", length = 1000)
    private String changes;

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

    public String getActorKind() {
        return actorKind;
    }

    public void setActorKind(String actorKind) {
        this.actorKind = actorKind == null ? ACTOR_SYSTEM : actorKind;
    }

    public Long getActorUserId() {
        return actorUserId;
    }

    public void setActorUserId(Long actorUserId) {
        this.actorUserId = actorUserId;
    }

    public String getActorLogin() {
        return actorLogin;
    }

    public void setActorLogin(String actorLogin) {
        this.actorLogin = actorLogin;
    }

    public Long getOnBehalfOfUserId() {
        return onBehalfOfUserId;
    }

    public void setOnBehalfOfUserId(Long onBehalfOfUserId) {
        this.onBehalfOfUserId = onBehalfOfUserId;
    }

    public String getChanges() {
        return changes;
    }

    public void setChanges(String changes) {
        this.changes = changes;
    }
}
