package com.dossier.api.web.rest.ent;

import com.dossier.api.service.DemoGuard;
import com.dossier.api.service.dto.ent.InterviewDTO;
import com.dossier.api.service.ent.IdempotencyService;
import com.dossier.api.service.ent.interviews.InterviewCommandService;
import com.dossier.api.service.ent.interviews.InterviewQueryService;
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
 * The Interviews board on real data (docs/enterprise-v2/page-interviews.md). Reading needs {@code pipeline.view} (the scope it is held at
 * decides the rows); writing needs {@code interviews.coordinate}. A caller with no key, a row outside their scope and a member of another
 * organization all get the same generic 404. Everything written is a RECORD: Kiwiply does not attend, run or send anything for an interview.
 */
@RestController("entOrgInterviewResource")
@RequestMapping("/api/orgs/{orgId}/interviews")
@Tag(name = "interviews", description = "Interviews: the table, KPI tiles, pipeline, analytics and the detail drawer; recorded schedules, reschedules, status changes, reminder requests and feedback.")
public class OrgInterviewResource {

    private final InterviewQueryService query;
    private final InterviewCommandService commands;
    private final IdempotencyService idempotency;
    private final DemoGuard demoGuard;
    private final ObjectMapper mapper;

    public OrgInterviewResource(InterviewQueryService query, InterviewCommandService commands, IdempotencyService idempotency, DemoGuard demoGuard, ObjectMapper mapper) {
        this.query = query;
        this.commands = commands;
        this.idempotency = idempotency;
        this.demoGuard = demoGuard;
        this.mapper = mapper;
    }

    private static InterviewQueryService.ListQuery filters(
        String q, List<String> status, Long clientId, Long consultantId, String round, String mode, LocalDate from, LocalDate to, List<String> sort, Integer page, Integer size
    ) {
        return new InterviewQueryService.ListQuery(q, status, clientId, consultantId, round, mode, from, to, sort, page, size);
    }

    @Operation(
        summary = "List interviews",
        description = "Paged, server-driven table. Query: q (2 to 80 characters: role, consultant, client, round, interviewer, JOB-code or INT-code), status (repeatable or comma separated: SCHEDULED, IN_PROGRESS, COMPLETED, CANCELLED), " +
            "clientId, consultantId, round, mode (VIDEO, ONSITE, PHONE), from and to (scheduled date, yyyy-mm-dd), sort=field,dir (scheduled, role, consultant, client, round, status, mode; 400 SORT_INVALID otherwise), " +
            "page (from 0), size (1 to 100, default 10). Answers a Page and X-Total-Count."
    )
    @GetMapping
    @OrgPermissionRequired
    public ResponseEntity<InterviewDTO.Page> list(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestParam(name = "q", required = false) String q,
        @RequestParam(name = "status", required = false) List<String> status,
        @RequestParam(name = "clientId", required = false) Long clientId,
        @RequestParam(name = "consultantId", required = false) Long consultantId,
        @RequestParam(name = "round", required = false) String round,
        @RequestParam(name = "mode", required = false) String mode,
        @RequestParam(name = "from", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
        @RequestParam(name = "to", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
        @RequestParam(name = "page", required = false) Integer page,
        @RequestParam(name = "size", required = false) Integer size,
        HttpServletRequest request
    ) {
        String[] sorts = request.getParameterValues("sort"); // raw: "scheduled,desc" must not be split by the converter
        InterviewDTO.Page result = query.list(me, filters(q, status, clientId, consultantId, round, mode, from, to, sorts == null ? null : List.of(sorts), page, size));
        return ResponseEntity.ok().header("X-Total-Count", String.valueOf(result.total())).body(result);
    }

    @Operation(
        summary = "The KPI tiles of the Interviews board",
        description = "Total, Scheduled This Week (against last week), In Progress and Completed (against thirty days ago), each with a weekly series. The comparison is rebuilt from the interview history; previous and the deltas are null when the history does not reach back that far: never estimated."
    )
    @GetMapping("/counts")
    @OrgPermissionRequired
    public InterviewDTO.Counts counts(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return query.counts(me);
    }

    @Operation(summary = "The options of the filter dropdowns", description = "Clients, consultants and rounds that have at least one interview the caller can see, the four statuses and the three modes.")
    @GetMapping("/filters")
    @OrgPermissionRequired
    public InterviewDTO.Filters filterOptions(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return query.filters(me);
    }

    @Operation(summary = "Candidates for the Schedule dialog", description = "kind = consultant, application (needs consultantId) or client; q narrows by name. Needs interviews.coordinate; up to 20 results.")
    @GetMapping("/pickers")
    @OrgPermissionRequired
    public InterviewDTO.Pickers pickers(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestParam(name = "kind", defaultValue = "consultant") String kind,
        @RequestParam(name = "consultantId", required = false) Long consultantId,
        @RequestParam(name = "q", required = false) String q
    ) {
        return query.pickers(me, kind, consultantId, q);
    }

    @Operation(summary = "The pipeline board", description = "One column per status with its total and the 20 nearest interviews that match the same filters as the table (q, clientId, consultantId, round, mode, from, to).")
    @GetMapping("/pipeline")
    @OrgPermissionRequired
    public InterviewDTO.Pipeline pipeline(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestParam(name = "q", required = false) String q,
        @RequestParam(name = "clientId", required = false) Long clientId,
        @RequestParam(name = "consultantId", required = false) Long consultantId,
        @RequestParam(name = "round", required = false) String round,
        @RequestParam(name = "mode", required = false) String mode,
        @RequestParam(name = "from", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
        @RequestParam(name = "to", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to
    ) {
        return query.pipeline(me, filters(q, null, clientId, consultantId, round, mode, from, to, null, null, null));
    }

    @Operation(summary = "Analytics", description = "Counts of the interviews the caller sees: by status, per month (six), by mode, by round, top clients, completion rate and interviews per week.")
    @GetMapping("/analytics")
    @OrgPermissionRequired
    public InterviewDTO.Analytics analytics(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return query.analytics(me);
    }

    @Operation(summary = "One interview: the detail drawer", description = "Stepper of rounds, timeline, feedback, documents, interviewers, meeting details, what the caller may do (actions) and, for a few minutes after the caller's own latest status change, an undo token. 404 outside the caller's scope.")
    @GetMapping("/{interviewId}")
    @OrgPermissionRequired
    public InterviewDTO.Detail get(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long interviewId) {
        return query.detail(me, interviewId);
    }

    @Operation(
        summary = "Schedule an interview (a record)",
        description = "interviews.coordinate. Body: consultantId and scheduledAt (required), applicationId (the consultant's application) or clientId, round, durationMinutes, mode (VIDEO, ONSITE, PHONE), meetingLink, location, notes, interviewers[{name, title, primary}]. " +
            "409 SLOT_OVERLAP when the consultant already has an open interview then. Unknown properties are 422. Idempotency-Key honoured. One INTERVIEW_CREATE audit row. Nothing is sent to anyone."
    )
    @PostMapping
    @OrgPermissionRequired
    public ResponseEntity<InterviewDTO.Detail> create(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestHeader(value = "Idempotency-Key", required = false) String key,
        @RequestBody JsonNode raw,
        HttpServletRequest request
    ) {
        demoGuard.assertNotDemo();
        InterviewDTO.CreateRequest body = strict(raw, InterviewDTO.CreateRequest.class);
        return run(me, key, request, body, 201, () -> commands.create(me, body));
    }

    @Operation(
        summary = "Edit next step, notes, meeting link, mode, location or interviewers",
        description = "interviews.coordinate. Body: any of nextStep, notes, meetingLink, mode, location, interviewers (a JSON null clears a clearable field); any other key is 422 FIELD_UNKNOWN. A request that changes nothing writes no event and no audit row."
    )
    @PatchMapping("/{interviewId}")
    @OrgPermissionRequired
    public InterviewDTO.Detail patch(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long interviewId,
        @RequestBody Map<String, Object> body
    ) {
        demoGuard.assertNotDemo();
        return commands.patch(me, interviewId, body);
    }

    @Operation(summary = "Reschedule (a record of the new time)", description = "interviews.coordinate. Body: scheduledAt (required), durationMinutes, reason. Allowed for a scheduled or a cancelled interview (it becomes Scheduled); 422 INVALID_TRANSITION otherwise, 409 SLOT_OVERLAP on a clash. Idempotency-Key honoured.")
    @PostMapping("/{interviewId}/reschedule")
    @OrgPermissionRequired
    public ResponseEntity<InterviewDTO.Detail> reschedule(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long interviewId,
        @RequestHeader(value = "Idempotency-Key", required = false) String key,
        @RequestBody JsonNode raw,
        HttpServletRequest request
    ) {
        demoGuard.assertNotDemo();
        InterviewDTO.RescheduleRequest body = strict(raw, InterviewDTO.RescheduleRequest.class);
        return run(me, key, request, body, 200, () -> commands.reschedule(me, interviewId, body));
    }

    @Operation(summary = "Record a status change", description = "interviews.coordinate. Body: status (IN_PROGRESS, COMPLETED, CANCELLED) with an optional reason, or undoEventId (from the detail's undo token) to revert your own latest change. 422 INVALID_TRANSITION (with the allowed statuses). Idempotency-Key honoured.")
    @PostMapping("/{interviewId}/status")
    @OrgPermissionRequired
    public ResponseEntity<InterviewDTO.Detail> status(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long interviewId,
        @RequestHeader(value = "Idempotency-Key", required = false) String key,
        @RequestBody JsonNode raw,
        HttpServletRequest request
    ) {
        demoGuard.assertNotDemo();
        InterviewDTO.StatusRequest body = strict(raw, InterviewDTO.StatusRequest.class);
        return run(me, key, request, body, 200, () -> commands.status(me, interviewId, body));
    }

    @Operation(summary = "Record a reminder request", description = "interviews.coordinate. Records that a reminder was requested for a scheduled interview; Kiwiply sends nothing. 409 REMINDER_RECENT inside the organization's cool-down. Empty body. Idempotency-Key honoured.")
    @PostMapping("/{interviewId}/reminder")
    @OrgPermissionRequired
    public ResponseEntity<InterviewDTO.Detail> reminder(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long interviewId,
        @RequestHeader(value = "Idempotency-Key", required = false) String key,
        @RequestBody(required = false) JsonNode raw,
        HttpServletRequest request
    ) {
        demoGuard.assertNotDemo();
        if (raw != null && !raw.isNull() && !(raw.isObject() && raw.isEmpty())) throw OrgException.invalid("body", "has a property or value this request does not accept");
        return run(me, key, request, Map.of(), 200, () -> commands.remind(me, interviewId));
    }

    @Operation(summary = "Add feedback", description = "interviews.coordinate. Body: rating (1 to 5), recommendation (ADVANCE, HOLD, DECLINE), note (up to 1000 characters, no sensitive identifiers). Allowed once the interview has started. One FEEDBACK event and one INTERVIEW_FEEDBACK audit row (never the note). Idempotency-Key honoured.")
    @PostMapping("/{interviewId}/feedback")
    @OrgPermissionRequired
    public ResponseEntity<InterviewDTO.Detail> feedback(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long interviewId,
        @RequestHeader(value = "Idempotency-Key", required = false) String key,
        @RequestBody JsonNode raw,
        HttpServletRequest request
    ) {
        demoGuard.assertNotDemo();
        InterviewDTO.FeedbackRequest body = strict(raw, InterviewDTO.FeedbackRequest.class);
        return run(me, key, request, body, 201, () -> commands.addFeedback(me, interviewId, body));
    }

    private <T> T strict(JsonNode raw, Class<T> type) {
        if (raw == null || raw.isNull() || !raw.isObject()) throw OrgException.invalid("body", "is required");
        try {
            return mapper.readerFor(type).with(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES).readValue(raw);
        } catch (java.io.IOException e) {
            throw OrgException.invalid("body", "has a property or value this request does not accept");
        }
    }

    private ResponseEntity<InterviewDTO.Detail> run(OrgMembership me, String key, HttpServletRequest request, Object body, int status, Supplier<InterviewDTO.Detail> work) {
        IdempotencyService.Outcome<InterviewDTO.Detail> out = idempotency.execute(me, key, false, request.getMethod(), request.getRequestURI(), body, status, InterviewDTO.Detail.class, work);
        ResponseEntity.BodyBuilder ok = ResponseEntity.status(out.status());
        if (out.replayed()) ok.header("Idempotent-Replayed", "true");
        return ok.body(out.body());
    }
}
