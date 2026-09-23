package com.dossier.api.web.rest;

import com.dossier.api.config.OpenApiConfiguration;
import com.dossier.api.service.JobFitService;
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
 * The job-fit panel (Phase 13.3, Pro): one resume against one job — match %, the requirements it
 * shows and the ones it's missing, and red flags.
 *
 * <p>{@code POST /api/ai/job-fit} for the job the extension has on screen (a server resume id), and
 * {@code POST /api/profile/applications/{id}/job-fit} for a tracked application (resume optional —
 * the linked one, else the default). Both return {@code {fit:{resumeId,label,score,summary,matched,
 * missing,redFlags}, cached, used, quota, resetsAt}} or a flag ({@code disabled},
 * {@code consentRequired}, {@code quotaExceeded}, {@code noResume}, {@code noJobDescription}),
 * 402 {@code PRO_REQUIRED}, 404 for someone else's resume or application, or 502.
 */
@RestController
@RequestMapping("/api")
@Tag(name = "job-fit", description = "One resume against one job: match, missing keywords, red flags (Pro).")
@SecurityRequirement(name = OpenApiConfiguration.BEARER_JWT_SCHEME)
public class JobFitResource {

    public record JobFitVM(
        Long resumeId,
        @Size(max = 20_000) String jobDescription,
        @Size(max = 300) String role,
        @Size(max = 300) String company,
        boolean consent
    ) {}

    public record ApplicationFitVM(Long resumeId, boolean consent) {}

    private final JobFitService service;

    public JobFitResource(JobFitService service) {
        this.service = service;
    }

    @Operation(summary = "Check one resume against a job", description = "Match %, matched and missing requirements, and red flags.")
    @PostMapping("/ai/job-fit")
    public ResponseEntity<Map<String, Object>> fitJob(@RequestBody JobFitVM vm) {
        return toResponse(service.fitJob(vm.resumeId(), vm.jobDescription(), vm.role(), vm.company(), vm.consent()));
    }

    @Operation(summary = "Check a resume against a tracked application", description = "Uses the linked resume when none is named.")
    @PostMapping("/profile/applications/{id}/job-fit")
    public ResponseEntity<Map<String, Object>> fitApplication(@PathVariable Long id, @RequestBody(required = false) ApplicationFitVM vm) {
        return toResponse(service.fitApplication(id, vm == null ? null : vm.resumeId(), vm != null && vm.consent()));
    }

    private static ResponseEntity<Map<String, Object>> toResponse(JobFitService.Result r) {
        Map<String, Object> body = new LinkedHashMap<>();
        switch (r.status()) {
            case OK -> {
                body.put("fit", r.fit());
                body.put("cached", r.cached());
            }
            case DISABLED -> body.put("disabled", true);
            case CONSENT_REQUIRED -> body.put("consentRequired", true);
            case QUOTA_EXCEEDED -> body.put("quotaExceeded", true);
            case NO_RESUME -> body.put("noResume", true);
            case NO_JOB_DESCRIPTION -> body.put("noJobDescription", true);
            default -> {
                body.put("error", "Couldn't check the fit right now.");
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
}
