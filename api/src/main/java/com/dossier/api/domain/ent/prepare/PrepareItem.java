package com.dossier.api.domain.ent.prepare;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/** One opening in a prepare session (unique per session and match). Table {@code prepare_item}; this is also what the daily and monthly caps count. */
@Entity
@Table(name = "prepare_item")
public class PrepareItem implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final String WAITING = "WAITING";
    public static final String OPENED = "OPENED";
    public static final String FILLED = "FILLED";
    public static final String NEEDS_INPUT = "NEEDS_INPUT";
    public static final String SUBMITTED = "SUBMITTED";
    public static final String CLOSED = "CLOSED";
    public static final String FAILED = "FAILED";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "session_id", nullable = false)
    private Long sessionId;

    @Column(name = "consultant_id", nullable = false)
    private Long consultantId;

    @Column(name = "match_id", nullable = false)
    private Long matchId;

    @Column(name = "opportunity_id")
    private Long opportunityId;

    @Column(name = "url", length = 500, nullable = false)
    private String url;

    @Column(name = "title", length = 255)
    private String title;

    @Column(name = "company", length = 255)
    private String company;

    @Column(name = "state", length = 20, nullable = false)
    private String state = WAITING;

    @Column(name = "detail", length = 200)
    private String detail;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getSessionId() { return sessionId; }
    public void setSessionId(Long sessionId) { this.sessionId = sessionId; }
    public Long getConsultantId() { return consultantId; }
    public void setConsultantId(Long consultantId) { this.consultantId = consultantId; }
    public Long getMatchId() { return matchId; }
    public void setMatchId(Long matchId) { this.matchId = matchId; }
    public Long getOpportunityId() { return opportunityId; }
    public void setOpportunityId(Long opportunityId) { this.opportunityId = opportunityId; }
    public String getUrl() { return url; }
    public void setUrl(String url) { this.url = url; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getCompany() { return company; }
    public void setCompany(String company) { this.company = company; }
    public String getState() { return state; }
    public void setState(String state) { this.state = state; }
    public String getDetail() { return detail; }
    public void setDetail(String detail) { this.detail = detail; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
