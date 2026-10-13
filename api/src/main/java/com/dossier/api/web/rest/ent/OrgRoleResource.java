package com.dossier.api.web.rest.ent;

import com.dossier.api.service.DemoGuard;
import com.dossier.api.service.dto.ent.RoleDTO;
import com.dossier.api.service.dto.ent.RoleWriteDTO;
import com.dossier.api.service.ent.OrgRoleService;
import com.dossier.api.service.ent.OrgRoleWriteService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.net.URI;
import java.util.List;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Roles as data, read side (X1.6): the system templates and the organization's own roles with their permission rows. Any
 * ACTIVE member of the organization may read it (the web gates its navigation on the same data); it is a 404 unless the roles
 * flag is on for the organization, exactly like an organization that does not exist.
 *
 * <p>X1.14 adds the write side and what the Roles and Permissions board needs: {@code GET /overview} (the table with scope label,
 * assigned users and status, the counts and the permission donut), {@code GET /{roleId}} (a role with its version), and create,
 * edit and delete of the organization's own roles under the ceiling rule. The write routes need {@code roles.manage} at ORG scope
 * (checked in {@link OrgRoleWriteService}: the permission is not a legacy {@code OrgPermission} constant), edit and delete need the
 * {@code If-Match} version of the role, and every refusal for another organization's row is the generic 404.
 */
@RestController
@RequestMapping("/api/orgs/{orgId}/roles")
@Tag(name = "roles", description = "Role templates and organization roles (read only).")
public class OrgRoleResource {

    private final OrgRoleService roleService;
    private final OrgRoleWriteService writeService;
    private final DemoGuard demoGuard;

    public OrgRoleResource(OrgRoleService roleService, OrgRoleWriteService writeService, DemoGuard demoGuard) {
        this.roleService = roleService;
        this.writeService = writeService;
        this.demoGuard = demoGuard;
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

    @Operation(
        summary = "The data of the Roles and Permissions page",
        description = "Every role the organization can use with its scope label (System or Custom), assigned users, status and version; the custom and system role counts; "
            + "and the permission overview by category (Core Platform, Recruiting, Consultants, Finance, Administration). Any active member; 404 when the roles flag is off."
    )
    @GetMapping("/overview")
    @OrgPermissionRequired
    public RoleWriteDTO.Overview overview(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return writeService.overview(me);
    }

    @Operation(summary = "One role with its permission rows and its version (ETag)", description = "The ETag is what edit and delete expect as If-Match.")
    @GetMapping("/{roleId}")
    @OrgPermissionRequired
    public ResponseEntity<RoleWriteDTO.RoleDetail> get(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long roleId) {
        return withEtag(ResponseEntity.ok(), writeService.get(me, roleId));
    }

    @Operation(
        summary = "Create a role (blank, from a template, or a copy of another role)",
        description = "roles.manage at ORG scope. Body: name, description?, templateKey? (a system template other than OWNER) or sourceRoleId? (duplicate), permissions? (the whole set: "
            + "[{key, scope, ceilingRoleKey?, rowFilter?}]). Every row must be within the caller's own permissions (422 ROLE_CEILING {key, scope}); 409 ROLE_NAME_TAKEN; "
            + "422 ORG_LIMIT_REACHED. 404 for anyone without the permission, when the roles flag is off, or for another organization's source role."
    )
    @PostMapping
    @OrgPermissionRequired
    public ResponseEntity<RoleWriteDTO.RoleDetail> create(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestBody RoleWriteDTO.CreateRequest request
    ) {
        demoGuard.assertNotDemo();
        RoleWriteDTO.RoleDetail created = writeService.create(me, request);
        return withEtag(ResponseEntity.created(URI.create("/api/orgs/" + me.orgId() + "/roles/" + created.id())), created);
    }

    @Operation(
        summary = "Rename a role or replace its permission set",
        description = "roles.manage at ORG scope. If-Match: the version (ETag) the editor last saw: 428 PRECONDITION_REQUIRED without it, 412 PRECONDITION_FAILED {currentVersion} when stale. "
            + "A system template is 409 ROLE_SYSTEM (clone it first). Everything in the role, before and after, must be within the caller's own permissions (422 ROLE_CEILING {key, scope})."
    )
    @PatchMapping("/{roleId}")
    @OrgPermissionRequired
    public ResponseEntity<RoleWriteDTO.RoleDetail> update(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long roleId,
        @RequestHeader(value = HttpHeaders.IF_MATCH, required = false) String ifMatch,
        @RequestBody RoleWriteDTO.UpdateRequest request
    ) {
        demoGuard.assertNotDemo();
        return withEtag(ResponseEntity.ok(), writeService.update(me, roleId, ifMatch, request));
    }

    @Operation(
        summary = "Delete a role nobody holds",
        description = "roles.manage at ORG scope, If-Match required. 409 ROLE_IN_USE {count} while a live member holds it; 409 ROLE_SYSTEM for a template; 422 ROLE_CEILING when the role holds anything the caller does not."
    )
    @DeleteMapping("/{roleId}")
    @OrgPermissionRequired
    public ResponseEntity<Void> delete(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long roleId,
        @RequestHeader(value = HttpHeaders.IF_MATCH, required = false) String ifMatch
    ) {
        demoGuard.assertNotDemo();
        writeService.delete(me, roleId, ifMatch);
        return ResponseEntity.noContent().build();
    }

    @Operation(
        summary = "A role compared with the template it was made from",
        description = "Any active member. Rows the role added, template rows it dropped, scopes it changed. A blank role (no template) and a system template match by definition."
    )
    @GetMapping("/{roleId}/diff")
    @OrgPermissionRequired
    public RoleWriteDTO.TemplateDiff diff(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long roleId) {
        return writeService.diff(me, roleId);
    }

    @Operation(
        summary = "Restore a role to the rows of its template",
        description = "roles.manage at ORG scope, If-Match required. Show GET .../diff first. Writes one ROLE_RESYNC audit row (HIGH) with what changed back; nothing when already identical. "
            + "422 when the role has no template; 422 ROLE_CEILING when the role holds anything the caller does not; 409 ROLE_SYSTEM for a template."
    )
    @PostMapping("/{roleId}/resync")
    @OrgPermissionRequired
    public ResponseEntity<RoleWriteDTO.RoleDetail> resync(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long roleId,
        @RequestHeader(value = HttpHeaders.IF_MATCH, required = false) String ifMatch
    ) {
        demoGuard.assertNotDemo();
        return withEtag(ResponseEntity.ok(), writeService.resync(me, roleId, ifMatch));
    }

    @Operation(
        summary = "The change history of one role",
        description = "roles.manage at ORG scope (404 otherwise). Newest first, from the organization audit trail (ROLE_CREATE, ROLE_UPDATE with the added / removed / scope diff, ROLE_RESYNC)."
    )
    @GetMapping("/{roleId}/history")
    @OrgPermissionRequired
    public List<RoleWriteDTO.HistoryEntry> history(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long roleId,
        @RequestParam(value = "limit", defaultValue = "50") int limit
    ) {
        return writeService.history(me, roleId, limit);
    }

    @Operation(
        summary = "Every role change and assignment in the organization",
        description = "roles.manage at ORG scope (404 otherwise). Newest first: ROLE_CREATE, ROLE_UPDATE, ROLE_DELETE, ROLE_RESYNC, ROLE_ASSIGN, ROLE_REVOKE. The page's Audit Role Changes drawer."
    )
    @GetMapping("/history")
    @OrgPermissionRequired
    public List<RoleWriteDTO.HistoryEntry> orgHistory(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestParam(value = "limit", defaultValue = "50") int limit
    ) {
        return writeService.history(me, null, limit);
    }

    private static ResponseEntity<RoleWriteDTO.RoleDetail> withEtag(ResponseEntity.BodyBuilder builder, RoleWriteDTO.RoleDetail body) {
        return builder.header(HttpHeaders.ETAG, body.version()).body(body);
    }
}
