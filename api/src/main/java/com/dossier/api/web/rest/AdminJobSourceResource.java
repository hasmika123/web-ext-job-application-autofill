package com.dossier.api.web.rest;

import com.dossier.api.repository.JobPostingRepository;
import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.JobMatchService;
import com.dossier.api.service.jobs.JobBoardProperties;
import com.dossier.api.service.jobs.JobIngestScheduler;
import com.dossier.api.service.jobs.JobIngestService;
import com.dossier.api.service.jobs.JobMatchScheduler;
import com.dossier.api.service.jobs.JobSourceService;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The job-board pool behind daily job matches (Phase 13.6a), ADMIN only.
 *
 * <ul>
 *   <li>{@code GET /api/admin/job-sources} — {@code {nightlyEnabled, running, lastRun, freshPostings,
 *       sources:[…]}}.</li>
 *   <li>{@code POST /api/admin/job-sources} {@code {ats, boardToken, companyName}} — add a board
 *       after a live check (400 bad input, 409 already there, 422 the board didn't answer).</li>
 *   <li>{@code PUT /api/admin/job-sources/{id}} {@code {enabled}} — switch a board on or off.</li>
 *   <li>{@code POST /api/admin/job-sources/run} — read every board now (async; 202, or 409 if a
 *       read is already going).</li>
 *   <li>{@code POST /api/admin/job-sources/match} — run daily matching for everyone who has it on
 *       (13.6b; async; users matched in the last 20 hours are skipped, so it never pays twice).</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/admin/job-sources")
@PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
public class AdminJobSourceResource {

    public record AddRequest(String ats, String boardToken, String companyName) {}

    public record EnabledRequest(Boolean enabled) {}

    private final JobSourceService sources;
    private final JobIngestService ingest;
    private final JobIngestScheduler scheduler;
    private final JobPostingRepository postings;
    private final JobBoardProperties props;
    private final JobMatchService matches;
    private final JobMatchScheduler matchScheduler;

    public AdminJobSourceResource(
        JobSourceService sources,
        JobIngestService ingest,
        JobIngestScheduler scheduler,
        JobPostingRepository postings,
        JobBoardProperties props,
        JobMatchService matches,
        JobMatchScheduler matchScheduler
    ) {
        this.sources = sources;
        this.ingest = ingest;
        this.scheduler = scheduler;
        this.postings = postings;
        this.props = props;
        this.matches = matches;
        this.matchScheduler = matchScheduler;
    }

    @GetMapping
    public Map<String, Object> list() {
        List<JobSourceService.SourceView> all = sources.list();
        Map<String, Object> body = new HashMap<>();
        body.put("nightlyEnabled", props.isEnabled());
        body.put("running", ingest.isRunning());
        body.put("lastRun", ingest.lastRun());
        body.put("freshPostings", postings.countByPublishedAtAfter(Instant.now().minus(Duration.ofHours(props.getFreshHours()))));
        body.put("matching", matches.isRunning());
        body.put("lastMatchRun", matches.lastRun());
        body.put("sources", all);
        return body;
    }

    @PostMapping
    public ResponseEntity<JobSourceService.SourceView> add(@RequestBody AddRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED).body(sources.add(req.ats(), req.boardToken(), req.companyName()));
    }

    @PutMapping("/{id}")
    public JobSourceService.SourceView setEnabled(@PathVariable Long id, @RequestBody EnabledRequest req) {
        return sources.setEnabled(id, req.enabled() == null || req.enabled());
    }

    @PostMapping("/run")
    public ResponseEntity<Map<String, Object>> run() {
        if (ingest.isRunning()) return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("running", true));
        scheduler.runNow();
        return ResponseEntity.accepted().body(Map.of("running", true));
    }

    @PostMapping("/match")
    public ResponseEntity<Map<String, Object>> match() {
        if (matches.isRunning()) return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("running", true));
        matchScheduler.runNow();
        return ResponseEntity.accepted().body(Map.of("running", true));
    }
}
