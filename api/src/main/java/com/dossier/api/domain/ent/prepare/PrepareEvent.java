package com.dossier.api.domain.ent.prepare;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/** One thing the extension reported about an item (append only). Table {@code prepare_event}; {@code detail} is at most 200 characters and was scanned for sensitive data. */
@Entity
@Table(name = "prepare_event")
public class PrepareEvent implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "session_id", nullable = false)
    private Long sessionId;

    @Column(name = "item_id", nullable = false)
    private Long itemId;

    @Column(name = "match_id", nullable = false)
    private Long matchId;

    @Column(name = "kind", length = 20, nullable = false)
    private String kind;

    @Column(name = "detail", length = 200)
    private String detail;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getSessionId() { return sessionId; }
    public void setSessionId(Long sessionId) { this.sessionId = sessionId; }
    public Long getItemId() { return itemId; }
    public void setItemId(Long itemId) { this.itemId = itemId; }
    public Long getMatchId() { return matchId; }
    public void setMatchId(Long matchId) { this.matchId = matchId; }
    public String getKind() { return kind; }
    public void setKind(String kind) { this.kind = kind; }
    public String getDetail() { return detail; }
    public void setDetail(String detail) { this.detail = detail; }
    public Instant getOccurredAt() { return occurredAt; }
    public void setOccurredAt(Instant occurredAt) { this.occurredAt = occurredAt; }
}
