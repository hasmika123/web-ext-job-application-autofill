package com.dossier.api.domain.ent.mkt;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * Append-only log of what the marketer did on a follow-up: CALL_LOGGED, REMINDER_SENT (a recorded reminder REQUEST, nothing is mailed to anyone) or
 * STATUS_CHANGED. Table {@code mkt_followup_event}. Feeds the "Avg. Response Time" insight.
 */
@Entity
@Table(name = "mkt_followup_event")
public class MktFollowupEvent implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final String CALL_LOGGED = "CALL_LOGGED";
    public static final String REMINDER_SENT = "REMINDER_SENT";
    public static final String STATUS_CHANGED = "STATUS_CHANGED";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "followup_id", nullable = false)
    private Long followupId;

    @Column(name = "kind", length = 20, nullable = false)
    private String kind;

    @Column(name = "note", length = 500)
    private String note;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt = Instant.now();

    @Column(name = "by_member_id")
    private Long byMemberId;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getFollowupId() { return followupId; }
    public void setFollowupId(Long followupId) { this.followupId = followupId; }
    public String getKind() { return kind; }
    public void setKind(String kind) { this.kind = kind; }
    public String getNote() { return note; }
    public void setNote(String note) { this.note = note; }
    public Instant getOccurredAt() { return occurredAt; }
    public void setOccurredAt(Instant occurredAt) { this.occurredAt = occurredAt; }
    public Long getByMemberId() { return byMemberId; }
    public void setByMemberId(Long byMemberId) { this.byMemberId = byMemberId; }
}
