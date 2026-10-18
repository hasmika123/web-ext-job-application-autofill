package com.dossier.api.domain.catalog;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * A plan's identity (docs/subscriptions/08-data-model.md section 3): {@code FREE}, {@code PRO}, {@code AUTOPILOT}, {@code ORG_STANDARD} ... The
 * composition lives in {@link PlanVersion} and {@link PlanComponent}. Status DRAFT, PUBLISHED, RETIRING or RETIRED; {@code audience} INDIVIDUAL or ORG
 * (personal accounts and organizations never share a plan, decision O4). Platform data, no org_id.
 */
@Entity
@Table(name = "plan")
public class Plan implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", nullable = false)
    private Long id;

    @Column(name = "plan_key", length = 40, nullable = false)
    private String planKey;

    @Column(name = "name", length = 80, nullable = false)
    private String name;

    @Column(name = "audience", length = 12, nullable = false)
    private String audience;

    @Column(name = "status", length = 12, nullable = false)
    private String status = "DRAFT";

    @Column(name = "public", nullable = false)
    private Boolean publicPlan = false;

    @Column(name = "description", length = 1000)
    private String description;

    @Column(name = "badge", length = 40)
    private String badge;

    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder = 0;

    @Column(name = "eligibility_json", columnDefinition = "json")
    private String eligibilityJson;

    @Column(name = "successor_plan_id")
    private Long successorPlanId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "created_by", length = 50, nullable = false)
    private String createdBy;

    @Column(name = "updated_at")
    private Instant updatedAt;

    @Column(name = "updated_by", length = 50)
    private String updatedBy;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getPlanKey() { return planKey; }
    public void setPlanKey(String planKey) { this.planKey = planKey; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getAudience() { return audience; }
    public void setAudience(String audience) { this.audience = audience; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public Boolean getPublicPlan() { return publicPlan; }
    public void setPublicPlan(Boolean publicPlan) { this.publicPlan = publicPlan; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getBadge() { return badge; }
    public void setBadge(String badge) { this.badge = badge; }
    public Integer getSortOrder() { return sortOrder; }
    public void setSortOrder(Integer sortOrder) { this.sortOrder = sortOrder; }
    public String getEligibilityJson() { return eligibilityJson; }
    public void setEligibilityJson(String eligibilityJson) { this.eligibilityJson = eligibilityJson; }
    public Long getSuccessorPlanId() { return successorPlanId; }
    public void setSuccessorPlanId(Long successorPlanId) { this.successorPlanId = successorPlanId; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
    public String getUpdatedBy() { return updatedBy; }
    public void setUpdatedBy(String updatedBy) { this.updatedBy = updatedBy; }
}
