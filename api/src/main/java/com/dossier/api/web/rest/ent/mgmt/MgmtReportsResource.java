package com.dossier.api.web.rest.ent.mgmt;

import com.dossier.api.service.dto.ent.ReportsDTO;
import com.dossier.api.service.ent.mgmt.MgmtReportsService;
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
 * The Marketing Manager's Reports: the Org Admin overview over the manager's team, and its CSV. A caller without the key and another organization get the generic 404.
 */
@RestController("mgmtReportsResource")
@RequestMapping("/api/orgs/{orgId}/mgmt/reports")
@Tag(name = "mgmt-reports", description = "Marketing Manager: the reports overview projected to the team, and its CSV download.")
public class MgmtReportsResource {

    private final MgmtReportsService service;

    public MgmtReportsResource(MgmtReportsService service) {
        this.service = service;
    }

    @Operation(
        summary = "The reports overview of the team",
        description = "reports.view at TEAM scope or wider. Query: range = 30 or 90 (days, default 30; 400 RANGE_INVALID otherwise). The Org Admin overview (tiles, consultant roster, applications funnel, interviews, " +
            "placements, top clients, marketer workload, median time to first submission) over the consultants the team's marketers carry and the team's marketers. An organization-wide caller sees the whole organization."
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
        summary = "The team's reports overview as a CSV download",
        description = "Same gate and range as the overview. One section per block, cells neutralised against spreadsheet formulas, and the export itself audited (EXPORT)."
    )
    @GetMapping("/export")
    @OrgPermissionRequired
    public ResponseEntity<byte[]> export(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestParam(name = "range", required = false) String range
    ) {
        String csv = service.exportCsv(me, range);
        return ResponseEntity.ok()
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"team-reports.csv\"")
            .cacheControl(CacheControl.noStore())
            .contentType(MediaType.parseMediaType("text/csv;charset=UTF-8"))
            .body(csv.getBytes(StandardCharsets.UTF_8));
    }
}
