package com.dossier.api.web.rest.ent;

import com.dossier.api.service.DemoGuard;
import com.dossier.api.service.dto.ent.RequirementDTO;
import com.dossier.api.service.ent.IdempotencyService;
import com.dossier.api.service.ent.accounts.AccountRequirementService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The Account Manager's Requirements page and Home figures (X10.2 / X10.5): intake of a client requirement (typed, a pasted client text or a posting
 * link), the list with filters, one requirement, edit with a status workflow, and putting a requirement in front of a consultant. View needs
 * {@code clients.view} or {@code pipeline.view}; every write needs {@code requirements.manage}. A caller without the key, a member of another
 * organization, a closed organization (for a write) and an id of another tenant all get the same generic 404 (never 403). The organization is the
 * path's, checked against the caller's membership; no request body ever names one.
 */
@RestController("entOrgRequirementResource")
@RequestMapping("/api/orgs/{orgId}/requirements")
@Tag(name = "requirements", description = "Account Manager requirements: intake, list with filters and Home figures, detail, edit, and putting a requirement in front of a consultant.")
public class OrgRequirementResource {

    private final AccountRequirementService service;
    private final IdempotencyService idempotency;
    private final DemoGuard demoGuard;
    private final com.fasterxml.jackson.databind.ObjectMapper mapper;

    public OrgRequirementResource(AccountRequirementService service, IdempotencyService idempotency, DemoGuard demoGuard, com.fasterxml.jackson.databind.ObjectMapper mapper) {
        this.service = service;
        this.idempotency = idempotency;
        this.demoGuard = demoGuard;
        this.mapper = mapper;
    }

    @Operation(
        summary = "List requirements",
        description = "q (title, client, location or skill; 2 to 80 characters) and these repeatable filters (repeat the parameter; a comma is never a separator): status (OPEN, IN_REVIEW, ON_HOLD, FILLED, CLOSED), priority (LOW, NORMAL, HIGH, URGENT), workMode (REMOTE, HYBRID, ON_SITE); "
            + "clientId; assigned (ANY: a consultant was put forward, NONE: nobody yet); aging=true (open and older than the organization's aging days). sort (posted, due, priority, title, client, status, age; 400 SORT_INVALID otherwise) and dir; page (from 0), size (1 to 100, default 10). Answers a page and X-Total-Count."
    )
    @GetMapping
    @OrgPermissionRequired
    public ResponseEntity<RequirementDTO.Page> list(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestParam(name = "q", required = false) String q,
        @RequestParam(name = "clientId", required = false) Long clientId,
        @RequestParam(name = "assigned", required = false) String assigned,
        @RequestParam(name = "aging", required = false, defaultValue = "false") boolean aging,
        @RequestParam(name = "sort", required = false) String sort,
        @RequestParam(name = "dir", required = false) String dir,
        @RequestParam(name = "page", required = false) Integer page,
        @RequestParam(name = "size", required = false) Integer size,
        HttpServletRequest request
    ) {
        RequirementDTO.Page result = service.list(
            me, new AccountRequirementService.ListQuery(q, raw(request, "status"), raw(request, "priority"), raw(request, "workMode"), clientId, assigned, aging, sort, dir, page, size)
        );
        return ResponseEntity.ok().header("X-Total-Count", String.valueOf(result.total())).body(result);
    }

    @Operation(
        summary = "The Home figures and the intake form's choices",
        description = "Open requirements, open requirements without a consultant, aging ones (older than the organization's aging days, an admin setting), those on hold, the active client contacts, "
            + "the clients (with their contacts) a requirement may be entered for, and what the caller may do (access)."
    )
    @GetMapping("/summary")
    @OrgPermissionRequired
    public RequirementDTO.Summary summary(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return service.summary(me);
    }

    @Operation(summary = "One requirement: the detail drawer", description = "Facts, the client text, the consultants it was put in front of, and an ETag (the version PATCH expects as If-Match). 404 for another tenant's id.")
    @GetMapping("/{requirementId}")
    @OrgPermissionRequired
    public ResponseEntity<RequirementDTO.Detail> get(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long requirementId) {
        return withEtag(service.detail(me, requirementId));
    }

    @Operation(
        summary = "Enter a requirement (intake)",
        description = "requirements.manage. Body: title and clientId (required, a client of this organization), contactId, description (the client's text, up to 4000 characters), location, workMode, employment, durationLabel, experienceLevel, rateMin and rateMax (whole currency units, business data), rateUnit (HOUR or YEAR), positions, "
            + "status (OPEN, IN_REVIEW or ON_HOLD; default OPEN), priority (LOW, NORMAL, HIGH, URGENT; default NORMAL), dueOn, skills[] (at most 15), source (MANUAL, PASTED_TEXT: description is required, LINK: sourceUrl is required). "
            + "A client that already has a live requirement with the same title and location, or the same posting link, is 409 REQUIREMENT_EXISTS (with existingId). An Idempotency-Key is required. Free text goes through the sensitive-data scanner (422). Audit JOB_CREATE and REQUIREMENT_INTAKE."
    )
    @PostMapping
    @OrgPermissionRequired
    public ResponseEntity<RequirementDTO.Detail> create(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestHeader(value = "Idempotency-Key", required = false) String key,
        @RequestBody com.fasterxml.jackson.databind.JsonNode raw,
        HttpServletRequest request
    ) {
        demoGuard.assertNotDemo();
        RequirementDTO.CreateRequest body = strict(raw, RequirementDTO.CreateRequest.class);
        IdempotencyService.Outcome<RequirementDTO.Detail> out = idempotency.execute(me, key, true, "POST", request.getRequestURI(), body, 201, RequirementDTO.Detail.class, () -> service.create(me, body));
        ResponseEntity.BodyBuilder ok = ResponseEntity.status(out.status());
        if (out.replayed()) ok.header("Idempotent-Replayed", "true");
        if (out.body() != null) ok.eTag("\"" + out.body().version() + "\"");
        return ok.body(out.body());
    }

    @Operation(
        summary = "Edit a requirement (autosave) or move its status",
        description = "requirements.manage. Body: any of title, description, location, workMode, employment, durationLabel, experienceLevel, rateMin, rateMax, rateUnit, positions, filled, status (OPEN, IN_REVIEW, ON_HOLD, FILLED, CLOSED), contactId, skills, priority, dueOn (a JSON null clears a clearable field); any other key is 422. "
            + "If-Match is required: 428 without, 412 when stale. Filling or closing a requirement closes the assignments still open on it. Answers the new detail."
    )
    @PatchMapping("/{requirementId}")
    @OrgPermissionRequired
    public ResponseEntity<RequirementDTO.Detail> patch(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long requirementId,
        @RequestHeader(value = HttpHeaders.IF_MATCH, required = false) String ifMatch,
        @RequestBody Map<String, Object> body
    ) {
        demoGuard.assertNotDemo();
        return withEtag(service.patch(me, requirementId, ifMatch, body));
    }

    @Operation(summary = "The consultants a requirement can be put in front of", description = "requirements.manage. q (name or title). Active consultants only; name, title, availability and skill overlap, best first. Nothing else about a consultant is shown.")
    @GetMapping("/{requirementId}/candidates")
    @OrgPermissionRequired
    public List<RequirementDTO.Candidate> candidates(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long requirementId,
        @RequestParam(name = "q", required = false) String q
    ) {
        return service.candidates(me, requirementId, q);
    }

    @Operation(
        summary = "Put a requirement in front of a consultant",
        description = "requirements.manage. Body: consultantId. A record only: the consultant sees it as an opportunity and decides; nothing is applied for them and nothing is sent to a client. Idempotent. 409 JOB_NOT_OPEN, CONSULTANT_PAUSED or RESUME_NOT_APPROVED when it cannot be done now. Audit REQUIREMENT_ASSIGN."
    )
    @PostMapping("/{requirementId}/assignments")
    @OrgPermissionRequired
    public ResponseEntity<RequirementDTO.AssignResult> assign(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long requirementId,
        @RequestBody com.fasterxml.jackson.databind.JsonNode raw
    ) {
        demoGuard.assertNotDemo();
        RequirementDTO.AssignRequest body = strict(raw, RequirementDTO.AssignRequest.class);
        RequirementDTO.AssignResult result = service.assign(me, requirementId, body);
        return ResponseEntity.ok().eTag("\"" + result.requirement().version() + "\"").body(result);
    }

    /** Binds a body and refuses any property the shape does not name (Spring's mapper ignores unknown ones, which would let {@code orgId} ride along silently). */
    private <T> T strict(com.fasterxml.jackson.databind.JsonNode raw, Class<T> type) {
        if (raw == null || raw.isNull()) throw OrgException.invalid("body", "is required");
        try {
            return mapper.readerFor(type).with(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES).readValue(raw);
        } catch (java.io.IOException e) {
            throw OrgException.invalid("body", "has a property or value this request does not accept");
        }
    }

    private static ResponseEntity<RequirementDTO.Detail> withEtag(RequirementDTO.Detail d) {
        return ResponseEntity.ok().eTag("\"" + d.version() + "\"").body(d);
    }

    /** The values of a repeatable query parameter, read raw (a comma inside a value is never a separator). */
    private static List<String> raw(HttpServletRequest request, String name) {
        String[] values = request.getParameterValues(name);
        return values == null ? List.of() : List.of(values);
    }
}
