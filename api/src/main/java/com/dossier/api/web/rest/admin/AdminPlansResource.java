package com.dossier.api.web.rest.admin;

import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.catalog.PlanLifecycleService;
import com.dossier.api.service.catalog.PlanPreviewService;
import com.dossier.api.service.catalog.PlanService;
import com.dossier.api.service.catalog.StripePriceImportService;
import com.dossier.api.service.catalog.StripePriceImportService.ImportRequest;
import com.dossier.api.service.catalog.StripePriceImportService.ImportResult;
import com.dossier.api.service.catalog.dto.PlanDTOs.CompareDTO;
import com.dossier.api.service.catalog.dto.PlanDTOs.ComponentsRequest;
import com.dossier.api.service.catalog.dto.PlanDTOs.CreatePlanRequest;
import com.dossier.api.service.catalog.dto.PlanDTOs.DiscardRequest;
import com.dossier.api.service.catalog.dto.PlanDTOs.NewVersionRequest;
import com.dossier.api.service.catalog.dto.PlanDTOs.PlanDTO;
import com.dossier.api.service.catalog.dto.PlanDTOs.PlanSummaryDTO;
import com.dossier.api.service.catalog.dto.PlanDTOs.PlanVersionDTO;
import com.dossier.api.service.catalog.dto.PlanDTOs.PublishPlanRequest;
import com.dossier.api.service.catalog.dto.PlanDTOs.SubscribersDTO;
import com.dossier.api.service.catalog.dto.PlanDTOs.UpdatePlanRequest;
import com.dossier.api.service.catalog.dto.PlanPreviewDTO;
import com.fasterxml.jackson.databind.JsonNode;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Platform admin: the plan builder's API (docs/subscriptions/09-apis.md section 1.3; stories K2.2 to K2.5). {@code ROLE_ADMIN} only (B-07: the finer
 * {@code catalog.view} / {@code catalog.manage} permissions narrow it when the staff-role model exists). Every write that changes what the company sells is
 * HIGH: it carries a {@code reason} (at least 10 characters) and writes {@code catalog_change} and {@code admin_audit_event} rows. Publishing takes an
 * {@code Idempotency-Key} header, the typed {@code confirmVersion}, and an optional {@code overrideReason} that lets a margin failure through (never for a
 * discounted or yearly derived row). Problems are RFC 7807 with a {@code code} (see the error registry of 09 section 5).
 */
@RestController
@RequestMapping("/api/admin/plans")
@PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
@Tag(name = "Admin plans", description = "The plan builder: plans, versions, components, preview, publish, compare, subscribers (ROLE_ADMIN).")
public class AdminPlansResource {

    private final PlanService plans;
    private final PlanPreviewService preview;
    private final PlanLifecycleService lifecycle;
    private final StripePriceImportService priceImport;

    public AdminPlansResource(PlanService plans, PlanPreviewService preview, PlanLifecycleService lifecycle, StripePriceImportService priceImport) {
        this.priceImport = priceImport;
        this.plans = plans;
        this.preview = preview;
        this.lifecycle = lifecycle;
    }

    @Operation(summary = "List plans", description = "Plans with their live and draft version, subscribers per version, base prices per interval and the worst-case margin.")
    @GetMapping
    public List<PlanSummaryDTO> list(@RequestParam(value = "audience", required = false) String audience, @RequestParam(value = "status", required = false) String status) {
        return plans.list(audience, status);
    }

    @Operation(summary = "Create a plan (HIGH)", description = "Starts with version 1 in DRAFT. Errors: 409 PLAN_KEY_EXISTS, 422 KEY_FORMAT, 422 REASON_REQUIRED.")
    @PostMapping
    public ResponseEntity<PlanDTO> create(@RequestBody CreatePlanRequest body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(plans.create(body));
    }

    @Operation(summary = "Update a plan's presentation (HIGH)", description = "Key and audience are immutable. 409 VERSION_CONFLICT when expectedUpdatedAt is stale.")
    @PutMapping("/{planKey}")
    public PlanDTO update(@PathVariable("planKey") String planKey, @RequestBody UpdatePlanRequest body) {
        return plans.update(planKey, body);
    }

    @Operation(summary = "A plan with all its versions")
    @GetMapping("/{planKey}")
    public PlanDTO get(@PathVariable("planKey") String planKey) {
        return plans.get(planKey);
    }

    @Operation(summary = "Start a new DRAFT version (HIGH)", description = "Copied from the live version unless 'from' names another. Errors: 409 DRAFT_EXISTS, 409 PLAN_RETIRING.")
    @PostMapping("/{planKey}/versions")
    public ResponseEntity<PlanVersionDTO> newVersion(@PathVariable("planKey") String planKey, @RequestBody NewVersionRequest body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(plans.newVersion(planKey, body));
    }

    @Operation(summary = "One version, priced from the live catalog (DRAFT) or from its own snapshot (published)")
    @GetMapping("/{planKey}/versions/{v}")
    public PlanVersionDTO getVersion(@PathVariable("planKey") String planKey, @PathVariable("v") int v) {
        return plans.getVersion(planKey, v);
    }

    @Operation(
        summary = "Edit a DRAFT version (autosave)",
        description = "Partial: intervals[], annualDiscountBp, aiBudgetCapCents, aiWindows{interval: cents}, baseProductId, seatRules, presets[], summary, expectedUpdatedAt. "
            + "Errors: 409 NOT_DRAFT, 409 VERSION_CONFLICT, 422 INTERVAL_NOT_ENABLED, 422 ORG_QUARTER_REFUSED, 422 INVALID_VALUE."
    )
    @PatchMapping("/{planKey}/versions/{v}")
    public PlanVersionDTO patch(@PathVariable("planKey") String planKey, @PathVariable("v") int v, @RequestBody JsonNode body) {
        return plans.patchVersion(planKey, v, body);
    }

    @Operation(
        summary = "Replace the components of a DRAFT version",
        description = "Errors: 409 NOT_DRAFT, 409 VERSION_CONFLICT, 422 ROLE_INVALID_FOR_AUDIENCE, 422 DUPLICATE_COMPONENT, 422 ALLOWANCE_REQUIRED, 422 PRODUCT_REQUIRED, 422 PRODUCT_AUDIENCE_MISMATCH, 422 QUANTITY_LIMIT."
    )
    @PutMapping("/{planKey}/versions/{v}/components")
    public PlanVersionDTO putComponents(@PathVariable("planKey") String planKey, @PathVariable("v") int v, @RequestBody ComponentsRequest body) {
        return plans.putComponents(planKey, v, body);
    }

    @Operation(summary = "Preview a version", description = "Totals, worst-case margin with levers, annual, the seat roster of an organization plan, the publish gates and the impact. roster = comma separated [n]BASE|presetKey.")
    @GetMapping("/{planKey}/versions/{v}/preview")
    public PlanPreviewDTO preview(
        @PathVariable("planKey") String planKey,
        @PathVariable("v") int v,
        @RequestParam(value = "interval", required = false) String interval,
        @RequestParam(value = "currency", required = false) String currency,
        @RequestParam(value = "roster", required = false) String roster
    ) {
        return preview.preview(planKey, v, interval, currency, roster);
    }

    @Operation(
        summary = "Publish a DRAFT version (HIGH)",
        description = "One transaction: margin guard on every offered currency, derived yearly rows, Stripe prices, the version, the snapshot and one catalog version. Needs the Idempotency-Key header "
            + "(400 IDEMPOTENCY_KEY_REQUIRED) and confirmVersion equal to the version (412 CONFIRM_MISMATCH). A replay with the same key answers 200 with the same version. "
            + "Errors: 409 NOT_DRAFT, 422 PLAN_PRICE_MISSING, 422 PLAN_DEPENDENCY_MISSING, 422 MARGIN_BELOW_FLOOR (overrideAllowed tells whether overrideReason can pass it), 422 BASE_PRODUCT_REQUIRED, "
            + "422 FREE_PLAN_PRICED, 422 INTERVAL_NOT_ENABLED, 422 SETUP_FEE_REQUIRED (an ORG plan without a setup fee), 422 LIVE_KEY_NOT_ALLOWED (a live Stripe key outside production), 502 STRIPE_ERROR, 503 BILLING_DISABLED (Stripe off, unless billing.publish.allow_without_stripe is on)."
    )
    @PostMapping("/{planKey}/versions/{v}/publish")
    public PlanVersionDTO publish(
        @PathVariable("planKey") String planKey,
        @PathVariable("v") int v,
        @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
        @RequestBody PublishPlanRequest body
    ) {
        return plans.publish(planKey, v, body, idempotencyKey);
    }

    @Operation(
        summary = "Import the launch Stripe prices into a DRAFT Pro version (HIGH)",
        description = "Cut-over step (decision B-01): reads STRIPE_PRICE_MONTHLY and STRIPE_PRICE_3MO from Stripe and creates the matching DRAFT MONTH and QUARTER price rows of the base product, "
            + "with the Stripe price ids set. Idempotent, never overwrites a row, needs billing on. Errors: 503 BILLING_DISABLED, 409 NOT_DRAFT, 422 IMPORT_NOT_SUPPORTED, 422 STRIPE_PRICE_MISMATCH, 422 REASON_REQUIRED."
    )
    @PostMapping("/{planKey}/versions/{v}/import-stripe-prices")
    public ImportResult importStripePrices(@PathVariable("planKey") String planKey, @PathVariable("v") int v, @RequestBody ImportRequest body) {
        return priceImport.importPrices(planKey, v, body);
    }

    @Operation(summary = "Discard a DRAFT version", description = "409 NOT_DRAFT for anything published.")
    @PostMapping("/{planKey}/versions/{v}/discard")
    public ResponseEntity<Void> discard(@PathVariable("planKey") String planKey, @PathVariable("v") int v, @RequestBody(required = false) DiscardRequest body) {
        plans.discard(planKey, v, body);
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "Compare two versions", description = "Differences (intervals, discount, AI budget, base prices, components), subscribers of each and the worst-case margin per interval.")
    @GetMapping("/{planKey}/compare")
    public CompareDTO compare(@PathVariable("planKey") String planKey, @RequestParam("a") int a, @RequestParam("b") int b) {
        return plans.compare(planKey, a, b);
    }

    @Operation(summary = "Subscribers of a plan", description = "Counts per version for everyone; the roster (logins) of one version when 'version' is given. Admin only.")
    @GetMapping("/{planKey}/subscribers")
    public SubscribersDTO subscribers(
        @PathVariable("planKey") String planKey,
        @RequestParam(value = "version", required = false) Integer version,
        @RequestParam(value = "page", required = false, defaultValue = "0") int page,
        @RequestParam(value = "size", required = false, defaultValue = "50") int size
    ) {
        return lifecycle.subscribers(planKey, version, page, size);
    }
}
