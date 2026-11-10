package com.dossier.api.web.rest.ent;

import com.dossier.api.service.DemoGuard;
import com.dossier.api.service.ent.IdempotencyService;
import com.dossier.api.service.ent.offers.OfferCommandService;
import com.dossier.api.service.ent.offers.OfferDTO;
import com.dossier.api.service.ent.offers.OfferQueryService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import java.util.function.Supplier;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The Accounts workspace Offers page (docs/enterprise-v2/page-accounts-offers.md). Everything needs {@code offers.manage}; a caller without it, a row of
 * another organization and a missing id all get the same generic 404. An offer here is a RECORD of what the client extended: the CONSULTANT accepts or
 * declines it in their own workspace (there is deliberately no accept or decline route on this side), nothing is signed or sent by Kiwiply, and the money
 * fields are plain numbers with a currency and a period. Bodies refuse unknown properties.
 */
@RestController("entOrgOfferResource")
@RequestMapping("/api/orgs/{orgId}/offers")
@Tag(name = "offers", description = "Offers: record, extend, revise and withdraw an offer for a consultant; the consultant answers it in their own workspace.")
public class OrgOfferResource {

    private final OfferQueryService query;
    private final OfferCommandService commands;
    private final IdempotencyService idempotency;
    private final DemoGuard demoGuard;
    private final ObjectMapper mapper;

    public OrgOfferResource(OfferQueryService query, OfferCommandService commands, IdempotencyService idempotency, DemoGuard demoGuard, ObjectMapper mapper) {
        this.query = query;
        this.commands = commands;
        this.idempotency = idempotency;
        this.demoGuard = demoGuard;
        this.mapper = mapper;
    }

    @Operation(
        summary = "List offers",
        description = "Paged. Query: tab (all, draft, open, accepted, closed; default open), q (2 to 80 characters: consultant, client or role), clientId, consultantId, sort (recent, deadline, start, consultant, client; 400 SORT_INVALID otherwise), page (from 0), size (1 to 100, default 10). " +
            "An open offer past its deadline reads Expired. The state is DRAFT, EXTENDED, NEGOTIATING, ACCEPTED, DECLINED, EXPIRED or WITHDRAWN."
    )
    @GetMapping
    @OrgPermissionRequired
    public ResponseEntity<OfferDTO.Page> list(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestParam(name = "tab", required = false) String tab,
        @RequestParam(name = "q", required = false) String q,
        @RequestParam(name = "clientId", required = false) Long clientId,
        @RequestParam(name = "consultantId", required = false) Long consultantId,
        @RequestParam(name = "sort", required = false) String sort,
        @RequestParam(name = "page", required = false) Integer page,
        @RequestParam(name = "size", required = false) Integer size
    ) {
        OfferDTO.Page result = query.list(me, new OfferQueryService.ListQuery(tab, q, clientId, consultantId, sort, page, size));
        return ResponseEntity.ok().header("X-Total-Count", String.valueOf(result.total())).body(result);
    }

    @Operation(summary = "The tiles and tab counts", description = "Counts for the tabs (all, draft, open, accepted, closed) and the tiles (closing soon, placed from an offer), straight from the offer table.")
    @GetMapping("/counts")
    @OrgPermissionRequired
    public OfferDTO.Counts counts(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return query.counts(me);
    }

    @Operation(summary = "Candidates for the Record an offer dialog", description = "kind = consultant, client or submission (needs consultantId); q narrows by name; up to 20 results.")
    @GetMapping("/pickers")
    @OrgPermissionRequired
    public OfferDTO.Pickers pickers(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestParam(name = "kind", defaultValue = "consultant") String kind,
        @RequestParam(name = "q", required = false) String q,
        @RequestParam(name = "consultantId", required = false) Long consultantId
    ) {
        return query.pickers(me, kind, q, consultantId);
    }

    @Operation(summary = "One offer", description = "The offer with its timeline (who did what: MEMBER, CONSULTANT or SYSTEM), the placement it created and the actions the caller may take.")
    @GetMapping("/{offerId}")
    @OrgPermissionRequired
    public OfferDTO.Detail one(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long offerId) {
        return query.detail(me, offerId);
    }

    @Operation(
        summary = "Record an offer",
        description = "Body: consultantId and clientId (required), roleTitle (required), optional submissionId / applicationId, placementType (CONTRACT, FTE, C2C), workMode, startDate, endDate or termMonths, rateMinor + ratePeriod (HOUR, DAY, MONTH, YEAR), " +
            "baseSalaryMinor, totalCompMinor, currency (three letters), deadline, benefits, notes, extend (true records it as extended at once; needs startDate). Free text is scanned for sensitive data. OFFER_CREATE audit row. 201."
    )
    @PostMapping
    @OrgPermissionRequired
    public ResponseEntity<OfferDTO.Detail> create(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestHeader(value = "Idempotency-Key", required = false) String key,
        @RequestBody JsonNode raw,
        HttpServletRequest request
    ) {
        demoGuard.assertNotDemo();
        OfferDTO.WriteRequest body = strict(raw, OfferDTO.WriteRequest.class);
        return run(me, key, request, body, 201, () -> commands.create(me, body));
    }

    @Operation(summary = "Revise an offer", description = "Same body as recording (a field left out keeps its value). Allowed while a draft or waiting on the consultant; revising a negotiated offer sends the new terms back to the consultant to answer. 409 OFFER_NOT_EDITABLE. OFFER_UPDATE audit row.")
    @PutMapping("/{offerId}")
    @OrgPermissionRequired
    public ResponseEntity<OfferDTO.Detail> update(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long offerId,
        @RequestHeader(value = "Idempotency-Key", required = false) String key,
        @RequestBody JsonNode raw,
        HttpServletRequest request
    ) {
        demoGuard.assertNotDemo();
        OfferDTO.WriteRequest body = strict(raw, OfferDTO.WriteRequest.class);
        return run(me, key, request, body, 200, () -> commands.update(me, offerId, body));
    }

    @Operation(
        summary = "Record a draft as extended",
        description = "Records that the client extended the offer: the consultant now sees it, is told in their notifications and may accept, decline or negotiate. Needs a start date; the deadline defaults to today plus the admin setting org.offers.expiry_days. 409 OFFER_NOT_DRAFT. OFFER_EXTEND audit row. " +
            "Kiwiply signs and sends nothing."
    )
    @PostMapping("/{offerId}/extend")
    @OrgPermissionRequired
    public ResponseEntity<OfferDTO.Detail> extend(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long offerId,
        @RequestHeader(value = "Idempotency-Key", required = false) String key,
        HttpServletRequest request
    ) {
        demoGuard.assertNotDemo();
        return run(me, key, request, "extend:" + offerId, 200, () -> commands.extend(me, offerId));
    }

    @Operation(summary = "Withdraw an offer", description = "Body: reason (optional, 300 characters, scanned). A draft or an offer still waiting on the consultant; the consultant is told. 409 OFFER_NOT_OPEN. OFFER_WITHDRAW audit row.")
    @PostMapping("/{offerId}/withdraw")
    @OrgPermissionRequired
    public ResponseEntity<OfferDTO.Detail> withdraw(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long offerId,
        @RequestHeader(value = "Idempotency-Key", required = false) String key,
        @RequestBody JsonNode raw,
        HttpServletRequest request
    ) {
        demoGuard.assertNotDemo();
        OfferDTO.WithdrawRequest body = strict(raw, OfferDTO.WithdrawRequest.class);
        return run(me, key, request, body, 200, () -> commands.withdraw(me, offerId, body));
    }

    @Operation(
        summary = "Create the placement for an accepted offer",
        description = "An accepted offer creates its placement by itself; this is the retry when it could not (no client linked, or the consultant still had a placement that had not ended). " +
            "PENDING_START when the start date is ahead, ACTIVE otherwise. 409 OFFER_NOT_ACCEPTED / PLACEMENT_EXISTS, 422 PLACEMENT_NOT_CREATED. OFFER_PLACEMENT audit row."
    )
    @PostMapping("/{offerId}/placement")
    @OrgPermissionRequired
    public ResponseEntity<OfferDTO.Detail> placement(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long offerId,
        @RequestHeader(value = "Idempotency-Key", required = false) String key,
        HttpServletRequest request
    ) {
        demoGuard.assertNotDemo();
        return run(me, key, request, "placement:" + offerId, 200, () -> commands.createPlacement(me, offerId));
    }

    private ResponseEntity<OfferDTO.Detail> run(OrgMembership me, String key, HttpServletRequest request, Object body, int status, Supplier<OfferDTO.Detail> work) {
        IdempotencyService.Outcome<OfferDTO.Detail> out = idempotency.execute(me, key, false, request.getMethod(), request.getRequestURI(), body, status, OfferDTO.Detail.class, work);
        ResponseEntity.BodyBuilder ok = ResponseEntity.status(out.status());
        if (out.replayed()) ok.header("Idempotent-Replayed", "true");
        return ok.body(out.body());
    }

    private <T> T strict(JsonNode raw, Class<T> type) {
        if (raw == null || raw.isNull() || !raw.isObject()) throw OrgException.invalid("body", "must be a JSON object");
        try {
            return mapper.readerFor(type).with(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES).readValue(raw);
        } catch (java.io.IOException e) {
            throw OrgException.invalid("body", "has a property or value this request does not accept");
        }
    }
}
