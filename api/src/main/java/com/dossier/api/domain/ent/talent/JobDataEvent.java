package com.dossier.api.domain.ent.talent;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * One line of the append-only job data ledger (docs/enterprise-v2/61-job-data-collection-and-audit.md section 3): what happened to a job's data,
 * when, and who or what did it. Table {@code job_data_event}. Rows are inserted and read, never changed or removed ({@code JobDataEventRepository}
 * has no way to). {@code fields} holds the NAMES of the fields set, changed or purged, never their values, and nothing here ever holds job text.
 * Every query goes through an org-scoped repository method.
 */
@Entity
@Table(name = "job_data_event")
public class JobDataEvent implements Serializable {

    private static final long serialVersionUID = 1L;

    /** CAPTURED, EDITED, ENRICHED_FULL, DOWNGRADED, FULL_PURGED, ASSIGNED, UNASSIGNED, EXPORTED, TAKEDOWN_RECEIVED, TAKEDOWN_APPLIED, DELETED, CAP_CHANGED. */
    public static final String CAPTURED = "CAPTURED";
    public static final String EDITED = "EDITED";
    public static final String ASSIGNED = "ASSIGNED";
    public static final String UNASSIGNED = "UNASSIGNED";
    public static final String CAP_CHANGED = "CAP_CHANGED";
    public static final String ENRICHED_FULL = "ENRICHED_FULL";
    public static final String DOWNGRADED = "DOWNGRADED";
    public static final String FULL_PURGED = "FULL_PURGED";
    public static final String EXPORTED = "EXPORTED";
    public static final String TAKEDOWN_RECEIVED = "TAKEDOWN_RECEIVED";
    public static final String TAKEDOWN_APPLIED = "TAKEDOWN_APPLIED";
    public static final String DELETED = "DELETED";

    /** Who acted: a signed-in member, the system (a job), the browser extension on a member's behalf, or a licensed feed. */
    public static final String ACTOR_MEMBER = "MEMBER";
    public static final String ACTOR_SYSTEM = "SYSTEM";
    public static final String ACTOR_EXTENSION = "EXTENSION";
    public static final String ACTOR_FEED = "FEED";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "requirement_id", nullable = false)
    private Long requirementId;

    @Column(name = "event_type", length = 24, nullable = false)
    private String eventType;

    @Column(name = "actor_member_id")
    private Long actorMemberId;

    @Column(name = "actor_kind", length = 10, nullable = false)
    private String actorKind = ACTOR_MEMBER;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt = Instant.now();

    @Column(name = "detail_level_before", length = 10)
    private String detailLevelBefore;

    @Column(name = "detail_level_after", length = 10)
    private String detailLevelAfter;

    @Column(name = "fields", length = 300)
    private String fields;

    @Column(name = "source_ref", length = 200)
    private String sourceRef;

    @Column(name = "terms_ref", length = 80)
    private String termsRef;

    @Column(name = "request_id", length = 64)
    private String requestId;

    @Column(name = "note", length = 200)
    private String note;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getRequirementId() { return requirementId; }
    public void setRequirementId(Long requirementId) { this.requirementId = requirementId; }
    public String getEventType() { return eventType; }
    public void setEventType(String eventType) { this.eventType = eventType; }
    public Long getActorMemberId() { return actorMemberId; }
    public void setActorMemberId(Long actorMemberId) { this.actorMemberId = actorMemberId; }
    public String getActorKind() { return actorKind; }
    public void setActorKind(String actorKind) { this.actorKind = actorKind; }
    public Instant getOccurredAt() { return occurredAt; }
    public void setOccurredAt(Instant occurredAt) { this.occurredAt = occurredAt; }
    public String getDetailLevelBefore() { return detailLevelBefore; }
    public void setDetailLevelBefore(String detailLevelBefore) { this.detailLevelBefore = detailLevelBefore; }
    public String getDetailLevelAfter() { return detailLevelAfter; }
    public void setDetailLevelAfter(String detailLevelAfter) { this.detailLevelAfter = detailLevelAfter; }
    public String getFields() { return fields; }
    public void setFields(String fields) { this.fields = fields; }
    public String getSourceRef() { return sourceRef; }
    public void setSourceRef(String sourceRef) { this.sourceRef = sourceRef; }
    public String getTermsRef() { return termsRef; }
    public void setTermsRef(String termsRef) { this.termsRef = termsRef; }
    public String getRequestId() { return requestId; }
    public void setRequestId(String requestId) { this.requestId = requestId; }
    public String getNote() { return note; }
    public void setNote(String note) { this.note = note; }
}
