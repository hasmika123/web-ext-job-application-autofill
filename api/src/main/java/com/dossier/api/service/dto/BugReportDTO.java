package com.dossier.api.service.dto;

import com.dossier.api.domain.BugReport;
import com.dossier.api.domain.enumeration.BugCategory;
import com.dossier.api.domain.enumeration.BugSeverity;
import com.dossier.api.domain.enumeration.BugStatus;
import java.io.Serializable;
import java.time.Instant;

/** Admin view of a bug report (Phase 9.A5). */
public class BugReportDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long id;
    private String source;
    private String userLogin;
    private String email;
    private String message;
    private BugCategory category;
    private BugSeverity severity;
    private BugStatus status;
    private String url;
    private String appVersion;
    private String userAgent;
    private String adminNotes;
    private Instant createdDate;

    public BugReportDTO() {}

    public BugReportDTO(BugReport b) {
        this.id = b.getId();
        this.source = b.getSource();
        this.userLogin = b.getUserLogin();
        this.email = b.getEmail();
        this.message = b.getMessage();
        this.category = b.getCategory();
        this.severity = b.getSeverity();
        this.status = b.getStatus();
        this.url = b.getUrl();
        this.appVersion = b.getAppVersion();
        this.userAgent = b.getUserAgent();
        this.adminNotes = b.getAdminNotes();
        this.createdDate = b.getCreatedDate();
    }

    public Long getId() {
        return id;
    }

    public String getSource() {
        return source;
    }

    public String getUserLogin() {
        return userLogin;
    }

    public String getEmail() {
        return email;
    }

    public String getMessage() {
        return message;
    }

    public BugCategory getCategory() {
        return category;
    }

    public BugSeverity getSeverity() {
        return severity;
    }

    public BugStatus getStatus() {
        return status;
    }

    public String getUrl() {
        return url;
    }

    public String getAppVersion() {
        return appVersion;
    }

    public String getUserAgent() {
        return userAgent;
    }

    public String getAdminNotes() {
        return adminNotes;
    }

    public Instant getCreatedDate() {
        return createdDate;
    }
}
