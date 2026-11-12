package com.dossier.api.web.rest.ent;

import com.dossier.api.service.DemoGuard;
import com.dossier.api.service.ent.IdempotencyService;
import com.dossier.api.service.ent.licenses.LicenseQuoteService;
import com.dossier.api.service.ent.licenses.OrgLicenseService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Consultant licences of one organization (LICENCES-BUILD.md L3, ORG-BILLING-BUILD.md step 1b): the Consultant Licenses page reads and changes them here.
 * No money moves yet (user decision 2026-11-10). An add-on change is priced first ({@code POST /quotes}) and confirmed ({@code POST /quotes/{id}/confirm});
 * the direct give / set-add-ons routes price and confirm in one step. Reads need {@code licenses.view}, writes and quotes {@code licenses.manage}; anything
 * else is a 404. Rows are keyed by consultant id.
 */
@RestController("entOrgLicenseResource")
@RequestMapping("/api/orgs/{orgId}/licenses")
@Tag(name = "Organization licences")
public class OrgLicenseResource {

    public record FeaturesVM(List<String> features) {
        Set<String> keys() {
            return features == null ? Set.of() : new LinkedHashSet<>(features);
        }
    }

    public record ReasonVM(String reason) {}

    private final OrgLicenseService licenses;
    private final LicenseQuoteService quotes;
    private final IdempotencyService idempotency;
    private final DemoGuard demoGuard;

    public OrgLicenseResource(OrgLicenseService licenses, LicenseQuoteService quotes, IdempotencyService idempotency, DemoGuard demoGuard) {
        this.licenses = licenses;
        this.quotes = quotes;
        this.idempotency = idempotency;
        this.demoGuard = demoGuard;
    }

    @Operation(summary = "Consultants and their licences", description = "licenses.view. Every active consultant, by name, with status (NONE, ACTIVE, SUSPENDED, ENDING, ENDED), add-ons and the monthly price where the organization has a contract price (null = not set).")
    @GetMapping
    @OrgPermissionRequired
    public List<OrgLicenseService.Row> list(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return licenses.list(me);
    }

    @Operation(summary = "What a licence can carry", description = "licenses.view. The base licence and the add-ons this organization can give, each with its contract price or null (price not set).")
    @GetMapping("/catalog")
    @OrgPermissionRequired
    public OrgLicenseService.Catalog catalog(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return licenses.catalog(me);
    }

    @Operation(summary = "One consultant's licence and its history", description = "licenses.view. 404 for a consultant of another organization or one who is not active.")
    @GetMapping("/{consultantId}")
    @OrgPermissionRequired
    public OrgLicenseService.Detail get(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long consultantId) {
        return licenses.get(me, consultantId);
    }

    @Operation(summary = "Price a licence change", description = "licenses.manage. Body {consultantId, features: [keys]}: the add-ons the licence should carry afterwards (a consultant without a licence gets one). Answers the quote: lines (CREATE, ADD_FEATURE, REMOVE_FEATURE, KEEP_FEATURE) with the monthly price and, when the organization has a billing period, what the rest of it costs now; totals (null amounts = price not set); expiresAt (enterprise.quote.ttl_minutes). 422 NO_CHANGE, 422 for an unknown add-on. Writes no audit row; nothing is billed.")
    @PostMapping("/quotes")
    @OrgPermissionRequired
    public LicenseQuoteService.Quote quote(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @RequestBody LicenseQuoteService.Request body) {
        demoGuard.assertNotDemo();
        return quotes.quote(me, body);
    }

    @Operation(summary = "One licence quote", description = "licenses.manage. The quote as it was priced; status OPEN, CONFIRMED or EXPIRED.")
    @GetMapping("/quotes/{quoteId}")
    @OrgPermissionRequired
    public LicenseQuoteService.Quote getQuote(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long quoteId) {
        return quotes.get(me, quoteId);
    }

    @Operation(summary = "Confirm a licence quote", description = "licenses.manage. Idempotency-Key optional (the same key answers the first reply). Re-prices the quote: 410 QUOTE_EXPIRED, 409 QUOTE_STALE (the licence or a price moved), 409 QUOTE_USED. Then the licence changes: additions now, removals at the end of the billing period when there is one (undo with DELETE /changes/{changeId}). Audit LICENSE_CHANGE. Answers the licence detail.")
    @PostMapping("/quotes/{quoteId}/confirm")
    @OrgPermissionRequired
    public ResponseEntity<OrgLicenseService.Detail> confirm(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long quoteId,
        @RequestHeader(value = "Idempotency-Key", required = false) String key,
        HttpServletRequest request
    ) {
        demoGuard.assertNotDemo();
        IdempotencyService.Outcome<OrgLicenseService.Detail> out = idempotency.execute(
            me, key, false, "POST", request.getRequestURI(), Map.of("quoteId", quoteId), 200, OrgLicenseService.Detail.class, () -> quotes.confirm(me, quoteId));
        ResponseEntity.BodyBuilder ok = ResponseEntity.status(out.status());
        if (out.replayed()) ok.header("Idempotent-Replayed", "true");
        return ok.body(out.body());
    }

    @Operation(summary = "Keep an add-on whose removal is waiting", description = "licenses.manage. Undoes a removal that takes effect at the end of the billing period. 409 NOT_PENDING once it is undone or has happened. Audit LICENSE_CHANGE. Answers the licence detail.")
    @DeleteMapping("/changes/{changeId}")
    @OrgPermissionRequired
    public OrgLicenseService.Detail keep(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long changeId) {
        demoGuard.assertNotDemo();
        return licenses.keepFeature(me, changeId);
    }

    @Operation(summary = "Give a consultant a licence", description = "licenses.manage. Body {features: [keys]} (may be empty: the base licence alone). Priced and confirmed in one step (a quote row is kept). 409 ALREADY_LICENSED, 422 for an unknown add-on. Nothing is billed.")
    @PostMapping("/{consultantId}")
    @OrgPermissionRequired
    public OrgLicenseService.Detail give(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long consultantId, @RequestBody(required = false) FeaturesVM body) {
        demoGuard.assertNotDemo();
        return quotes.applyNow(me, consultantId, body == null ? Set.of() : body.keys(), false);
    }

    @Operation(summary = "Set a licence's add-ons", description = "licenses.manage. Body {features: [keys]}: the licence carries exactly these afterwards. Priced and confirmed in one step: new ones start now; missing ones stop at the end of the billing period when there is one, otherwise now. 409 NO_LICENSE.")
    @PutMapping("/{consultantId}/features")
    @OrgPermissionRequired
    public OrgLicenseService.Detail setFeatures(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long consultantId, @RequestBody FeaturesVM body) {
        demoGuard.assertNotDemo();
        return quotes.applyNow(me, consultantId, body == null ? Set.of() : body.keys(), true);
    }

    @Operation(summary = "Suspend a licence", description = "licenses.manage. Body {reason} (3+ characters). Every add-on stops now and comes back on reactivate.")
    @PostMapping("/{consultantId}/suspend")
    @OrgPermissionRequired
    public OrgLicenseService.Detail suspend(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long consultantId, @RequestBody ReasonVM body) {
        demoGuard.assertNotDemo();
        return licenses.suspend(me, consultantId, body == null ? null : body.reason());
    }

    @Operation(summary = "Reactivate a suspended licence", description = "licenses.manage. The add-ons it had come back.")
    @PostMapping("/{consultantId}/reactivate")
    @OrgPermissionRequired
    public OrgLicenseService.Detail reactivate(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long consultantId) {
        demoGuard.assertNotDemo();
        return licenses.reactivate(me, consultantId);
    }

    @Operation(summary = "End a licence", description = "licenses.manage. Body {reason} (3+ characters). Ends now with its add-ons; a new licence later is a new row.")
    @PostMapping("/{consultantId}/end")
    @OrgPermissionRequired
    public OrgLicenseService.Detail end(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long consultantId, @RequestBody ReasonVM body) {
        demoGuard.assertNotDemo();
        return licenses.end(me, consultantId, body == null ? null : body.reason());
    }
}
