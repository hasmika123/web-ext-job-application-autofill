package com.dossier.api.web.rest.ent;

import com.dossier.api.service.DemoGuard;
import com.dossier.api.service.dto.ent.ClientDTO;
import com.dossier.api.service.ent.IdempotencyService;
import com.dossier.api.service.ent.clients.ClientBoardService;
import com.dossier.api.service.ent.clients.ClientWriteService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import java.util.ArrayList;
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
 * The Clients page on real data: the directory, the KPI tiles (with weekly sparklines and filter facets), one client's drawer, adding and
 * editing a client, adding a contact (and marking one as left), relationship notes, and the Contacts, Requirements and Activity tabs. A client
 * is a {@code client_account}. View needs {@code clients.view}; every write needs {@code clients.manage}. A caller without the key, a member
 * of another organization, a closed organization (for a write) and an id of another tenant all get the same generic 404 (never 403).
 */
@RestController("entOrgClientResource")
@RequestMapping("/api/orgs/{orgId}/clients")
@Tag(name = "clients", description = "Clients: directory, KPI tiles, detail drawer, add and edit a client, contacts, relationship notes, and the Contacts / Requirements / Activity tabs.")
public class OrgClientResource {

    private final ClientBoardService board;
    private final ClientWriteService write;
    private final IdempotencyService idempotency;
    private final DemoGuard demoGuard;
    private final com.fasterxml.jackson.databind.ObjectMapper mapper;

    public OrgClientResource(ClientBoardService board, ClientWriteService write, IdempotencyService idempotency, DemoGuard demoGuard, com.fasterxml.jackson.databind.ObjectMapper mapper) {
        this.board = board;
        this.write = write;
        this.idempotency = idempotency;
        this.demoGuard = demoGuard;
        this.mapper = mapper;
    }

    @Operation(
        summary = "List clients",
        description = "Server-driven directory. Query: q (name, industry or account manager; 2 to 80 characters), and these repeatable filters (repeat the parameter; a comma is never a separator): "
            + "industry, health (HEALTHY, AT_RISK, NEUTRAL: computed from rows by the organization's thresholds), status (ACTIVE, PROSPECT, INACTIVE), sizeBand, managerId; "
            + "sort (name, industry, requirements, consultants, manager, health, activity; 400 SORT_INVALID otherwise) and dir (asc or desc, default newest first); page (from 0), size (1 to 100, default 10). Answers a page and X-Total-Count."
    )
    @GetMapping
    @OrgPermissionRequired
    public ResponseEntity<ClientDTO.Page> list(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestParam(name = "q", required = false) String q,
        @RequestParam(name = "sort", required = false) String sort,
        @RequestParam(name = "dir", required = false) String dir,
        @RequestParam(name = "page", required = false) Integer page,
        @RequestParam(name = "size", required = false) Integer size,
        HttpServletRequest request
    ) {
        ClientBoardService.ListQuery query = new ClientBoardService.ListQuery(
            q, raw(request, "industry"), raw(request, "health"), raw(request, "status"), raw(request, "sizeBand"), ids("managerId", raw(request, "managerId")), sort, dir, page, size
        );
        ClientDTO.Page result = board.list(me, query);
        return ResponseEntity.ok().header("X-Total-Count", String.valueOf(result.total())).body(result);
    }

    @Operation(
        summary = "The KPI tiles and filter facets of the Clients page",
        description = "Total Clients, Active Requirements, New Clients This Month and Placements via Clients, each with the figure of the last period, the delta and an 8-week series (previous and delta are null when the organization has no history to compare with: never estimated); "
            + "plus the facets that fill the filter menus, the health rule's two thresholds (organization settings), the account managers a new client may be given (only for a caller who may manage), and what the caller may do (access)."
    )
    @GetMapping("/summary")
    @OrgPermissionRequired
    public ClientDTO.Summary summary(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return board.summary(me);
    }

    @Operation(summary = "All contacts, across clients (the Contacts tab)", description = "q (name, title, e-mail or client; 2 to 80 characters), clientId, page, size. Business contacts only: a name, a title and a work e-mail.")
    @GetMapping("/contacts")
    @OrgPermissionRequired
    public ResponseEntity<ClientDTO.ContactPage> contacts(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestParam(name = "q", required = false) String q,
        @RequestParam(name = "clientId", required = false) Long clientId,
        @RequestParam(name = "page", required = false) Integer page,
        @RequestParam(name = "size", required = false) Integer size
    ) {
        ClientDTO.ContactPage result = board.contactList(me, q, clientId, page, size);
        return ResponseEntity.ok().header("X-Total-Count", String.valueOf(result.total())).body(result);
    }

    @Operation(summary = "All requirements, across clients (the Requirements tab)", description = "q (title, client or location), status, clientId, page, size; newest first. Requirements are the Jobs page's rows.")
    @GetMapping("/requirements")
    @OrgPermissionRequired
    public ResponseEntity<ClientDTO.RequirementPage> requirements(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestParam(name = "q", required = false) String q,
        @RequestParam(name = "status", required = false) String status,
        @RequestParam(name = "clientId", required = false) Long clientId,
        @RequestParam(name = "page", required = false) Integer page,
        @RequestParam(name = "size", required = false) Integer size
    ) {
        ClientDTO.RequirementPage result = board.requirementList(me, q, status, clientId, page, size);
        return ResponseEntity.ok().header("X-Total-Count", String.valueOf(result.total())).body(result);
    }

    @Operation(summary = "The newest happenings across clients (the Activity tab)", description = "limit (1 to 100, default 30): new clients, contacts, relationship notes, requirements, applications moving and placements, newest first.")
    @GetMapping("/activity")
    @OrgPermissionRequired
    public ClientDTO.ActivityFeed activity(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @RequestParam(name = "limit", required = false) Integer limit) {
        return board.activity(me, limit);
    }

    @Operation(summary = "One client: the detail drawer", description = "Facts, about, health with the rule's sentence, contacts, requirements, recent submissions and relationship notes. ETag = the version PATCH expects as If-Match. 404 for another tenant's id.")
    @GetMapping("/{clientId}")
    @OrgPermissionRequired
    public ResponseEntity<ClientDTO.Detail> get(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long clientId) {
        return withEtag(board.detail(me, clientId));
    }

    @Operation(
        summary = "Add a client",
        description = "clients.manage. Body: name (required, unique per organization, 409 DUPLICATE_CLIENT), industry, website, location, sizeBand (1-50, 51-200, 201-1000, 1000-5000, 5000+), clientSince (a date), about, status (ACTIVE or PROSPECT, default ACTIVE), ownerMemberId (an active member; default the caller). "
            + "An Idempotency-Key is required: the same key and body returns the first answer. Free text goes through the sensitive-data scanner (422). Audit CLIENT_CREATE."
    )
    @PostMapping
    @OrgPermissionRequired
    public ResponseEntity<ClientDTO.Detail> create(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestHeader(value = "Idempotency-Key", required = false) String key,
        @RequestBody com.fasterxml.jackson.databind.JsonNode raw,
        HttpServletRequest request
    ) {
        demoGuard.assertNotDemo();
        ClientDTO.CreateRequest body = strict(raw, ClientDTO.CreateRequest.class);
        IdempotencyService.Outcome<ClientDTO.Detail> out = idempotency.execute(me, key, true, "POST", request.getRequestURI(), body, 201, ClientDTO.Detail.class, () -> write.create(me, body));
        return replay(out, true);
    }

    @Operation(
        summary = "Edit a client (autosave)",
        description = "clients.manage. Body: any of name, industry, website, location, sizeBand, clientSince, about, status (ACTIVE, PROSPECT, INACTIVE), ownerMemberId (a JSON null clears a clearable field); any other key is 422. "
            + "If-Match (the drawer's ETag) is required: 428 without, 412 when stale. A request that changes nothing writes no audit row. Audit CLIENT_STATUS (status) and CLIENT_UPDATE (the rest). Answers the new detail."
    )
    @PatchMapping("/{clientId}")
    @OrgPermissionRequired
    public ResponseEntity<ClientDTO.Detail> patch(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long clientId,
        @RequestHeader(value = HttpHeaders.IF_MATCH, required = false) String ifMatch,
        @RequestBody Map<String, Object> body
    ) {
        demoGuard.assertNotDemo();
        return withEtag(write.patch(me, clientId, ifMatch, body));
    }

    @Operation(
        summary = "Add a contact to a client",
        description = "clients.manage. Body: name (required), title, email (a WORK address: consumer mail domains from the organization setting are 422 WORK_EMAIL_REQUIRED; the same e-mail twice is 409 DUPLICATE_CONTACT), role (HIRING_MANAGER, RECRUITER, VMS_ADMIN, AP, OTHER). Idempotency-Key optional. Audit CLIENT_CONTACT_ADD. Answers the client detail."
    )
    @PostMapping("/{clientId}/contacts")
    @OrgPermissionRequired
    public ResponseEntity<ClientDTO.Detail> addContact(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long clientId,
        @RequestHeader(value = "Idempotency-Key", required = false) String key,
        @RequestBody com.fasterxml.jackson.databind.JsonNode raw,
        HttpServletRequest request
    ) {
        demoGuard.assertNotDemo();
        ClientDTO.ContactRequest body = strict(raw, ClientDTO.ContactRequest.class);
        IdempotencyService.Outcome<ClientDTO.Detail> out = idempotency.execute(me, key, false, "POST", request.getRequestURI(), body, 201, ClientDTO.Detail.class, () -> write.addContact(me, clientId, body));
        return replay(out, false);
    }

    @Operation(summary = "Edit a contact, or mark one as left (and back)", description = "clients.manage. Body: any of name, title, email, role, status (ACTIVE or LEFT); any other key is 422. Audit CLIENT_CONTACT_UPDATE. Answers the client detail.")
    @PatchMapping("/{clientId}/contacts/{contactId}")
    @OrgPermissionRequired
    public ResponseEntity<ClientDTO.Detail> patchContact(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long clientId,
        @PathVariable Long contactId,
        @RequestBody Map<String, Object> body
    ) {
        demoGuard.assertNotDemo();
        return withEtag(write.patchContact(me, clientId, contactId, body));
    }

    @Operation(summary = "Add a relationship note", description = "clients.manage. Body: body (1 to 1000 characters, through the sensitive-data scanner). Idempotency-Key optional. Audit CLIENT_NOTE_ADD (the audit row never carries the text). Answers the client detail.")
    @PostMapping("/{clientId}/notes")
    @OrgPermissionRequired
    public ResponseEntity<ClientDTO.Detail> addNote(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long clientId,
        @RequestHeader(value = "Idempotency-Key", required = false) String key,
        @RequestBody com.fasterxml.jackson.databind.JsonNode raw,
        HttpServletRequest request
    ) {
        demoGuard.assertNotDemo();
        ClientDTO.NoteRequest body = strict(raw, ClientDTO.NoteRequest.class);
        IdempotencyService.Outcome<ClientDTO.Detail> out = idempotency.execute(me, key, false, "POST", request.getRequestURI(), body, 201, ClientDTO.Detail.class, () -> write.addNote(me, clientId, body));
        return replay(out, false);
    }

    private static ResponseEntity<ClientDTO.Detail> replay(IdempotencyService.Outcome<ClientDTO.Detail> out, boolean etag) {
        ResponseEntity.BodyBuilder ok = ResponseEntity.status(out.status());
        if (out.replayed()) ok.header("Idempotent-Replayed", "true");
        if (etag && out.body() != null) ok.eTag("\"" + out.body().version() + "\"");
        return ok.body(out.body());
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

    private static ResponseEntity<ClientDTO.Detail> withEtag(ClientDTO.Detail d) {
        return ResponseEntity.ok().eTag("\"" + d.version() + "\"").body(d);
    }

    /** The values of a repeatable query parameter, read raw (a comma inside a value is never a separator). */
    private static List<String> raw(HttpServletRequest request, String name) {
        String[] values = request.getParameterValues(name);
        return values == null ? List.of() : List.of(values);
    }

    private static List<Long> ids(String field, List<String> values) {
        List<Long> out = new ArrayList<>();
        for (String v : values) {
            if (v == null || v.isBlank()) continue;
            try {
                out.add(Long.parseLong(v.trim()));
            } catch (NumberFormatException e) {
                throw OrgException.invalid(field, "must be a number");
            }
        }
        return out;
    }
}
