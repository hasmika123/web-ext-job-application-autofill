package com.dossier.api.domain.ent.consultantws;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;
import java.time.LocalDate;

/** One upcoming meeting of a placement (join link https only, nullable). Table {@code cws_placement_meeting}. Every query goes through an org-scoped repository method. */
@Entity
@Table(name = "cws_placement_meeting")
public class CwsPlacementMeeting implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "placement_id", nullable = false)
    private Long placementId;

    @Column(name = "label", length = 120, nullable = false)
    private String label;

    @Column(name = "starts_at", nullable = false)
    private Instant startsAt;

    @Column(name = "duration_minutes", nullable = false)
    private int durationMinutes = 60;

    @Column(name = "with_label", length = 120)
    private String withLabel;

    @Column(name = "join_url", length = 500)
    private String joinUrl;

    @Column(name = "sample_data", nullable = false)
    private boolean sampleData = false;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getPlacementId() { return placementId; }
    public void setPlacementId(Long placementId) { this.placementId = placementId; }
    public String getLabel() { return label; }
    public void setLabel(String label) { this.label = label; }
    public Instant getStartsAt() { return startsAt; }
    public void setStartsAt(Instant startsAt) { this.startsAt = startsAt; }
    public int getDurationMinutes() { return durationMinutes; }
    public void setDurationMinutes(int durationMinutes) { this.durationMinutes = durationMinutes; }
    public String getWithLabel() { return withLabel; }
    public void setWithLabel(String withLabel) { this.withLabel = withLabel; }
    public String getJoinUrl() { return joinUrl; }
    public void setJoinUrl(String joinUrl) { this.joinUrl = joinUrl; }
    public boolean isSampleData() { return sampleData; }
    public void setSampleData(boolean sampleData) { this.sampleData = sampleData; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
