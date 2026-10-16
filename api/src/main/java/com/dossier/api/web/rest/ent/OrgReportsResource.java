package com.dossier.api.web.rest.ent;

import com.dossier.api.service.dto.ent.ReportsDTO;
import com.dossier.api.service.ent.reports.OrgReportsService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The Org Admin Reports page: a few canned reports computed from the organization's own rows (no money, no sample data). Needs
 * {@code reports.view} held at ORG scope; every other caller, and a foreign organization, gets the same generic 404.
 */
@RestController("entOrgReportsResource")
@RequestMapping("/api/orgs/{orgId}/reports")
@Tag(name = "org-reports", description = "Organization reports: roster, applications funnel, interviews, placements, clients and marketer workload.")
public class OrgReportsResource {

    private final OrgReportsService service;

    public OrgReportsResource(OrgReportsService service) {
        this.service = service;
    }

    @Operation(
        summary = "The reports overview",
        description = "Query: range = 30 or 90 (days, default 30; 400 RANGE_INVALID otherwise). Answers the headline tiles, the consultant roster by marketing status and availability, " +
            "the applications funnel by stage with week-over-week change, interviews scheduled vs completed, placements started and ended per month, the top clients by running placements, " +
            "the marketer workload and the median time to first submission. reports.view at ORG scope required; 404 for everyone else."
    )
    @GetMapping("/overview")
    @OrgPermissionRequired
    public ReportsDTO.Overview overview(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestParam(name = "range", required = false) String range
    ) {
        return service.overview(me, range);
    }
}
