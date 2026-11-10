package com.dossier.api.domain.ent.mkt;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;
import java.time.LocalDate;

/**
 * Marketing state of one opportunity (a {@code requirement_match} row): what the consultant said about it, who on the marketing side owns
 * the follow-up and when the next action is due. Table {@code mkt_opportunity}. {@code interest} is only ever written from the consultant's
 * side (E1: a marketer requests, never answers for the consultant). Every query goes through an org-scoped repository method.
 */
@Entity
@Table(name = "mkt_opportunity")
public class MktOpportunity implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "match_id", nullable = false)
    private Long matchId;

    @Column(name = "interest", length = 20, nullable = false)
    private String interest = "NO_RESPONSE";

    @Column(name = "owner_member_id")
    private Long ownerMemberId;

    @Column(name = "next_action_at")
    private Instant nextActionAt;

    @Column(name = "last_response_at")
    private Instant lastResponseAt;

    @Column(name = "interest_requested_at")
    private Instant interestRequestedAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @Column(name = "state", length = 20, nullable = false)
    private String state = "ASSIGNED";

    @Column(name = "marketer_note", length = 1000)
    private String marketerNote;

    @Column(name = "priority", length = 10, nullable = false)
    private String priority = "MEDIUM";

    @Column(name = "due_on")
    private LocalDate dueOn;

    @Column(name = "viewed_at")
    private Instant viewedAt;

    @Column(name = "posting_opened_at")
    private Instant postingOpenedAt;

    @Column(name = "applied_at")
    private Instant appliedAt;

    @Column(name = "closed_at")
    private Instant closedAt;

    @Column(name = "decline_reason", length = 40)
    private String declineReason;

    /** The consultant's own words for declining (the consultant workspace takes free text); {@code decline_reason} stays the short code. */
    @Column(name = "decline_note", length = 300)
    private String declineNote;

    @Column(name = "info_request", length = 500)
    private String infoRequest;

    @Column(name = "info_answer", length = 1000)
    private String infoAnswer;

    @Column(name = "closed_reason", length = 30)
    private String closedReason;

    @Version
    @Column(name = "version", nullable = false)
    private long version;


    @PreUpdate
    void touch() {
        updatedAt = Instant.now();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getMatchId() { return matchId; }
    public void setMatchId(Long matchId) { this.matchId = matchId; }
    public String getInterest() { return interest; }
    public void setInterest(String interest) { this.interest = interest; }
    public Long getOwnerMemberId() { return ownerMemberId; }
    public void setOwnerMemberId(Long ownerMemberId) { this.ownerMemberId = ownerMemberId; }
    public Instant getNextActionAt() { return nextActionAt; }
    public void setNextActionAt(Instant nextActionAt) { this.nextActionAt = nextActionAt; }
    public Instant getLastResponseAt() { return lastResponseAt; }
    public void setLastResponseAt(Instant lastResponseAt) { this.lastResponseAt = lastResponseAt; }
    public Instant getInterestRequestedAt() { return interestRequestedAt; }
    public void setInterestRequestedAt(Instant interestRequestedAt) { this.interestRequestedAt = interestRequestedAt; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
    public String getState() { return state; }
    public void setState(String state) { this.state = state; }
    public String getMarketerNote() { return marketerNote; }
    public void setMarketerNote(String marketerNote) { this.marketerNote = marketerNote; }
    public String getPriority() { return priority; }
    public void setPriority(String priority) { this.priority = priority; }
    public LocalDate getDueOn() { return dueOn; }
    public void setDueOn(LocalDate dueOn) { this.dueOn = dueOn; }
    public Instant getViewedAt() { return viewedAt; }
    public void setViewedAt(Instant viewedAt) { this.viewedAt = viewedAt; }
    public Instant getPostingOpenedAt() { return postingOpenedAt; }
    public void setPostingOpenedAt(Instant postingOpenedAt) { this.postingOpenedAt = postingOpenedAt; }
    public Instant getAppliedAt() { return appliedAt; }
    public void setAppliedAt(Instant appliedAt) { this.appliedAt = appliedAt; }
    public Instant getClosedAt() { return closedAt; }
    public void setClosedAt(Instant closedAt) { this.closedAt = closedAt; }
    public String getDeclineReason() { return declineReason; }
    public void setDeclineReason(String declineReason) { this.declineReason = declineReason; }
    public String getDeclineNote() { return declineNote; }
    public void setDeclineNote(String declineNote) { this.declineNote = declineNote; }
    public String getInfoRequest() { return infoRequest; }
    public void setInfoRequest(String infoRequest) { this.infoRequest = infoRequest; }
    public String getInfoAnswer() { return infoAnswer; }
    public void setInfoAnswer(String infoAnswer) { this.infoAnswer = infoAnswer; }
    public String getClosedReason() { return closedReason; }
    public void setClosedReason(String closedReason) { this.closedReason = closedReason; }
    public long getVersion() { return version; }
    public void setVersion(long version) { this.version = version; }
}
