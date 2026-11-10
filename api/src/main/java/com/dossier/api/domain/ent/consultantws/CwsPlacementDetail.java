package com.dossier.api.domain.ent.consultantws;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;
import java.time.LocalDate;

/** The facts of one placement that talent_placement lacks (employer / ops side; demo stand-ins when sampleData). No email or phone, display labels only. Table {@code cws_placement_detail}. Every query goes through an org-scoped repository method. */
@Entity
@Table(name = "cws_placement_detail")
public class CwsPlacementDetail implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "placement_id", nullable = false)
    private Long placementId;

    @Column(name = "end_client_name", length = 160)
    private String endClientName;

    @Column(name = "project_name", length = 160)
    private String projectName;

    @Column(name = "manager_name", length = 120)
    private String managerName;

    @Column(name = "manager_title", length = 120)
    private String managerTitle;

    @Column(name = "location_label", length = 160)
    private String locationLabel;

    @Column(name = "work_mode", length = 60)
    private String workMode;

    @Column(name = "hours_per_week")
    private Integer hoursPerWeek;

    @Column(name = "schedule_label", length = 160)
    private String scheduleLabel;

    @Column(name = "engagement_status", length = 20, nullable = false)
    private String engagementStatus = "ON_TRACK";

    @Column(name = "status_note", length = 300)
    private String statusNote;

    @Column(name = "next_check_in")
    private LocalDate nextCheckIn;

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
    public String getEndClientName() { return endClientName; }
    public void setEndClientName(String endClientName) { this.endClientName = endClientName; }
    public String getProjectName() { return projectName; }
    public void setProjectName(String projectName) { this.projectName = projectName; }
    public String getManagerName() { return managerName; }
    public void setManagerName(String managerName) { this.managerName = managerName; }
    public String getManagerTitle() { return managerTitle; }
    public void setManagerTitle(String managerTitle) { this.managerTitle = managerTitle; }
    public String getLocationLabel() { return locationLabel; }
    public void setLocationLabel(String locationLabel) { this.locationLabel = locationLabel; }
    public String getWorkMode() { return workMode; }
    public void setWorkMode(String workMode) { this.workMode = workMode; }
    public Integer getHoursPerWeek() { return hoursPerWeek; }
    public void setHoursPerWeek(Integer hoursPerWeek) { this.hoursPerWeek = hoursPerWeek; }
    public String getScheduleLabel() { return scheduleLabel; }
    public void setScheduleLabel(String scheduleLabel) { this.scheduleLabel = scheduleLabel; }
    public String getEngagementStatus() { return engagementStatus; }
    public void setEngagementStatus(String engagementStatus) { this.engagementStatus = engagementStatus; }
    public String getStatusNote() { return statusNote; }
    public void setStatusNote(String statusNote) { this.statusNote = statusNote; }
    public LocalDate getNextCheckIn() { return nextCheckIn; }
    public void setNextCheckIn(LocalDate nextCheckIn) { this.nextCheckIn = nextCheckIn; }
    public boolean isSampleData() { return sampleData; }
    public void setSampleData(boolean sampleData) { this.sampleData = sampleData; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
