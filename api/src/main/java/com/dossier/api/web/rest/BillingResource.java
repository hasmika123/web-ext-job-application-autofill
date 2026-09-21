package com.dossier.api.web.rest;

import com.dossier.api.config.OpenApiConfiguration;
import com.dossier.api.service.EntitlementService;
import com.dossier.api.service.dto.PlanDTO;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Billing, from the signed-in user's point of view (Phase 12).
 *
 * <p>12.1 ships only the read: {@code GET /api/billing/me}. Checkout and the portal arrive in
 * 12.3, and the webhook — the only thing that ever <i>writes</i> subscription state — in 12.2.
 */
@RestController
@RequestMapping("/api/billing")
@Tag(name = "billing", description = "The current user's plan. Stripe is the source of truth; this reads our mirror of it.")
@SecurityRequirement(name = OpenApiConfiguration.BEARER_JWT_SCHEME)
public class BillingResource {

    private static final Logger LOG = LoggerFactory.getLogger(BillingResource.class);

    private final EntitlementService entitlementService;

    public BillingResource(EntitlementService entitlementService) {
        this.entitlementService = entitlementService;
    }

    /**
     * {@code GET /api/billing/me} : the current user's plan.
     *
     * <p>Never 404s and never errors for a user who has never paid — they are simply
     * {@code FREE}/{@code none}. {@code billingEnabled=false} means this server has no Stripe
     * key, which clients render as "coming soon" rather than a failure.
     */
    @Operation(summary = "Get my plan", description = "Plan, status, renewal date and whether billing is configured. Free when there's no subscription.")
    @GetMapping("/me")
    public ResponseEntity<PlanDTO> myPlan() {
        LOG.debug("REST request to get the current user's plan");
        return ResponseEntity.ok(entitlementService.currentUserPlan());
    }
}
