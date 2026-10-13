package com.dossier.api.domain.ent.consultantws;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * A consultant's own search: kind SAVED (named, kept until deleted) or RECENT (the last few runs, newest first). The filters are plain
 * columns. Table {@code cws_saved_search}; only that consultant reads it.
 */
@Entity
@Table(name = "cws_saved_search")
public class CwsSavedSearch implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final String SAVED = "SAVED";
    public static final String RECENT = "RECENT";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "consultant_id", nullable = false)
    private Long consultantId;

    @Column(name = "kind", length = 10, nullable = false)
    private String kind = SAVED;

    @Column(name = "name", length = 80)
    private String name;

    @Column(name = "keyword", length = 120)
    private String keyword;

    @Column(name = "location", length = 120)
    private String location;

    @Column(name = "job_type", length = 20)
    private String jobType;

    @Column(name = "work_mode", length = 20)
    private String workMode;

    @Column(name = "experience", length = 20)
    private String experience;

    @Column(name = "industry", length = 80)
    private String industry;

    @Column(name = "skill", length = 80)
    private String skill;

    @Column(name = "client_id")
    private Long clientId;

    @Column(name = "min_rate_minor")
    private Long minRateMinor;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "last_used_at", nullable = false)
    private Instant lastUsedAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getConsultantId() { return consultantId; }
    public void setConsultantId(Long consultantId) { this.consultantId = consultantId; }
    public String getKind() { return kind; }
    public void setKind(String kind) { this.kind = kind; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getKeyword() { return keyword; }
    public void setKeyword(String keyword) { this.keyword = keyword; }
    public String getLocation() { return location; }
    public void setLocation(String location) { this.location = location; }
    public String getJobType() { return jobType; }
    public void setJobType(String jobType) { this.jobType = jobType; }
    public String getWorkMode() { return workMode; }
    public void setWorkMode(String workMode) { this.workMode = workMode; }
    public String getExperience() { return experience; }
    public void setExperience(String experience) { this.experience = experience; }
    public String getIndustry() { return industry; }
    public void setIndustry(String industry) { this.industry = industry; }
    public String getSkill() { return skill; }
    public void setSkill(String skill) { this.skill = skill; }
    public Long getClientId() { return clientId; }
    public void setClientId(Long clientId) { this.clientId = clientId; }
    public Long getMinRateMinor() { return minRateMinor; }
    public void setMinRateMinor(Long minRateMinor) { this.minRateMinor = minRateMinor; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getLastUsedAt() { return lastUsedAt; }
    public void setLastUsedAt(Instant lastUsedAt) { this.lastUsedAt = lastUsedAt; }
}
