package com.dossier.api.web.rest.ent;

import com.dossier.api.service.DemoGuard;
import com.dossier.api.service.dto.ent.MemberDTO;
import com.dossier.api.service.ent.members.OrgMemberEditService;
import com.dossier.api.service.ent.members.OrgMemberQueryService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The Employees board on real data (X4.3 list, tiles, single edit; X4.6 detail sheet and activity). What a caller sees is decided in the service from the
 * permission keys they hold and the scope each is held at (a people key at TEAM scope lists only that team); a caller with no people key, a member of
 * another organization and a row outside the scope all get the same generic 404, so nothing here says "forbidden".
 */
@RestController
@RequestMapping("/api/orgs/{orgId}/members")
@Tag(name = "members", description = "Employees: the directory, KPI tiles, detail sheet, single edits, bulk actions and the lifecycle.")
public class OrgMemberResource {

    private final OrgMemberQueryService query;
    private final OrgMemberEditService edit;
    private final DemoGuard demoGuard;

    public OrgMemberResource(OrgMemberQueryService query, OrgMemberEditService edit, DemoGuard demoGuard) {
        this.query = query;
        this.edit = edit;
        this.demoGuard = demoGuard;
    }

    @Operation(
        summary = "List employees",
        description = "Paged, server-driven table of the Employees board. Needs a people permission (member.view_summary, hr.view or one of the members.* keys); the rows are only the " +
            "seats inside the widest scope the caller holds it at. Query: q (name, email, title, role or department/team name; 2 to 80 characters), status (repeatable or comma " +
            "separated: INVITED, ACTIVE, SUSPENDED, LEFT, REMOVED; default INVITED, ACTIVE, SUSPENDED), roleId, departmentId, teamId, managerId, sort=field,dir (repeatable; " +
            "name, joined, status, lastActive; 400 SORT_INVALID otherwise), page (from 0), size (1 to 100, default 25). Answers a PageDTO and X-Total-Count. A row seen only through " +
            "a summary scope carries no work email, manager or consent (summaryOnly = true)."
    )
    @GetMapping
    @OrgPermissionRequired
    public ResponseEntity<MemberDTO.Page> list(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestParam(name = "q", required = false) String q,
        @RequestParam(name = "status", required = false) List<String> status,
        @RequestParam(name = "roleId", required = false) Long roleId,
        @RequestParam(name = "departmentId", required = false) Long departmentId,
        @RequestParam(name = "teamId", required = false) Long teamId,
        @RequestParam(name = "managerId", required = false) Long managerId,
        @RequestParam(name = "page", required = false) Integer page,
        @RequestParam(name = "size", required = false) Integer size,
        HttpServletRequest request
    ) {
        String[] sorts = request.getParameterValues("sort"); // read raw: "name,desc" must not be split by the converter
        MemberDTO.Page result = query.list(me, new OrgMemberQueryService.ListQuery(q, status, roleId, departmentId, teamId, managerId, sorts == null ? null : List.of(sorts), page, size));
        return ResponseEntity.ok().header("X-Total-Count", String.valueOf(result.total())).body(result);
    }

    @Operation(
        summary = "The KPI tiles of the Employees board",
        description = "Total, active, invited, suspended, departments and teams, each with the figure one month ago and the delta rebuilt from real history (seat timestamps and the audit trail). " +
            "previous and the deltas are null when that history does not exist (an organization younger than a month, a seat that ended with no time recorded, a suspension nobody audited): never estimated."
    )
    @GetMapping("/counts")
    @OrgPermissionRequired
    public MemberDTO.Counts counts(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return query.counts(me);
    }

    @Operation(
        summary = "One employee: the detail sheet",
        description = "Seat, roles, department, team, manager, direct reports, consent scope, what the caller may do with this seat (actions), and recent audit rows about the person (with audit.view or hr.view). " +
            "phone, location and timezone are null: the platform stores none of them for a member. Never exposes a resume or an application. ETag = the version PATCH expects as If-Match. 404 outside the caller's scope."
    )
    @GetMapping("/{memberId}")
    @OrgPermissionRequired
    public ResponseEntity<MemberDTO.Detail> get(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long memberId) {
        MemberDTO.Detail detail = query.detail(me, memberId);
        HttpHeaders headers = new HttpHeaders();
        headers.setETag(detail.version());
        return ResponseEntity.ok().headers(headers).body(detail);
    }

    @Operation(
        summary = "Audit rows about an employee (direction=on) or done by them (direction=by)",
        description = "Needs audit.view or hr.view at a scope covering the person. Paged (page from 0, size 1 to 100), newest first."
    )
    @GetMapping("/{memberId}/activity")
    @OrgPermissionRequired
    public MemberDTO.ActivityPage activity(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long memberId,
        @RequestParam(name = "direction", required = false) String direction,
        @RequestParam(name = "page", required = false) Integer page,
        @RequestParam(name = "size", required = false) Integer size
    ) {
        return query.activity(me, memberId, direction, page, size);
    }

    @Operation(
        summary = "Edit one employee",
        description = "Body: any of title, departmentGroupId, teamGroupId, managerMemberId (a JSON null clears it); any other key is 422. Title, department and team need members.group.set, the manager needs " +
            "members.manager.set, each at a scope covering the person. If-Match (the sheet's ETag) is required: 428 without, 412 when stale. 422 TEAM_NOT_IN_DEPARTMENT, MANAGER_CYCLE, MANAGER_INVALID; a group or " +
            "manager of another organization is the generic 404. One audit row per changed field family; a request that changes nothing writes none. Answers the new detail."
    )
    @PatchMapping("/{memberId}")
    @OrgPermissionRequired
    public ResponseEntity<MemberDTO.Detail> patch(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long memberId,
        @RequestHeader(value = HttpHeaders.IF_MATCH, required = false) String ifMatch,
        @RequestBody Map<String, Object> body
    ) {
        demoGuard.assertNotDemo();
        MemberDTO.Detail detail = edit.edit(me, memberId, ifMatch, body);
        HttpHeaders headers = new HttpHeaders();
        headers.setETag(detail.version());
        return ResponseEntity.ok().headers(headers).body(detail);
    }
}
