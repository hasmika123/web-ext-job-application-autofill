package com.dossier.api.domain.ent.talent;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/** Metadata-only org resume (30 section 3); resume_id is a future link to a person resume and has no FK. Preview text lives in headline, summary_text and org_resume_experience. Table {@code org_resume}; see docs/enterprise-v2/talent-foundation.md. Every query goes through an org-scoped repository method. */
@Entity
@Table(name = "org_resume")
public class OrgResume implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "consultant_id", nullable = false)
    private Long consultantId;

    @Column(name = "member_id")
    private Long memberId;

    @Column(name = "resume_id")
    private Long resumeId;

    @Column(name = "kind", length = 20, nullable = false)
    private String kind = "ORG_MANAGED";

    @Column(name = "name", length = 200, nullable = false)
    private String name;

    @Column(name = "file_name", length = 200)
    private String fileName;

    @Column(name = "target_role", length = 120)
    private String targetRole;

    @Column(name = "version_no", nullable = false)
    private Integer versionNo = 1;

    @Column(name = "primary_for_org", nullable = false)
    private boolean primaryForOrg = false;

    @Column(name = "visibility", length = 20, nullable = false)
    private String visibility = "INTERNAL";

    @Column(name = "approval_status", length = 20, nullable = false)
    private String approvalStatus = "APPROVED";

    @Column(name = "approved_at")
    private Instant approvedAt;

    @Column(name = "approved_by_member_id")
    private Long approvedByMemberId;

    @Column(name = "owner_member_id")
    private Long ownerMemberId;

    @Column(name = "file_size_kb")
    private Integer fileSizeKb;

    @Column(name = "headline", length = 120)
    private String headline;

    @Column(name = "summary_text", length = 1000)
    private String summaryText;

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
    public Long getConsultantId() { return consultantId; }
    public void setConsultantId(Long consultantId) { this.consultantId = consultantId; }
    public Long getMemberId() { return memberId; }
    public void setMemberId(Long memberId) { this.memberId = memberId; }
    public Long getResumeId() { return resumeId; }
    public void setResumeId(Long resumeId) { this.resumeId = resumeId; }
    public String getKind() { return kind; }
    public void setKind(String kind) { this.kind = kind; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getFileName() { return fileName; }
    public void setFileName(String fileName) { this.fileName = fileName; }
    public String getTargetRole() { return targetRole; }
    public void setTargetRole(String targetRole) { this.targetRole = targetRole; }
    public Integer getVersionNo() { return versionNo; }
    public void setVersionNo(Integer versionNo) { this.versionNo = versionNo; }
    public boolean isPrimaryForOrg() { return primaryForOrg; }
    public void setPrimaryForOrg(boolean primaryForOrg) { this.primaryForOrg = primaryForOrg; }
    public String getVisibility() { return visibility; }
    public void setVisibility(String visibility) { this.visibility = visibility; }
    public String getApprovalStatus() { return approvalStatus; }
    public void setApprovalStatus(String approvalStatus) { this.approvalStatus = approvalStatus; }
    public Instant getApprovedAt() { return approvedAt; }
    public void setApprovedAt(Instant approvedAt) { this.approvedAt = approvedAt; }
    public Long getApprovedByMemberId() { return approvedByMemberId; }
    public void setApprovedByMemberId(Long approvedByMemberId) { this.approvedByMemberId = approvedByMemberId; }
    public Long getOwnerMemberId() { return ownerMemberId; }
    public void setOwnerMemberId(Long ownerMemberId) { this.ownerMemberId = ownerMemberId; }
    public Integer getFileSizeKb() { return fileSizeKb; }
    public void setFileSizeKb(Integer fileSizeKb) { this.fileSizeKb = fileSizeKb; }
    public String getHeadline() { return headline; }
    public void setHeadline(String headline) { this.headline = headline; }
    public String getSummaryText() { return summaryText; }
    public void setSummaryText(String summaryText) { this.summaryText = summaryText; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
