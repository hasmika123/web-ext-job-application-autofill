package com.dossier.api.web.rest.ent;

import com.dossier.api.service.DemoGuard;
import com.dossier.api.service.dto.ent.MemberActionDTO;
import com.dossier.api.service.ent.IdempotencyService;
import com.dossier.api.service.ent.members.OrgMemberBulkService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import java.util.function.Supplier;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Bulk people actions (X4.3, 15-employees-and-teams.md section 3.2). Every call needs an {@code Idempotency-Key} (400 without) AFTER the permission wall:
 * a caller who may not do the action gets the generic 404 whether or not the header is there. The answer is always 200 with a per-member result; a
 * member that was skipped is in {@code skipped} with a reason. A replay of the same key and body returns the first answer with {@code Idempotent-Replayed: true}.
 */
@RestController
@RequestMapping("/api/orgs/{orgId}/members/bulk")
@Tag(name = "members", description = "Employees: the directory, KPI tiles, detail sheet, single edits, bulk actions and the lifecycle.")
public class OrgMemberBulkResource {

    private final OrgMemberBulkService bulk;
    private final IdempotencyService idempotency;
    private final DemoGuard demoGuard;

    public OrgMemberBulkResource(OrgMemberBulkService bulk, IdempotencyService idempotency, DemoGuard demoGuard) {
        this.bulk = bulk;
        this.idempotency = idempotency;
        this.demoGuard = demoGuard;
    }

    @Operation(
        summary = "Add and remove roles on many employees",
        description = "members.role.set at ORG scope, within the caller's ceiling. Body: memberIds (1 to 500), add[], remove[], primaryRoleId. Each member keeps their primary role when it survives; " +
            "a member who would lose the last administrator is skipped (LAST_ADMIN), as is the caller (SELF) and any role beyond the ceiling (ROLE_CEILING). One ROLE_ASSIGN/ROLE_REVOKE audit row per changed " +
            "member plus one MEMBER_BULK row. Idempotency-Key required."
    )
    @PostMapping("/roles")
    @OrgPermissionRequired
    public ResponseEntity<MemberActionDTO.BulkResult> roles(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestHeader(value = "Idempotency-Key", required = false) String key,
        @RequestBody MemberActionDTO.BulkRolesRequest body,
        HttpServletRequest request
    ) {
        return run(me, key, request, body, OrgMemberBulkService.ACTION_ROLES, () -> bulk.roles(me, body));
    }

    @Operation(
        summary = "Move many employees to a department and team",
        description = "members.group.set. Body: memberIds, departmentGroupId, teamGroupId (a null clears; a team alone brings its department). 422 TEAM_NOT_IN_DEPARTMENT for a team outside the department " +
            "(skipped per member); a group of another organization is NOT_FOUND per member. One MEMBER_GROUP row per changed member plus one MEMBER_BULK row. Idempotency-Key required."
    )
    @PostMapping("/groups")
    @OrgPermissionRequired
    public ResponseEntity<MemberActionDTO.BulkResult> groups(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestHeader(value = "Idempotency-Key", required = false) String key,
        @RequestBody MemberActionDTO.BulkGroupsRequest body,
        HttpServletRequest request
    ) {
        return run(me, key, request, body, OrgMemberBulkService.ACTION_GROUPS, () -> bulk.groups(me, body));
    }

    @Operation(
        summary = "Set the reporting manager of many employees",
        description = "members.manager.set. Body: memberIds, managerMemberId (null clears). A manager who must be active and never a loop: MANAGER_CYCLE and MANAGER_INVALID skip the member. " +
            "One MEMBER_MANAGER row per changed member plus one MEMBER_BULK row. Idempotency-Key required."
    )
    @PostMapping("/manager")
    @OrgPermissionRequired
    public ResponseEntity<MemberActionDTO.BulkResult> manager(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestHeader(value = "Idempotency-Key", required = false) String key,
        @RequestBody MemberActionDTO.BulkManagerRequest body,
        HttpServletRequest request
    ) {
        return run(me, key, request, body, OrgMemberBulkService.ACTION_MANAGER, () -> bulk.manager(me, body));
    }

    @Operation(
        summary = "Suspend or reinstate many employees",
        description = "members.suspend. Body: memberIds, action (SUSPEND or REINSTATE), reason (10 to 500 characters, required to suspend: 422 without). The caller (SELF), the last owner or administrator " +
            "(LAST_ADMIN) and anyone above the caller's rank are skipped with a reason. One MEMBER_SUSPEND/MEMBER_REINSTATE row per changed member plus one MEMBER_BULK row. Idempotency-Key required."
    )
    @PostMapping("/status")
    @OrgPermissionRequired
    public ResponseEntity<MemberActionDTO.BulkResult> status(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestHeader(value = "Idempotency-Key", required = false) String key,
        @RequestBody MemberActionDTO.BulkStatusRequest body,
        HttpServletRequest request
    ) {
        return run(me, key, request, body, OrgMemberBulkService.ACTION_SUSPEND, () -> bulk.status(me, body));
    }

    private ResponseEntity<MemberActionDTO.BulkResult> run(
        OrgMembership me,
        String key,
        HttpServletRequest request,
        Object body,
        String gate,
        Supplier<MemberActionDTO.BulkResult> work
    ) {
        demoGuard.assertNotDemo();
        bulk.gate(me, gate); // the permission wall first: an unauthorised caller never learns about the header
        bulk.validate(gate, body); // then the shape of the body, outside any transaction
        IdempotencyService.Outcome<MemberActionDTO.BulkResult> out = idempotency.execute(
            me, key, true, "POST", request.getRequestURI(), body, 200, MemberActionDTO.BulkResult.class, work
        );
        ResponseEntity.BodyBuilder ok = ResponseEntity.status(out.status());
        if (out.replayed()) ok.header("Idempotent-Replayed", "true");
        return ok.body(out.body());
    }
}
