package com.dossier.api.service.dto.ent;

import java.util.List;

/**
 * The permissions catalog of the Roles and Permissions page (X4.1): every registered permission key, grouped by the five
 * board categories, with what the CALLER may hand out. {@code grantable} is computed against the caller's own ceiling
 * (05-permission-model.md section 3), so the grid can disable what the API would refuse (422 ROLE_CEILING) before anyone clicks.
 */
public final class PermissionCatalogDTO {

    private PermissionCatalogDTO() {}

    /**
     * One scope a key can be granted at. {@code grantable} says whether the caller may write it. {@code ceilingRoleKey} and
     * {@code rowFilter} are the narrowing attributes the editor must send with a NEW row at this scope so that it stays within
     * the caller's reach (null = none needed): an Organization Admin's {@code members.role.set} only works with BELOW_ADMIN.
     */
    public record ScopeChoice(String scope, boolean grantable, String ceilingRoleKey, String rowFilter) {}

    /**
     * One registered permission. {@code grantable} is true when the caller may write the key at at least one of its scopes;
     * {@code reason} explains a false: NO_PERMISSION (the caller cannot manage roles), OWNER_ONLY (only the Owner holds it) or
     * BEYOND_YOUR_ACCESS (the caller does not hold it widely enough).
     */
    public record Entry(
        String key,
        String family,
        String label,
        String description,
        boolean dangerous,
        boolean actsForOthers,
        String defaultScope,
        List<ScopeChoice> scopes,
        boolean grantable,
        String reason
    ) {}

    /** One of the five board categories with its keys (registration order). */
    public record Category(String key, String label, int keyCount, int permissionSets, List<Entry> permissions) {}

    /**
     * {@code canManage}: the caller holds roles.manage at ORG scope (write actions); everything is non-grantable otherwise.
     * {@code permissionSets}: the number of permission families (groups of related keys), the board's "Permission Sets" count.
     */
    public record Catalog(boolean canManage, int totalKeys, int permissionSets, List<Category> categories) {}
}
