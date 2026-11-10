package com.dossier.api.domain;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * One grant on a resume (Resume Builder R3.11, DESIGN 8.7): to a Kiwiply account ({@code USER}, by login)
 * or to whoever holds a link ({@code LINK}, by an unguessable token). The org marketer's pairing is not a
 * row here - it is computed from the member's consent. {@code resumeId} is a plain column, not an
 * association: the database cascades the delete, and no code path should ever navigate from a grant to a
 * resume without going through an ownership check.
 */
@Entity
@Table(name = "resume_access")
public class ResumeAccess implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final String SUBJECT_USER = "USER";
    public static final String SUBJECT_LINK = "LINK";
    public static final String ROLE_VIEW = "VIEW";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "resume_id", nullable = false)
    private Long resumeId;

    @Column(name = "owner_user_id", nullable = false)
    private Long ownerUserId;

    /** USER | LINK */
    @Column(name = "subject_type", nullable = false, length = 12)
    private String subjectType;

    /** The grantee's login (USER grants only). */
    @Column(name = "subject_login", length = 50)
    private String subjectLogin;

    /** 32-char base62 (LINK grants only). */
    @Column(name = "token", length = 32, columnDefinition = "char(32)")
    private String token;

    /** VIEW (EDIT is reserved and not grantable yet). */
    @Column(name = "role", nullable = false, length = 8)
    private String role = ROLE_VIEW;

    @Column(name = "label", length = 80)
    private String label;

    /** LINK grants: whether the holder may download the PDF. */
    @Column(name = "allow_download", nullable = false)
    private boolean allowDownload;

    @Column(name = "expires_at")
    private Instant expiresAt;

    @Column(name = "revoked_at")
    private Instant revokedAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "created_by_login", nullable = false, length = 50)
    private String createdByLogin;

    @Column(name = "view_count", nullable = false)
    private int viewCount;

    @Column(name = "last_viewed_at")
    private Instant lastViewedAt;

    /** Not revoked and not past its expiry at {@code now}: the only state in which a grant opens anything. */
    public boolean isActive(Instant now) {
        return revokedAt == null && (expiresAt == null || expiresAt.isAfter(now));
    }

    public boolean isLink() {
        return SUBJECT_LINK.equals(subjectType);
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getResumeId() {
        return resumeId;
    }

    public void setResumeId(Long resumeId) {
        this.resumeId = resumeId;
    }

    public Long getOwnerUserId() {
        return ownerUserId;
    }

    public void setOwnerUserId(Long ownerUserId) {
        this.ownerUserId = ownerUserId;
    }

    public String getSubjectType() {
        return subjectType;
    }

    public void setSubjectType(String subjectType) {
        this.subjectType = subjectType;
    }

    public String getSubjectLogin() {
        return subjectLogin;
    }

    public void setSubjectLogin(String subjectLogin) {
        this.subjectLogin = subjectLogin;
    }

    public String getToken() {
        return token;
    }

    public void setToken(String token) {
        this.token = token;
    }

    public String getRole() {
        return role;
    }

    public void setRole(String role) {
        this.role = role;
    }

    public String getLabel() {
        return label;
    }

    public void setLabel(String label) {
        this.label = label;
    }

    public boolean isAllowDownload() {
        return allowDownload;
    }

    public void setAllowDownload(boolean allowDownload) {
        this.allowDownload = allowDownload;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public void setExpiresAt(Instant expiresAt) {
        this.expiresAt = expiresAt;
    }

    public Instant getRevokedAt() {
        return revokedAt;
    }

    public void setRevokedAt(Instant revokedAt) {
        this.revokedAt = revokedAt;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public String getCreatedByLogin() {
        return createdByLogin;
    }

    public void setCreatedByLogin(String createdByLogin) {
        this.createdByLogin = createdByLogin;
    }

    public int getViewCount() {
        return viewCount;
    }

    public void setViewCount(int viewCount) {
        this.viewCount = viewCount;
    }

    public Instant getLastViewedAt() {
        return lastViewedAt;
    }

    public void setLastViewedAt(Instant lastViewedAt) {
        this.lastViewedAt = lastViewedAt;
    }
}
