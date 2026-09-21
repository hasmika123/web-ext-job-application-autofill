package com.dossier.api.web.rest;

import com.dossier.api.service.billing.BillingWebhookService;
import com.dossier.api.service.billing.StripeGateway;
import com.dossier.api.service.billing.StripeGatewayException;
import com.dossier.api.service.billing.StripeWebhookEvent;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The Stripe webhook (Phase 12.2) — the only endpoint that writes subscription state.
 *
 * <p>Unauthenticated by necessity: Stripe has no session with us. The signature is what
 * authenticates a delivery, so the {@code Stripe-Signature} check is not a formality — it is the
 * only thing between this endpoint and anyone on the internet posting fake billing events.
 *
 * <p>The body is taken as a raw {@code String}, not a parsed DTO: the signature is computed over
 * the exact bytes Stripe sent, so deserialising and re-serialising would break verification.
 *
 * <p>Status codes are chosen for Stripe's retry behaviour, not for a browser:
 * <ul>
 *   <li><b>200</b> — applied, or a duplicate we already handled. Stop retrying.
 *   <li><b>400</b> — the signature didn't verify. Retrying won't help, and nothing is recorded.
 *   <li><b>500</b> — we failed to apply a legitimate event. <b>Please retry</b>; the event is
 *       recorded as {@code failed} so it can be found afterwards.
 * </ul>
 */
@RestController
@RequestMapping("/api/billing")
@Tag(name = "billing-webhook", description = "Stripe webhook receiver. Authenticated by signature, not by session.")
public class BillingWebhookResource {

    private static final Logger LOG = LoggerFactory.getLogger(BillingWebhookResource.class);

    private final StripeGateway stripeGateway;
    private final BillingWebhookService webhookService;

    public BillingWebhookResource(StripeGateway stripeGateway, BillingWebhookService webhookService) {
        this.stripeGateway = stripeGateway;
        this.webhookService = webhookService;
    }

    @Operation(
        summary = "Stripe webhook",
        description = "Receives Stripe events. Verified by signature; 400 when it doesn't match, 500 to ask Stripe to retry."
    )
    @PostMapping("/webhook")
    public ResponseEntity<String> receive(
        @RequestBody String payload,
        @RequestHeader(value = "Stripe-Signature", required = false) String signature
    ) {
        StripeWebhookEvent event;
        try {
            event = stripeGateway.constructEvent(payload, signature);
        } catch (StripeGatewayException e) {
            // Also covers "no webhook secret configured" — on a server without billing set up,
            // an unverifiable delivery is simply rejected. Nothing is recorded either way.
            LOG.warn("Rejected a Stripe webhook delivery: {}", e.getMessage());
            return ResponseEntity.badRequest().body("invalid signature");
        }

        // Anything thrown from here is a real failure: it propagates so the response is 500 and
        // Stripe retries. The event row is already marked `failed` by the service.
        BillingWebhookService.Outcome outcome = webhookService.handle(event);
        return ResponseEntity.status(HttpStatus.OK).body(outcome == BillingWebhookService.Outcome.DUPLICATE ? "duplicate" : "ok");
    }
}
