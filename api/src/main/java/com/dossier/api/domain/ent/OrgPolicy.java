package com.dossier.api.domain.ent;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * The working copy of one policy kind of one organization (docs/enterprise-v2/62-tenant-policy-pages.md): the draft body, where
 * it stands in the review ({@code state}), the reviewer's last comment and which version is live. Nothing here is ever public:
 * the public view reads only the PUBLISHED {@link OrgPolicyVersion}.
 */
@Entity
@Table(name = "org_policy")
public class OrgPolicy implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final String DRAFT = "DRAFT";
    public static final String IN_REVIEW = "IN_REVIEW";
    public static final String CHANGES_REQUESTED = "CHANGES_REQUESTED";
    public static final String PUBLISHED = "PUBLISHED";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "kind", length = 40, nullable = false)
    private String kind;

    @Column(name = "draft_body", columnDefinition = "longtext")
    private String draftBody;

    @Column(name = "draft_version", nullable = false)
    private int draftVersion;

    @Column(name = "state", length = 20, nullable = false)
    private String state = DRAFT;

    @Column(name = "review_comment", length = 1000)
    private String reviewComment;

    @Column(name = "live_version_no")
    private Integer liveVersionNo;

    @Column(name = "updated_by_member_id")
    private Long updatedByMemberId;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    public Long getId() { return id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public String getKind() { return kind; }
    public void setKind(String kind) { this.kind = kind; }
    public String getDraftBody() { return draftBody; }
    public void setDraftBody(String draftBody) { this.draftBody = draftBody; }
    public int getDraftVersion() { return draftVersion; }
    public void setDraftVersion(int draftVersion) { this.draftVersion = draftVersion; }
    public String getState() { return state; }
    public void setState(String state) { this.state = state; }
    public String getReviewComment() { return reviewComment; }
    public void setReviewComment(String reviewComment) { this.reviewComment = reviewComment; }
    public Integer getLiveVersionNo() { return liveVersionNo; }
    public void setLiveVersionNo(Integer liveVersionNo) { this.liveVersionNo = liveVersionNo; }
    public Long getUpdatedByMemberId() { return updatedByMemberId; }
    public void setUpdatedByMemberId(Long updatedByMemberId) { this.updatedByMemberId = updatedByMemberId; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
