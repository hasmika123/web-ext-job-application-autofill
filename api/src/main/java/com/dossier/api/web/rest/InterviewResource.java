package com.dossier.api.web.rest;

import com.dossier.api.config.OpenApiConfiguration;
import com.dossier.api.service.InterviewService;
import com.dossier.api.service.InterviewService.IcsFile;
import com.dossier.api.service.dto.TrackerDTOs.InterviewDTO;
import com.dossier.api.service.dto.TrackerDTOs.InterviewRequest;
import com.dossier.api.service.dto.TrackerDTOs.OutcomeRequest;
import com.fasterxml.jackson.databind.node.ObjectNode;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * The user's interviews (APP-E2E U6.4). Interviews belong to an application
 * ({@code /api/profile/applications/{id}/interviews}) and are also read across applications as a date range
 * ({@code /api/profile/interviews}) for the dashboard and the prep page, or exported one at a time as a
 * calendar file. Everything is scoped to the signed-in user; another user's application or interview is a
 * 404. Refusals carry a {@code code}: 422 {@code TRACKER_INVALID {path, message}}, {@code TRACKER_LIMIT},
 * {@code SENSITIVE_CONTENT {path, class}}.
 */
@RestController
@RequestMapping("/api/profile")
@Tag(name = "interviews", description = "The user's interviews: log, change, outcome, date range, calendar export.")
@SecurityRequirement(name = OpenApiConfiguration.BEARER_JWT_SCHEME)
public class InterviewResource {

    private static final Logger LOG = LoggerFactory.getLogger(InterviewResource.class);
    private static final MediaType CALENDAR = MediaType.parseMediaType("text/calendar;charset=UTF-8");

    private final InterviewService interviewService;

    public InterviewResource(InterviewService interviewService) {
        this.interviewService = interviewService;
    }

    /** {@code POST /api/profile/applications/:id/interviews} : log an interview. */
    @Operation(
        summary = "Log an interview",
        description = "{kind: PHONE|VIDEO|ONSITE|TECHNICAL|BEHAVIORAL|PANEL|OTHER, startsAt (ISO-8601), endsAt?, tz? (IANA), location?, interviewer?, notes?}. " +
        "Writes an INTERVIEW event; does not change the application's status. 404 if the application is not owned.",
        requestBody = @io.swagger.v3.oas.annotations.parameters.RequestBody(content = @Content(schema = @Schema(implementation = InterviewRequest.class)))
    )
    @PostMapping("/applications/{id}/interviews")
    public ResponseEntity<InterviewDTO> create(@PathVariable("id") Long id, @RequestBody ObjectNode body) {
        LOG.debug("REST request to log an interview on application {}", id);
        return ResponseEntity.status(HttpStatus.CREATED).body(interviewService.create(id, body));
    }

    /** {@code PUT /api/profile/applications/:id/interviews/:iid} : change an interview. */
    @Operation(
        summary = "Change an interview",
        description = "Partial: only the fields sent change; null clears endsAt, tz, location, interviewer and notes. The outcome is set with POST .../outcome. 404 if not owned.",
        requestBody = @io.swagger.v3.oas.annotations.parameters.RequestBody(content = @Content(schema = @Schema(implementation = InterviewRequest.class)))
    )
    @PutMapping("/applications/{id}/interviews/{iid}")
    public InterviewDTO update(@PathVariable("id") Long id, @PathVariable("iid") Long iid, @RequestBody ObjectNode body) {
        LOG.debug("REST request to update interview {} of application {}", iid, id);
        return interviewService.update(id, iid, body);
    }

    /** {@code DELETE /api/profile/applications/:id/interviews/:iid} : remove an interview. */
    @Operation(summary = "Remove an interview", description = "404 if the application or interview is not owned.")
    @DeleteMapping("/applications/{id}/interviews/{iid}")
    public ResponseEntity<Void> delete(@PathVariable("id") Long id, @PathVariable("iid") Long iid) {
        LOG.debug("REST request to delete interview {} of application {}", iid, id);
        interviewService.delete(id, iid);
        return ResponseEntity.noContent().build();
    }

    /** {@code POST /api/profile/applications/:id/interviews/:iid/outcome} : record how it went. */
    @Operation(
        summary = "Record an interview's outcome",
        description = "{outcome: PENDING|PASSED|REJECTED|NO_SHOW}. Writes an INTERVIEW event when it changes. 404 if not owned.",
        requestBody = @io.swagger.v3.oas.annotations.parameters.RequestBody(content = @Content(schema = @Schema(implementation = OutcomeRequest.class)))
    )
    @PostMapping("/applications/{id}/interviews/{iid}/outcome")
    public InterviewDTO outcome(@PathVariable("id") Long id, @PathVariable("iid") Long iid, @RequestBody ObjectNode body) {
        LOG.debug("REST request to set the outcome of interview {}", iid);
        return interviewService.outcome(id, iid, body);
    }

    /** {@code GET /api/profile/interviews?from=&to=} : the user's interviews in a date range. */
    @Operation(
        summary = "My interviews in a date range",
        description = "Soonest first, each with its application's company and role. from/to are ISO-8601 instants or dates (a date `to` includes that day, UTC); " +
        "default: from now for the configured number of days. Optional outcome filter (e.g. PENDING, to find interviews awaiting a result). 422 TRACKER_INVALID for a bad or too-wide range."
    )
    @GetMapping("/interviews")
    public List<InterviewDTO> range(
        @RequestParam(name = "from", required = false) String from,
        @RequestParam(name = "to", required = false) String to,
        @RequestParam(name = "outcome", required = false) String outcome
    ) {
        return interviewService.range(from, to, outcome);
    }

    /** {@code GET /api/profile/interviews/:id/ics} : the interview as a calendar file. */
    @Operation(
        summary = "Export an interview as a calendar file",
        description = "text/calendar (iCalendar) with a VTIMEZONE for the interview's zone (UTC when none); attachment named interview-<id>.ics. 404 if not owned.",
        responses = @ApiResponse(responseCode = "200", content = @Content(mediaType = "text/calendar", schema = @Schema(type = "string")))
    )
    @GetMapping("/interviews/{id}/ics")
    public ResponseEntity<byte[]> ics(@PathVariable("id") Long id) {
        IcsFile file = interviewService.ics(id);
        return ResponseEntity.ok()
            .contentType(CALENDAR)
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + file.filename() + "\"")
            .cacheControl(CacheControl.noStore())
            .body(file.content().getBytes(StandardCharsets.UTF_8));
    }
}
