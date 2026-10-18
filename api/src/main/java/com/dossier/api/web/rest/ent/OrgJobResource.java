package com.dossier.api.web.rest.ent;

import com.dossier.api.service.DemoGuard;
import com.dossier.api.service.dto.ent.JobDTO;
import com.dossier.api.service.ent.IdempotencyService;
import com.dossier.api.service.ent.jobs.JobBoardService;
import com.dossier.api.service.ent.jobs.JobWriteService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
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
 * The Jobs board on real data: the list, the KPI tiles (with weekly sparklines and filter facets), one job's drawer, creating and editing a
 * job, the bulk status change, and the two actions of "Top Consultant Matches" (assign, dismiss or restore). A job is a
 * {@code client_requirement}. View needs {@code clients.view} or {@code pipeline.view}; creating and editing needs {@code requirements.manage};
 * assigning needs {@code opportunities.manage}. A caller without the key, a member of another organization, a closed organization (for a write)
 * and an id of another tenant all get the same generic 404 (never 403).
 */
@RestController("entOrgJobResource")
@RequestMapping("/api/orgs/{orgId}/jobs")
@Tag(name = "jobs", description = "Jobs (client requirements): list, KPI tiles, detail drawer, create, edit, bulk status, assign a top match.")
public class OrgJobResource {

    private final JobBoardService board;
    private final JobWriteService write;
    private final IdempotencyService idempotency;
    private final DemoGuard demoGuard;
    private final com.fasterxml.jackson.databind.ObjectMapper mapper;

    public OrgJobResource(JobBoardService board, JobWriteService write, IdempotencyService idempotency, DemoGuard demoGuard, com.fasterxml.jackson.databind.ObjectMapper mapper) {
        this.mapper = mapper;
        this.board = board;
        this.write = write;
        this.idempotency = idempotency;
        this.demoGuard = demoGuard;
    }

    @Operation(
        summary = "List jobs",
        description = "Server-driven table of the Jobs board. Query: q (title, client, skill or location; 2 to 80 characters), and these repeatable filters (repeat the parameter; a comma is never a separator): "
            + "status (OPEN, IN_REVIEW, ON_HOLD, FILLED, CLOSED), clientId, location, workMode (REMOTE, HYBRID, ON_SITE), skill, employment (CONTRACT, FTE, C2C), experience (JUNIOR, MID, SENIOR, LEAD); "
            + "minMatch (0 to 100: jobs with a live match at least that good); sort (posted, title, client, status, submissions, match; 400 SORT_INVALID otherwise) and dir (asc or desc, default newest or best first); "
            + "page (from 0), size (1 to 100, default 10). Answers a page and X-Total-Count."
    )
    @GetMapping
    @OrgPermissionRequired
    public ResponseEntity<JobDTO.Page> list(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestParam(name = "q", required = false) String q,
        @RequestParam(name = "minMatch", required = false) Integer minMatch,
        @RequestParam(name = "sort", required = false) String sort,
        @RequestParam(name = "dir", required = false) String dir,
        @RequestParam(name = "page", required = false) Integer page,
        @RequestParam(name = "size", required = false) Integer size,
        HttpServletRequest request
    ) {
        JobBoardService.ListQuery query = new JobBoardService.ListQuery(
            q, raw(request, "status"), ids(raw(request, "clientId")), raw(request, "location"), raw(request, "workMode"), raw(request, "skill"), raw(request, "employment"), raw(request, "experience"),
            minMatch, sort, dir, page, size
        );
        JobDTO.Page result = board.list(me, query);
        return ResponseEntity.ok().header("X-Total-Count", String.valueOf(result.total())).body(result);
    }

    @Operation(
        summary = "The KPI tiles and filter facets of the Jobs board",
        description = "Open Jobs, New This Week, Assigned Opportunities and High Match Jobs, each with the figure of the last period, the delta and an 8-week series (previous and delta are null when the organization has no history to compare with: never estimated); "
            + "plus the facets that fill the filter menus (status, client, location, work mode, job type, experience, skills) with their counts, and what the caller may do (access)."
    )
    @GetMapping("/summary")
    @OrgPermissionRequired
    public JobDTO.Summary summary(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return board.summary(me);
    }

    @Operation(
        summary = "One job: the detail drawer",
        description = "Facts, description, skills, client contact, every match with its score and status (Top Matches), the submissions (applications) and the activity (application events and audit rows). ETag = the version PATCH expects as If-Match. 404 for another tenant's id."
    )
    @GetMapping("/{jobId}")
    @OrgPermissionRequired
    public ResponseEntity<JobDTO.Detail> get(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long jobId) {
        return withEtag(board.detail(me, jobId));
    }

    @Operation(
        summary = "Create a job",
        description = "requirements.manage. Body: title (required), clientId (required, a client of this organization), contactId, description, location, workMode, employment, durationLabel, experienceLevel, rateMin, rateMax (whole currency units), rateUnit (HOUR or YEAR), positions, status (OPEN, IN_REVIEW or ON_HOLD; default OPEN), skills[] (at most 15). "
            + "An Idempotency-Key is required: the same key and body returns the first answer. Free text goes through the sensitive-data scanner (422). Audit JOB_CREATE."
    )
    @PostMapping
    @OrgPermissionRequired
    public ResponseEntity<JobDTO.Detail> create(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestHeader(value = "Idempotency-Key", required = false) String key,
        @RequestBody com.fasterxml.jackson.databind.JsonNode raw,
        HttpServletRequest request
    ) {
        demoGuard.assertNotDemo();
        JobDTO.CreateRequest body = strict(raw, JobDTO.CreateRequest.class);
        IdempotencyService.Outcome<JobDTO.Detail> out = idempotency.execute(me, key, true, "POST", request.getRequestURI(), body, 201, JobDTO.Detail.class, () -> write.create(me, body));
        ResponseEntity.BodyBuilder ok = ResponseEntity.status(out.status());
        if (out.replayed()) ok.header("Idempotent-Replayed", "true");
        if (out.body() != null) ok.eTag("\"" + out.body().version() + "\"");
        return ok.body(out.body());
    }

    @Operation(
        summary = "Edit a job (autosave)",
        description = "requirements.manage. Body: any of title, description, location, workMode, employment, durationLabel, experienceLevel, rateMin, rateMax, rateUnit, positions, filled, status, contactId, skills (a JSON null clears a clearable field); any other key is 422. "
            + "If-Match (the drawer's ETag) is required: 428 without, 412 when stale. A request that changes nothing writes no audit row. Audit JOB_STATUS (status) and JOB_UPDATE (the rest). Answers the new detail."
    )
    @PatchMapping("/{jobId}")
    @OrgPermissionRequired
    public ResponseEntity<JobDTO.Detail> patch(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long jobId,
        @RequestHeader(value = HttpHeaders.IF_MATCH, required = false) String ifMatch,
        @RequestBody Map<String, Object> body
    ) {
        demoGuard.assertNotDemo();
        return withEtag(write.patch(me, jobId, ifMatch, body));
    }

    @Operation(
        summary = "Change the status of several jobs",
        description = "requirements.manage. Body: ids[] (at most 100), status (OPEN, IN_REVIEW, ON_HOLD, FILLED or CLOSED). Jobs of another organization are skipped as NOT_FOUND; ones already in that status as UNCHANGED. Each result carries the previous status for an Undo. Idempotency-Key required. Audit JOB_STATUS per job and one JOB_BULK."
    )
    @PostMapping("/bulk/status")
    @OrgPermissionRequired
    public ResponseEntity<JobDTO.BulkResult> bulkStatus(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestHeader(value = "Idempotency-Key", required = false) String key,
        @RequestBody com.fasterxml.jackson.databind.JsonNode raw,
        HttpServletRequest request
    ) {
        demoGuard.assertNotDemo();
        JobDTO.BulkStatusRequest body = strict(raw, JobDTO.BulkStatusRequest.class);
        IdempotencyService.Outcome<JobDTO.BulkResult> out = idempotency.execute(me, key, true, "POST", request.getRequestURI(), body, 200, JobDTO.BulkResult.class, () -> write.bulkStatus(me, body));
        ResponseEntity.BodyBuilder ok = ResponseEntity.status(out.status());
        if (out.replayed()) ok.header("Idempotent-Replayed", "true");
        return ok.body(out.body());
    }

    @Operation(
        summary = "Assign a top-match consultant to the job",
        description = "opportunities.manage (at ASSIGNED scope only for consultants the caller markets). Opens an application in stage ASSIGNED (with its CREATED event), marks the match ASSIGNED. "
            + "Replaying it for an already assigned match answers the same application (alreadyAssigned = true) and changes nothing. 409 JOB_NOT_OPEN, MATCH_STATE (dismissed), CONSULTANT_UNAVAILABLE. Idempotency-Key optional. Audit JOB_ASSIGN."
    )
    @PostMapping("/{jobId}/matches/{matchId}/assign")
    @OrgPermissionRequired
    public ResponseEntity<JobDTO.AssignResult> assign(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long jobId,
        @PathVariable Long matchId,
        @RequestHeader(value = "Idempotency-Key", required = false) String key,
        HttpServletRequest request
    ) {
        demoGuard.assertNotDemo();
        IdempotencyService.Outcome<JobDTO.AssignResult> out = idempotency.execute(me, key, false, "POST", request.getRequestURI(), Map.of(), 200, JobDTO.AssignResult.class, () -> write.assign(me, jobId, matchId));
        ResponseEntity.BodyBuilder ok = ResponseEntity.status(out.status());
        if (out.replayed()) ok.header("Idempotent-Replayed", "true");
        return ok.body(out.body());
    }

    @Operation(
        summary = "Dismiss or restore a suggested match",
        description = "opportunities.manage. Body: status = DISMISSED or SUGGESTED (the Undo). 409 MATCH_STATE for an assigned match. Audit JOB_MATCH_DISMISS / JOB_MATCH_RESTORE. Answers the job detail."
    )
    @PatchMapping("/{jobId}/matches/{matchId}")
    @OrgPermissionRequired
    public ResponseEntity<JobDTO.Detail> matchStatus(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long jobId,
        @PathVariable Long matchId,
        @RequestBody com.fasterxml.jackson.databind.JsonNode raw
    ) {
        demoGuard.assertNotDemo();
        JobDTO.MatchRequest body = strict(raw, JobDTO.MatchRequest.class);
        if (body == null) throw OrgException.invalid("status", "DISMISSED or SUGGESTED");
        return withEtag(write.setMatchStatus(me, jobId, matchId, body.status()));
    }

    /** Binds a body and refuses any property the shape does not name (Spring's mapper ignores unknown ones, which would let {@code orgId} ride along silently). */
    private <T> T strict(com.fasterxml.jackson.databind.JsonNode raw, Class<T> type) {
        if (raw == null || raw.isNull()) throw OrgException.invalid("body", "is required");
        try {
            return mapper.readerFor(type).with(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES).readValue(raw);
        } catch (java.io.IOException e) {
            throw OrgException.invalid("body", "has a property or value this request does not accept");
        }
    }

    private static ResponseEntity<JobDTO.Detail> withEtag(JobDTO.Detail d) {
        return ResponseEntity.ok().eTag("\"" + d.version() + "\"").body(d);
    }

    /** The values of a repeatable query parameter, read raw (a comma inside a value, such as "New York, NY", is never a separator). */
    private static List<String> raw(HttpServletRequest request, String name) {
        String[] values = request.getParameterValues(name);
        return values == null ? List.of() : List.of(values);
    }

    private static List<Long> ids(List<String> values) {
        List<Long> out = new ArrayList<>();
        for (String v : values) {
            if (v == null || v.isBlank()) continue;
            try {
                out.add(Long.parseLong(v.trim()));
            } catch (NumberFormatException e) {
                throw OrgException.invalid("clientId", "must be a number");
            }
        }
        return out;
    }
}
