package com.dossier.api.web.rest.org;

import com.dossier.api.domain.enumeration.OrgPermission;
import com.dossier.api.service.dto.org.OrgOnboardingDTO;
import com.dossier.api.service.dto.org.OrgOverviewDTO;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgOnboardingService;
import com.dossier.api.service.org.OrgOverviewService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * What the org dashboard shows (O2.7): the activation checklist for the people who set the workspace up
 * ({@code org.settings.manage}) and the live, consent-scoped numbers for everyone who may read reports
 * ({@code reports.view}). Both are reads: they write no audit row.
 */
@RestController
@RequestMapping("/api/orgs/{orgId}")
public class OrgOnboardingResource {

    private final OrgOnboardingService onboarding;
    private final OrgOverviewService overview;

    public OrgOnboardingResource(OrgOnboardingService onboarding, OrgOverviewService overview) {
        this.onboarding = onboarding;
        this.overview = overview;
    }

    /** The checklist: {@code {items: [{key, done, count?, total?, href, available, optional}], done, total, complete}}. */
    @GetMapping("/onboarding")
    @OrgPermissionRequired(OrgPermission.ORG_SETTINGS_MANAGE)
    public OrgOnboardingDTO checklist(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return onboarding.checklist(me);
    }

    /** Seat counts, application progress of the members who share, and the org's recent activity. */
    @GetMapping("/overview")
    @OrgPermissionRequired(OrgPermission.REPORTS_VIEW)
    public OrgOverviewDTO overview(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return overview.overview(me);
    }
}
