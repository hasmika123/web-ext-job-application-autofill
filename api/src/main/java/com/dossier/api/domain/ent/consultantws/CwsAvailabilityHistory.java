package com.dossier.api.domain.ent.consultantws;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;
import java.time.LocalDate;

/** One availability change made through the Availability page. Table {@code cws_availability_history}; the newest row is ACTIVE, older ones EXPIRED. */
@Entity
@Table(name = "cws_availability_history")
public class CwsAvailabilityHistory implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final String ACTIVE = "ACTIVE";
    public static final String EXPIRED = "EXPIRED";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "consultant_id", nullable = false)
    private Long consultantId;

    @Column(name = "effective_date", nullable = false)
    private LocalDate effectiveDate;

    @Column(name = "availability_status", length = 20, nullable = false)
    private String availabilityStatus;

    @Column(name = "available_from")
    private LocalDate availableFrom;

    @Column(name = "work_mode", length = 10)
    private String workMode;

    @Column(name = "status", length = 10, nullable = false)
    private String status = ACTIVE;

    @Column(name = "sample_data", nullable = false)
    private boolean sampleData = false;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getConsultantId() { return consultantId; }
    public void setConsultantId(Long consultantId) { this.consultantId = consultantId; }
    public LocalDate getEffectiveDate() { return effectiveDate; }
    public void setEffectiveDate(LocalDate effectiveDate) { this.effectiveDate = effectiveDate; }
    public String getAvailabilityStatus() { return availabilityStatus; }
    public void setAvailabilityStatus(String availabilityStatus) { this.availabilityStatus = availabilityStatus; }
    public LocalDate getAvailableFrom() { return availableFrom; }
    public void setAvailableFrom(LocalDate availableFrom) { this.availableFrom = availableFrom; }
    public String getWorkMode() { return workMode; }
    public void setWorkMode(String workMode) { this.workMode = workMode; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public boolean isSampleData() { return sampleData; }
    public void setSampleData(boolean sampleData) { this.sampleData = sampleData; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
