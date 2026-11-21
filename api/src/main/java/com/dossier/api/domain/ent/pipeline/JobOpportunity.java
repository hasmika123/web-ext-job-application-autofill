package com.dossier.api.domain.ent.pipeline;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.io.Serializable;
import java.time.Instant;

/**
 * The organization-owned thing worth marketing to a consultant: a public posting or a client requirement.
 * {@code postingId} deliberately has no foreign key because {@code job_posting} is the global public pool; the
 * source check and live generated keys are database contracts. Table {@code job_opportunity}; see enterprise-v2
 * 31 section 3. Every query goes through an org-scoped repository method.
 */
@Entity
@Table(name = "job_opportunity")
public class JobOpportunity implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "kind", length = 20, nullable = false)
    private String kind;

    @Column(name = "posting_id")
    private Long postingId;

    @Column(name = "requirement_id")
    private Long requirementId;

    @Column(name = "title", length = 300, nullable = false)
    private String title;

    @Column(name = "company", length = 200)
    private String company;

    @Column(name = "location", length = 300)
    private String location;

    @Column(name = "url", length = 1000)
    private String url;

    @Column(name = "apply_url", length = 1000)
    private String applyUrl;

    @Column(name = "source_label", length = 40, nullable = false)
    private String sourceLabel;

    @Column(name = "description_text", length = 4000)
    private String descriptionText;

    @Column(name = "skills_json", length = 4000)
    private String skillsJson;

    @Column(name = "status", length = 20, nullable = false)
    private String status = "NEW";

    @Column(name = "priority", length = 10, nullable = false)
    private String priority = "NORMAL";

    @Column(name = "closes_at")
    private Instant closesAt;

    @Column(name = "created_by_member_id")
    private Long createdByMemberId;

    /** Last member who changed this row; system freshness work may leave it null. */
    @Column(name = "updated_by_member_id")
    private Long updatedByMemberId;

    /** A future link to the org assignment that supplied this opportunity; its parent key is added by the assignment seam. */
    @Column(name = "assignment_id")
    private Long assignmentId;

    /** A future link to an org job bank; the bank table is owned by the discovery slice. */
    @Column(name = "bank_id")
    private Long bankId;

    @Column(name = "dedupe_key", length = 64)
    private String dedupeKey;

    @Column(name = "posting_live_key", insertable = false, updatable = false)
    private Long postingLiveKey;

    @Column(name = "requirement_live_key", insertable = false, updatable = false)
    private Long requirementLiveKey;

    @Column(name = "dedupe_live_key", insertable = false, updatable = false)
    private String dedupeLiveKey;

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
    public String getKind() { return kind; }
    public void setKind(String kind) { this.kind = kind; }
    public Long getPostingId() { return postingId; }
    public void setPostingId(Long postingId) { this.postingId = postingId; }
    public Long getRequirementId() { return requirementId; }
    public void setRequirementId(Long requirementId) { this.requirementId = requirementId; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getCompany() { return company; }
    public void setCompany(String company) { this.company = company; }
    public String getLocation() { return location; }
    public void setLocation(String location) { this.location = location; }
    public String getUrl() { return url; }
    public void setUrl(String url) { this.url = url; }
    public String getApplyUrl() { return applyUrl; }
    public void setApplyUrl(String applyUrl) { this.applyUrl = applyUrl; }
    public String getSourceLabel() { return sourceLabel; }
    public void setSourceLabel(String sourceLabel) { this.sourceLabel = sourceLabel; }
    public String getDescriptionText() { return descriptionText; }
    public void setDescriptionText(String descriptionText) { this.descriptionText = descriptionText; }
    public String getSkillsJson() { return skillsJson; }
    public void setSkillsJson(String skillsJson) { this.skillsJson = skillsJson; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getPriority() { return priority; }
    public void setPriority(String priority) { this.priority = priority; }
    public Instant getClosesAt() { return closesAt; }
    public void setClosesAt(Instant closesAt) { this.closesAt = closesAt; }
    public Long getCreatedByMemberId() { return createdByMemberId; }
    public void setCreatedByMemberId(Long createdByMemberId) { this.createdByMemberId = createdByMemberId; }
    public Long getUpdatedByMemberId() { return updatedByMemberId; }
    public void setUpdatedByMemberId(Long updatedByMemberId) { this.updatedByMemberId = updatedByMemberId; }
    public Long getAssignmentId() { return assignmentId; }
    public void setAssignmentId(Long assignmentId) { this.assignmentId = assignmentId; }
    public Long getBankId() { return bankId; }
    public void setBankId(Long bankId) { this.bankId = bankId; }
    public String getDedupeKey() { return dedupeKey; }
    public void setDedupeKey(String dedupeKey) { this.dedupeKey = dedupeKey; }
    public Long getPostingLiveKey() { return postingLiveKey; }
    public Long getRequirementLiveKey() { return requirementLiveKey; }
    public String getDedupeLiveKey() { return dedupeLiveKey; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
