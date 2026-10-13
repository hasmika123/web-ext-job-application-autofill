package com.dossier.api.web.rest.ent.mkt;

import com.dossier.api.service.ent.mkt.talent.MktTalentDtos;
import com.dossier.api.service.ent.mkt.talent.MktTalentService;
import com.dossier.api.service.ent.mkt.talent.MktTalentService.ListQuery;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Marketing workspace, page "My Assigned Talent" ({@code /w/marketing/talent}). Permission {@code consultants.view}; the consultants
 * shown are the caller's own (ASSIGNED scope) and anything else answers the generic 404. Read-only apart from the caller's own
 * saved views. E1: nothing here submits anything for a consultant.
 */
@RestController
@RequestMapping("/api/orgs/{orgId}/mkt/talent")
@Tag(name = "mkt-talent", description = "Marketing: My Assigned Talent (KPIs, table, bottom cards, consultant summary drawer, saved views).")
public class MktTalentResource {

    private final MktTalentService service;

    public MktTalentResource(MktTalentService service) {
        this.service = service;
    }

    @Operation(
        summary = "The My Assigned Talent board",
        description = "{kpis, counts, facets, items, total, page, size, cards, views, canAddConsultant} in one call. Filters: q, status "
            + "(AVAILABLE_NOW|IN_INTERVIEW|NEEDS_UPDATE|PENDING_APPROVAL), skill, location, experience (0-2|3-5|6-8|9+), availability "
            + "(AVAILABLE_NOW|IN_INTERVIEW|SOON|LATER|ON_PROJECT|UNAVAILABLE), sort (name|experience|location|apps|jobs|availability, '-' = descending), "
            + "page, size (cap 100). consultants.view required; 404 for everyone else."
    )
    @GetMapping
    @OrgPermissionRequired
    public MktTalentDtos.Response list(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestParam(required = false) String q,
        @RequestParam(required = false) String status,
        @RequestParam(required = false) String skill,
        @RequestParam(required = false) String location,
        @RequestParam(required = false) String experience,
        @RequestParam(required = false) String availability,
        @RequestParam(required = false) String sort,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "" + MktTalentService.DEFAULT_SIZE) int size
    ) {
        return service.list(me, new ListQuery(q, status, skill, location, experience, availability, sort, page, size));
    }

    @Operation(summary = "A consultant's summary (the View Profile drawer)", description = "Read-only, consent level SUMMARY, no e-mail/phone/ID numbers. 404 when the consultant is not one of the caller's.")
    @GetMapping("/{consultantId}")
    @OrgPermissionRequired
    public MktTalentDtos.Detail detail(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long consultantId) {
        return service.detail(me, consultantId);
    }

    @Operation(summary = "Save (or overwrite by name) one of the caller's filter sets", description = "At most 20 per marketer. Only the caller's own preferences; no consultant data is stored.")
    @PostMapping("/views")
    @OrgPermissionRequired
    public ResponseEntity<MktTalentDtos.View> saveView(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @RequestBody MktTalentDtos.SaveViewRequest body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.saveView(me, body));
    }

    @Operation(summary = "Delete one of the caller's saved views", description = "404 for a view that is not the caller's.")
    @DeleteMapping("/views/{viewId}")
    @OrgPermissionRequired
    public ResponseEntity<Void> deleteView(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long viewId) {
        service.deleteView(me, viewId);
        return ResponseEntity.noContent().build();
    }
}
