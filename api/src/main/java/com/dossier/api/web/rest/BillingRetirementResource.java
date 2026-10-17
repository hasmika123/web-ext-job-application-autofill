package com.dossier.api.web.rest;

import com.dossier.api.config.OpenApiConfiguration;
import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.BillingException;
import com.dossier.api.service.DemoGuard;
import com.dossier.api.service.retirement.RetirementChoiceService;
import com.dossier.api.service.retirement.dto.CustomerRetirementDTOs.ChoiceRequest;
import com.dossier.api.service.retirement.dto.CustomerRetirementDTOs.ChoiceResultDTO;
import com.dossier.api.service.retirement.dto.CustomerRetirementDTOs.RetirementMeDTO;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * "Your plan is changing", from the subscriber's side (docs/subscriptions/11-plan-retirement.md sections 6 and 12; story K10.4). Personal accounts only: an enterprise
 * account gets the generic 404. {@code GET /me} answers what is changing, the date, what the subscriber uses, the closest match with its real quote and the services that
 * would lock on Free; {@code POST /me/choice} applies one choice and needs an {@code Idempotency-Key} (a UUID). Nothing here lets anyone pay more without asking for it,
 * and nothing deletes anything.
 */
@RestController
@RequestMapping("/api/billing/retirement")
@Tag(name = "billing", description = "The current user's plan. Stripe is the source of truth; this reads our mirror of it.")
@SecurityRequirement(name = OpenApiConfiguration.BEARER_JWT_SCHEME)
public class BillingRetirementResource {

    private final RetirementChoiceService choices;
    private final DemoGuard demoGuard;

    public BillingRetirementResource(RetirementChoiceService choices, DemoGuard demoGuard) {
        this.choices = choices;
        this.demoGuard = demoGuard;
    }

    @Operation(
        summary = "My plan is changing",
        description = "The retirement that concerns the signed-in account: its date, what they use, the closest match (with a real RETIREMENT_SWITCH quote), the other options, the services that would lock on Free, "
            + "the last choice, and after a fallback the services that are read-only now. 404 NO_RETIREMENT when nothing applies."
    )
    @GetMapping("/me")
    public ResponseEntity<RetirementMeDTO> me() {
        return ResponseEntity.ok(choices.me(login()));
    }

    @Operation(
        summary = "Choose",
        description = "kind SWITCH_NOW, SWITCH_AT_RENEWAL, PICK, LATER or CANCEL. Needs an Idempotency-Key header (a UUID): the same key returns the same result. A higher price takes effect now only with SWITCH_NOW (prorated); "
            + "an equal or lower price is applied on the effective date; CANCEL keeps the plan to the end of the paid period; the last confirmed choice replaces the earlier scheduled one. "
            + "Errors: 400 IDEMPOTENCY_KEY_REQUIRED, 404 NO_RETIREMENT, 409 CANCEL_PENDING / QUOTE_STALE / IDEMPOTENCY_KEY_REUSED, 410 QUOTE_EXPIRED, 422 INVALID_CHOICE / SUCCESSOR_NOT_AVAILABLE / INTERVAL_NOT_AVAILABLE, 502 STRIPE_ERROR, 503 BILLING_DISABLED."
    )
    @PostMapping("/me/choice")
    public ResponseEntity<ChoiceResultDTO> choose(@RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey, @RequestBody ChoiceRequest body) {
        demoGuard.assertNotDemo();
        return ResponseEntity.ok(choices.choose(login(), idempotencyKey, body));
    }

    private static String login() {
        return SecurityUtils.getCurrentUserLogin().orElseThrow(() -> new BillingException(401, "UNAUTHENTICATED", "Sign in to continue"));
    }
}
