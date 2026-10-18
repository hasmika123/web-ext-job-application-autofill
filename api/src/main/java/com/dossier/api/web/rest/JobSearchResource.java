package com.dossier.api.web.rest;

import com.dossier.api.config.OpenApiConfiguration;
import com.dossier.api.service.dto.JobDTOs.FeedbackRequest;
import com.dossier.api.service.dto.JobDTOs.FeedbackResult;
import com.dossier.api.service.dto.JobDTOs.JobDetail;
import com.dossier.api.service.dto.JobDTOs.JobSearchPage;
import com.dossier.api.service.jobs.JobSearchService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * Job search over the posting store (E2E-U4.0): the postings the nightly board read keeps (Greenhouse, Lever, Ashby
 * public job-board APIs). Free and Pro alike; everything is scoped to the signed-in user (what they hid, what they
 * saved). Refusals carry a {@code code}: 400 {@code SORT_INVALID} / {@code QUERY_TOO_LONG}, 422 {@code JOB_SEARCH_INVALID
 * {path, message}}, 410 {@code JOB_GONE}; an unknown posting is a 404.
 */
@RestController
@RequestMapping("/api/jobs")
@Tag(name = "job-search", description = "Search the job postings we keep; save or hide one.")
@SecurityRequirement(name = OpenApiConfiguration.BEARER_JWT_SCHEME)
public class JobSearchResource {

    private final JobSearchService service;

    public JobSearchResource(JobSearchService service) {
        this.service = service;
    }

    @Operation(
        summary = "Search jobs",
        description = "q (words AND-ed, \"quoted phrases\", -exclude), loc, remote (ANY|REMOTE|HYBRID|ONSITE), type (CSV of FULL_TIME|PART_TIME|CONTRACT|INTERNSHIP), " +
        "posted (days; one of the jobs.search.postedDays setting), company (prefix), sort (best|newest), page, size (capped by jobs.search.maxSize). " +
        "Answers {items, total, page, size, capped, tookMs, facets{remote, type, postedBuckets}, suggestions[{label, params, total}]}; Pro cards carry the nightly match. " +
        "Never lists a job the user hid or applied to. explain=1 adds each result's ranking terms for an admin."
    )
    @GetMapping("/search")
    public JobSearchPage search(
        @RequestParam(name = "q", required = false) String q,
        @RequestParam(name = "loc", required = false) String loc,
        @RequestParam(name = "remote", required = false) String remote,
        @RequestParam(name = "type", required = false) String type,
        @RequestParam(name = "posted", required = false) Integer posted,
        @RequestParam(name = "company", required = false) String company,
        @RequestParam(name = "sort", required = false) String sort,
        @RequestParam(name = "page", required = false) Integer page,
        @RequestParam(name = "size", required = false) Integer size,
        @RequestParam(name = "explain", required = false) String explain
    ) {
        boolean wantExplain = "1".equals(explain) || "true".equalsIgnoreCase(explain);
        return service.search(new JobSearchService.Request(q, loc, remote, type, posted, company, sort, page, size, wantExplain));
    }

    @Operation(summary = "Job title suggestions", description = "Up to jobs.suggest.max distinct titles starting with (or having a word starting with) q; empty under jobs.suggest.minChars letters.")
    @GetMapping("/suggest")
    public List<String> suggest(@RequestParam(name = "q", required = false) String q) {
        return service.suggest(q);
    }

    @Operation(summary = "One job", description = "The card plus the description (plain text), links, how many other postings that company has and similar jobs. 404 unknown; 410 when it was tracked and has been purged.")
    @GetMapping("/{id}")
    public JobDetail get(@PathVariable("id") Long id) {
        return service.detail(id);
    }

    @Operation(summary = "Save a job to the board", description = "Creates (or updates, by the board's dedup) a SAVED application from the stored posting. Returns {applicationId}.")
    @PostMapping("/{id}/save")
    public Map<String, Object> save(@PathVariable("id") Long id) {
        return Map.of("applicationId", service.save(id));
    }

    @Operation(
        summary = "Hide a job or a company",
        description = "{signal: HIDE|HIDE_COMPANY}. The job (or every job of that company) stops showing in the user's search; hiding a saved job archives its application (archivedApplicationId, for Undo)."
    )
    @PostMapping("/{id}/feedback")
    public ResponseEntity<FeedbackResult> hide(@PathVariable("id") Long id, @RequestBody FeedbackRequest body) {
        return ResponseEntity.status(201).body(service.hide(id, body == null ? null : body.signal()));
    }

    @Operation(summary = "Undo a hide", description = "Removes the HIDE / HIDE_COMPANY signal (a company hide lifts every job of that company). Quietly succeeds when there is none.")
    @DeleteMapping("/{id}/feedback/{signal}")
    public ResponseEntity<Void> unhide(@PathVariable("id") Long id, @PathVariable("signal") String signal) {
        service.unhide(id, signal);
        return ResponseEntity.noContent().build();
    }
}
