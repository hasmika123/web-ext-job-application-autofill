package com.dossier.api.web.rest.ent.consultant;

import com.dossier.api.service.ent.IdempotencyService;
import com.dossier.api.service.ent.IdempotencyService.Outcome;
import com.dossier.api.service.ent.consultant.ConOpportunityDTO;
import com.dossier.api.service.ent.consultant.ConOpportunityService;
import com.dossier.api.service.ent.jobs.IdempotentCreate;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.function.Supplier;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The consultant's assigned opportunities (`/api/orgs/{orgId}/con/opportunities`; the Java packages are named {@code consultant} because {@code con} is a
 * reserved device name on Windows). Gate: {@code ConScope} (the consultant id is the caller's own seat, never a request value); a caller outside it, another
 * consultant's id and someone else's application id are all the same generic 404.
 * E1: every write here records what the CONSULTANT did or said. Nothing under this path submits an application for anyone.
 */
@RestController
@RequestMapping("/api/orgs/{orgId}/con/opportunities")
@Tag(name = "consultant-opportunities", description = "Consultant: opportunities assigned to me and my own responses to them.")
public class ConOpportunitiesResource {

    private final ConOpportunityService service;
    private final IdempotencyService idempotency;

    public ConOpportunitiesResource(ConOpportunityService service, IdempotencyService idempotency) {
        this.service = service;
        this.idempotency = idempotency;
    }

    @Operation(
        summary = "My assigned opportunities",
        description = "{items, total}. Filters: state (comma list of ASSIGNED, VIEWED, INTERESTED, NEEDS_INFO, DECLINED, APPLIED, CLOSED), page (from 0), size (default 20, max 100). "
            + "match=<job page url> or atsPlatform + externalJobId return the opportunities of that posting instead (for the browser extension)."
    )
    @GetMapping
    @OrgPermissionRequired
    public ConOpportunityDTO.ListResponse list(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestParam(required = false) String state,
        @RequestParam(required = false) Integer page,
        @RequestParam(required = false) Integer size,
        @RequestParam(required = false) String match,
        @RequestParam(required = false) String atsPlatform,
        @RequestParam(required = false) String externalJobId
    ) {
        return service.list(me, state, page, size, match, atsPlatform, externalJobId);
    }

    @Operation(summary = "One of my assigned opportunities (404 for anyone else's)")
    @GetMapping("/{id}")
    @OrgPermissionRequired
    public ConOpportunityDTO get(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long id) {
        return service.get(me, id);
    }

    @Operation(summary = "Mark as viewed (ASSIGNED to VIEWED). Explicit; a GET never does it.")
    @PostMapping("/{id}/viewed")
    @OrgPermissionRequired
    public ConOpportunityDTO viewed(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long id,
        @RequestHeader(value = "If-Match", required = false) String ifMatch
    ) {
        return service.viewed(me, id, ifMatch);
    }

    @Operation(summary = "I am interested")
    @PostMapping("/{id}/interest")
    @OrgPermissionRequired
    public ConOpportunityDTO interest(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long id,
        @RequestHeader(value = "If-Match", required = false) String ifMatch
    ) {
        return service.interest(me, id, ifMatch);
    }

    @Operation(summary = "Decline: reason NOT_INTERESTED, LOCATION, RATE, ALREADY_APPLIED or OTHER, optional note (200 characters)")
    @PostMapping("/{id}/decline")
    @OrgPermissionRequired
    public ConOpportunityDTO decline(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long id,
        @RequestBody DeclineRequest body,
        @RequestHeader(value = "If-Match", required = false) String ifMatch
    ) {
        return service.decline(me, id, body == null ? null : body.reason(), body == null ? null : body.note(), ifMatch);
    }

    @Operation(summary = "Ask the marketer a question (1 to 500 characters); the opportunity becomes NEEDS_INFO")
    @PostMapping("/{id}/request-info")
    @OrgPermissionRequired
    public ConOpportunityDTO requestInfo(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long id,
        @RequestBody InfoRequest body,
        @RequestHeader(value = "If-Match", required = false) String ifMatch
    ) {
        return service.requestInfo(me, id, body == null ? null : body.question(), ifMatch);
    }

    @Operation(
        summary = "I applied (my own application, in my own session). Optional applicationId ties one of MY tracked applications to it (404 for anyone else's). "
            + "Accepts an Idempotency-Key."
    )
    @PostMapping("/{id}/applied")
    @OrgPermissionRequired
    public ResponseEntity<ConOpportunityDTO> applied(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long id,
        @RequestBody(required = false) ApplicationRequest body,
        @RequestHeader(value = "If-Match", required = false) String ifMatch,
        @RequestHeader(value = IdempotentCreate.HEADER, required = false) String idempotencyKey
    ) {
        Long applicationId = body == null ? null : body.applicationId();
        return once(me, idempotencyKey, "applied", id, applicationId, () -> service.applied(me, id, applicationId, ifMatch));
    }

    @Operation(summary = "Link one of MY tracked applications to this opportunity (applicationId required). Accepts an Idempotency-Key.")
    @PostMapping("/{id}/link")
    @OrgPermissionRequired
    public ResponseEntity<ConOpportunityDTO> link(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long id,
        @RequestBody ApplicationRequest body,
        @RequestHeader(value = "If-Match", required = false) String ifMatch,
        @RequestHeader(value = IdempotentCreate.HEADER, required = false) String idempotencyKey
    ) {
        Long applicationId = body == null ? null : body.applicationId();
        return once(me, idempotencyKey, "link", id, applicationId, () -> service.link(me, id, applicationId, ifMatch));
    }

    @Operation(summary = "End the link between this opportunity and my tracked application")
    @PostMapping("/{id}/unlink")
    @OrgPermissionRequired
    public ConOpportunityDTO unlink(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long id,
        @RequestHeader(value = "If-Match", required = false) String ifMatch
    ) {
        return service.unlink(me, id, ifMatch);
    }

    /** The key is optional here (the extension sends one, the web page may not): with none the work simply runs. */
    private ResponseEntity<ConOpportunityDTO> once(OrgMembership me, String key, String action, Long id, Long applicationId, Supplier<ConOpportunityDTO> work) {
        String path = "/api/orgs/" + me.orgId() + "/con/opportunities/" + id + "/" + action;
        Outcome<ConOpportunityDTO> out = idempotency.execute(me, key, false, "POST", path, java.util.Map.of("applicationId", String.valueOf(applicationId)), 200, ConOpportunityDTO.class, work);
        ResponseEntity.BodyBuilder ok = ResponseEntity.ok();
        if (out.replayed()) ok.header(IdempotentCreate.REPLAYED_HEADER, "true");
        return ok.body(out.body());
    }

    /** {@code POST .../decline}. */
    public record DeclineRequest(String reason, String note) {}

    /** {@code POST .../request-info}. */
    public record InfoRequest(String question) {}

    /** {@code POST .../applied} and {@code .../link}. */
    public record ApplicationRequest(Long applicationId) {}
}
