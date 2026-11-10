package com.dossier.api.web.rest.ent;

import com.dossier.api.service.DemoGuard;
import com.dossier.api.service.dto.ent.RoleWriteDTO;
import com.dossier.api.service.ent.OrgRoleWriteService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Who holds which roles (X1.14): replace the roles of one member, with a primary, under the ceiling rule and the last-admin guard. */
@RestController
@RequestMapping("/api/orgs/{orgId}/members/{memberId}/roles")
@Tag(name = "roles", description = "Role templates and organization roles.")
public class OrgMemberRoleResource {

    private final OrgRoleWriteService writeService;
    private final DemoGuard demoGuard;

    public OrgMemberRoleResource(OrgRoleWriteService writeService, DemoGuard demoGuard) {
        this.writeService = writeService;
        this.demoGuard = demoGuard;
    }

    @Operation(
        summary = "Replace a member's roles",
        description = "members.role.set at ORG scope. Body: roleIds[] and primaryRoleId (optional only with one role). Roles added or removed must be within the caller's own permissions "
            + "(422 ROLE_CEILING {key, scope}); a caller capped at BELOW_ADMIN may not touch OWNER or admin-level roles; nobody changes their own roles; 409 LAST_ADMIN when the organization "
            + "would lose its last Owner or administrator; 409 SEAT_STATE for a member who has left. org_member.role follows the primary role. 404 for another organization's member or role."
    )
    @PutMapping
    @OrgPermissionRequired
    public RoleWriteDTO.MemberRoles replace(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long memberId,
        @RequestBody RoleWriteDTO.MemberRolesRequest request
    ) {
        demoGuard.assertNotDemo();
        return writeService.setMemberRoles(me, memberId, request);
    }
}
