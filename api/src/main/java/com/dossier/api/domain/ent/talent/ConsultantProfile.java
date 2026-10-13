package com.dossier.api.domain.ent.talent;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;
import java.time.LocalDate;

/** Org overlay of a consultant (30 section 2, 03 section 2.3) plus the directory columns of the Consultants board. member_id is null for consultants who are not seats. Table {@code consultant_profile}; see docs/enterprise-v2/talent-foundation.md. Every query goes through an org-scoped repository method. */
@Entity
@Table(name = "consultant_profile")
public class ConsultantProfile implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "member_id")
    private Long memberId;

    @Column(name = "display_name", length = 120, nullable = false)
    private String displayName;

    @Column(name = "email", length = 254, nullable = false)
    private String email;

    @Column(name = "job_title", length = 120)
    private String jobTitle;

    @Column(name = "headline", length = 120)
    private String headline;

    @Column(name = "years_experience")
    private Integer yearsExperience;

    @Column(name = "location_label", length = 120)
    private String locationLabel;

    @Column(name = "work_mode", length = 20)
    private String workMode;

    @Column(name = "availability_status", length = 20, nullable = false)
    private String availabilityStatus = "AVAILABLE";

    @Column(name = "available_from")
    private LocalDate availableFrom;

    @Column(name = "availability_since")
    private LocalDate availabilitySince;

    @Column(name = "marketing_status", length = 20, nullable = false)
    private String marketingStatus = "ACTIVE";

    @Column(name = "bench_since")
    private LocalDate benchSince;

    @Column(name = "license_status", length = 20, nullable = false)
    private String licenseStatus = "ACTIVE";

    @Column(name = "license_valid_until")
    private LocalDate licenseValidUntil;

    @Column(name = "profile_completeness", nullable = false)
    private Integer profileCompleteness = 0;

    @Column(name = "has_certifications", nullable = false)
    private boolean hasCertifications = false;

    @Column(name = "has_preferences", nullable = false)
    private boolean hasPreferences = false;

    @Column(name = "department_group_id")
    private Long departmentGroupId;

    @Column(name = "status", length = 20, nullable = false)
    private String status = "ACTIVE";

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
    public Long getMemberId() { return memberId; }
    public void setMemberId(Long memberId) { this.memberId = memberId; }
    public String getDisplayName() { return displayName; }
    public void setDisplayName(String displayName) { this.displayName = displayName; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getJobTitle() { return jobTitle; }
    public void setJobTitle(String jobTitle) { this.jobTitle = jobTitle; }
    public String getHeadline() { return headline; }
    public void setHeadline(String headline) { this.headline = headline; }
    public Integer getYearsExperience() { return yearsExperience; }
    public void setYearsExperience(Integer yearsExperience) { this.yearsExperience = yearsExperience; }
    public String getLocationLabel() { return locationLabel; }
    public void setLocationLabel(String locationLabel) { this.locationLabel = locationLabel; }
    public String getWorkMode() { return workMode; }
    public void setWorkMode(String workMode) { this.workMode = workMode; }
    public String getAvailabilityStatus() { return availabilityStatus; }
    public void setAvailabilityStatus(String availabilityStatus) { this.availabilityStatus = availabilityStatus; }
    public LocalDate getAvailableFrom() { return availableFrom; }
    public void setAvailableFrom(LocalDate availableFrom) { this.availableFrom = availableFrom; }
    public LocalDate getAvailabilitySince() { return availabilitySince; }
    public void setAvailabilitySince(LocalDate availabilitySince) { this.availabilitySince = availabilitySince; }
    public String getMarketingStatus() { return marketingStatus; }
    public void setMarketingStatus(String marketingStatus) { this.marketingStatus = marketingStatus; }
    public LocalDate getBenchSince() { return benchSince; }
    public void setBenchSince(LocalDate benchSince) { this.benchSince = benchSince; }
    public String getLicenseStatus() { return licenseStatus; }
    public void setLicenseStatus(String licenseStatus) { this.licenseStatus = licenseStatus; }
    public LocalDate getLicenseValidUntil() { return licenseValidUntil; }
    public void setLicenseValidUntil(LocalDate licenseValidUntil) { this.licenseValidUntil = licenseValidUntil; }
    public Integer getProfileCompleteness() { return profileCompleteness; }
    public void setProfileCompleteness(Integer profileCompleteness) { this.profileCompleteness = profileCompleteness; }
    public boolean isHasCertifications() { return hasCertifications; }
    public void setHasCertifications(boolean hasCertifications) { this.hasCertifications = hasCertifications; }
    public boolean isHasPreferences() { return hasPreferences; }
    public void setHasPreferences(boolean hasPreferences) { this.hasPreferences = hasPreferences; }
    public Long getDepartmentGroupId() { return departmentGroupId; }
    public void setDepartmentGroupId(Long departmentGroupId) { this.departmentGroupId = departmentGroupId; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
