package com.dossier.api.service.org;

import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.org.OrgAuditEvent;
import com.dossier.api.repository.org.OrgAuditEventRepository;
import com.dossier.api.security.SecurityUtils;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Writes and reads the organization audit trail (tenant-model.md decision 8 and section 2.7): every thing an org
 * actor does to a person, so "what did my org do" has an answer. The org twin of {@code AdminAuditService}.
 *
 * <p>{@code record(...)} runs in the CALLER's transaction (no REQUIRES_NEW): the audit row and the action it
 * describes commit or roll back together. Rows are keyed by login strings, not user ids, so the trail survives
 * account erasure. This class is append-only on purpose: there is no update and no delete anywhere in it or in
 * {@link OrgAuditEventRepository}.
 *
 * <p>Action keys live here as constants so callers never typo them. The {@code BILLING_}, {@code MARKETER_} and
 * {@code OPS_} families grow with their areas (billing.md, marketer-workspace.md, TIMESHEETS-DESIGN.md), so only
 * the prefixes are fixed here.
 */
@Service
public class OrgAuditService {

    // --- Action keys, tenant-model.md section 2.7 ---
    public static final String ORG_CREATE = "ORG_CREATE";
    public static final String ORG_SETTINGS = "ORG_SETTINGS";
    public static final String MEMBER_INVITE = "MEMBER_INVITE";
    public static final String MEMBER_INVITE_RESEND = "MEMBER_INVITE_RESEND";
    /** Someone accepted an invite (or redeemed a join code) and became a member. */
    public static final String MEMBER_JOIN = "MEMBER_JOIN";
    public static final String MEMBER_ROLE = "MEMBER_ROLE";
    public static final String MEMBER_SUSPEND = "MEMBER_SUSPEND";
    public static final String MEMBER_REMOVE = "MEMBER_REMOVE";
    public static final String MEMBER_LEFT = "MEMBER_LEFT";
    public static final String MEMBER_ERASED = "MEMBER_ERASED";
    public static final String ASSIGNMENT_CREATE = "ASSIGNMENT_CREATE";
    public static final String ASSIGNMENT_END = "ASSIGNMENT_END";
    public static final String SHARE_READ_FULL = "SHARE_READ_FULL";
    public static final String SHARE_SCOPE_CHANGED = "SHARE_SCOPE_CHANGED";
    public static final String EXPORT = "EXPORT";

    /** Action families that are defined by their own area; a key in one of these starts with the prefix. */
    public static final String PREFIX_BILLING = "BILLING_";
    public static final String PREFIX_MARKETER = "MARKETER_";
    public static final String PREFIX_OPS = "OPS_";

    // --- Added by the org endpoints (O1.3): closing an org and the groups CRUD are also org actions ---
    public static final String ORG_CLOSE = "ORG_CLOSE";
    public static final String GROUP_CREATE = "GROUP_CREATE";
    public static final String GROUP_UPDATE = "GROUP_UPDATE";
    public static final String GROUP_DELETE = "GROUP_DELETE";

    // --- Target kinds ---
    public static final String TARGET_ORG = "ORG";
    public static final String TARGET_MEMBER = "MEMBER";
    public static final String TARGET_GROUP = "GROUP";
    public static final String TARGET_RESUME = "RESUME";
    public static final String TARGET_REPORT = "REPORT";

    /** The login recorded for an action no signed-in person did (a webhook, a job). */
    public static final String SYSTEM_ACTOR = "system";

    static final int DETAILS_MAX = 2000;

    private static final Logger LOG = LoggerFactory.getLogger(OrgAuditService.class);

    private final OrgAuditEventRepository repository;

    public OrgAuditService(OrgAuditEventRepository repository) {
        this.repository = repository;
    }

    /**
     * Record an action by the signed-in caller, whose role in the org is {@code actorRole} (null for a system
     * action). {@code targetLogin} / {@code targetId} may be null; {@code details} is truncated to the column.
     */
    @Transactional
    public OrgAuditEvent record(
        Long orgId,
        OrgRole actorRole,
        String action,
        String targetType,
        String targetLogin,
        String targetId,
        String details
    ) {
        return record(orgId, SecurityUtils.getCurrentUserLogin().orElse(SYSTEM_ACTOR), actorRole, action, targetType, targetLogin, targetId, details, null);
    }

    /** Record an action by the member the access check resolved: the org, login and role come from {@code actor}. */
    @Transactional
    public OrgAuditEvent record(OrgMembership actor, String action, String targetType, String targetLogin, String targetId, String details) {
        return record(actor.orgId(), actor.login(), actor.role(), action, targetType, targetLogin, targetId, details, null);
    }

    /** {@link #record(Long, OrgRole, String, String, String, String, String)} when the actor is not the signed-in caller (jobs, webhooks, erasure). */
    @Transactional
    public OrgAuditEvent record(
        Long orgId,
        String actorLogin,
        OrgRole actorRole,
        String action,
        String targetType,
        String targetLogin,
        String targetId,
        String details,
        String ipHash
    ) {
        if (orgId == null) throw new IllegalArgumentException("orgId is required");
        if (action == null || action.isBlank()) throw new IllegalArgumentException("action is required");
        if (targetType == null || targetType.isBlank()) throw new IllegalArgumentException("targetType is required");
        OrgAuditEvent e = new OrgAuditEvent();
        e.setOrgId(orgId);
        e.setActorLogin(actorLogin);
        e.setActorRole(actorRole == null ? null : actorRole.name());
        e.setAction(action);
        e.setTargetType(targetType);
        e.setTargetLogin(targetLogin);
        e.setTargetId(targetId);
        e.setDetails(details != null && details.length() > DETAILS_MAX ? details.substring(0, DETAILS_MAX) : details);
        e.setIpHash(ipHash);
        e.setCreatedAt(Instant.now());
        OrgAuditEvent saved = repository.save(e);
        LOG.info("ORG AUDIT org={} actor='{}' action='{}' target='{}:{}'", orgId, actorLogin, action, targetType, targetId);
        return saved;
    }

    /** One page of an org's trail, newest first (the Pageable carries the sort). Always scoped to {@code orgId}. */
    @Transactional(readOnly = true)
    public Page<OrgAuditEvent> findPage(Long orgId, String action, Pageable pageable) {
        return action == null || action.isBlank() ? repository.findByOrgId(orgId, pageable) : repository.findByOrgIdAndAction(orgId, action, pageable);
    }

    /** SHA-256 (hex) of a caller address, for {@code ip_hash}; the address itself is never stored. */
    public static String hashIp(String ip) {
        if (ip == null || ip.isBlank()) return null;
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(ip.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e); // SHA-256 is mandatory on every JVM
        }
    }
}
