package com.dossier.api.service.org;

import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.org.OrgAuditEvent;
import com.dossier.api.repository.org.OrgAuditEventRepository;
import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.ent.TenantContext;
import com.dossier.api.service.ent.TenantContextHolder;
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
    /** An Org Admin created an account for a person with a temporary password (HIGH; details carry the address and roles, never the password). */
    public static final String MEMBER_ACCOUNT_CREATE = "MEMBER_ACCOUNT_CREATE";
    /** An Org Admin issued a new temporary password to a member who had not yet chosen their own (HIGH). */
    public static final String MEMBER_PASSWORD_RESET = "MEMBER_PASSWORD_RESET";
    /** X1.15: an admin withdrew a pending invitation. */
    public static final String MEMBER_INVITE_REVOKE = "MEMBER_INVITE_REVOKE";
    /** X1.15: the expiry job ended invitations whose link ran out (one row per organization per run, actor {@code system}). */
    public static final String MEMBER_INVITE_EXPIRED = "MEMBER_INVITE_EXPIRED";
    /** X1.15 (T32): accepting found that some invited roles were no longer the inviter's to give; the person joined with the rest. */
    public static final String INVITE_ROLES_TRIMMED = "INVITE_ROLES_TRIMMED";
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
    /** X9.15: the nightly retention job deleted old application / interview / submission history rows (one SYSTEM row per organization per run; counts only). */
    public static final String HISTORY_PURGED = "HISTORY_PURGED";
    /** X9.15: a marketer saved a job onto an assigned consultant's own tracker (MEDIUM; the beneficiary is the consultant's login). */
    public static final String MARKETER_SAVE_FOR_CONSULTANT = "MARKETER_SAVE_FOR_CONSULTANT";

    /** Action families that are defined by their own area; a key in one of these starts with the prefix. */
    public static final String PREFIX_BILLING = "BILLING_";
    public static final String PREFIX_MARKETER = "MARKETER_";
    public static final String PREFIX_OPS = "OPS_";

    // --- Added by the org endpoints (O1.3): closing an org and the groups CRUD are also org actions ---
    public static final String ORG_CLOSE = "ORG_CLOSE";
    public static final String GROUP_CREATE = "GROUP_CREATE";
    public static final String GROUP_UPDATE = "GROUP_UPDATE";
    public static final String GROUP_DELETE = "GROUP_DELETE";
    /** X4.5: people moved into or out of a group, or a team re-parented (one row per request, the ids in the details). */
    public static final String GROUP_MOVE = "GROUP_MOVE";
    /** X4.5: a group's lead changed (MEDIUM: the lead counts as a member of the group for TEAM / DEPARTMENT scope). */
    public static final String GROUP_LEAD = "GROUP_LEAD";

    // --- Enterprise V2 tenancy (X1.2): hostnames and branding add their own keys in their stories ---
    public static final String ORG_SUBDOMAIN_SET = "ORG_SUBDOMAIN_SET";
    /** X1.11: the Kiwiply platform admin acted on this organization (HIGH, in the tenant's own trail; the actor is the admin's login). */
    public static final String ADMIN_ORG_CREATE = "ADMIN_ORG_CREATE";
    public static final String ADMIN_OWNER_PASSWORD_RESET = "ADMIN_OWNER_PASSWORD_RESET";
    public static final String ADMIN_SUBDOMAIN_PROVISION = "ADMIN_SUBDOMAIN_PROVISION";
    public static final String ADMIN_ENTERPRISE_ON = "ADMIN_ENTERPRISE_ON";
    public static final String ADMIN_ENTERPRISE_OFF = "ADMIN_ENTERPRISE_OFF";
    public static final String ADMIN_MODULE_ON = "ADMIN_MODULE_ON";
    public static final String ADMIN_MODULE_OFF = "ADMIN_MODULE_OFF";
    public static final String ADMIN_HOSTNAME_SUSPEND = "ADMIN_HOSTNAME_SUSPEND";
    public static final String ADMIN_HOSTNAME_RESUME = "ADMIN_HOSTNAME_RESUME";
    public static final String ADMIN_ACCOUNT_MIGRATE = "ADMIN_ACCOUNT_MIGRATE";
    public static final String TARGET_HOSTNAME = "HOSTNAME";
    /** X1.5: correct credentials on this organization's host by someone with no active seat (recorded in the tenant's own trail). */
    public static final String LOGIN_DENIED_NOT_MEMBER = "LOGIN_DENIED_NOT_MEMBER";
    public static final String TARGET_SESSION = "SESSION";
    /** X1.8: sign-in on an organization host by someone with no seat yet, who holds a live invitation to that organization (no tid until accepted). */
    public static final String LOGIN_FOR_INVITE = "LOGIN_FOR_INVITE";
    /** X2.5: a branding publish, a restore into the draft, and an asset upload or removal (draft edits and discards write none). */
    public static final String BRANDING_PUBLISH = "BRANDING_PUBLISH";
    public static final String BRANDING_RESTORE = "BRANDING_RESTORE";
    public static final String BRANDING_ASSET = "BRANDING_ASSET";
    public static final String TARGET_BRANDING = "BRANDING";
    /** Tenant policy pages (docs/enterprise-v2/62). */
    public static final String POLICY_DRAFT_SAVE = "POLICY_DRAFT_SAVE";
    public static final String POLICY_TEMPLATE = "POLICY_TEMPLATE";
    public static final String POLICY_SUBMIT = "POLICY_SUBMIT";
    public static final String POLICY_WITHDRAW = "POLICY_WITHDRAW";
    public static final String POLICY_APPROVE = "POLICY_APPROVE";
    public static final String POLICY_REQUEST_CHANGES = "POLICY_REQUEST_CHANGES";
    public static final String TARGET_POLICY = "POLICY";

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
        return record(orgId, actorLogin, actorRole, action, targetType, targetLogin, targetId, details, ipHash, null, null, null);
    }

    /**
     * X1.10: the full form. {@code hostnameId} is the tenant hostname the request arrived on; when null it is taken from the
     * request's tenant context, but ONLY if that context is a tenant host of THIS org (a row never carries another org's
     * hostname, and a job thread with no context records none). {@code beneficiaryLogin} is who the action was done for
     * (a marketer acting for a consultant); {@code risk} is LOW / MEDIUM / HIGH and defaults to LOW.
     */
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
        String ipHash,
        Long hostnameId,
        String beneficiaryLogin,
        String risk
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
        e.setHostnameId(hostnameId != null ? hostnameId : contextHostnameId(orgId));
        e.setBeneficiaryLogin(beneficiaryLogin);
        e.setRisk(normalizeRisk(risk));
        e.setCreatedAt(Instant.now());
        OrgAuditEvent saved = repository.save(e);
        LOG.info("ORG AUDIT org={} host={} actor='{}' action='{}' target='{}:{}' risk={}", orgId, saved.getHostnameId(), actorLogin, action, targetType, targetId, saved.getRisk());
        return saved;
    }

    private static Long contextHostnameId(Long orgId) {
        return TenantContextHolder.current().filter(c -> c.isTenant() && orgId.equals(c.orgId())).map(TenantContext::hostnameId).orElse(null);
    }

    private static String normalizeRisk(String risk) {
        if (risk == null || risk.isBlank()) return "LOW";
        String r = risk.trim().toUpperCase(java.util.Locale.ROOT);
        if (!r.equals("LOW") && !r.equals("MEDIUM") && !r.equals("HIGH") && !r.equals("CRITICAL")) throw new IllegalArgumentException("risk must be LOW, MEDIUM, HIGH or CRITICAL");
        return r;
    }

    /** A denied sign-in on a tenant host: no signed-in caller exists yet, so the actor is the login that tried; carries the hostname row. */
    @Transactional
    public OrgAuditEvent recordHostEvent(Long orgId, Long hostnameId, String actorLogin, String action, String risk, String details) {
        OrgAuditEvent saved = record(orgId, actorLogin, null, action, TARGET_SESSION, actorLogin, null, details, null);
        saved.setHostnameId(hostnameId);
        saved.setRisk(risk == null ? "LOW" : risk);
        return repository.save(saved);
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
