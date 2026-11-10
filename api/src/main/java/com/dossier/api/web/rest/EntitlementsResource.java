package com.dossier.api.web.rest;

import com.dossier.api.config.OpenApiConfiguration;
import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.BillingException;
import com.dossier.api.service.billing.personal.PersonalEntitlementService;
import com.dossier.api.service.dto.EntitlementSetDTO;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * What the signed-in personal account may use (docs/subscriptions/09-apis.md section 3.4; story K5.7). Read-only and never a reservation: the gates of the
 * product still ask {@code EntitlementService}; this tells the UI what to show. An enterprise token gets the generic 404.
 */
@RestController
@RequestMapping("/api/entitlements")
@Tag(name = "billing", description = "The current user's plan. Stripe is the source of truth; this reads our mirror of it.")
@SecurityRequirement(name = OpenApiConfiguration.BEARER_JWT_SCHEME)
public class EntitlementsResource {

    private final PersonalEntitlementService entitlements;

    public EntitlementsResource(PersonalEntitlementService entitlements) {
        this.entitlements = entitlements;
    }

    @Operation(summary = "My entitlements", description = "The plan, period and the features (included in the plan or bought as add-ons) of the signed-in personal account.")
    @GetMapping("/me")
    public ResponseEntity<EntitlementSetDTO> me() {
        return ResponseEntity.ok(entitlements.me(login()));
    }

    @Operation(summary = "Would this feature be allowed", description = "A UI hint {allowed, reasonCode, details, upgrade?}; it never reserves or consumes anything.")
    @GetMapping("/check")
    public ResponseEntity<EntitlementSetDTO.Check> check(@RequestParam("feature") String feature) {
        return ResponseEntity.ok(entitlements.check(login(), feature));
    }

    private static String login() {
        return SecurityUtils.getCurrentUserLogin().orElseThrow(() -> new BillingException(401, "UNAUTHENTICATED", "Sign in to continue"));
    }
}
