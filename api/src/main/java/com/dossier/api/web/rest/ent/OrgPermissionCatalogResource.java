package com.dossier.api.web.rest.ent;

import com.dossier.api.service.dto.ent.PermissionCatalogDTO;
import com.dossier.api.service.ent.OrgPermissionCatalogService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** The permissions catalog of the Roles and Permissions page (X4.1): registry metadata with a per-key {@code grantable} flag for the caller. */
@RestController
@RequestMapping("/api/orgs/{orgId}/permissions")
@Tag(name = "roles", description = "Role templates and organization roles.")
public class OrgPermissionCatalogResource {

    private final OrgPermissionCatalogService catalog;

    public OrgPermissionCatalogResource(OrgPermissionCatalogService catalog) {
        this.catalog = catalog;
    }

    @Operation(
        summary = "Every permission key by category, with what the caller may grant",
        description = "Any active member; 404 when the roles flag is off. Five categories (Core Platform, Recruiting, Consultants, Finance, Administration); each key has its description, "
            + "dangerous flag, scope choices and, per scope, whether the CALLER may write it (their own ceiling: nobody grants more than they hold). grantable is false with a reason "
            + "(NO_PERMISSION, OWNER_ONLY, BEYOND_YOUR_ACCESS) for keys the caller cannot hand out. Scope choices carry the ceiling attribute a new row must send."
    )
    @GetMapping
    @OrgPermissionRequired
    public PermissionCatalogDTO.Catalog catalog(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return catalog.catalog(me);
    }
}
