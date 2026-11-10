package com.dossier.api.service.ent;

import java.time.Instant;

/**
 * Which tenant a request is for (ADR-001/003, 04-tenancy-and-security.md section 3), derived by the API from the
 * forwarded host and from nothing else: never from a tenant id in a header, cookie, query or body. It selects a tenant
 * CANDIDATE only; membership and permissions are still required for anything it names.
 *
 * <ul>
 *   <li>{@link Kind#PLATFORM} - a reserved platform host (kiwiply.com, localhost): the personal product and the console.</li>
 *   <li>{@link Kind#TENANT} - an organization's own host; {@code orgId} is set, {@code hostnameId} when a hostname row backs it.</li>
 *   <li>{@link Kind#UNKNOWN} - not a host we serve. There is no fallback: tenant routes answer a generic 404 and nothing is
 *       branded. {@link #reason()} says why, for logs only (it is never sent to a client).</li>
 * </ul>
 */
public record TenantContext(Kind kind, Long orgId, Long hostnameId, String host, Reason reason, Instant resolvedAt) {

    public enum Kind {
        PLATFORM,
        TENANT,
        UNKNOWN,
    }

    /** Why a host is UNKNOWN (internal; the client always sees the same 404). */
    public enum Reason {
        NONE,
        /** The request carried no forwarded host (today's clients, the extension, a health check): legacy, path-based behaviour. */
        NO_HOST,
        /** The forwarded host is not a single valid hostname (a list, a path, whitespace...). */
        INVALID_HOST,
        /** A valid name that no organization has (or whose hostname is not ACTIVE). */
        UNKNOWN_HOST,
        /** The organization exists but is not ACTIVE / PAST_DUE (suspended, closed, still a draft). */
        ORG_INACTIVE,
        /** The organization is outside the enterprise flag's allow list, or the flag is off. */
        FLAG_OFF,
    }

    public static TenantContext platform(String host) {
        return new TenantContext(Kind.PLATFORM, null, null, host, Reason.NONE, Instant.now());
    }

    public static TenantContext tenant(Long orgId, Long hostnameId, String host) {
        return new TenantContext(Kind.TENANT, orgId, hostnameId, host, Reason.NONE, Instant.now());
    }

    public static TenantContext unknown(String host, Reason reason) {
        return new TenantContext(Kind.UNKNOWN, null, null, host, reason, Instant.now());
    }

    public boolean isTenant() {
        return kind == Kind.TENANT;
    }

    public boolean isPlatform() {
        return kind == Kind.PLATFORM;
    }

    /**
     * True when the host was GIVEN and is not served. A request with no host at all is not "explicitly unknown": it is a
     * legacy caller that predates tenant hosts and keeps today's behaviour.
     */
    public boolean isExplicitlyUnknown() {
        return kind == Kind.UNKNOWN && reason != Reason.NO_HOST;
    }

    /** The value for log lines and the MDC: the organization id, or {@code platform} / {@code unknown}. */
    public String tenantLabel() {
        return switch (kind) {
            case TENANT -> String.valueOf(orgId);
            case PLATFORM -> "platform";
            case UNKNOWN -> "unknown";
        };
    }
}
