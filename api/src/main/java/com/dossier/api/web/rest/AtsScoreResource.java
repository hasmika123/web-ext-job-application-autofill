package com.dossier.api.web.rest;

import com.dossier.api.config.OpenApiConfiguration;
import com.dossier.api.service.AtsScoreService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

/**
 * The ATS resume score (Phase 13.5, Pro). {@code GET /api/profile/resumes/{id}/ats-score} scores a
 * resume's structure (no AI); {@code POST /api/profile/applications/{id}/ats-score}
 * {@code {resumeId, consent}} adds keyword coverage against that application's job, from its cached
 * job-fit report. Both return {@code {resumeId, label, score, passed, total, checks:[{id, label,
 * passed, weight, detail}], keywords:{covered, missing, coveragePercent, missingTerms}|null, jobNote}};
 * 402 {@code PRO_REQUIRED} on Free, 404 for someone else's resume or application.
 */
@RestController
@RequestMapping("/api/profile")
@Tag(name = "ats-score", description = "ATS resume score: structure checks, plus keyword coverage for a job (Pro).")
@SecurityRequirement(name = OpenApiConfiguration.BEARER_JWT_SCHEME)
public class AtsScoreResource {

    public record ApplicationScoreVM(Long resumeId, boolean consent) {}

    private final AtsScoreService service;

    public AtsScoreResource(AtsScoreService service) {
        this.service = service;
    }

    @Operation(summary = "Score a resume", description = "Fifteen structure checks; no AI.")
    @GetMapping("/resumes/{id}/ats-score")
    public AtsScoreService.Report forResume(@PathVariable Long id) {
        return service.forResume(id);
    }

    @Operation(summary = "Score a resume against an application's job", description = "Structure checks plus keyword coverage.")
    @PostMapping("/applications/{id}/ats-score")
    public AtsScoreService.Report forApplication(@PathVariable Long id, @RequestBody ApplicationScoreVM vm) {
        return service.forApplication(id, vm.resumeId(), vm.consent());
    }
}
