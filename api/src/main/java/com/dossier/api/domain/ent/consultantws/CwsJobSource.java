package com.dossier.api.domain.ent.consultantws;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * The marketer-entered source link and quick info of one job. Table {@code cws_job_source}; Kiwiply does not load full job details, the consultant opens
 * {@code sourceUrl} and applies on the source site with the extension. Only org members of the job's organization read it.
 */
@Entity
@Table(name = "cws_job_source")
public class CwsJobSource implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "requirement_id", nullable = false)
    private Long requirementId;

    @Column(name = "source_url", length = 500)
    private String sourceUrl;

    @Column(name = "source_name", length = 80)
    private String sourceName;

    @Column(name = "quick_info", length = 500)
    private String quickInfo;

    @Column(name = "added_by_member_id")
    private Long addedByMemberId;

    @Column(name = "sample_data", nullable = false)
    private boolean sampleData;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getRequirementId() { return requirementId; }
    public void setRequirementId(Long requirementId) { this.requirementId = requirementId; }
    public String getSourceUrl() { return sourceUrl; }
    public void setSourceUrl(String sourceUrl) { this.sourceUrl = sourceUrl; }
    public String getSourceName() { return sourceName; }
    public void setSourceName(String sourceName) { this.sourceName = sourceName; }
    public String getQuickInfo() { return quickInfo; }
    public void setQuickInfo(String quickInfo) { this.quickInfo = quickInfo; }
    public Long getAddedByMemberId() { return addedByMemberId; }
    public void setAddedByMemberId(Long addedByMemberId) { this.addedByMemberId = addedByMemberId; }
    public boolean isSampleData() { return sampleData; }
    public void setSampleData(boolean sampleData) { this.sampleData = sampleData; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
