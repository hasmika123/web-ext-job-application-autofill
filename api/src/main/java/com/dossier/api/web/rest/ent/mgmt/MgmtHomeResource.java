package com.dossier.api.web.rest.ent.mgmt;

import com.dossier.api.service.ent.mgmt.MgmtHomeDTO;
import com.dossier.api.service.ent.mgmt.MgmtHomeService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The Marketing Manager's Home. Permission {@code workload.view} at TEAM scope or wider, resolved by the service: a caller without it, a member of another
 * organization and an organization outside the flags all get the same generic 404. A manager with no marketer in scope gets {@code empty: true}, never a 404.
 */
@RestController
@RequestMapping("/api/orgs/{orgId}/mgmt/home")
@Tag(name = "mgmt-home", description = "Marketing Manager: the Home page in one call.")
public class MgmtHomeResource {

    private final MgmtHomeService service;

    public MgmtHomeResource(MgmtHomeService service) {
        this.service = service;
    }

    @Operation(
        summary = "The Marketing Manager's Home (one call)",
        description = "workload.view at TEAM scope or wider. {empty, tiles (marketers active and paused, consultants covered, open opportunities, approvals waiting, escalations by severity), " +
            "pipeline (this week against last: assigned, interested, submitted, interviews), workload (the three most loaded marketers), needsYou (the oldest approvals and the most severe escalations), activity (the latest ten lines)}. " +
            "Counts of the team's own rows and display names only. An organization-wide caller sees everyone."
    )
    @GetMapping
    @OrgPermissionRequired
    public MgmtHomeDTO home(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return service.home(me);
    }
}
