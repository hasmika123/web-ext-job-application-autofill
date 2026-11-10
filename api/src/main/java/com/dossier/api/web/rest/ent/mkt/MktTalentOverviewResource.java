package com.dossier.api.web.rest.ent.mkt;

import com.dossier.api.service.ent.mkt.talent.MktTalentOverviewDtos;
import com.dossier.api.service.ent.mkt.talent.MktTalentOverviewService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Marketing workspace, "My Assigned Talent" -> View Profile: the selected consultant in one call. Permission {@code consultants.view}; the consultant must be
 * one of the caller's (decision O5) and every part goes through {@code MarketerAccess}. Read-only. E1: nothing here submits anything for a consultant.
 */
@RestController
@RequestMapping("/api/orgs/{orgId}/mkt/talent/{consultantId}/overview")
@Tag(name = "mkt-talent", description = "Marketing: My Assigned Talent (KPIs, table, bottom cards, consultant summary drawer, saved views).")
public class MktTalentOverviewResource {

    private final MktTalentOverviewService service;

    public MktTalentOverviewResource(MktTalentOverviewService service) {
        this.service = service;
    }

    @Operation(
        summary = "The selected consultant, in full, for their assigned marketer",
        description = "{id, name, title, headline, workMode, availability, resume, contact{workEmail, location, workAuthorization (a stored status label or null)}, skills, "
            + "placement{role, client, startDate, status} (no money), resumes, applications{total, open, byStage, recent[5] with updatedBy}, interviews}. "
            + "No identity numbers, no date of birth, no bank details, no amounts. consultants.view; 404 for a consultant that is not the caller's, another organization's id, or anyone else."
    )
    @GetMapping
    @OrgPermissionRequired
    public MktTalentOverviewDtos.Overview overview(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long consultantId) {
        return service.overview(me, consultantId);
    }
}
