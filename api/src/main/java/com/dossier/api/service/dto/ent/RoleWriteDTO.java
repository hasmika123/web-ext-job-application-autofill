package com.dossier.api.service.dto.ent;

import java.util.List;

/**
 * Request and response shapes of the role write API (X1.14) and of the page it serves (the Roles and Permissions board). The
 * request records carry ONLY the fields a caller may set: the organization, the system flag, the editable flag, the role key
 * and every id are never bound from a body (mass assignment is impossible by construction, and unknown fields are ignored).
 */
public final class RoleWriteDTO {

    private RoleWriteDTO() {}

    /**
     * One permission row as written. {@code ceilingRoleKey} / {@code rowFilter}: null keeps what the role (or the template it is
     * cloned from) already says for this key, an empty string clears it, anything else sets it (BELOW_ADMIN / MEMBER and
     * BILLING_OPS / HR); a narrowing can only be loosened by someone who holds the looser version themselves (the ceiling rule).
     */
    public record PermissionInput(String key, String scope, String ceilingRoleKey, String rowFilter) {}

    /**
     * Create a role. Exactly one source at most: {@code templateKey} (a system template other than OWNER), {@code sourceRoleId} (a
     * role the organization can see: "duplicate"), or neither (a blank role). {@code permissions}, when present, is the whole set
     * (otherwise the source's rows are copied).
     */
    public record CreateRequest(String name, String description, String templateKey, Long sourceRoleId, List<PermissionInput> permissions) {}

    /** Edit a role: a null field is unchanged; {@code permissions}, when present, replaces the whole set. */
    public record UpdateRequest(String name, String description, List<PermissionInput> permissions) {}

    /** Replace the roles of a member: {@code primaryRoleId} may be omitted only when there is exactly one role. */
    public record MemberRolesRequest(List<Long> roleIds, Long primaryRoleId) {}

    /** A role with its rows and the version the client must send back as {@code If-Match}. */
    public record RoleDetail(
        Long id,
        String key,
        String name,
        String description,
        String templateKey,
        boolean system,
        boolean editable,
        String workspaceKey,
        String scopeLabel,
        String status,
        long assignedUsers,
        String version,
        List<RoleDTO.PermissionDTO> permissions
    ) {}

    public record MemberRoles(Long memberId, String legacyRole, List<MemberRoleRef> roles) {}

    public record MemberRoleRef(Long roleId, String key, String name, boolean primary) {}

    /** One row of the roles table of the board. */
    public record RoleRow(
        Long id,
        String key,
        String name,
        String description,
        String templateKey,
        String scopeLabel,
        String scopeLevel,
        boolean system,
        boolean editable,
        String status,
        long assignedUsers,
        int permissionCount,
        String version
    ) {}

    /** One slice of the permission donut. */
    public record CategorySlice(String category, String label, int keys, int grantedKeys, int percent, int permissionSets) {}

    /** The whole of the page's data: the table, the counts and the permission overview by category. */
    public record Overview(
        List<RoleRow> roles,
        int totalRoles,
        long activeUsers,
        int customRoleCount,
        int systemRoleCount,
        int totalPermissionKeys,
        List<CategorySlice> permissionOverview,
        int permissionSetCount
    ) {}

    // ---- X4.1: template diff, history, resync ------------------------------------------------------------------------

    /** A permission as the diff shows it. */
    public record DiffEntry(String key, String scope) {}

    public record DiffScopeChange(String key, String from, String to) {}

    /**
     * A role compared with the template it was cloned from. {@code template} is null for a blank role (nothing to compare with);
     * {@code matches} is true when the rows are identical. {@code added} are rows the role has and the template lacks,
     * {@code removed} are template rows the role dropped, {@code scopeChanged} rows both have at a different scope.
     */
    public record TemplateDiff(
        Long roleId,
        String template,
        String templateName,
        boolean hasTemplate,
        boolean matches,
        List<DiffEntry> added,
        List<DiffEntry> removed,
        List<DiffScopeChange> scopeChanged,
        List<String> attributesChanged
    ) {}

    /** One audit row about a role (ROLE_CREATE, ROLE_UPDATE, ROLE_DELETE, ROLE_RESYNC, ROLE_ASSIGN, ROLE_REVOKE). */
    public record HistoryEntry(
        Long id,
        String action,
        String risk,
        String actor,
        String targetType,
        String targetId,
        String targetLogin,
        String roleName,
        java.time.Instant at,
        java.util.Map<String, Object> details
    ) {}
}
