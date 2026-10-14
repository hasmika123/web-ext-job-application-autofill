package com.dossier.api.service.dto;

import java.time.Instant;
import java.util.List;

/**
 * Wire shapes of the platform-admin Organizations page (X1.11). Deliberately thin: an organization's counts and its hostnames,
 * never a member's name, address or login (no member PII), and the audit tail carries only platform-admin actions.
 */
public final class AdminOrgDTOs {

    private AdminOrgDTOs() {}

    /** One row of the list. {@code host} is the live primary host, or null when the organization has none yet. */
    public record OrgRow(
        Long id,
        String name,
        String slug,
        String type,
        String status,
        String subdomain,
        boolean subdomainEnabled,
        boolean enterpriseOn,
        String host,
        long hostnamesActive,
        long memberCount,
        Instant createdAt
    ) {}

    /** The four stat tiles: all orgs, enterprise-on orgs, ACTIVE hostnames, and orgs still waiting for a hostname. */
    public record Summary(long orgs, long enterpriseOn, long hostnamesActive, long pending) {}

    public record Hostname(Long id, String hostname, String kind, String status, boolean primary, String certState, Instant activatedAt, Instant suspendedAt, Instant createdAt) {}

    /**
     * The enterprise switch. {@code on} is what the resolver will answer now (the flag evaluated for this org);
     * {@code allowListed} / {@code denied} say which list holds the org; {@code masterOn} is the platform-wide master flag.
     */
    public record Enterprise(boolean on, boolean allowListed, boolean denied, boolean masterOn) {}

    public record AuditRow(Long id, String action, String actorLogin, String risk, String details, Instant createdAt) {}

    public record Detail(
        Long id,
        String name,
        String displayName,
        String slug,
        String type,
        String status,
        String sizeBand,
        String country,
        String subdomain,
        boolean subdomainEnabled,
        int configVersion,
        Instant createdAt,
        long memberCount,
        long pendingInvites,
        String baseDomain,
        Enterprise enterprise,
        List<Hostname> hostnames,
        List<AuditRow> audit
    ) {}

    /** Body of the provision call: {@code label} becomes {label}.kiwiply.com. */
    public record SubdomainRequest(String label) {}

    public record ReasonRequest(String reason) {}

    public record EnterpriseRequest(Boolean on, String reason) {}

    /** {@code label} becomes the organization's address, {label}.kiwiply.com, and its slug. */
    public record CreateRequest(String name, String label, String type, String ownerEmail, String ownerName) {}

    /** The live answer of the provision dialog: is {@code label} usable for this organization (or for a new one)? */
    public record LabelCheck(String label, boolean valid, boolean reserved, boolean taken, String suggestion, String host) {}

    /** The owner is onboarded in this response: {@code tempPassword} is set ONLY here, once, and only when the account was created now (null for an existing account, whose password is untouched). */
    public record Created(Long id, String slug, String host, String ownerEmail, String ownerAccount, String tempPassword, Instant tempPasswordExpiresAt) {}

    /** A new temporary password for an owner who has not set their own yet; shown once. */
    public record ResetResult(String ownerEmail, String tempPassword, Instant tempPasswordExpiresAt) {}
}
