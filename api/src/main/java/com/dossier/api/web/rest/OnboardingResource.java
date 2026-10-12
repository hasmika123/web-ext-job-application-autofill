package com.dossier.api.web.rest;

import com.dossier.api.config.OpenApiConfiguration;
import com.dossier.api.service.DemoGuard;
import com.dossier.api.service.dto.OnboardingDTOs.DraftRequest;
import com.dossier.api.service.dto.OnboardingDTOs.DraftSavedDTO;
import com.dossier.api.service.dto.OnboardingDTOs.FinishDTO;
import com.dossier.api.service.dto.OnboardingDTOs.PatchRequest;
import com.dossier.api.service.dto.OnboardingDTOs.StatusDTO;
import com.dossier.api.service.onboarding.OnboardingService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * Onboarding v2 (R1.8, ONBOARDING-V2-DESIGN 9): the resumable setup draft, the persona and card markers, and
 * finish, under {@code /api/profile/onboarding}. Everything belongs to the signed-in user (no ids in any path).
 * Writes are refused for the shared demo logins ({@link DemoGuard}); the status {@code GET} is not.
 *
 * <p>Refusals carry a {@code code}: 409 {@code DRAFT_CONFLICT {serverUpdatedAt}}, 413 {@code DRAFT_TOO_LARGE {max}},
 * 422 {@code DRAFT_INVALID {path}}, 422 {@code SENSITIVE_CONTENT {path, class}} (a value the product never collects),
 * 422 {@code PERSONA_INVALID}.
 */
@RestController
@RequestMapping("/api/profile/onboarding")
@Tag(name = "onboarding", description = "Onboarding v2: resumable setup draft, persona, dashboard card, finish.")
@SecurityRequirement(name = OpenApiConfiguration.BEARER_JWT_SCHEME)
public class OnboardingResource {

    private static final Logger LOG = LoggerFactory.getLogger(OnboardingResource.class);

    private final OnboardingService onboardingService;
    private final DemoGuard demoGuard;

    public OnboardingResource(OnboardingService onboardingService, DemoGuard demoGuard) {
        this.onboardingService = onboardingService;
        this.demoGuard = demoGuard;
    }

    @Operation(
        summary = "Onboarding status",
        description = "NONE / DRAFT / FINISHED, the persona, the draft summary (its state only with ?include=state), the dashboard card decision and the completeness thresholds. A dismissed card that comes back is counted once per showing."
    )
    @GetMapping
    public StatusDTO status(@RequestParam(name = "include", required = false) String include) {
        LOG.debug("REST request for the onboarding status");
        return onboardingService.status("state".equals(include));
    }

    @Operation(
        summary = "Save the setup draft",
        description = "Upsert. 409 DRAFT_CONFLICT when another device saved since baseUpdatedAt (force overrides), 413 DRAFT_TOO_LARGE, 422 DRAFT_INVALID, 422 SENSITIVE_CONTENT. Never touches the profile or the extension's version."
    )
    @PutMapping("/draft")
    public DraftSavedDTO putDraft(@RequestBody DraftRequest body) {
        demoGuard.assertNotDemo();
        LOG.debug("REST request to save the onboarding draft");
        return onboardingService.putDraft(body);
    }

    @Operation(summary = "Start over", description = "Deletes the draft. The persona and everything already confirmed in the profile stay.")
    @DeleteMapping("/draft")
    public ResponseEntity<Void> deleteDraft() {
        demoGuard.assertNotDemo();
        LOG.debug("REST request to delete the onboarding draft");
        onboardingService.deleteDraft();
        return ResponseEntity.noContent().build();
    }

    @Operation(
        summary = "Set the persona / act on the dashboard card",
        description = "persona: a string sets it, null clears it, absent leaves it (422 PERSONA_INVALID). card.action: SNOOZE, DISMISS or RESET."
    )
    @PatchMapping
    public StatusDTO patch(@RequestBody PatchRequest body) {
        demoGuard.assertNotDemo();
        LOG.debug("REST request to patch the onboarding markers");
        return onboardingService.patch(body);
    }

    @Operation(
        summary = "Finish setup",
        description = "Idempotent. Stamps finishedAt, writes onboardedAt when blank, deletes the draft, and returns the completeness and the honest autofill field count."
    )
    @PostMapping("/finish")
    public FinishDTO finish() {
        demoGuard.assertNotDemo();
        LOG.debug("REST request to finish onboarding");
        return onboardingService.finish();
    }
}
