package com.dossier.api.domain.ent.mkt;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/** Append-only history of a submission record (activity feed, state-at-a-time for the KPI deltas). Table {@code mkt_submission_event}. */
@Entity
@Table(name = "mkt_submission_event")
public class MktSubmissionEvent implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final String CREATED = "CREATED";
    public static final String APPROVAL_REQUESTED = "APPROVAL_REQUESTED";
    public static final String APPROVAL_DECIDED = "APPROVAL_DECIDED";
    public static final String STATUS_RECORDED = "STATUS_RECORDED";
    public static final String WITHDRAWN = "WITHDRAWN";
    public static final String FIELD_APPROVAL = "APPROVAL";
    public static final String FIELD_STATUS = "STATUS";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "submission_id", nullable = false)
    private Long submissionId;

    @Column(name = "kind", length = 24, nullable = false)
    private String kind;

    @Column(name = "field", length = 12)
    private String field;

    @Column(name = "from_value", length = 24)
    private String fromValue;

    @Column(name = "to_value", length = 24)
    private String toValue;

    @Column(name = "actor_member_id")
    private Long actorMemberId;

    @Column(name = "detail", length = 300)
    private String detail;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt = Instant.now();

    public static MktSubmissionEvent of(Long orgId, Long submissionId, String kind, String field, String from, String to, Long actorMemberId, String detail, Instant at) {
        MktSubmissionEvent e = new MktSubmissionEvent();
        e.orgId = orgId;
        e.submissionId = submissionId;
        e.kind = kind;
        e.field = field;
        e.fromValue = from;
        e.toValue = to;
        e.actorMemberId = actorMemberId;
        e.detail = detail;
        e.occurredAt = at;
        return e;
    }

    public Long getId() { return id; }
    public Long getOrgId() { return orgId; }
    public Long getSubmissionId() { return submissionId; }
    public String getKind() { return kind; }
    public String getField() { return field; }
    public String getFromValue() { return fromValue; }
    public String getToValue() { return toValue; }
    public Long getActorMemberId() { return actorMemberId; }
    public String getDetail() { return detail; }
    public Instant getOccurredAt() { return occurredAt; }
}
