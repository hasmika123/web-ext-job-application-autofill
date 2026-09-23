package com.dossier.api.web.rest;

import com.dossier.api.config.OpenApiConfiguration;
import com.dossier.api.service.JobMatchService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

/**
 * Daily job matches, the user's switch (Phase 13.6b). {@code GET /api/profile/job-matches/settings}
 * returns {@code {enabled, lastRunAt, lastStatus, lastCandidates, lastMatched}};
 * {@code PUT} {@code {enabled}} switches matching on (Pro — 402 {@code PRO_REQUIRED} on Free — and
 * matches them straight away) or off. The list itself arrives with 13.6c.
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
