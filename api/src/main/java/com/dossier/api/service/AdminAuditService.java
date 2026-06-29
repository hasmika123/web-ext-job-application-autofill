package com.dossier.api.service;

import com.dossier.api.domain.AdminAuditEvent;
import com.dossier.api.repository.AdminAuditEventRepository;
import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.dto.AdminAuditEventDTO;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Writes and reads the admin audit trail (Phase 9.A1).
 *
 * {@code record(...)} runs in the CALLER's transaction (no REQUIRES_NEW): the audit row and the
 * action it describes commit or roll back together, so we never log an action that didn't happen
 * (or miss logging one that did). The actor is taken from the security context.
 *
 * Common {@code action} keys live here as constants so callers don't typo them. The list grows
 * with each admin feature (A1.4 user actions, A2 sessions, …).
 */
@Service
public class AdminAuditService {

    // --- Action keys (extend as admin features land) ---
    public static final String TARGET_USER = "USER";

    public static final String USER_ACTIVATE = "USER_ACTIVATE";
    public static final String USER_DEACTIVATE = "USER_DEACTIVATE";
    public static final String USER_UPDATE = "USER_UPDATE";
    public static final String USER_DELETE = "USER_DELETE";
    public static final String USER_RESET_PASSWORD = "USER_RESET_PASSWORD";
    public static final String USER_GRANT_ADMIN = "USER_GRANT_ADMIN";
    public static final String USER_REVOKE_ADMIN = "USER_REVOKE_ADMIN";
    public static final String USER_FORCE_LOGOUT = "USER_FORCE_LOGOUT";
    public static final String USER_PII_VIEW = "USER_PII_VIEW";
    public static final String AI_QUOTA_SET = "AI_QUOTA_SET";
    public static final String AI_QUOTA_CLEAR = "AI_QUOTA_CLEAR";

    private static final Logger LOG = LoggerFactory.getLogger(AdminAuditService.class);

    private final AdminAuditEventRepository repository;

    public AdminAuditService(AdminAuditEventRepository repository) {
        this.repository = repository;
    }

    /** Record an admin action. {@code reason} is required for PII access; pass null otherwise. */
    @Transactional
    public AdminAuditEvent record(String action, String targetType, String targetId, String reason, String details) {
        AdminAuditEvent event = new AdminAuditEvent();
        event.setActorLogin(SecurityUtils.getCurrentUserLogin().orElse("system"));
        event.setAction(action);
        event.setTargetType(targetType);
        event.setTargetId(targetId);
        event.setReason(reason);
        event.setDetails(details);
        event.setCreatedDate(Instant.now());
        AdminAuditEvent saved = repository.save(event);
        LOG.info("ADMIN AUDIT actor='{}' action='{}' target='{}:{}'", saved.getActorLogin(), action, targetType, targetId);
        return saved;
    }

    /** Convenience overload for a targeted action with no reason/details. */
    @Transactional
    public AdminAuditEvent record(String action, String targetType, String targetId) {
        return record(action, targetType, targetId, null, null);
    }

    /** Paginated read of the trail (newest first via the Pageable sort), optionally filtered by actor. */
    @Transactional(readOnly = true)
    public Page<AdminAuditEventDTO> findAll(String actorLogin, Pageable pageable) {
        Page<AdminAuditEvent> page = (actorLogin == null || actorLogin.isBlank())
            ? repository.findAll(pageable)
            : repository.findAllByActorLoginContainingIgnoreCase(actorLogin.trim(), pageable);
        return page.map(AdminAuditEventDTO::new);
    }
}
