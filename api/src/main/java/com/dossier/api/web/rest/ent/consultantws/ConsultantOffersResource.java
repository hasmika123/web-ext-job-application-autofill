package com.dossier.api.web.rest.ent.consultantws;

import com.dossier.api.service.ent.consultantws.ConsultantOffersDTO;
import com.dossier.api.service.ent.consultantws.ConsultantOffersService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Consultant workspace Offers: the caller's OWN offers. 404 for anyone who is not a consultant of this organization and for an offer that is
 * not theirs. Accept, decline and negotiate only record the consultant's answer: nothing is signed, sent to a client, paid, or turned into a
 * placement by Kiwiply.
 */
@RestController
@RequestMapping("/api/orgs/{orgId}/me-workspace/offers")
@Tag(name = "consultant-workspace", description = "The signed-in consultant's own workspace (never another member's data).")
public class ConsultantOffersResource {

    private final ConsultantOffersService service;

    public ConsultantOffersResource(ConsultantOffersService service) {
        this.service = service;
    }

    @Operation(summary = "Offers page", description = "Tiles, the first filtered page of the caller's offers, every offer for the compare table, recent activity and the company filter options.")
    @GetMapping
    @OrgPermissionRequired
    public ConsultantOffersDTO.Response page(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestParam(required = false) String status,
        @RequestParam(required = false) String company,
        @RequestParam(required = false) String workMode,
        @RequestParam(required = false) String q,
        @RequestParam(required = false) String sort,
        @RequestParam(required = false) Integer page,
        @RequestParam(required = false) Integer size
    ) {
        return service.page(me, status, company, workMode, q, sort, page, size);
    }

    @Operation(summary = "Offers table", description = "One filtered, sorted page of the caller's offers (size 1 to 50).")
    @GetMapping("/list")
    @OrgPermissionRequired
    public ConsultantOffersDTO.OfferPage list(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestParam(required = false) String status,
        @RequestParam(required = false) String company,
        @RequestParam(required = false) String workMode,
        @RequestParam(required = false) String q,
        @RequestParam(required = false) String sort,
        @RequestParam(required = false) Integer page,
        @RequestParam(required = false) Integer size
    ) {
        return service.list(me, status, company, workMode, q, sort, page, size);
    }

    @Operation(summary = "One offer", description = "The full package, benefits text if stored, deadline, timeline and what the caller may still do.")
    @GetMapping("/{id}")
    @OrgPermissionRequired
    public ConsultantOffersDTO.Detail detail(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable long id) {
        return service.detail(me, id);
    }

    @Operation(
        summary = "Accept an offer",
        description = "Needs offers.respond. Records the consultant's answer only: nothing is signed or sent to a client; accepting creates the placement record (PENDING_START or ACTIVE). 409 OFFER_NOT_OPEN when it is not open, OFFER_EXPIRED after the deadline."
    )
    @PostMapping("/{id}/accept")
    @OrgPermissionRequired
    public ConsultantOffersDTO.Decision accept(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable long id) {
        return service.accept(me, id);
    }

    @Operation(
        summary = "Decline an offer",
        description = "Needs offers.respond. The reason is optional (up to 300 characters, scanned for sensitive data). 409 OFFER_NOT_OPEN / OFFER_EXPIRED."
    )
    @PostMapping("/{id}/decline")
    @OrgPermissionRequired
    public ConsultantOffersDTO.Decision decline(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable long id,
        @RequestBody(required = false) ConsultantOffersDTO.ReasonRequest body
    ) {
        return service.decline(me, id, body == null ? null : body.reason());
    }

    @Operation(
        summary = "Ask to negotiate an offer",
        description = "Needs offers.respond. Only while pending review. A note of 3 to 300 characters is required and scanned for sensitive data. 409 OFFER_NOT_OPEN / OFFER_EXPIRED."
    )
    @PostMapping("/{id}/negotiate")
    @OrgPermissionRequired
    public ConsultantOffersDTO.Decision negotiate(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable long id,
        @RequestBody(required = false) ConsultantOffersDTO.NoteRequest body
    ) {
        return service.negotiate(me, id, body == null ? null : body.note());
    }
}
