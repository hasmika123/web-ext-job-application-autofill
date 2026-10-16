package com.dossier.api.web.rest.admin;

import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.billing.reconcile.BillingOpsService;
import com.dossier.api.service.billing.reconcile.BillingOpsService.Attention;
import com.dossier.api.service.billing.reconcile.BillingOpsService.DriftDTO;
import com.dossier.api.service.billing.reconcile.BillingOpsService.DriftPage;
import com.dossier.api.service.billing.reconcile.BillingOpsService.ReplayDTO;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Platform admin: what the billing reconcilers found and the two things an admin can do about it (docs/subscriptions/07 section 7, story K8.5).
 * {@code ROLE_ADMIN} only. Replaying an event and resolving a drift row are HIGH: a {@code reason} of at least 10 characters and an audit row. Nothing here
 * moves money or writes to Stripe.
 */
@RestController
@RequestMapping("/api/admin/billing")
@PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
@Tag(name = "Admin billing operations", description = "Reconciler drift, attention counts, event replay (ROLE_ADMIN).")
public class AdminBillingOpsResource {

    private final BillingOpsService ops;

    public AdminBillingOpsResource(BillingOpsService ops) {
        this.ops = ops;
    }

    /** The reason (required) and an optional note. */
    public record ReasonRequest(String reason, String note) {}

    @Operation(summary = "Open drift counts", description = "Open billing_drift rows in total and per kind (CATALOG, PERSONAL, ...): the admin attention badge.")
    @GetMapping("/attention")
    public Attention attention() {
        return ops.attention();
    }

    @Operation(
        summary = "List drift rows",
        description = "kind: CATALOG | PERSONAL | ... (optional); state: open (default) | resolved | all; newest first. The answer carries the attention counts."
    )
    @GetMapping("/drift")
    public DriftPage drift(
        @RequestParam(name = "kind", required = false) String kind,
        @RequestParam(name = "state", required = false, defaultValue = "open") String state,
        @RequestParam(name = "page", required = false, defaultValue = "0") int page,
        @RequestParam(name = "size", required = false, defaultValue = "50") int size
    ) {
        return ops.list(kind, state, page, size);
    }

    @Operation(summary = "Resolve a drift row (HIGH)", description = "Needs a reason. 404 DRIFT_NOT_FOUND, 409 DRIFT_RESOLVED, 422 REASON_REQUIRED.")
    @PostMapping("/drift/{id}/resolve")
    public DriftDTO resolve(@PathVariable("id") Long id, @RequestBody ReasonRequest body) {
        return ops.resolve(id, body == null ? null : body.reason(), body == null ? null : body.note());
    }

    @Operation(
        summary = "Replay a Stripe event (HIGH)",
        description = "Fetches the event from Stripe by id and runs it through the webhook handler again; recorded as its own event row with replayed_from and " +
        "replayed_by. 404 EVENT_NOT_FOUND, 422 REASON_REQUIRED, 500 REPLAY_FAILED, 503 BILLING_DISABLED."
    )
    @PostMapping("/events/{id}/replay")
    public ReplayDTO replay(@PathVariable("id") String id, @RequestBody ReasonRequest body) {
        return ops.replay(id, body == null ? null : body.reason());
    }
}
