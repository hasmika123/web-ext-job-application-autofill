package com.dossier.api.domain.ent.ops;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;
import java.time.LocalDate;

/** HR record of one employee: a staff seat (member_id) and/or a consultant (consultant_id). Directory fields only, record-only (E2): no phone, no date of birth, no document or bank data. Table {@code hr_employee}; see docs/enterprise-v2/ops-data-foundation.md. Every query goes through an org-scoped repository method. */
@Entity
@Table(name = "hr_employee")
public class HrEmployee implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "member_id")
    private Long memberId;

    @Column(name = "consultant_id")
    private Long consultantId;

    @Column(name = "display_name", length = 120, nullable = false)
    private String displayName;

    @Column(name = "work_email", length = 254, nullable = false)
    private String workEmail;

    @Column(name = "job_title", length = 120)
    private String jobTitle;

    @Column(name = "employment_type", length = 20, nullable = false)
    private String employmentType = "FULL_TIME";

    @Column(name = "department_group_id")
    private Long departmentGroupId;

    @Column(name = "manager_member_id")
    private Long managerMemberId;

    @Column(name = "work_city", length = 80)
    private String workCity;

    @Column(name = "work_region", length = 40)
    private String workRegion;

    @Column(name = "start_date", nullable = false)
    private LocalDate startDate;

    @Column(name = "end_date")
    private LocalDate endDate;

    @Column(name = "employment_status", length = 20, nullable = false)
    private String employmentStatus = "ACTIVE";

    @Column(name = "onboarding_stage", length = 20, nullable = false)
    private String onboardingStage = "NOT_STARTED";

    @Column(name = "onboarding_started_at")
    private Instant onboardingStartedAt;

    @Column(name = "onboarding_completed_at")
    private Instant onboardingCompletedAt;

    @Column(name = "last_activity_at")
    private Instant lastActivityAt;

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
    public Long getConsultantId() { return consultantId; }
    public void setConsultantId(Long consultantId) { this.consultantId = consultantId; }
    public String getDisplayName() { return displayName; }
    public void setDisplayName(String displayName) { this.displayName = displayName; }
    public String getWorkEmail() { return workEmail; }
    public void setWorkEmail(String workEmail) { this.workEmail = workEmail; }
    public String getJobTitle() { return jobTitle; }
    public void setJobTitle(String jobTitle) { this.jobTitle = jobTitle; }
    public String getEmploymentType() { return employmentType; }
    public void setEmploymentType(String employmentType) { this.employmentType = employmentType; }
    public Long getDepartmentGroupId() { return departmentGroupId; }
    public void setDepartmentGroupId(Long departmentGroupId) { this.departmentGroupId = departmentGroupId; }
    public Long getManagerMemberId() { return managerMemberId; }
    public void setManagerMemberId(Long managerMemberId) { this.managerMemberId = managerMemberId; }
    public String getWorkCity() { return workCity; }
    public void setWorkCity(String workCity) { this.workCity = workCity; }
    public String getWorkRegion() { return workRegion; }
    public void setWorkRegion(String workRegion) { this.workRegion = workRegion; }
    public LocalDate getStartDate() { return startDate; }
    public void setStartDate(LocalDate startDate) { this.startDate = startDate; }
    public LocalDate getEndDate() { return endDate; }
    public void setEndDate(LocalDate endDate) { this.endDate = endDate; }
    public String getEmploymentStatus() { return employmentStatus; }
    public void setEmploymentStatus(String employmentStatus) { this.employmentStatus = employmentStatus; }
    public String getOnboardingStage() { return onboardingStage; }
    public void setOnboardingStage(String onboardingStage) { this.onboardingStage = onboardingStage; }
    public Instant getOnboardingStartedAt() { return onboardingStartedAt; }
    public void setOnboardingStartedAt(Instant onboardingStartedAt) { this.onboardingStartedAt = onboardingStartedAt; }
    public Instant getOnboardingCompletedAt() { return onboardingCompletedAt; }
    public void setOnboardingCompletedAt(Instant onboardingCompletedAt) { this.onboardingCompletedAt = onboardingCompletedAt; }
    public Instant getLastActivityAt() { return lastActivityAt; }
    public void setLastActivityAt(Instant lastActivityAt) { this.lastActivityAt = lastActivityAt; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
