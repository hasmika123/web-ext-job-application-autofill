package com.dossier.api.domain.ent.consultantws;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;
import java.util.List;
import java.util.regex.Pattern;

/**
 * One entry of a consultant's own notification feed (table {@code cws_notification}). Rows are DERIVED from the consultant's own data and persisted
 * by the generator; {@code sourceKey} makes that idempotent (one source event, at most one row). {@code actionHref} is an internal
 * {@code /w/consultant/...} path or null. Deleting is a soft delete ({@code deletedAt}) so the same source event is not regenerated.
 */
@Entity
@Table(name = "cws_notification")
public class CwsNotification implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final String JOB_MATCH = "JOB_MATCH";
    public static final String APPLICATION = "APPLICATION";
    public static final String INTERVIEW = "INTERVIEW";
    public static final String APPROVAL = "APPROVAL";
    public static final String OFFER = "OFFER";
    public static final String MESSAGE = "MESSAGE";
    public static final String REMINDER = "REMINDER";
    public static final List<String> CATEGORIES = List.of(JOB_MATCH, APPLICATION, INTERVIEW, APPROVAL, OFFER, MESSAGE, REMINDER);

    public static final String HIGH = "HIGH";
    public static final String MEDIUM = "MEDIUM";
    public static final String LOW = "LOW";
    public static final List<String> PRIORITIES = List.of(HIGH, MEDIUM, LOW);

    /** Only an internal consultant-workspace path (optionally with a plain query) may be stored as an action link. */
    private static final Pattern INTERNAL_HREF = Pattern.compile("^/w/consultant(/[a-z0-9-]+)*(\\?[A-Za-z0-9=&_-]{1,60})?$");

    public static boolean validHref(String href) {
        return href != null && href.length() <= 200 && INTERNAL_HREF.matcher(href).matches();
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "consultant_id", nullable = false)
    private Long consultantId;

    @Column(name = "category", length = 16, nullable = false)
    private String category;

    @Column(name = "title", length = 160, nullable = false)
    private String title;

    @Column(name = "body", length = 300)
    private String body;

    @Column(name = "priority", length = 8, nullable = false)
    private String priority = MEDIUM;

    @Column(name = "action_label", length = 24)
    private String actionLabel;

    @Column(name = "action_href", length = 200)
    private String actionHref;

    @Column(name = "related_type", length = 24)
    private String relatedType;

    @Column(name = "related_id")
    private Long relatedId;

    @Column(name = "source_key", length = 80, nullable = false)
    private String sourceKey;

    @Column(name = "read_at")
    private Instant readAt;

    @Column(name = "resolved_at")
    private Instant resolvedAt;

    @Column(name = "snoozed_until")
    private Instant snoozedUntil;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getConsultantId() { return consultantId; }
    public void setConsultantId(Long consultantId) { this.consultantId = consultantId; }
    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getBody() { return body; }
    public void setBody(String body) { this.body = body; }
    public String getPriority() { return priority; }
    public void setPriority(String priority) { this.priority = priority; }
    public String getActionLabel() { return actionLabel; }
    public void setActionLabel(String actionLabel) { this.actionLabel = actionLabel; }
    public String getActionHref() { return actionHref; }
    public void setActionHref(String actionHref) { this.actionHref = actionHref; }
    public String getRelatedType() { return relatedType; }
    public void setRelatedType(String relatedType) { this.relatedType = relatedType; }
    public Long getRelatedId() { return relatedId; }
    public void setRelatedId(Long relatedId) { this.relatedId = relatedId; }
    public String getSourceKey() { return sourceKey; }
    public void setSourceKey(String sourceKey) { this.sourceKey = sourceKey; }
    public Instant getReadAt() { return readAt; }
    public void setReadAt(Instant readAt) { this.readAt = readAt; }
    public Instant getResolvedAt() { return resolvedAt; }
    public void setResolvedAt(Instant resolvedAt) { this.resolvedAt = resolvedAt; }
    public Instant getSnoozedUntil() { return snoozedUntil; }
    public void setSnoozedUntil(Instant snoozedUntil) { this.snoozedUntil = snoozedUntil; }
    public Instant getDeletedAt() { return deletedAt; }
    public void setDeletedAt(Instant deletedAt) { this.deletedAt = deletedAt; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
