package com.dossier.api.web.rest.ent;

import com.dossier.api.service.dto.ent.DashboardDTO;
import com.dossier.api.service.ent.dashboard.OrgDashboardService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The Org Admin dashboard (X2.4, 14-organization-administration.md section 2): one call returns every widget the caller may see,
 * in board order, each with its data or an honest state. The permission is {@code dashboard.view_org} (a roles-as-data key, so it
 * is checked in {@link OrgDashboardService} through the authorization order, like the roles write routes); a caller without it,
 * anyone who is not an active member, and an organization outside the enterprise and roles flags all get the same generic 404.
 */
@RestController
@RequestMapping("/api/orgs/{orgId}/dashboard")
@Tag(name = "org-dashboard", description = "Organization dashboard: widgets with real data or an honest state, alerts and their dismissal.")
public class OrgDashboardResource {

    private final OrgDashboardService service;

    public OrgDashboardResource(OrgDashboardService service) {
        this.service = service;
    }

    @Operation(
        summary = "The Org Admin dashboard",
        description = "{orgId, generatedAt, widgets: [{key, state: ok|empty|unavailable|error, reason?, module?, data?}]} in board order. "
            + "dashboard.view_org required; each widget additionally needs its own permission (otherwise it is absent) and its module on "
            + "(otherwise state unavailable, reason NOT_ENABLED, no data). data is present only when state is ok. "
            + "404 for everyone else, and whenever the enterprise or roles flag is off for the organization."
    )
    @GetMapping
    @OrgPermissionRequired
    public DashboardDTO.Response get(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return service.get(me);
    }

    @Operation(
        summary = "Hide an alert for 7 days (for the caller only)",
        description = "alertKey is one of the alert keys of the dashboard (ORG_PAST_DUE, DOMAIN_FAILING, DOMAIN_SUSPENDED, INVITES_EXPIRING, MEMBERS_SUSPENDED, SINGLE_ADMIN, BRANDING_DRAFT, APPLICATIONS_OVERDUE, LICENSES_ATTENTION, MARKETERS_OVERLOADED, APPLICATIONS_NEW, INTERVIEWS_WEEK, PLACEMENT_NEW, RESUMES_PENDING, CONSULTANTS_UNASSIGNED) or CHECKLIST (the activation checklist card). "
            + "Other administrators still see it. Unknown key, or no dashboard.view_org: 404."
    )
    @PostMapping("/alerts/{alertKey}/dismiss")
    @OrgPermissionRequired
    public DashboardDTO.DismissResponse dismiss(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable String alertKey) {
        return service.dismissAlert(me, alertKey);
    }
}
