package com.dossier.api.web.rest;

import com.dossier.api.config.OpenApiConfiguration;
import com.dossier.api.service.ResumeMatchService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Size;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * Resume recommendation per job (Phase 13.2, Pro): which of my resumes fits this job best?
 *
 * <p>Two ways in, one answer: {@code POST /api/ai/resume-match} for the job the extension has on
 * screen, and {@code POST /api/profile/applications/{id}/resume-match} for a tracked application on
 * the board. Both return {@code {best, scores:[{resumeId,label,score,why}], cached, used, quota,
 * resetsAt}} — or a flag ({@code disabled}, {@code consentRequired}, {@code quotaExceeded},
 * {@code noResumes}, {@code noJobDescription}), 402 {@code PRO_REQUIRED}, or 502. {@code used} is
 * a percent of the month's AI, never dollars.
 */
@RestController
@RequestMapping("/api")
@Tag(name = "resume-match", description = "Score the user's resumes against a job description (Pro).")
@SecurityRequirement(name = OpenApiConfiguration.BEARER_JWT_SCHEME)
public class ResumeMatchResource {

    /** The job on screen. The description is capped server-side too; this only bounds the payload. */
    public record JobMatchVM(@Size(max = 20_000) String jobDescription, @Size(max = 300) String role, @Size(max = 300) String company, boolean consent) {}

    public record ApplicationMatchVM(boolean consent) {}

    private final ResumeMatchService service;

    public ResumeMatchResource(ResumeMatchService service) {
        this.service = service;
    }

    @Operation(summary = "Match my resumes to a job", description = "Scores every live resume against the posted job description.")
    @PostMapping("/ai/resume-match")
    public ResponseEntity<Map<String, Object>> matchJob(@RequestBody JobMatchVM vm) {
        return toResponse(service.matchJob(vm.jobDescription(), vm.role(), vm.company(), vm.consent()));
    }

    @Operation(summary = "Match my resumes to a tracked application", description = "Scores every live resume against the application's job description.")
    @PostMapping("/profile/applications/{id}/resume-match")
    public ResponseEntity<Map<String, Object>> matchApplication(@PathVariable Long id, @RequestBody(required = false) ApplicationMatchVM vm) {
        return toResponse(service.matchApplication(id, vm != null && vm.consent()));
    }

    private static ResponseEntity<Map<String, Object>> toResponse(ResumeMatchService.Result r) {
        Map<String, Object> body = new LinkedHashMap<>();
        switch (r.status()) {
            case OK -> {
                body.put("best", scoreMap(r.best()));
                body.put("scores", r.scores().stream().map(ResumeMatchResource::scoreMap).toList());
                body.put("cached", r.cached());
            }
            case DISABLED -> body.put("disabled", true);
            case CONSENT_REQUIRED -> body.put("consentRequired", true);
            case QUOTA_EXCEEDED -> body.put("quotaExceeded", true);
            case NO_RESUMES -> body.put("noResumes", true);
            case NO_JOB_DESCRIPTION -> body.put("noJobDescription", true);
            default -> {
                body.put("error", "Couldn't score your resumes right now.");
                return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(body);
            }
        }
        if (r.resetsAt() != null) {
            body.put("used", r.used());
            body.put("quota", r.quota());
            body.put("resetsAt", r.resetsAt().toString());
        }
        return ResponseEntity.ok(body);
    }

    private static Map<String, Object> scoreMap(ResumeMatchService.Score s) {
        if (s == null) return null;
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("resumeId", s.resumeId());
        m.put("label", s.label());
        m.put("score", s.score());
        m.put("why", s.why());
        return m;
    }
}
