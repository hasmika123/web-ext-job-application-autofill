package com.dossier.api.web.rest.ent;

import com.dossier.api.service.dto.ent.RoleDTO;
import com.dossier.api.service.ent.OrgRoleService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Roles as data, read side (X1.6): the system templates and the organization's own roles with their permission rows. Any
 * ACTIVE member of the organization may read it (the web gates its navigation on the same data); it is a 404 unless the roles
 * flag is on for the organization, exactly like an organization that does not exist. There is no write route here: clone, edit,
 * assign and revoke are X1.14 and answer 404 until then.
 */
@RestController
@RequestMapping("/api/orgs/{orgId}/roles")
@Tag(name = "roles", description = "Role templates and organization roles (read only).")
public class OrgRoleResource {

    private final OrgRoleService roleService;

    public OrgRoleResource(OrgRoleService roleService) {
        this.roleService = roleService;
    }

    @Operation(
        summary = "List the roles an organization can use",
        description = "System templates (organization-independent, read-only) first, then the organization's own roles, each with its permission rows. "
            + "Any active member. 404 when the organization is not enterprise-roles enabled or the caller is not a member."
    )
    @GetMapping
    @OrgPermissionRequired
    public List<RoleDTO> list(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return roleService.list(me);
    }
}
