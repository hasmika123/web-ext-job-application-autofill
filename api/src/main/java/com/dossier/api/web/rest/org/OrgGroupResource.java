package com.dossier.api.web.rest.org;

import com.dossier.api.domain.enumeration.OrgGroupKind;
import com.dossier.api.domain.enumeration.OrgPermission;
import com.dossier.api.service.DemoGuard;
import com.dossier.api.service.dto.org.OrgGroupDTO;
import com.dossier.api.service.dto.org.OrgGroupRequest;
import com.dossier.api.service.dto.org.OrgGroupViews;
import com.dossier.api.service.ent.IdempotencyService;
import com.dossier.api.service.org.OrgGroupDirectoryService;
import com.dossier.api.service.org.OrgGroupService;
import com.dossier.api.service.org.OrgMembership;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import java.net.URI;
import java.util.List;
import java.util.Map;
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
 * Departments, cohorts and teams of an org (tenant-model.md section 5; Enterprise V2 X4.5). Reading needs any permission that looks
 * at people or structure ({@code groups.manage}, {@code member.view_summary}, {@code hr.view} and a few more: the service decides
 * and answers 404 otherwise); changing groups needs {@code groups.manage} (OWNER, ADMIN, HR), of which {@code departments.manage}
 * and {@code teams.manage} are aliases. A group id from another org, or one the caller may not see, is a 404.
 *
 * <p>Inside the Enterprise flag an update or delete needs the {@code If-Match} version (ETag) of the group: 428 without it, 412
 * with a stale one. The directory, structure and detail reads exist only inside the flag.
 */
@RestController
@RequestMapping("/api/orgs/{orgId}/groups")
@Tag(name = "org-groups", description = "Departments, teams and cohorts: tree, leads, members, directory.")
public class OrgGroupResource {

    private final OrgGroupService groupService;
    private final OrgGroupDirectoryService directory;
    private final DemoGuard demoGuard;
    private final IdempotencyService idempotency;

    public OrgGroupResource(OrgGroupService groupService, OrgGroupDirectoryService directory, DemoGuard demoGuard, IdempotencyService idempotency) {
        this.idempotency = idempotency;
        this.groupService = groupService;
        this.directory = directory;
        this.demoGuard = demoGuard;
    }

    @Operation(summary = "Every group the caller may see", description = "Flat list with lead, parent, counts and version. 404 for someone who may not read the organization's structure.")
    @GetMapping
    @OrgPermissionRequired
    public List<OrgGroupDTO> list(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return groupService.list(me);
    }

    @Operation(
        summary = "The directory of departments and teams with its KPI numbers",
        description = "Filters: kind (DEPARTMENT, TEAM, COHORT), departmentId (the teams of that department), status (ACTIVE, INACTIVE), q (name or lead); sort: name, members, created, lead, department; dir asc|desc; page, size (max 100). Enterprise flag only."
    )
    @GetMapping("/directory")
    @OrgPermissionRequired
    public OrgGroupViews.DirectoryPage directory(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestParam(required = false) OrgGroupKind kind,
        @RequestParam(required = false) Long departmentId,
        @RequestParam(required = false) String status,
        @RequestParam(required = false) String q,
        @RequestParam(required = false) String sort,
        @RequestParam(required = false, defaultValue = "asc") String dir,
        @RequestParam(required = false, defaultValue = "0") int page,
        @RequestParam(required = false, defaultValue = "10") int size
    ) {
        return directory.directory(me, new OrgGroupDirectoryService.Query(kind, departmentId, status, q, sort, "desc".equalsIgnoreCase(dir), page, size));
    }

    @Operation(summary = "The organization structure: the organization, its departments with their teams, teams under no department, cohorts", description = "Enterprise flag only.")
    @GetMapping("/structure")
    @OrgPermissionRequired
    public OrgGroupViews.Structure structure(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return directory.structure(me);
    }

    @Operation(summary = "The icons and colours a group can use", description = "A closed list; anything else is a 422.")
    @GetMapping("/pickers")
    @OrgPermissionRequired
    public Map<String, List<String>> pickers(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return Map.of("icons", OrgGroupService.ICONS.stream().sorted().toList(), "colors", OrgGroupService.COLORS.stream().sorted().toList());
    }

    @Operation(summary = "One group with its people and teams (ETag)", description = "The ETag is what update and delete expect as If-Match. Enterprise flag only; the people are limited to what the caller's scope reaches.")
    @GetMapping("/{groupId}")
    @OrgPermissionRequired
    public ResponseEntity<OrgGroupViews.Detail> detail(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long groupId) {
        OrgGroupViews.Detail d = directory.detail(me, groupId);
        return ResponseEntity.ok().header(HttpHeaders.ETAG, d.group().version()).body(d);
    }

    @Operation(
        summary = "Create a department, team or cohort",
        description = "groups.manage. parentGroupId puts a TEAM under a DEPARTMENT (422 GROUP_PARENT_INVALID for anything else); leadMemberId must be an ACTIVE member (422 LEAD_NOT_ACTIVE). 409 GROUP_NAME_TAKEN, 422 ORG_LIMIT_REACHED."
    )
    @PostMapping
    @OrgPermissionRequired(OrgPermission.GROUPS_MANAGE)
    public ResponseEntity<OrgGroupDTO> create(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestBody OrgGroupRequest request
    ) {
        demoGuard.assertNotDemo();
        OrgGroupDTO created = groupService.create(me, request);
        return ResponseEntity.created(URI.create("/api/orgs/" + me.orgId() + "/groups/" + created.id())).header(HttpHeaders.ETAG, created.version()).body(created);
    }

    @Operation(
        summary = "Rename, retype, re-parent, change the lead, status, icon or colour of a group",
        description = "groups.manage. If-Match is required inside the Enterprise flag (428 without, 412 {currentVersion} when stale). Moving a team under another department re-points its members' department in the same transaction. clearParent / clearLead remove them."
    )
    @PatchMapping("/{groupId}")
    @OrgPermissionRequired(OrgPermission.GROUPS_MANAGE)
    public ResponseEntity<OrgGroupDTO> update(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long groupId,
        @RequestHeader(value = HttpHeaders.IF_MATCH, required = false) String ifMatch,
        @RequestBody OrgGroupRequest request
    ) {
        demoGuard.assertNotDemo();
        OrgGroupDTO updated = groupService.update(me, groupId, ifMatch, request);
        return ResponseEntity.ok().header(HttpHeaders.ETAG, updated.version()).body(updated);
    }

    @Operation(
        summary = "Delete a group",
        description = "groups.manage. Inside the Enterprise flag only when empty: 409 GROUP_NOT_EMPTY {count, members, teams}; If-Match required. Never removes a person."
    )
    @DeleteMapping("/{groupId}")
    @OrgPermissionRequired(OrgPermission.GROUPS_MANAGE)
    public ResponseEntity<Void> delete(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long groupId,
        @RequestHeader(value = HttpHeaders.IF_MATCH, required = false) String ifMatch
    ) {
        demoGuard.assertNotDemo();
        groupService.delete(me, groupId, ifMatch);
        return ResponseEntity.noContent().build();
    }

    @Operation(
        summary = "Move people into a group (one or many)",
        description = "groups.manage. Body {memberIds[] (at most 500)}; Idempotency-Key required. One result row per id: MOVED, UNCHANGED, or SKIPPED NOT_FOUND (not a live seat of this organization or not one the caller may touch). A team move also sets the team's department."
    )
    @PostMapping("/{groupId}/members")
    @OrgPermissionRequired(OrgPermission.GROUPS_MANAGE)
    public ResponseEntity<OrgGroupViews.MoveResult> moveMembers(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long groupId,
        @RequestHeader(value = "Idempotency-Key", required = false) String key,
        @RequestBody OrgGroupViews.MoveRequest request,
        HttpServletRequest http
    ) {
        demoGuard.assertNotDemo();
        groupService.gateMove(me, groupId); // the permission wall first: an unauthorised caller never learns about the header
        IdempotencyService.Outcome<OrgGroupViews.MoveResult> out = idempotency.execute(
            me, key, true, "POST", http.getRequestURI(), request, 200, OrgGroupViews.MoveResult.class, () -> groupService.moveMembers(me, groupId, request)
        );
        ResponseEntity.BodyBuilder ok = ResponseEntity.status(out.status());
        if (out.replayed()) ok.header("Idempotent-Replayed", "true");
        return ok.body(out.body());
    }

    @Operation(summary = "Take one person out of a group", description = "groups.manage. Idempotent: 204 whether or not they were in it; 404 for a person who is not a live seat of this organization or not in the caller's scope.")
    @DeleteMapping("/{groupId}/members/{memberId}")
    @OrgPermissionRequired(OrgPermission.GROUPS_MANAGE)
    public ResponseEntity<Void> removeMember(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long groupId,
        @PathVariable Long memberId
    ) {
        demoGuard.assertNotDemo();
        groupService.removeMember(me, groupId, memberId);
        return ResponseEntity.noContent().build();
    }
}
