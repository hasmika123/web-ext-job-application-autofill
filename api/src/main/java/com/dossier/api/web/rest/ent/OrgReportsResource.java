package com.dossier.api.web.rest.ent;

import com.dossier.api.service.dto.ent.ReportsDTO;
import com.dossier.api.service.ent.reports.OrgReportsExportService;
import com.dossier.api.service.ent.reports.OrgReportsService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.nio.charset.StandardCharsets;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
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
    private final OrgReportsExportService exports;

    public OrgReportsResource(OrgReportsService service, OrgReportsExportService exports) {
        this.service = service;
        this.exports = exports;
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

    @Operation(
        summary = "The reports overview as a CSV download",
        description = "Same range and gate as the overview (reports.view at ORG scope; 404 otherwise). One section per block (tiles, roster, funnel, interviews, placements, top clients, marketer workload), " +
            "cells neutralised against spreadsheet formulas, and the export itself audited (EXPORT)."
    )
    @GetMapping("/export")
    @OrgPermissionRequired
    public ResponseEntity<byte[]> export(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestParam(name = "range", required = false) String range
    ) {
        String csv = exports.exportCsv(me, range);
        return ResponseEntity.ok()
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"reports.csv\"")
            .cacheControl(CacheControl.noStore())
            .contentType(MediaType.parseMediaType("text/csv;charset=UTF-8"))
            .body(csv.getBytes(StandardCharsets.UTF_8));
    }
}
