package com.dossier.api.domain.ent.consultantws;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;
import java.time.LocalDate;

/** One onboarding checklist item of a placement; the consultant ticks it (completedAt). Table {@code cws_placement_checklist}. Every query goes through an org-scoped repository method. */
@Entity
@Table(name = "cws_placement_checklist")
public class CwsPlacementChecklist implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "placement_id", nullable = false)
    private Long placementId;

    @Column(name = "label", length = 160, nullable = false)
    private String label;

    @Column(name = "due_on")
    private LocalDate dueOn;

    @Column(name = "completed_at")
    private Instant completedAt;

    @Column(name = "sort_no", nullable = false)
    private int sortNo = 0;

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
    public LocalDate getDueOn() { return dueOn; }
    public void setDueOn(LocalDate dueOn) { this.dueOn = dueOn; }
    public Instant getCompletedAt() { return completedAt; }
    public void setCompletedAt(Instant completedAt) { this.completedAt = completedAt; }
    public int getSortNo() { return sortNo; }
    public void setSortNo(int sortNo) { this.sortNo = sortNo; }
    public boolean isSampleData() { return sampleData; }
    public void setSampleData(boolean sampleData) { this.sampleData = sampleData; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
