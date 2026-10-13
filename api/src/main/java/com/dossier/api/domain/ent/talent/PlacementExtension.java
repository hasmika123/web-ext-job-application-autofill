package com.dossier.api.domain.ent.talent;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;
import java.time.LocalDate;

/** An extension of a placement end date: requested, then approved (recorded) or declined. Table {@code placement_extension}; see docs/enterprise-v2/page-placements.md. Every query goes through an org-scoped path. */
@Entity
@Table(name = "placement_extension")
public class PlacementExtension implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "placement_id", nullable = false)
    private Long placementId;

    @Column(name = "status", length = 20, nullable = false)
    private String status = "REQUESTED";

    @Column(name = "from_end_date")
    private LocalDate fromEndDate;

    @Column(name = "requested_end_date", nullable = false)
    private LocalDate requestedEndDate;

    @Column(name = "note", length = 500)
    private String note;

    @Column(name = "requested_by_member_id")
    private Long requestedByMemberId;

    @Column(name = "decided_by_member_id")
    private Long decidedByMemberId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "decided_at")
    private Instant decidedAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getPlacementId() { return placementId; }
    public void setPlacementId(Long placementId) { this.placementId = placementId; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public LocalDate getFromEndDate() { return fromEndDate; }
    public void setFromEndDate(LocalDate fromEndDate) { this.fromEndDate = fromEndDate; }
    public LocalDate getRequestedEndDate() { return requestedEndDate; }
    public void setRequestedEndDate(LocalDate requestedEndDate) { this.requestedEndDate = requestedEndDate; }
    public String getNote() { return note; }
    public void setNote(String note) { this.note = note; }
    public Long getRequestedByMemberId() { return requestedByMemberId; }
    public void setRequestedByMemberId(Long requestedByMemberId) { this.requestedByMemberId = requestedByMemberId; }
    public Long getDecidedByMemberId() { return decidedByMemberId; }
    public void setDecidedByMemberId(Long decidedByMemberId) { this.decidedByMemberId = decidedByMemberId; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getDecidedAt() { return decidedAt; }
    public void setDecidedAt(Instant decidedAt) { this.decidedAt = decidedAt; }
}
