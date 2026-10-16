package com.dossier.api.web.rest.ent;

import com.dossier.api.service.DemoGuard;
import com.dossier.api.service.dto.ent.ConsultantDTO;
import com.dossier.api.service.ent.IdempotencyService;
import com.dossier.api.service.ent.consultants.ConsultantAccess;
import com.dossier.api.service.ent.consultants.ConsultantQueryService;
import com.dossier.api.service.ent.consultants.ConsultantWriteService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
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
 * The Consultants board on real data (docs/enterprise-v2/talent-foundation.md section 5; page-consultants.md). What a caller sees is decided in the
 * service from {@code consultants.view} and the scope it is held at (ORG all, TEAM their team's marketers' consultants, ASSIGNED their own); a caller
 * without the key, a member of another organization and a row outside the scope all get the same generic 404. Writes need {@code consultants.edit}
 * (profile, license, availability, status), {@code assignments.manage} (marketer) or {@code opportunities.manage} (create an application); creates and
 * bulk calls need an {@code Idempotency-Key} AFTER the permission wall.
 */
@RestController("entOrgConsultantResource")
@RequestMapping("/api/orgs/{orgId}/consultants")
@Tag(name = "consultants", description = "Consultants: the directory, KPI tiles, drawer tabs, edits, marketer assignment and bulk actions.")
public class OrgConsultantResource {

    private final ConsultantQueryService query;
    private final ConsultantWriteService write;
    private final IdempotencyService idempotency;
    private final DemoGuard demoGuard;

    public OrgConsultantResource(ConsultantQueryService query, ConsultantWriteService write, IdempotencyService idempotency, DemoGuard demoGuard) {
        this.query = query;
        this.write = write;
        this.idempotency = idempotency;
        this.demoGuard = demoGuard;
    }

    @Operation(
        summary = "List consultants",
        description = "Paged, server-driven directory. Needs consultants.view. Query: q (name, email, title, location or skill; 2 to 80 characters), availability (AVAILABLE, ON_PROJECT, NOTICE, UNAVAILABLE), " +
            "skill (exact), license (ACTIVE, EXPIRING, PENDING, NEEDS_REVIEW), marketerId (a seat id, or none for unassigned), workMode (REMOTE, HYBRID, ONSITE), status (ACTIVE default, INACTIVE), " +
            "departmentId, sort=field,dir (repeatable; name, experience, availability, license, profile, joined; 400 SORT_INVALID otherwise), page (from 0), size (1 to 100, default 10)."
    )
    @GetMapping
    @OrgPermissionRequired
    public ResponseEntity<ConsultantDTO.Page> list(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestParam(name = "q", required = false) String q,
        @RequestParam(name = "availability", required = false) String availability,
        @RequestParam(name = "skill", required = false) String skill,
        @RequestParam(name = "license", required = false) String license,
        @RequestParam(name = "marketerId", required = false) String marketerId,
        @RequestParam(name = "workMode", required = false) String workMode,
        @RequestParam(name = "status", required = false) String status,
        @RequestParam(name = "departmentId", required = false) Long departmentId,
        @RequestParam(name = "page", required = false) Integer page,
        @RequestParam(name = "size", required = false) Integer size,
        HttpServletRequest request
    ) {
        String[] sorts = request.getParameterValues("sort"); // read raw: "name,desc" must not be split by the converter
        ConsultantDTO.Page result = query.list(
            me, new ConsultantQueryService.ListQuery(q, availability, skill, license, marketerId, workMode, status, departmentId, sorts == null ? null : List.of(sorts), page, size)
        );
        return ResponseEntity.ok().header("X-Total-Count", String.valueOf(result.total())).body(result);
    }

    @Operation(
        summary = "The four KPI tiles",
        description = "Total, Available, On Project and Needs Review among ACTIVE consultants the caller reaches. Each tile has the figure, the same figure counting only consultants created more than 30 days " +
            "ago (previous), the delta, and eight weekly sparkline points. previous and the deltas are null when nobody joined more than 30 days ago (no baseline): never estimated."
    )
    @GetMapping("/counts")
    @OrgPermissionRequired
    public ConsultantDTO.Counts counts(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return query.counts(me);
    }

    @Operation(summary = "The pickers of the board: skills, marketers with their workload, departments")
    @GetMapping("/filters")
    @OrgPermissionRequired
    public ConsultantDTO.Filters filters(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return query.filters(me);
    }

    @Operation(summary = "One consultant: the drawer", description = "Overview data, checklist, marketer, what the caller may do (actions). ETag = the version PATCH expects as If-Match. 404 outside the caller's reach.")
    @GetMapping("/{consultantId}")
    @OrgPermissionRequired
    public ResponseEntity<ConsultantDTO.Detail> get(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long consultantId) {
        ConsultantDTO.Detail d = query.detail(me, consultantId);
        HttpHeaders headers = new HttpHeaders();
        headers.setETag(d.version());
        return ResponseEntity.ok().headers(headers).body(d);
    }

    @Operation(summary = "Drawer tab: assignments", description = "The marketer and backup, the jobs assigned to the consultant, and their placements.")
    @GetMapping("/{consultantId}/assignments")
    @OrgPermissionRequired
    public ConsultantDTO.Assignments assignments(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long consultantId) {
        return query.assignments(me, consultantId);
    }

    @Operation(summary = "Drawer tab: applications", description = "Applications of the consultant (newest stage change first) and their upcoming interviews.")
    @GetMapping("/{consultantId}/applications")
    @OrgPermissionRequired
    public ConsultantDTO.Applications applications(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long consultantId) {
        return query.applications(me, consultantId);
    }

    @Operation(summary = "Drawer tab: activity", description = "Stage events of the consultant's applications, plus audit rows about the consultant for callers with audit.view. limit 1 to 50, default 20.")
    @GetMapping("/{consultantId}/activity")
    @OrgPermissionRequired
    public ConsultantDTO.Activity activity(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long consultantId,
        @RequestParam(name = "limit", required = false) Integer limit
    ) {
        return query.activity(me, consultantId, limit);
    }

    @Operation(summary = "Open jobs this consultant has no application for (the Create Job Application picker)", description = "Needs opportunities.manage.")
    @GetMapping("/{consultantId}/job-options")
    @OrgPermissionRequired
    public List<ConsultantDTO.JobOption> jobOptions(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long consultantId) {
        return write.jobOptions(me, consultantId);
    }

    @Operation(
        summary = "Add a consultant",
        description = "consultants.edit. Body: displayName, email (unique per organization: 409 CONSULTANT_EXISTS), jobTitle, yearsExperience, locationLabel, workMode, skills[] (the first two are the primary chips), " +
            "departmentGroupId. Free text goes through the sensitive-data scanner (422). Idempotency-Key required. One CONSULTANT_CREATE audit row. Answers 201 with the detail."
    )
    @PostMapping
    @OrgPermissionRequired
    public ResponseEntity<ConsultantDTO.Detail> create(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestHeader(value = "Idempotency-Key", required = false) String key,
        @RequestBody ConsultantWriteService.CreateRequest body,
        HttpServletRequest request
    ) {
        demoGuard.assertNotDemo();
        write.gate(me, ConsultantAccess.EDIT);
        IdempotencyService.Outcome<ConsultantDTO.Detail> out = idempotency.execute(
            me, key, true, "POST", request.getRequestURI(), body, 201, ConsultantDTO.Detail.class, () -> write.create(me, body)
        );
        return reply(out);
    }

    @Operation(
        summary = "Edit one consultant",
        description = "consultants.edit. Body: any of jobTitle, yearsExperience, locationLabel, workMode, availabilityStatus, availableFrom, licenseStatus, licenseValidUntil, departmentGroupId (a JSON null clears " +
            "a nullable one); any other key is 422. If-Match (the drawer's ETag) is required: 428 without, 412 when stale. One CONSULTANT_UPDATE audit row; a request that changes nothing writes none."
    )
    @PatchMapping("/{consultantId}")
    @OrgPermissionRequired
    public ResponseEntity<ConsultantDTO.Detail> patch(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long consultantId,
        @RequestHeader(value = HttpHeaders.IF_MATCH, required = false) String ifMatch,
        @RequestBody Map<String, Object> body
    ) {
        demoGuard.assertNotDemo();
        ConsultantDTO.Detail d = write.patch(me, consultantId, ifMatch, body);
        HttpHeaders headers = new HttpHeaders();
        headers.setETag(d.version());
        return ResponseEntity.ok().headers(headers).body(d);
    }

    @Operation(
        summary = "People who can be linked to a consultant profile",
        description = "consultants.edit. Members (ACTIVE or INVITED) who hold the Consultant role and have no profile yet: {memberId, name, email, status}. The pickers of Add consultant and of the drawer's Link a sign-in."
    )
    @GetMapping("/linkable-members")
    @OrgPermissionRequired
    public List<ConsultantWriteService.LinkableMember> linkableMembers(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return write.linkableMembers(me);
    }

    @Operation(
        summary = "Link a consultant profile to an organization member",
        description = "consultants.edit. Body: memberId (an ACTIVE or INVITED member of this organization with no profile: 422 / 409 MEMBER_ALREADY_LINKED; the consultant must not be linked yet: 409 CONSULTANT_ALREADY_LINKED). " +
            "Their sign-in then opens the consultant workspace. One CONSULTANT_UPDATE audit row."
    )
    @PostMapping("/{consultantId}/member")
    @OrgPermissionRequired
    public ConsultantDTO.Detail linkMember(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long consultantId,
        @RequestBody Map<String, Object> body
    ) {
        demoGuard.assertNotDemo();
        Object raw = body == null ? null : body.get("memberId");
        return write.linkMember(me, consultantId, raw instanceof Number n ? n.longValue() : null);
    }

    @Operation(
        summary = "Assign or change the marketer",
        description = "assignments.manage (a TEAM holder may only name marketers inside their team). Body: marketerMemberId (an ACTIVE seat with marketer capacity: 422 MARKETER_INVALID), backupMemberId, priority. " +
            "One CONSULTANT_ASSIGN audit row when the marketer changes."
    )
    @PostMapping("/{consultantId}/marketer")
    @OrgPermissionRequired
    public ConsultantDTO.Detail marketer(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long consultantId,
        @RequestBody ConsultantWriteService.AssignRequest body
    ) {
        demoGuard.assertNotDemo();
        return write.assignMarketer(me, consultantId, body);
    }

    @Operation(summary = "Deactivate a consultant", description = "consultants.edit. Body: reason (10 to 500 characters). The consultant leaves the default list and every KPI. One CONSULTANT_DEACTIVATE audit row.")
    @PostMapping("/{consultantId}/deactivate")
    @OrgPermissionRequired
    public ConsultantDTO.Detail deactivate(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long consultantId,
        @RequestBody(required = false) Map<String, Object> body
    ) {
        demoGuard.assertNotDemo();
        return write.deactivate(me, consultantId, body == null ? null : str(body.get("reason")));
    }

    @Operation(summary = "Reactivate a consultant", description = "consultants.edit. Body: reason (optional). One CONSULTANT_REACTIVATE audit row.")
    @PostMapping("/{consultantId}/reactivate")
    @OrgPermissionRequired
    public ConsultantDTO.Detail reactivate(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long consultantId,
        @RequestBody(required = false) Map<String, Object> body
    ) {
        demoGuard.assertNotDemo();
        return write.reactivate(me, consultantId, body == null ? null : str(body.get("reason")));
    }

    @Operation(
        summary = "Create a job application for a consultant",
        description = "opportunities.manage. Body: requirementId (an OPEN job: 422 JOB_NOT_OPEN; 409 APPLICATION_EXISTS). Creates the application in stage ASSIGNED with its CREATED event and marks the match ASSIGNED. " +
            "Idempotency-Key required. One APPLICATION_CREATE audit row. Answers 201."
    )
    @PostMapping("/{consultantId}/applications")
    @OrgPermissionRequired
    public ResponseEntity<ConsultantDTO.ApplicationCreated> createApplication(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long consultantId,
        @RequestHeader(value = "Idempotency-Key", required = false) String key,
        @RequestBody Map<String, Object> body,
        HttpServletRequest request
    ) {
        demoGuard.assertNotDemo();
        write.gate(me, ConsultantAccess.OPPORTUNITIES);
        Long requirementId = body.get("requirementId") instanceof Number n ? n.longValue() : null;
        IdempotencyService.Outcome<ConsultantDTO.ApplicationCreated> out = idempotency.execute(
            me, key, true, "POST", request.getRequestURI(), body, 201, ConsultantDTO.ApplicationCreated.class, () -> write.createApplication(me, consultantId, requirementId)
        );
        return reply(out);
    }

    // ---- bulk -----------------------------------------------------------------------------------------------------------------

    @Operation(summary = "Set the availability of many consultants", description = "consultants.edit. Body: ids (1 to 200), availability. Idempotency-Key required. One CONSULTANT_UPDATE row per changed consultant plus one CONSULTANT_BULK row.")
    @PostMapping("/bulk/availability")
    @OrgPermissionRequired
    public ResponseEntity<ConsultantDTO.BulkResult> bulkAvailability(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestHeader(value = "Idempotency-Key", required = false) String key,
        @RequestBody Map<String, Object> body,
        HttpServletRequest request
    ) {
        return bulk(me, key, request, body, ConsultantAccess.EDIT, () -> write.bulkAvailability(me, longs(body.get("ids")), str(body.get("availability"))));
    }

    @Operation(summary = "Assign one marketer to many consultants", description = "assignments.manage. Body: ids, marketerMemberId. Idempotency-Key required. One CONSULTANT_ASSIGN row per changed consultant plus one CONSULTANT_BULK row.")
    @PostMapping("/bulk/marketer")
    @OrgPermissionRequired
    public ResponseEntity<ConsultantDTO.BulkResult> bulkMarketer(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestHeader(value = "Idempotency-Key", required = false) String key,
        @RequestBody Map<String, Object> body,
        HttpServletRequest request
    ) {
        Long marketer = body.get("marketerMemberId") instanceof Number n ? n.longValue() : null;
        return bulk(me, key, request, body, ConsultantAccess.ASSIGN, () -> write.bulkMarketer(me, longs(body.get("ids")), marketer));
    }

    @Operation(summary = "Deactivate or reactivate many consultants", description = "consultants.edit. Body: ids, action (DEACTIVATE or REACTIVATE), reason (10 to 500 characters to deactivate). Idempotency-Key required.")
    @PostMapping("/bulk/status")
    @OrgPermissionRequired
    public ResponseEntity<ConsultantDTO.BulkResult> bulkStatus(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestHeader(value = "Idempotency-Key", required = false) String key,
        @RequestBody Map<String, Object> body,
        HttpServletRequest request
    ) {
        return bulk(me, key, request, body, ConsultantAccess.EDIT, () -> write.bulkStatus(me, longs(body.get("ids")), str(body.get("action")), str(body.get("reason"))));
    }

    private ResponseEntity<ConsultantDTO.BulkResult> bulk(
        OrgMembership me, String key, HttpServletRequest request, Map<String, Object> body, String permission, Supplier<ConsultantDTO.BulkResult> work
    ) {
        demoGuard.assertNotDemo();
        write.gate(me, permission); // the permission wall first: an unauthorised caller never learns about the header
        return reply(idempotency.execute(me, key, true, "POST", request.getRequestURI(), body, 200, ConsultantDTO.BulkResult.class, work));
    }

    private static <T> ResponseEntity<T> reply(IdempotencyService.Outcome<T> out) {
        ResponseEntity.BodyBuilder ok = ResponseEntity.status(out.status());
        if (out.replayed()) ok.header("Idempotent-Replayed", "true");
        return ok.body(out.body());
    }

    private static String str(Object o) {
        return o instanceof String s ? s : null;
    }

    private static List<Long> longs(Object o) {
        if (!(o instanceof List<?> l)) return null;
        List<Long> out = new ArrayList<>();
        for (Object x : l) out.add(x instanceof Number n ? n.longValue() : null);
        return out;
    }
}
