package com.dossier.api.web.rest;

import com.dossier.api.config.OpenApiConfiguration;
import com.dossier.api.service.BillingService;
import com.dossier.api.service.EntitlementService;
import com.dossier.api.service.dto.PlanDTO;
import java.util.Map;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Billing, from the signed-in user's point of view (Phase 12).
 *
 * <p>Reading the plan, starting a checkout, and opening the billing portal. None of these ever
 * writes subscription state — that belongs solely to the webhook ({@code BillingWebhookResource}),
 * because anything reachable from a browser can be skipped, replayed or forged.
 */
@RestController
@RequestMapping("/api/billing")
@Tag(name = "billing", description = "The current user's plan. Stripe is the source of truth; this reads our mirror of it.")
@SecurityRequirement(name = OpenApiConfiguration.BEARER_JWT_SCHEME)
public class BillingResource {

    private static final Logger LOG = LoggerFactory.getLogger(BillingResource.class);

    private final EntitlementService entitlementService;
    private final BillingService billingService;

    public BillingResource(EntitlementService entitlementService, BillingService billingService) {
        this.entitlementService = entitlementService;
        this.billingService = billingService;
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

    /**
     * {@code POST /api/billing/checkout} : start a hosted Stripe Checkout and return {@code {url}}.
     *
     * <p>Returning a URL rather than redirecting keeps the caller in control — the web app opens
     * it, and a 409/503 is a JSON body the UI can act on instead of a redirect into an error page.
     * This does <b>not</b> make anyone Pro; only the webhook does that.
     */
    @Operation(summary = "Start checkout", description = "Creates a Stripe Checkout Session for the chosen plan and returns its URL.")
    @PostMapping("/checkout")
    public ResponseEntity<Map<String, String>> checkout(@RequestBody CheckoutRequest body) {
        LOG.debug("REST request to start checkout for plan {}", body == null ? null : body.plan());
        String url = billingService.startCheckout(body == null ? null : body.plan());
        return ResponseEntity.ok(Map.of("url", url));
    }

    /**
     * {@code POST /api/billing/portal} : open the Stripe Billing Portal and return {@code {url}}.
     * This is the click-to-cancel path; 404 when the user has never checked out.
     */
    @Operation(summary = "Open the billing portal", description = "Creates a Stripe Billing Portal session and returns its URL.")
    @PostMapping("/portal")
    public ResponseEntity<Map<String, String>> portal() {
        LOG.debug("REST request to open the billing portal");
        return ResponseEntity.ok(Map.of("url", billingService.openPortal()));
    }

    /** Request body for checkout. {@code plan} is {@code monthly} or {@code 3mo}. */
    public record CheckoutRequest(String plan) {}
}
