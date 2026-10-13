package com.dossier.api.domain.ent.talent;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/** A client job (34 section 2); the Jobs board. status adds IN_REVIEW to the doc list. Table {@code client_requirement}; see docs/enterprise-v2/talent-foundation.md. Every query goes through an org-scoped repository method. */
@Entity
@Table(name = "client_requirement")
public class ClientRequirement implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "client_id", nullable = false)
    private Long clientId;

    @Column(name = "contact_id")
    private Long contactId;

    @Column(name = "title", length = 300, nullable = false)
    private String title;

    @Column(name = "description_text", length = 4000)
    private String descriptionText;

    @Column(name = "location", length = 300)
    private String location;

    @Column(name = "work_mode", length = 20)
    private String workMode;

    @Column(name = "employment_label", length = 20)
    private String employmentLabel;

    @Column(name = "duration_label", length = 40)
    private String durationLabel;

    @Column(name = "experience_level", length = 20)
    private String experienceLevel;

    @Column(name = "rate_min_minor")
    private Long rateMinMinor;

    @Column(name = "rate_max_minor")
    private Long rateMaxMinor;

    @Column(name = "rate_unit", length = 10)
    private String rateUnit;

    @Column(name = "currency", length = 3, nullable = false)
    private String currency = "USD";

    @Column(name = "positions", nullable = false)
    private Integer positions = 1;

    @Column(name = "filled", nullable = false)
    private Integer filled = 0;

    @Column(name = "status", length = 20, nullable = false)
    private String status = "OPEN";

    @Column(name = "posted_at", nullable = false)
    private Instant postedAt = Instant.now();

    @Column(name = "owner_member_id")
    private Long ownerMemberId;

    @Column(name = "source", length = 20, nullable = false)
    private String source = "MANUAL";

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @Column(name = "closed_at")
    private Instant closedAt;

    @PreUpdate
    void touch() {
        updatedAt = Instant.now();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getClientId() { return clientId; }
    public void setClientId(Long clientId) { this.clientId = clientId; }
    public Long getContactId() { return contactId; }
    public void setContactId(Long contactId) { this.contactId = contactId; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getDescriptionText() { return descriptionText; }
    public void setDescriptionText(String descriptionText) { this.descriptionText = descriptionText; }
    public String getLocation() { return location; }
    public void setLocation(String location) { this.location = location; }
    public String getWorkMode() { return workMode; }
    public void setWorkMode(String workMode) { this.workMode = workMode; }
    public String getEmploymentLabel() { return employmentLabel; }
    public void setEmploymentLabel(String employmentLabel) { this.employmentLabel = employmentLabel; }
    public String getDurationLabel() { return durationLabel; }
    public void setDurationLabel(String durationLabel) { this.durationLabel = durationLabel; }
    public String getExperienceLevel() { return experienceLevel; }
    public void setExperienceLevel(String experienceLevel) { this.experienceLevel = experienceLevel; }
    public Long getRateMinMinor() { return rateMinMinor; }
    public void setRateMinMinor(Long rateMinMinor) { this.rateMinMinor = rateMinMinor; }
    public Long getRateMaxMinor() { return rateMaxMinor; }
    public void setRateMaxMinor(Long rateMaxMinor) { this.rateMaxMinor = rateMaxMinor; }
    public String getRateUnit() { return rateUnit; }
    public void setRateUnit(String rateUnit) { this.rateUnit = rateUnit; }
    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }
    public Integer getPositions() { return positions; }
    public void setPositions(Integer positions) { this.positions = positions; }
    public Integer getFilled() { return filled; }
    public void setFilled(Integer filled) { this.filled = filled; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public Instant getPostedAt() { return postedAt; }
    public void setPostedAt(Instant postedAt) { this.postedAt = postedAt; }
    public Long getOwnerMemberId() { return ownerMemberId; }
    public void setOwnerMemberId(Long ownerMemberId) { this.ownerMemberId = ownerMemberId; }
    public String getSource() { return source; }
    public void setSource(String source) { this.source = source; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
    public Instant getClosedAt() { return closedAt; }
    public void setClosedAt(Instant closedAt) { this.closedAt = closedAt; }
}
