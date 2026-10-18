package com.dossier.api.domain.ent.talent;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * A planned change of a consultant's marketer (Sprint 2 / H-assign). Table {@code marketer_assignment_schedule}.
 *
 * <p>{@link #REASSIGN}: a handover to {@code newMarketerMemberId} that takes effect at {@code startsAt}. {@link #DELEGATE}: temporary cover, the cover
 * marketer ({@code newMarketerMemberId}) takes the consultant at {@code startsAt} and {@code returnMarketerMemberId} (the marketer it was taken from, filled in
 * when the cover starts) gets them back at {@code endsAt}. The row never carries the work itself: the lifecycle service applies it to
 * {@code marketer_assignment} and writes the history, audit and handover rows. The reason is free text typed by a person and is scanned for sensitive data
 * before it is stored.
 */
@Entity
@Table(name = "marketer_assignment_schedule")
public class MarketerAssignmentSchedule implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final String REASSIGN = "REASSIGN";
    public static final String DELEGATE = "DELEGATE";

    /** Waiting for its start. */
    public static final String SCHEDULED = "SCHEDULED";
    /** A DELEGATE that has started and has not ended yet. */
    public static final String ACTIVE = "ACTIVE";
    /** A REASSIGN that was applied. */
    public static final String DONE = "DONE";
    /** A DELEGATE that ended (on time, early or overtaken). */
    public static final String ENDED = "ENDED";
    public static final String CANCELLED = "CANCELLED";
    /** Could not be applied (the outcome says why); left for an administrator to see. */
    public static final String FAILED = "FAILED";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "consultant_id", nullable = false)
    private Long consultantId;

    @Column(name = "kind", length = 12, nullable = false)
    private String kind;

    @Column(name = "status", length = 12, nullable = false)
    private String status = SCHEDULED;

    @Column(name = "new_marketer_member_id", nullable = false)
    private Long newMarketerMemberId;

    @Column(name = "return_marketer_member_id")
    private Long returnMarketerMemberId;

    @Column(name = "starts_at", nullable = false)
    private Instant startsAt;

    @Column(name = "ends_at")
    private Instant endsAt;

    @Column(name = "reason", length = 200)
    private String reason;

    @Column(name = "outcome", length = 40)
    private String outcome;

    @Column(name = "created_by_member_id")
    private Long createdByMemberId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "applied_at")
    private Instant appliedAt;

    @Column(name = "finished_at")
    private Instant finishedAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getConsultantId() { return consultantId; }
    public void setConsultantId(Long consultantId) { this.consultantId = consultantId; }
    public String getKind() { return kind; }
    public void setKind(String kind) { this.kind = kind; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public Long getNewMarketerMemberId() { return newMarketerMemberId; }
    public void setNewMarketerMemberId(Long v) { this.newMarketerMemberId = v; }
    public Long getReturnMarketerMemberId() { return returnMarketerMemberId; }
    public void setReturnMarketerMemberId(Long v) { this.returnMarketerMemberId = v; }
    public Instant getStartsAt() { return startsAt; }
    public void setStartsAt(Instant startsAt) { this.startsAt = startsAt; }
    public Instant getEndsAt() { return endsAt; }
    public void setEndsAt(Instant endsAt) { this.endsAt = endsAt; }
    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }
    public String getOutcome() { return outcome; }
    public void setOutcome(String outcome) { this.outcome = outcome; }
    public Long getCreatedByMemberId() { return createdByMemberId; }
    public void setCreatedByMemberId(Long v) { this.createdByMemberId = v; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getAppliedAt() { return appliedAt; }
    public void setAppliedAt(Instant appliedAt) { this.appliedAt = appliedAt; }
    public Instant getFinishedAt() { return finishedAt; }
    public void setFinishedAt(Instant finishedAt) { this.finishedAt = finishedAt; }
}
