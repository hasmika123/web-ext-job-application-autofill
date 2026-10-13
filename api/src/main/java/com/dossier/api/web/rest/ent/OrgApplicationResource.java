package com.dossier.api.web.rest.ent;

import com.dossier.api.service.DemoGuard;
import com.dossier.api.service.dto.ent.ApplicationDTO;
import com.dossier.api.service.ent.IdempotencyService;
import com.dossier.api.service.ent.applications.ApplicationCommandService;
import com.dossier.api.service.ent.applications.ApplicationQueryService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;
import org.springframework.format.annotation.DateTimeFormat;
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
 * The Applications board on real data (docs/enterprise-v2/page-applications.md). Reading needs {@code pipeline.view} (the scope it is held at decides the
 * rows); writing needs the recording keys. A caller with no key, a row outside their scope and a member of another organization all get the same
 * generic 404. A stage change is a record of what happened, never an action: Kiwiply does not submit applications, the consultant does.
 */
@RestController("entOrgApplicationResource")
@RequestMapping("/api/orgs/{orgId}/applications")
@Tag(name = "applications", description = "Applications: the table, KPI tiles, pipeline board, analytics and the detail drawer; recorded stage moves, notes and next actions.")
public class OrgApplicationResource {

    private final ApplicationQueryService query;
    private final ApplicationCommandService commands;
    private final IdempotencyService idempotency;
    private final DemoGuard demoGuard;

    public OrgApplicationResource(ApplicationQueryService query, ApplicationCommandService commands, IdempotencyService idempotency, DemoGuard demoGuard) {
        this.query = query;
        this.commands = commands;
        this.idempotency = idempotency;
        this.demoGuard = demoGuard;
    }

    private static ApplicationQueryService.ListQuery filters(
        String q, List<String> stage, String jobTitle, Long clientId, Long marketerId, LocalDate from, LocalDate to, List<String> sort, Integer page, Integer size
    ) {
        return new ApplicationQueryService.ListQuery(q, stage, jobTitle, clientId, marketerId, from, to, sort, page, size);
    }

    @Operation(
        summary = "List applications",
        description = "Paged, server-driven table. Query: q (2 to 80 characters: job title, consultant, client, application code, stage or next action), stage (repeatable or comma separated: ASSIGNED, " +
            "SUBMITTED, UNDER_REVIEW, INTERVIEWING, OFFER, CLOSED), jobTitle, clientId, marketerId, from and to (applied date, yyyy-mm-dd), sort=field,dir (applied, job, consultant, client, stage, nextAction, " +
            "moved; 400 SORT_INVALID otherwise), page (from 0), size (1 to 100, default 10). Answers a Page and X-Total-Count."
    )
    @GetMapping
    @OrgPermissionRequired
    public ResponseEntity<ApplicationDTO.Page> list(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestParam(name = "q", required = false) String q,
        @RequestParam(name = "stage", required = false) List<String> stage,
        @RequestParam(name = "jobTitle", required = false) String jobTitle,
        @RequestParam(name = "clientId", required = false) Long clientId,
        @RequestParam(name = "marketerId", required = false) Long marketerId,
        @RequestParam(name = "from", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
        @RequestParam(name = "to", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
        @RequestParam(name = "page", required = false) Integer page,
        @RequestParam(name = "size", required = false) Integer size,
        HttpServletRequest request
    ) {
        String[] sorts = request.getParameterValues("sort"); // raw: "applied,desc" must not be split by the converter
        ApplicationDTO.Page result = query.list(me, filters(q, stage, jobTitle, clientId, marketerId, from, to, sorts == null ? null : List.of(sorts), page, size));
        return ResponseEntity.ok().header("X-Total-Count", String.valueOf(result.total())).body(result);
    }

    @Operation(
        summary = "The KPI tiles of the Applications board",
        description = "Total, In Review (submitted + under review), Interviewing and Offers, each with its figure thirty days ago rebuilt from the application history and a weekly series for the sparkline. " +
            "previous and the deltas are null when the history does not reach back that far: never estimated."
    )
    @GetMapping("/counts")
    @OrgPermissionRequired
    public ApplicationDTO.Counts counts(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return query.counts(me);
    }

    @Operation(summary = "The options of the filter dropdowns", description = "Job titles, clients and marketers that have at least one application the caller can see, and the six stages.")
    @GetMapping("/filters")
    @OrgPermissionRequired
    public ApplicationDTO.Filters filterOptions(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return query.filters(me);
    }

    @Operation(
        summary = "Candidates for the Add Application dialog",
        description = "kind = consultant, job or marketer; q narrows by name. Needs a key that may add applications (submissions.prepare or opportunities.manage); up to 20 results."
    )
    @GetMapping("/pickers")
    @OrgPermissionRequired
    public ApplicationDTO.Pickers pickers(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestParam(name = "kind", defaultValue = "consultant") String kind,
        @RequestParam(name = "q", required = false) String q
    ) {
        return query.pickers(me, kind, q);
    }

    @Operation(
        summary = "The pipeline board",
        description = "One column per stage with its total and the 20 most recently moved applications that match the same filters as the table (q, jobTitle, clientId, marketerId, from, to)."
    )
    @GetMapping("/pipeline")
    @OrgPermissionRequired
    public ApplicationDTO.Pipeline pipeline(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestParam(name = "q", required = false) String q,
        @RequestParam(name = "jobTitle", required = false) String jobTitle,
        @RequestParam(name = "clientId", required = false) Long clientId,
        @RequestParam(name = "marketerId", required = false) Long marketerId,
        @RequestParam(name = "from", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
        @RequestParam(name = "to", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to
    ) {
        return query.pipeline(me, filters(q, null, jobTitle, clientId, marketerId, from, to, null, null, null));
    }

    @Operation(
        summary = "Analytics",
        description = "Counts of the applications the caller sees: by stage, how many ever reached each stage, applications per month (six months), closing reasons, top clients, sources and marketers, and the average age of open applications."
    )
    @GetMapping("/analytics")
    @OrgPermissionRequired
    public ApplicationDTO.Analytics analytics(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return query.analytics(me);
    }

    @Operation(
        summary = "One application: the detail drawer",
        description = "Stepper with the date each stage was recorded, the timeline, notes, activity, the fields of Application Details, what the caller may do (actions) and, for a few minutes after the caller's own latest stage move, an undo token. 404 outside the caller's scope."
    )
    @GetMapping("/{applicationId}")
    @OrgPermissionRequired
    public ApplicationDTO.Detail get(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long applicationId) {
        return query.detail(me, applicationId);
    }

    @Operation(
        summary = "Add an application (a record)",
        description = "Body: requirementId, consultantId, optional marketerMemberId (default: the consultant's assigned marketer), source, nextAction, nextActionDue, appliedOn, stage (ASSIGNED, or SUBMITTED when the consultant already submitted it). " +
            "409 DUPLICATE_APPLICATION for a second application of the same consultant to the same job. Idempotency-Key honoured. One APPLICATION_CREATE audit row."
    )
    @PostMapping
    @OrgPermissionRequired
    public ResponseEntity<ApplicationDTO.Detail> create(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestHeader(value = "Idempotency-Key", required = false) String key,
        @RequestBody ApplicationDTO.CreateRequest body,
        HttpServletRequest request
    ) {
        demoGuard.assertNotDemo();
        return run(me, key, request, body, 201, () -> commands.create(me, body));
    }

    @Operation(
        summary = "Edit the next action, its due date or the marketer",
        description = "Body: any of nextAction, nextActionDue (yyyy-mm-dd) and marketerMemberId (a JSON null clears each); any other key is 422 FIELD_UNKNOWN. Changing the marketer needs assignments.manage. " +
            "A request that changes nothing writes no event and no audit row."
    )
    @PatchMapping("/{applicationId}")
    @OrgPermissionRequired
    public ApplicationDTO.Detail patch(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long applicationId,
        @RequestBody Map<String, Object> body
    ) {
        demoGuard.assertNotDemo();
        return commands.patch(me, applicationId, body);
    }

    @Operation(
        summary = "Record a stage move",
        description = "Body: stage (the stage it is now in) with closedReason (HIRED, REJECTED, WITHDRAWN, NO_RESPONSE) when closing; or undoEventId (from the detail's undo token) to revert your own latest move. " +
            "A stage change records what happened: Kiwiply never submits an application. 422 INVALID_TRANSITION (with the allowed stages) for a move backwards or out of Closed. Idempotency-Key honoured."
    )
    @PostMapping("/{applicationId}/stage")
    @OrgPermissionRequired
    public ResponseEntity<ApplicationDTO.Detail> stage(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long applicationId,
        @RequestHeader(value = "Idempotency-Key", required = false) String key,
        @RequestBody ApplicationDTO.StageRequest body,
        HttpServletRequest request
    ) {
        demoGuard.assertNotDemo();
        return run(me, key, request, body, 200, () -> commands.stage(me, applicationId, body));
    }

    @Operation(summary = "Add a note", description = "Body: body (1 to 1000 characters, no sensitive identifiers). One NOTE event and one APPLICATION_NOTE audit row. Idempotency-Key honoured.")
    @PostMapping("/{applicationId}/notes")
    @OrgPermissionRequired
    public ResponseEntity<ApplicationDTO.Detail> note(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long applicationId,
        @RequestHeader(value = "Idempotency-Key", required = false) String key,
        @RequestBody ApplicationDTO.NoteRequest body,
        HttpServletRequest request
    ) {
        demoGuard.assertNotDemo();
        return run(me, key, request, body, 201, () -> commands.addNote(me, applicationId, body));
    }

    private ResponseEntity<ApplicationDTO.Detail> run(OrgMembership me, String key, HttpServletRequest request, Object body, int status, Supplier<ApplicationDTO.Detail> work) {
        IdempotencyService.Outcome<ApplicationDTO.Detail> out = idempotency.execute(me, key, false, request.getMethod(), request.getRequestURI(), body, status, ApplicationDTO.Detail.class, work);
        ResponseEntity.BodyBuilder ok = ResponseEntity.status(out.status());
        if (out.replayed()) ok.header("Idempotent-Replayed", "true");
        return ok.body(out.body());
    }
}
