package com.dossier.api.domain.ent.talent;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;
import java.time.LocalDate;

/** A note on a placement. Table {@code placement_note}; see docs/enterprise-v2/page-placements.md. Every query goes through an org-scoped path. */
@Entity
@Table(name = "placement_note")
public class PlacementNote implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "placement_id", nullable = false)
    private Long placementId;

    @Column(name = "author_member_id")
    private Long authorMemberId;

    @Column(name = "body", length = 1000, nullable = false)
    private String body;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getPlacementId() { return placementId; }
    public void setPlacementId(Long placementId) { this.placementId = placementId; }
    public Long getAuthorMemberId() { return authorMemberId; }
    public void setAuthorMemberId(Long authorMemberId) { this.authorMemberId = authorMemberId; }
    public String getBody() { return body; }
    public void setBody(String body) { this.body = body; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
