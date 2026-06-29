package com.dossier.api.domain;

import com.dossier.api.domain.enumeration.BugCategory;
import com.dossier.api.domain.enumeration.BugSeverity;
import com.dossier.api.domain.enumeration.BugStatus;
import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * A user-submitted bug report / idea (Phase 9.A5). Reportable from the web (floating widget) and
 * the extension popup; triaged in the admin console. Diagnostic context (url/appVersion/userAgent)
 * is only stored when the reporter consented. {@code userLogin} is filled server-side from the
 * authenticated principal when present (reports may also be anonymous).
 */
@Entity
@Table(name = "bug_report")
public class BugReport implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** "web" or "extension". */
    @Column(name = "source", length = 20)
    private String source;

    @Column(name = "user_login", length = 50)
    private String userLogin;

    @Column(name = "email", length = 254)
    private String email;

    @Column(name = "message", length = 4000, nullable = false)
    private String message;

    @Enumerated(EnumType.STRING)
    @Column(name = "category", length = 20, nullable = false)
    private BugCategory category;

    @Enumerated(EnumType.STRING)
    @Column(name = "severity", length = 20)
    private BugSeverity severity;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", length = 20, nullable = false)
    private BugStatus status;

    /** Diagnostic context — only set when the reporter consented. */
    @Column(name = "url", length = 2048)
    private String url;

    @Column(name = "app_version", length = 50)
    private String appVersion;

    @Column(name = "user_agent", length = 512)
    private String userAgent;

    @Column(name = "admin_notes", length = 4000)
    private String adminNotes;

    @Column(name = "created_date", nullable = false)
    private Instant createdDate;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getSource() {
        return source;
    }

    public void setSource(String source) {
        this.source = source;
    }

    public String getUserLogin() {
        return userLogin;
    }

    public void setUserLogin(String userLogin) {
        this.userLogin = userLogin;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }

    public BugCategory getCategory() {
        return category;
    }

    public void setCategory(BugCategory category) {
        this.category = category;
    }

    public BugSeverity getSeverity() {
        return severity;
    }

    public void setSeverity(BugSeverity severity) {
        this.severity = severity;
    }

    public BugStatus getStatus() {
        return status;
    }

    public void setStatus(BugStatus status) {
        this.status = status;
    }

    public String getUrl() {
        return url;
    }

    public void setUrl(String url) {
        this.url = url;
    }

    public String getAppVersion() {
        return appVersion;
    }

    public void setAppVersion(String appVersion) {
        this.appVersion = appVersion;
    }

    public String getUserAgent() {
        return userAgent;
    }

    public void setUserAgent(String userAgent) {
        this.userAgent = userAgent;
    }

    public String getAdminNotes() {
        return adminNotes;
    }

    public void setAdminNotes(String adminNotes) {
        this.adminNotes = adminNotes;
    }

    public Instant getCreatedDate() {
        return createdDate;
    }

    public void setCreatedDate(Instant createdDate) {
        this.createdDate = createdDate;
    }
}
