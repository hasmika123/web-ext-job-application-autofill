package com.dossier.api.domain.ent.mkt;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

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
}
