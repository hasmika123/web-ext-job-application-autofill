package com.dossier.api.domain.ent;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * One submitted body of an organization's policy with its review outcome (docs/enterprise-v2/62). The body is immutable once
 * written; only the review fields and {@code status} move: IN_REVIEW to PUBLISHED, REJECTED (changes requested) or WITHDRAWN, and
 * PUBLISHED to SUPERSEDED when a newer one goes live. At most one version per (org, kind) is PUBLISHED.
 */
@Entity
@Table(name = "org_policy_version")
public class OrgPolicyVersion implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final String IN_REVIEW = "IN_REVIEW";
    public static final String PUBLISHED = "PUBLISHED";
    public static final String SUPERSEDED = "SUPERSEDED";
    public static final String REJECTED = "REJECTED";
    public static final String WITHDRAWN = "WITHDRAWN";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "kind", length = 40, nullable = false)
    private String kind;

    @Column(name = "version_no", nullable = false)
    private int versionNo;

    @Column(name = "body", columnDefinition = "longtext", nullable = false)
    private String body;

    @Column(name = "status", length = 20, nullable = false)
    private String status;

    @Column(name = "submitted_at", nullable = false)
    private Instant submittedAt = Instant.now();

    @Column(name = "submitted_by_member_id")
    private Long submittedByMemberId;

    @Column(name = "reviewed_at")
    private Instant reviewedAt;

    @Column(name = "reviewed_by_login", length = 50)
    private String reviewedByLogin;

    @Column(name = "review_comment", length = 1000)
    private String reviewComment;

    @Column(name = "published_at")
    private Instant publishedAt;

    public Long getId() { return id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public String getKind() { return kind; }
    public void setKind(String kind) { this.kind = kind; }
    public int getVersionNo() { return versionNo; }
    public void setVersionNo(int versionNo) { this.versionNo = versionNo; }
    public String getBody() { return body; }
    public void setBody(String body) { this.body = body; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public Instant getSubmittedAt() { return submittedAt; }
    public void setSubmittedAt(Instant submittedAt) { this.submittedAt = submittedAt; }
    public Long getSubmittedByMemberId() { return submittedByMemberId; }
    public void setSubmittedByMemberId(Long submittedByMemberId) { this.submittedByMemberId = submittedByMemberId; }
    public Instant getReviewedAt() { return reviewedAt; }
    public void setReviewedAt(Instant reviewedAt) { this.reviewedAt = reviewedAt; }
    public String getReviewedByLogin() { return reviewedByLogin; }
    public void setReviewedByLogin(String reviewedByLogin) { this.reviewedByLogin = reviewedByLogin; }
    public String getReviewComment() { return reviewComment; }
    public void setReviewComment(String reviewComment) { this.reviewComment = reviewComment; }
    public Instant getPublishedAt() { return publishedAt; }
    public void setPublishedAt(Instant publishedAt) { this.publishedAt = publishedAt; }
}
