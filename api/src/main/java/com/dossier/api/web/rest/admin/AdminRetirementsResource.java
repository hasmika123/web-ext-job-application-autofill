package com.dossier.api.web.rest.admin;

import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.retirement.RetirementCoverageService;
import com.dossier.api.service.retirement.RetirementNoticeService;
import com.dossier.api.service.retirement.RetirementService;
import com.dossier.api.service.retirement.dto.CoverageDTO;
import com.dossier.api.service.retirement.dto.NoticeDTOs.NoticePage;
import com.dossier.api.service.retirement.dto.NoticeDTOs.NoticePreviewDTO;
import com.dossier.api.service.retirement.dto.NoticeDTOs.ResendRequest;
import com.dossier.api.service.retirement.dto.NoticeDTOs.ResendResult;
import com.dossier.api.service.retirement.dto.RetirementDTOs.SuccessorsRequest;
import com.dossier.api.service.retirement.dto.RetirementDTOs.CancelRequest;
import com.dossier.api.service.retirement.dto.RetirementDTOs.CompleteRequest;
import com.dossier.api.service.retirement.dto.RetirementDTOs.CreateRequest;
import com.dossier.api.service.retirement.dto.RetirementDTOs.ImpactDTO;
import com.dossier.api.service.retirement.dto.RetirementDTOs.ItemPage;
import com.dossier.api.service.retirement.dto.RetirementDTOs.RetirementDTO;
import com.dossier.api.service.retirement.dto.RetirementDTOs.RetirementPage;
import com.dossier.api.service.retirement.dto.RetirementDTOs.StartRequest;
import com.dossier.api.service.retirement.dto.RetirementDTOs.UpdateRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Platform admin: the retirement lifecycle (docs/subscriptions/11-plan-retirement.md, epic K10; stories K10.1 to K10.3). {@code ROLE_ADMIN} only (B-07). Every write is
 * HIGH: a {@code reason} of at least 20 characters, the typed key on start and cancel (412 {@code CONFIRM_MISMATCH}), and {@code admin_audit_event} plus
 * {@code catalog_change} rows. Problems are RFC 7807 with a {@code code}: 404 NOT_FOUND, 409 NOT_DRAFT / RETIREMENT_EXISTS / RETIREMENT_IN_PROGRESS / ITEMS_PENDING /
 * DRAFT_EXISTS / PLAN_STATE / FREE_PLAN_MISSING, 412 CONFIRM_MISMATCH, 422 REASON_REQUIRED / KIND_NOT_SUPPORTED / AUDIENCE_NOT_SUPPORTED / FREE_PLAN_PROTECTED /
 * MIN_NOTICE_TOO_SHORT / SUCCESSOR_REQUIRED / SUCCESSOR_NOT_SELLABLE / PRICE_INCREASE_REQUIRES_CONSENT / INVALID_VALUE.
 */
@RestController
@RequestMapping("/api/admin/retirements")
@PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
@Tag(name = "Admin retirements", description = "Retire a plan, a plan version or an add-on: notices, successors, the Free fallback (ROLE_ADMIN).")
public class AdminRetirementsResource {

    private final RetirementService retirements;
    private final RetirementCoverageService coverage;
    private final RetirementNoticeService notices;

    public AdminRetirementsResource(RetirementService retirements, RetirementCoverageService coverage, RetirementNoticeService notices) {
        this.retirements = retirements;
        this.coverage = coverage;
        this.notices = notices;
    }

    @Operation(
        summary = "Create a retirement (HIGH, DRAFT)",
        description = "kind PLAN (planKey, optional version of a SUPERSEDED version) or ADDON (featureKey). Defaults come from the settings: mode RETIRE_AT_RENEWAL, defaultOutcome FREE, notice days, minimum notice (hard minimum 30), channels. "
            + "Nothing changes for anyone until it is started. Errors: 409 RETIREMENT_EXISTS, 409 PLAN_STATE, 422 KIND_NOT_SUPPORTED (PRICE), 422 AUDIENCE_NOT_SUPPORTED, 422 FREE_PLAN_PROTECTED, 422 MIN_NOTICE_TOO_SHORT, 422 REASON_REQUIRED."
    )
    @PostMapping
    public ResponseEntity<RetirementDTO> create(@RequestBody CreateRequest body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(retirements.create(body));
    }

    @Operation(summary = "List retirements", description = "Newest first; filter by status DRAFT, NOTICING, COMPLETING, COMPLETED or CANCELLED.")
    @GetMapping
    public RetirementPage list(
        @RequestParam(value = "status", required = false) String status,
        @RequestParam(value = "page", required = false, defaultValue = "0") int page,
        @RequestParam(value = "size", required = false, defaultValue = "25") int size
    ) {
        return retirements.list(status, page, size);
    }

    @Operation(summary = "One retirement", description = "With its ranked successors, item counts per status and the impact snapshot taken at start.")
    @GetMapping("/{id}")
    public RetirementDTO get(@PathVariable("id") long id) {
        return retirements.get(id);
    }

    @Operation(summary = "Edit a DRAFT retirement (HIGH)", description = "Mode, default outcome, notice schedule, minimum notice, channels, message. 409 NOT_DRAFT once started.")
    @PatchMapping("/{id}")
    public RetirementDTO update(@PathVariable("id") long id, @RequestBody UpdateRequest body) {
        return retirements.update(id, body);
    }

    @Operation(
        summary = "Start a retirement (HIGH)",
        description = "The plan, version or add-on becomes RETIRING (no new buyers: quotes answer 410 PLAN_RETIRING with the ranked successors); every affected subscription gets an item with its effective date; the impact is snapshotted. "
            + "Needs reason (20+ characters) and confirmKey equal to the plan key (412 CONFIRM_MISMATCH). With no subscribers the retirement completes at once with no notices. Nobody loses anything before their own date."
    )
    @PostMapping("/{id}/start")
    public RetirementDTO start(@PathVariable("id") long id, @RequestBody StartRequest body) {
        return retirements.start(id, body);
    }

    @Operation(summary = "Cancel a retirement (HIGH)", description = "A DRAFT cancels at any time; a started one only while no subscriber has acted (409 RETIREMENT_IN_PROGRESS otherwise). The plan sells again.")
    @PostMapping("/{id}/cancel")
    public RetirementDTO cancel(@PathVariable("id") long id, @RequestBody CancelRequest body) {
        return retirements.cancel(id, body);
    }

    @Operation(summary = "Complete a retirement (HIGH)", description = "Closes it once every subscriber has been handled and retires the plan, version or add-on for good. 409 ITEMS_PENDING while anyone is undecided or not yet moved.")
    @PostMapping("/{id}/complete")
    public RetirementDTO complete(@PathVariable("id") long id, @RequestBody CompleteRequest body) {
        return retirements.complete(id, body);
    }

    @Operation(summary = "Affected subscriptions", description = "One row per subscription with its effective date, status and suggestion. Logins are the admin's alone.")
    @GetMapping("/{id}/items")
    public ItemPage items(
        @PathVariable("id") long id,
        @RequestParam(value = "status", required = false) String status,
        @RequestParam(value = "interval", required = false) String interval,
        @RequestParam(value = "page", required = false, defaultValue = "0") int page,
        @RequestParam(value = "size", required = false, defaultValue = "50") int size
    ) {
        return retirements.items(id, status, interval, page, size);
    }

    @Operation(
        summary = "Rank the successors (HIGH)",
        description = "Replaces the ranked successors (plan keys for a plan retirement, feature keys for an add-on). Allowed while DRAFT, NOTICING or COMPLETING; suggestions are recomputed nightly. "
            + "Errors: 422 SUCCESSOR_NOT_SELLABLE (a successor must be a different, PUBLISHED individual plan), 422 REASON_REQUIRED, 409 RETIREMENT_CLOSED."
    )
    @PutMapping("/{id}/successors")
    public RetirementDTO successors(@PathVariable("id") long id, @RequestBody SuccessorsRequest body) {
        return retirements.replaceSuccessors(id, body == null ? null : body.successors(), body == null ? null : body.reason());
    }

    @Operation(
        summary = "Coverage of the ranked successors",
        description = "How many affected subscribers each successor covers completely, leaves with gaps, or would charge more than they pay today; migrateAllowed is true when nobody would pay more under the rank-1 successor. Computed now, writes nothing."
    )
    @GetMapping("/{id}/coverage")
    public CoverageDTO coverage(@PathVariable("id") long id) {
        return coverage.coverage(id);
    }

    @Operation(summary = "Notices sent", description = "The ledger of every notice of this retirement, newest first (what was sent to whom, by which channels, and when). No message body is stored.")
    @GetMapping("/{id}/notices")
    public NoticePage notices(
        @PathVariable("id") long id,
        @RequestParam(value = "page", required = false, defaultValue = "0") int page,
        @RequestParam(value = "size", required = false, defaultValue = "50") int size
    ) {
        return notices.list(id, page, size);
    }

    @Operation(summary = "Preview a notice", description = "The notice as a subscriber would read it now: a real subscriber when subscriptionId names one, otherwise a sample with invented numbers. Sends nothing.")
    @GetMapping("/{id}/notices/preview")
    public NoticePreviewDTO preview(@PathVariable("id") long id, @RequestParam(value = "subscriptionId", required = false) Long subscriptionId) {
        return notices.preview(id, subscriptionId);
    }

    @Operation(
        summary = "Resend a notice (audited)",
        description = "Sends the current notice to one undecided subscriber once more, with a reason of 10+ characters. 409 NOT_PENDING once they have chosen or the retirement is not running."
    )
    @PostMapping("/{id}/items/{itemId}/resend")
    public ResendResult resend(@PathVariable("id") long id, @PathVariable("itemId") long itemId, @RequestBody ResendRequest body) {
        return notices.resend(id, itemId, body == null ? null : body.reason());
    }

    @Operation(summary = "Preview the impact", description = "Subscribers by interval and status, MRR (monthly equivalent) and the earliest and latest effective date: computed now for a DRAFT, the stored items for a started retirement. Writes nothing.")
    @GetMapping("/{id}/impact")
    public ImpactDTO impact(@PathVariable("id") long id) {
        return retirements.impact(id);
    }
}
