package com.dossier.api.web.rest.ent.consultant;

import com.dossier.api.service.ent.consultant.ConPrepareDTO;
import com.dossier.api.service.ent.consultant.ConPrepareService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Prepare selected openings (`/api/orgs/{orgId}/con/prepare`, docs/enterprise-v2/63; the Java packages are named {@code consultant} because {@code con} is a
 * reserved device name on Windows). Gate: {@code ConScope} (the consultant id is the caller's own seat) and the feature switch; a caller outside it, another
 * consultant's session and a match that is not the caller's own are all the same generic 404.
 * The server plans and records. The browser extension opens the jobs in the consultant's own browser, fills them and stops; the consultant presses the final
 * button on the real site. Nothing under this path sends an application for anyone.
 */
@RestController
@RequestMapping("/api/orgs/{orgId}/con/prepare")
@Tag(name = "consultant-prepare", description = "Consultant: prepare selected assigned openings in my own browser (the extension fills, I review and finish).")
public class ConPrepareResource {

    private final ConPrepareService service;

    public ConPrepareResource(ConPrepareService service) {
        this.service = service;
    }

    @Operation(summary = "Is Prepare selected on, and what is left of my limits", description = "{enabled, maxBatch, remainingToday, remainingMonth, dailyCap, monthlyCap}. Used by the page only.")
    @GetMapping("/status")
    @OrgPermissionRequired
    public ConPrepareDTO.Status status(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return service.status(me);
    }

    @Operation(
        summary = "Prepare the selected assigned openings in my own browser",
        description = "Body {matchIds}. Returns the session and the links for the extension to open ({sessionId, expiresAt, jobs, skipped, remainingToday, remainingMonth}). "
            + "Every match must be one of my own assigned openings (404 otherwise). Over the admin-set daily or monthly limit: 409 PREPARE_CAP_REACHED. The same request again while its session is live is the same session and costs nothing. "
            + "This plans a batch only: nothing is filled or sent from the server, and the extension never presses the final button."
    )
    @PostMapping
    @OrgPermissionRequired
    public ConPrepareDTO.Created prepare(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @RequestBody(required = false) ConPrepareDTO.Request body) {
        return service.prepare(me, body == null ? null : body.matchIds());
    }

    @Operation(
        summary = "The extension reports progress on one opening",
        description = "Body {matchId, event, detail?}: event is OPENED, PREFILLED, NEEDS_INPUT, SUBMIT_DETECTED, CLOSED or FAILED; detail is at most 200 characters and is scanned for sensitive data. 204. "
            + "SUBMIT_DETECTED only records what the consultant did on the site; the opportunity becomes APPLIED only through the existing linker."
    )
    @PostMapping("/{sessionId}/events")
    @OrgPermissionRequired
    public ResponseEntity<Void> event(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long sessionId,
        @RequestBody(required = false) ConPrepareDTO.EventRequest body
    ) {
        service.event(me, sessionId, body == null ? null : body.matchId(), body == null ? null : body.event(), body == null ? null : body.detail());
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "State of each opening of one of my prepared batches (404 for anyone else's)")
    @GetMapping("/{sessionId}")
    @OrgPermissionRequired
    public ConPrepareDTO.Session session(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long sessionId) {
        return service.session(me, sessionId);
    }
}
