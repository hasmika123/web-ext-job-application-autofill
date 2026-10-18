package com.dossier.api.domain;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * One non-owner read of a resume (Resume Builder R3.11, DESIGN 8.7): the "who viewed it" audit. A
 * {@code LINK} viewer is anonymous - {@code viewerLogin} stays null and nothing identifying (no IP, no
 * user agent) is stored. Owner reads are not recorded.
 */
@Entity
@Table(name = "resume_view_event")
public class ResumeViewEvent implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final String KIND_ORG = "ORG";
    public static final String KIND_USER = "USER";
    public static final String KIND_LINK = "LINK";
    public static final String WHAT_PAGE = "PAGE";
    public static final String WHAT_PDF = "PDF";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "resume_id", nullable = false)
    private Long resumeId;

    @Column(name = "owner_user_id", nullable = false)
    private Long ownerUserId;

    /** ORG | USER | LINK (OWNER views are not recorded). */
    @Column(name = "viewer_kind", nullable = false, length = 8)
    private String viewerKind;

    @Column(name = "viewer_login", length = 50)
    private String viewerLogin;

    @Column(name = "access_id")
    private Long accessId;

    /** PAGE | PDF */
    @Column(name = "what", nullable = false, length = 8)
    private String what;

    @Column(name = "viewed_at", nullable = false)
    private Instant viewedAt = Instant.now();

    public Long getId() {
        return id;
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

    public String getViewerKind() {
        return viewerKind;
    }

    public void setViewerKind(String viewerKind) {
        this.viewerKind = viewerKind;
    }

    public String getViewerLogin() {
        return viewerLogin;
    }

    public void setViewerLogin(String viewerLogin) {
        this.viewerLogin = viewerLogin;
    }

    public Long getAccessId() {
        return accessId;
    }

    public void setAccessId(Long accessId) {
        this.accessId = accessId;
    }

    public String getWhat() {
        return what;
    }

    public void setWhat(String what) {
        this.what = what;
    }

    public Instant getViewedAt() {
        return viewedAt;
    }

    public void setViewedAt(Instant viewedAt) {
        this.viewedAt = viewedAt;
    }
}
