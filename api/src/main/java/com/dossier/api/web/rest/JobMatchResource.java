package com.dossier.api.web.rest;

import com.dossier.api.config.OpenApiConfiguration;
import com.dossier.api.service.JobMatchService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.Map;
import org.springframework.web.bind.annotation.*;

/**
 * Daily job matches, the user's switch (Phase 13.6b). {@code GET /api/profile/job-matches/settings}
 * returns {@code {enabled, lastRunAt, lastStatus, lastCandidates, lastMatched}};
 * {@code PUT} {@code {enabled}} switches matching on (Pro — 402 {@code PRO_REQUIRED} on Free — and
 * matches them straight away) or off.
 *
 * <p>13.6c, the Matches page: {@code GET /api/profile/job-matches} → {@code {setting, matches:[{id,
 * score, reason, title, company, location, workplaceType, employmentType, url, applyUrl, publishedAt,
 * ats}]}} (Pro); {@code POST /{id}/dismiss} hides one; {@code POST /{id}/save} puts it on the board
 * as a SAVED application and returns {@code {applicationId}}. 404 for someone else's match.
 */
@RestController
@RequestMapping("/api/profile/job-matches")
@Tag(name = "job-matches", description = "Daily job matches (Pro).")
@SecurityRequirement(name = OpenApiConfiguration.BEARER_JWT_SCHEME)
public class JobMatchResource {

    public record SettingVM(Boolean enabled) {}

    private final JobMatchService service;

    public JobMatchResource(JobMatchService service) {
        this.service = service;
    }

    @Operation(summary = "Today's matches and the switch")
    @GetMapping
    public JobMatchService.ListView list() {
        return service.myMatches();
    }

    @Operation(summary = "Hide a match")
    @PostMapping("/{id}/dismiss")
    public Map<String, Object> dismiss(@PathVariable Long id) {
        service.dismiss(id);
        return Map.of("ok", true);
    }

    @Operation(summary = "Save a match to the board", description = "Creates a SAVED application from the posting.")
    @PostMapping("/{id}/save")
    public Map<String, Object> save(@PathVariable Long id) {
        return Map.of("applicationId", service.save(id));
    }

    @Operation(summary = "Whether daily job matches are on, and what the last run did")
    @GetMapping("/settings")
    public JobMatchService.SettingView settings() {
        return service.mySetting();
    }

    @Operation(summary = "Switch daily job matches on or off", description = "On is Pro-only and matches straight away.")
    @PutMapping("/settings")
    public JobMatchService.SettingView setEnabled(@RequestBody SettingVM vm) {
        return service.setEnabled(Boolean.TRUE.equals(vm.enabled()));
    }
}
