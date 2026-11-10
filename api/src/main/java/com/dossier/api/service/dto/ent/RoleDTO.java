package com.dossier.api.service.dto.ent;

import java.util.List;

/**
 * A role as the roles API shows it (docs/enterprise-v2/40-api-specs.md section 12.4): a system template or an organization's
 * own role, with its permission rows. Read-only in X1.6; the organization id is never included (system rows have none, an
 * org role is the caller's own).
 */
public record RoleDTO(
    Long id,
    String key,
    String name,
    String description,
    String templateKey,
    boolean system,
    boolean editable,
    String workspaceKey,
    List<PermissionDTO> permissions
) {
    /** One permission row. {@code scope} is an OWN / ASSIGNED / TEAM / DEPARTMENT / ORG name; the two attributes narrow it (null = none). */
    public record PermissionDTO(String key, String scope, String ceilingRoleKey, String rowFilter) {}
}
