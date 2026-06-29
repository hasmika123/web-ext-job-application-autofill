package com.dossier.api.service.dto;

import com.dossier.api.domain.AdminAuditEvent;
import java.io.Serializable;
import java.time.Instant;

/** Read-only view of an {@link AdminAuditEvent} for the admin audit-log UI (Phase 9.A1). */
public class AdminAuditEventDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long id;
    private String actorLogin;
    private String action;
    private String targetType;
    private String targetId;
    private String reason;
    private String details;
    private Instant createdDate;

    public AdminAuditEventDTO() {}

    public AdminAuditEventDTO(AdminAuditEvent e) {
        this.id = e.getId();
        this.actorLogin = e.getActorLogin();
        this.action = e.getAction();
        this.targetType = e.getTargetType();
        this.targetId = e.getTargetId();
        this.reason = e.getReason();
        this.details = e.getDetails();
        this.createdDate = e.getCreatedDate();
    }

    public Long getId() {
        return id;
    }

    public String getActorLogin() {
        return actorLogin;
    }

    public String getAction() {
        return action;
    }

    public String getTargetType() {
        return targetType;
    }

    public String getTargetId() {
        return targetId;
    }

    public String getReason() {
        return reason;
    }

    public String getDetails() {
        return details;
    }

    public Instant getCreatedDate() {
        return createdDate;
    }
}
