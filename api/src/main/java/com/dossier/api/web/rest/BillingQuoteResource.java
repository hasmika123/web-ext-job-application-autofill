package com.dossier.api.web.rest;

import com.dossier.api.config.OpenApiConfiguration;
import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.BillingException;
import com.dossier.api.service.DemoGuard;
import com.dossier.api.service.billing.personal.PersonalInvoiceService;
import com.dossier.api.service.billing.personal.PersonalQuoteService;
import com.dossier.api.service.billing.personal.QuoteCheckoutService;
import com.dossier.api.service.billing.personal.QuoteConfirmService;
import com.dossier.api.service.billing.personal.QuoteRequest;
import com.dossier.api.service.billing.personal.SubscriptionChangeService;
import com.dossier.api.service.dto.ChangeBatchDTO;
import com.dossier.api.service.dto.InvoiceDTO;
import com.dossier.api.service.dto.PlanQuoteDTO;
import com.dossier.api.web.filter.QuoteRateLimiter;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Personal quotes, checkout from a quote, confirmed changes and invoices (docs/subscriptions/09-apis.md section 3; stories K3.3, K5.3, K5.4, K5.7). Like
 * {@link BillingResource} nothing here writes the subscription mirror: checkout only sends the person to Stripe, a confirm records the change and tells Stripe,
 * and the webhook is still the only thing that writes {@code subscription}. {@code POST /api/billing/quotes} is public (the pricing page prices a basket
 * without an account, 30 requests a minute per IP); every other route needs a signed-in personal account (an enterprise token gets the generic 404).
 */
@RestController
@RequestMapping("/api/billing")
@Tag(name = "billing", description = "The current user's plan. Stripe is the source of truth; this reads our mirror of it.")
@SecurityRequirement(name = OpenApiConfiguration.BEARER_JWT_SCHEME)
public class BillingQuoteResource {

    private final PersonalQuoteService quotes;
    private final QuoteCheckoutService checkout;
    private final QuoteConfirmService confirm;
    private final SubscriptionChangeService changes;
    private final PersonalInvoiceService invoices;
    private final QuoteRateLimiter rateLimiter;
    private final DemoGuard demoGuard;

    public BillingQuoteResource(
        PersonalQuoteService quotes,
        QuoteCheckoutService checkout,
        QuoteConfirmService confirm,
        SubscriptionChangeService changes,
        PersonalInvoiceService invoices,
        QuoteRateLimiter rateLimiter,
        DemoGuard demoGuard
    ) {
        this.quotes = quotes;
        this.checkout = checkout;
        this.confirm = confirm;
        this.changes = changes;
        this.invoices = invoices;
        this.rateLimiter = rateLimiter;
        this.demoGuard = demoGuard;
    }

    /** {@code POST /api/billing/quotes} : price a basket and keep it for the checkout or the change that follows. */
    @Operation(
        summary = "Price a basket",
        description = "CHECKOUT (a new subscription), CHANGE (add-ons of the live subscription) or anonymous=true (pricing page, no account). Returns a PlanQuoteDTO. 422 ADDON_NOT_IN_PLAN, QUANTITY_LIMIT, INTERVAL_NOT_AVAILABLE, DEPENDENCY_*, PROMO_INVALID, PLAN_NOT_SELLABLE; 409 ALREADY_SUBSCRIBED; 410 PLAN_SUNSET; 429 over the per-IP limit."
    )
    @PostMapping("/quotes")
    public ResponseEntity<PlanQuoteDTO> create(@RequestBody QuoteRequest body, HttpServletRequest request) {
        long wait = rateLimiter.hit(request);
        if (wait > 0) return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).header(HttpHeaders.RETRY_AFTER, Long.toString(wait)).build();
        QuoteRequest req = body == null ? new QuoteRequest(null, null, null, null, null, null, null) : body;
        String login = null;
        if (!Boolean.TRUE.equals(req.anonymous())) login = login();
        return ResponseEntity.ok(quotes.create(req, login));
    }

    /** {@code GET /api/billing/quotes/{id}} : the caller's own quote (404 for anyone else's, 410 once expired). */
    @Operation(summary = "Read a quote", description = "The caller's own quote as a PlanQuoteDTO. 404 when it isn't theirs, 410 QUOTE_EXPIRED once past its time.")
    @GetMapping("/quotes/{id}")
    public ResponseEntity<PlanQuoteDTO> get(@PathVariable Long id) {
        return ResponseEntity.ok(quotes.get(id, login()));
    }

    /** {@code POST /api/billing/quotes/{id}/checkout} : the hosted Stripe Checkout of a CHECKOUT quote; its line items are the quote's. */
    @Operation(
        summary = "Check out a quote",
        description = "Creates a Stripe Checkout Session whose line items equal the quote and returns {url}. 409 QUOTE_STALE {reason}, 410 QUOTE_EXPIRED, 409 ALREADY_SUBSCRIBED, 503 BILLING_DISABLED. This does not make anyone paid; only the webhook does."
    )
    @PostMapping("/quotes/{id}/checkout")
    public ResponseEntity<Map<String, String>> checkout(@PathVariable Long id, @RequestBody(required = false) CheckoutRequest body) {
        demoGuard.assertNotDemo();
        return ResponseEntity.ok(Map.of("url", checkout.checkout(id, login(), body == null ? null : body.returnTo())));
    }

    /** {@code POST /api/billing/quotes/{id}/confirm} : apply a CHANGE quote (needs an {@code Idempotency-Key} UUID). */
    @Operation(
        summary = "Confirm a change",
        description = "Applies a CHANGE quote: the add-on change is granted now (removals at the period end, no refund) and Stripe is told. Requires an Idempotency-Key header (a UUID); the same key returns the same batch. 409 QUOTE_STALE / CANCEL_PENDING, 410 QUOTE_EXPIRED, 400 IDEMPOTENCY_KEY_REQUIRED, 503 BILLING_DISABLED."
    )
    @PostMapping("/quotes/{id}/confirm")
    public ResponseEntity<ChangeBatchDTO> confirm(
        @PathVariable Long id,
        @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
        @RequestBody(required = false) ConfirmRequest body
    ) {
        demoGuard.assertNotDemo();
        return ResponseEntity.ok(confirm.confirm(id, login(), idempotencyKey, body == null ? List.of() : body.confirmedCommercialDeps()));
    }

    /** {@code DELETE /api/billing/changes/{id}} : take back a scheduled removal or decrease before its date. */
    @Operation(summary = "Undo a scheduled change", description = "Cancels a PENDING scheduled removal or decrease (Stripe first, then Kiwiply). 409 NOT_PENDING, 404 when it isn't theirs, 502 when Stripe refuses.")
    @DeleteMapping("/changes/{id}")
    public ResponseEntity<ChangeBatchDTO.ChangeDTO> undo(@PathVariable Long id) {
        demoGuard.assertNotDemo();
        return ResponseEntity.ok(changes.undo(id, login()));
    }

    /** {@code GET /api/billing/invoices} : the account's last 36 invoices, newest first. */
    @Operation(summary = "My invoices", description = "The signed-in account's invoices with their lines (base, add-on, proration), newest first, at most 36.")
    @GetMapping("/invoices")
    public ResponseEntity<List<InvoiceDTO>> myInvoices() {
        return ResponseEntity.ok(invoices.mine(login()));
    }

    private static String login() {
        return SecurityUtils.getCurrentUserLogin().orElseThrow(() -> new BillingException(401, "UNAUTHENTICATED", "Sign in to continue"));
    }

    /** Body of the quote checkout: {@code returnTo} is a same-site path the success page may send the person back to. */
    public record CheckoutRequest(String returnTo) {}

    /** Body of a confirm. */
    public record ConfirmRequest(List<String> confirmedCommercialDeps) {
        public ConfirmRequest {
            confirmedCommercialDeps = confirmedCommercialDeps == null ? List.of() : List.copyOf(confirmedCommercialDeps);
        }
    }
}
