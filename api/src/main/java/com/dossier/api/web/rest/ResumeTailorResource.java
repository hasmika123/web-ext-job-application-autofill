package com.dossier.api.web.rest;

import com.dossier.api.config.OpenApiConfiguration;
import com.dossier.api.service.ResumeTailorService;
import com.dossier.api.service.dto.ResumeDTO;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Size;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * Resume tailoring (Phase 13.4, Pro): reword a resume for one tracked application's job, then save
 * the kept changes as a NEW resume.
 *
 * <p>{@code POST /api/profile/applications/{id}/tailor} {@code {resumeId, consent}} returns a checked
 * proposal: {@code {proposal:{proposalId, resumeId, label, changes:[{ref, section, before, after}],
 * suggestions}, cached, used, quota, resetsAt}} — or a flag ({@code disabled}, {@code consentRequired},
 * {@code quotaExceeded}, {@code noResume}, {@code noJobDescription}, {@code nothingToChange}),
 * 402 {@code PRO_REQUIRED}, 404, or 502. {@code POST /api/profile/tailor/{proposalId}/apply}
 * {@code {keep:[refs], label, applicationId}} saves it and returns {@code {resumeId, label}} — the
 * client names refs, never text (409 if the source resume changed since).
 */
@RestController
@RequestMapping("/api/profile")
@Tag(name = "resume-tailor", description = "Reword a resume for one job and save it as a new version (Pro).")
@SecurityRequirement(name = OpenApiConfiguration.BEARER_JWT_SCHEME)
public class ResumeTailorResource {

    public record ProposeVM(Long resumeId, boolean consent) {}

    public record ApplyVM(@Size(max = 60) List<@Size(max = 20) String> keep, @Size(max = 200) String label, Long applicationId) {}

    private final ResumeTailorService service;

    public ResumeTailorResource(ResumeTailorService service) {
        this.service = service;
    }

    @Operation(summary = "Propose a tailored version", description = "Rewrites of existing bullets and summary, checked for truthfulness.")
    @PostMapping("/applications/{id}/tailor")
    public ResponseEntity<Map<String, Object>> propose(@PathVariable Long id, @RequestBody ProposeVM vm) {
        ResumeTailorService.Result r = service.proposeForApplication(id, vm.resumeId(), vm.consent());
        Map<String, Object> body = new LinkedHashMap<>();
        switch (r.status()) {
            case OK -> {
                body.put("proposal", r.proposal());
                body.put("cached", r.cached());
            }
            case NOTHING_TO_CHANGE -> {
                body.put("nothingToChange", true);
                body.put("proposal", r.proposal());
            }
            case DISABLED -> body.put("disabled", true);
            case CONSENT_REQUIRED -> body.put("consentRequired", true);
            case QUOTA_EXCEEDED -> body.put("quotaExceeded", true);
            case NO_RESUME -> body.put("noResume", true);
            case NO_JOB_DESCRIPTION -> body.put("noJobDescription", true);
            default -> {
                body.put("error", "Couldn't tailor the resume right now.");
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

    @Operation(summary = "Save a tailored version", description = "Builds a NEW resume from the stored proposal, keeping the named changes.")
    @PostMapping("/tailor/{proposalId}/apply")
    public ResponseEntity<Map<String, Object>> apply(@PathVariable Long proposalId, @RequestBody ApplyVM vm) {
        ResumeDTO created = service.apply(proposalId, vm.keep(), vm.label(), vm.applicationId());
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("resumeId", created.getId());
        body.put("label", created.getLabel());
        return ResponseEntity.status(HttpStatus.CREATED).body(body);
    }
}
