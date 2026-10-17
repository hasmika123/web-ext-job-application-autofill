package com.dossier.api.web.rest.ent;

import com.dossier.api.service.DemoGuard;
import com.dossier.api.service.dto.ent.PlacementDTO;
import com.dossier.api.service.ent.IdempotencyService;
import com.dossier.api.service.ent.placements.PlacementCommandService;
import com.dossier.api.service.ent.placements.PlacementQueryService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import java.time.LocalDate;
import java.util.List;
import java.util.function.Supplier;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The Placements board on real data (docs/enterprise-v2/page-placements.md). Reading needs {@code placements.view} (or {@code placements.manage}); the
 * scope it is held at decides the rows. Writing needs {@code placements.manage}. A caller with no key, a row outside their scope and a member of another
 * organization all get the same generic 404. Everything on this page is a RECORD: extension requests, extensions, completions and redeployments are
 * rows with an audit event, and the bill rate is a number on the record, never money that moves. Bodies refuse unknown properties.
 */
@RestController("entOrgPlacementResource")
@RequestMapping("/api/orgs/{orgId}/placements")
@Tag(name = "placements", description = "Placements: the table, KPI tiles, tab counts and the detail drawer; recorded extensions, completion, redeployment and notes.")
public class OrgPlacementResource {

    private final PlacementQueryService query;
    private final PlacementCommandService commands;
    private final IdempotencyService idempotency;
    private final DemoGuard demoGuard;
    private final ObjectMapper mapper;

    public OrgPlacementResource(PlacementQueryService query, PlacementCommandService commands, IdempotencyService idempotency, DemoGuard demoGuard, ObjectMapper mapper) {
        this.query = query;
        this.commands = commands;
        this.idempotency = idempotency;
        this.demoGuard = demoGuard;
        this.mapper = mapper;
    }

    @Operation(
        summary = "List placements",
        description = "Paged, server-driven table. Query: tab (active, upcoming, completed, extensions), q (2 to 80 characters: consultant, client, role or skill), clientId, role, status (repeatable or comma separated: " +
            "ACTIVE, ENDING_SOON, UPCOMING, EXTENSION_REQUESTED, IN_POOL, COMPLETED), managerId, type (CONTRACT, FTE, C2C), startFrom, startTo, endFrom, endTo (yyyy-mm-dd), sort=field,dir (end, start, consultant, " +
            "client, role, rate; 400 SORT_INVALID otherwise; default end,asc), page (from 0), size (1 to 100, default 10). Answers a Page and X-Total-Count. The bill rate is null for a caller who may not see rates."
    )
    @GetMapping
    @OrgPermissionRequired
    public ResponseEntity<PlacementDTO.Page> list(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestParam(name = "tab", required = false) String tab,
        @RequestParam(name = "q", required = false) String q,
        @RequestParam(name = "clientId", required = false) Long clientId,
        @RequestParam(name = "role", required = false) String role,
        @RequestParam(name = "status", required = false) List<String> status,
        @RequestParam(name = "managerId", required = false) Long managerId,
        @RequestParam(name = "type", required = false) String type,
        @RequestParam(name = "startFrom", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startFrom,
        @RequestParam(name = "startTo", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startTo,
        @RequestParam(name = "endFrom", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endFrom,
        @RequestParam(name = "endTo", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endTo,
        @RequestParam(name = "page", required = false) Integer page,
        @RequestParam(name = "size", required = false) Integer size,
        HttpServletRequest request
    ) {
        String[] sorts = request.getParameterValues("sort"); // raw: "end,asc" must not be split by the converter
        PlacementQueryService.ListQuery f = new PlacementQueryService.ListQuery(
            tab == null || tab.isBlank() ? "active" : tab, q, clientId, role, status, managerId, type, startFrom, startTo, endFrom, endTo, sorts == null ? null : List.of(sorts), page, size
        );
        PlacementDTO.Page result = query.list(me, f);
        return ResponseEntity.ok().header("X-Total-Count", String.valueOf(result.total())).body(result);
    }

    @Operation(
        summary = "The KPI tiles and tab counts",
        description = "Active Placements, Starting Soon, Ending Soon and Redeployment Pool, each with its figure thirty days ago and a weekly series (previous and the deltas are null when the history does not reach back: never estimated), " +
            "the counts behind the four tabs, and the windows (days) the organization uses for ending soon, urgent and starting soon."
    )
    @GetMapping("/counts")
    @OrgPermissionRequired
    public PlacementDTO.Counts counts(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return query.counts(me);
    }

    @Operation(summary = "The options of the filter dropdowns", description = "Clients, roles and account managers that have at least one placement the caller can see, the placement types and the status filters.")
    @GetMapping("/filters")
    @OrgPermissionRequired
    public PlacementDTO.Filters filterOptions(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return query.filters(me);
    }

    @Operation(summary = "Candidates for the Add Placement dialog", description = "kind = consultant (not placed right now), client, contact (needs clientId) or manager; q narrows by name; up to 20 results. Needs placements.manage.")
    @GetMapping("/pickers")
    @OrgPermissionRequired
    public PlacementDTO.Pickers pickers(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestParam(name = "kind", defaultValue = "consultant") String kind,
        @RequestParam(name = "q", required = false) String q,
        @RequestParam(name = "clientId", required = false) Long clientId
    ) {
        return query.pickers(me, kind, q, clientId);
    }

    @Operation(
        summary = "One placement: the detail drawer",
        description = "Placement details, the engagement timeline (start, midpoint, end and how far today is), extension status with every request, post-placement availability, the timeline events and notes, " +
            "what the caller may do (actions) and, for a few minutes after the caller's own latest change, an undo token. 404 outside the caller's scope."
    )
    @GetMapping("/{placementId}")
    @OrgPermissionRequired
    public PlacementDTO.Detail get(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long placementId) {
        return query.detail(me, placementId);
    }

    @Operation(
        summary = "Add a placement (a record)",
        description = "placements.manage. Body: consultantId, clientId, roleTitle, startDate (required), placementType (CONTRACT, FTE, C2C), endDate, accountManagerMemberId (default: the consultant's marketer), clientContactId, billRateMinor " +
            "(a record, never moved), rateUnit (HOUR, DAY, MONTH, YEAR), note. 409 ALREADY_PLACED when the consultant has a placement that has not ended. Idempotency-Key honoured. One PLACEMENT_CREATE audit row."
    )
    @PostMapping
    @OrgPermissionRequired
    public ResponseEntity<PlacementDTO.Detail> create(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestHeader(value = "Idempotency-Key", required = false) String key,
        @RequestBody JsonNode raw,
        HttpServletRequest request
    ) {
        demoGuard.assertNotDemo();
        PlacementDTO.CreateRequest body = strict(raw, PlacementDTO.CreateRequest.class);
        return run(me, key, request, body, 201, () -> commands.create(me, body));
    }

    @Operation(summary = "Record an extension", description = "Body: endDate (after the current end date), note. The end date moves and the extension is listed as APPROVED. Undo within ten minutes. PLACEMENT_EXTEND audit row.")
    @PostMapping("/{placementId}/extend")
    @OrgPermissionRequired
    public ResponseEntity<PlacementDTO.Detail> extend(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long placementId,
        @RequestHeader(value = "Idempotency-Key", required = false) String key,
        @RequestBody JsonNode raw,
        HttpServletRequest request
    ) {
        demoGuard.assertNotDemo();
        PlacementDTO.ExtendRequest body = strict(raw, PlacementDTO.ExtendRequest.class);
        return run(me, key, request, body, 200, () -> commands.extend(me, placementId, body));
    }

    @Operation(summary = "Request an extension", description = "Body: requestedEndDate, note. 409 EXTENSION_ALREADY_REQUESTED while one waits for a decision. The placement joins the Extensions tab. PLACEMENT_EXTENSION_REQUEST audit row.")
    @PostMapping("/{placementId}/extension-requests")
    @OrgPermissionRequired
    public ResponseEntity<PlacementDTO.Detail> requestExtension(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long placementId,
        @RequestHeader(value = "Idempotency-Key", required = false) String key,
        @RequestBody JsonNode raw,
        HttpServletRequest request
    ) {
        demoGuard.assertNotDemo();
        PlacementDTO.RequestExtensionRequest body = strict(raw, PlacementDTO.RequestExtensionRequest.class);
        return run(me, key, request, body, 201, () -> commands.requestExtension(me, placementId, body));
    }

    @Operation(summary = "Decide an extension request", description = "Body: decision APPROVE (the end date moves) or DECLINE. 409 EXTENSION_NOT_PENDING when it was already decided. PLACEMENT_EXTENSION_DECIDE audit row.")
    @PostMapping("/{placementId}/extensions/{extensionId}/decision")
    @OrgPermissionRequired
    public ResponseEntity<PlacementDTO.Detail> decide(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long placementId,
        @PathVariable Long extensionId,
        @RequestHeader(value = "Idempotency-Key", required = false) String key,
        @RequestBody JsonNode raw,
        HttpServletRequest request
    ) {
        demoGuard.assertNotDemo();
        PlacementDTO.DecideRequest body = strict(raw, PlacementDTO.DecideRequest.class);
        return run(me, key, request, body, 200, () -> commands.decide(me, placementId, extensionId, body));
    }

    @Operation(summary = "Mark a placement complete", description = "Body: note. Status becomes ENDED and the end date is today when it was later. 422 PLACEMENT_NOT_STARTED for an upcoming placement. PLACEMENT_COMPLETE audit row.")
    @PostMapping("/{placementId}/complete")
    @OrgPermissionRequired
    public ResponseEntity<PlacementDTO.Detail> complete(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long placementId,
        @RequestHeader(value = "Idempotency-Key", required = false) String key,
        @RequestBody JsonNode raw,
        HttpServletRequest request
    ) {
        demoGuard.assertNotDemo();
        PlacementDTO.CompleteRequest body = strict(raw, PlacementDTO.CompleteRequest.class);
        return run(me, key, request, body, 200, () -> commands.complete(me, placementId, body));
    }

    @Operation(
        summary = "Terminate a placement",
        description = "Body: reason (required, 3 to 300 characters, scanned for sensitive data), endDate (default today, never in the future). Status becomes ENDED and the row reads Terminated; the consultant goes back to Available. " +
            "422 PLACEMENT_ENDED when already ended. PLACEMENT_TERMINATE audit row. Records the fact only: nothing is sent to the client or the consultant."
    )
    @PostMapping("/{placementId}/terminate")
    @OrgPermissionRequired
    public ResponseEntity<PlacementDTO.Detail> terminate(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long placementId,
        @RequestHeader(value = "Idempotency-Key", required = false) String key,
        @RequestBody JsonNode raw,
        HttpServletRequest request
    ) {
        demoGuard.assertNotDemo();
        PlacementDTO.TerminateRequest body = strict(raw, PlacementDTO.TerminateRequest.class);
        return run(me, key, request, body, 200, () -> commands.terminate(me, placementId, body));
    }

    @Operation(
        summary = "Record that notice was given",
        description = "Body: endDate (today or later, required), note. The placement reads Ending until then and the consultant reads On notice. 409 ALREADY_ON_NOTICE, 422 PLACEMENT_NOT_STARTED. PLACEMENT_NOTICE audit row."
    )
    @PostMapping("/{placementId}/notice")
    @OrgPermissionRequired
    public ResponseEntity<PlacementDTO.Detail> notice(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long placementId,
        @RequestHeader(value = "Idempotency-Key", required = false) String key,
        @RequestBody JsonNode raw,
        HttpServletRequest request
    ) {
        demoGuard.assertNotDemo();
        PlacementDTO.NoticeRequest body = strict(raw, PlacementDTO.NoticeRequest.class);
        return run(me, key, request, body, 200, () -> commands.giveNotice(me, placementId, body));
    }

    @Operation(summary = "Start redeployment", description = "Body: availableFrom (default: the day after the end date, or today). Puts the consultant in the redeployment pool. 409 ALREADY_IN_POOL. PLACEMENT_REDEPLOY audit row.")
    @PostMapping("/{placementId}/redeploy")
    @OrgPermissionRequired
    public ResponseEntity<PlacementDTO.Detail> redeploy(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long placementId,
        @RequestHeader(value = "Idempotency-Key", required = false) String key,
        @RequestBody JsonNode raw,
        HttpServletRequest request
    ) {
        demoGuard.assertNotDemo();
        PlacementDTO.RedeployRequest body = strict(raw, PlacementDTO.RedeployRequest.class);
        return run(me, key, request, body, 200, () -> commands.redeploy(me, placementId, body));
    }

    @Operation(summary = "Remove from the redeployment pool", description = "No body. 409 NOT_IN_POOL. PLACEMENT_REDEPLOY_CANCEL audit row.")
    @PostMapping("/{placementId}/redeploy/cancel")
    @OrgPermissionRequired
    public ResponseEntity<PlacementDTO.Detail> cancelRedeployment(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long placementId,
        @RequestHeader(value = "Idempotency-Key", required = false) String key,
        HttpServletRequest request
    ) {
        demoGuard.assertNotDemo();
        return run(me, key, request, "cancel", 200, () -> commands.cancelRedeployment(me, placementId));
    }

    @Operation(summary = "Add a note", description = "Body: body (1 to 1000 characters, no sensitive identifiers). One NOTE event and one PLACEMENT_NOTE audit row (the text is never copied into it).")
    @PostMapping("/{placementId}/notes")
    @OrgPermissionRequired
    public ResponseEntity<PlacementDTO.Detail> note(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long placementId,
        @RequestHeader(value = "Idempotency-Key", required = false) String key,
        @RequestBody JsonNode raw,
        HttpServletRequest request
    ) {
        demoGuard.assertNotDemo();
        PlacementDTO.NoteRequest body = strict(raw, PlacementDTO.NoteRequest.class);
        return run(me, key, request, body, 201, () -> commands.addNote(me, placementId, body));
    }

    @Operation(summary = "Undo your latest change", description = "Body: eventId (from the detail's undo token). Takes back the caller's own latest change within ten minutes. 422 UNDO_NOT_AVAILABLE otherwise. PLACEMENT_UNDO audit row.")
    @PostMapping("/{placementId}/undo")
    @OrgPermissionRequired
    public ResponseEntity<PlacementDTO.Detail> undo(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long placementId,
        @RequestHeader(value = "Idempotency-Key", required = false) String key,
        @RequestBody JsonNode raw,
        HttpServletRequest request
    ) {
        demoGuard.assertNotDemo();
        PlacementDTO.UndoRequest body = strict(raw, PlacementDTO.UndoRequest.class);
        return run(me, key, request, body, 200, () -> commands.undo(me, placementId, body));
    }

    /** Binds a body and refuses any property the shape does not name (Spring's mapper ignores unknown ones, which would let {@code orgId} ride along silently). */
    private <T> T strict(JsonNode raw, Class<T> type) {
        if (raw == null || raw.isNull() || !raw.isObject()) throw OrgException.invalid("body", "must be a JSON object");
        try {
            return mapper.readerFor(type).with(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES).readValue(raw);
        } catch (java.io.IOException e) {
            throw OrgException.invalid("body", "has a property or value this request does not accept");
        }
    }

    private ResponseEntity<PlacementDTO.Detail> run(OrgMembership me, String key, HttpServletRequest request, Object body, int status, Supplier<PlacementDTO.Detail> work) {
        IdempotencyService.Outcome<PlacementDTO.Detail> out = idempotency.execute(me, key, false, request.getMethod(), request.getRequestURI(), body, status, PlacementDTO.Detail.class, work);
        ResponseEntity.BodyBuilder ok = ResponseEntity.status(out.status());
        if (out.replayed()) ok.header("Idempotent-Replayed", "true");
        return ok.body(out.body());
    }
}
