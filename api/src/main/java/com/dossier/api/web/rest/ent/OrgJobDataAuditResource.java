package com.dossier.api.web.rest.ent;

import com.dossier.api.domain.enumeration.OrgPermission;
import com.dossier.api.service.ent.jobs.JobDataAuditService;
import com.dossier.api.service.ent.jobs.JobDataAuditService.Response;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.Instant;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The job data audit (docs/enterprise-v2/60 section 11, 61 section 7): where each job came from, who put it there and what happened to its data.
 * {@code audit.view} at ORG scope (an organization administrator); anyone else, a row-filtered audit grant included, gets the same generic 404 as an
 * organization that does not exist. Read only; no job text beyond the title and employer.
 */
@RestController
@RequestMapping("/api/orgs/{orgId}/audit/job-data")
@Tag(name = "audit", description = "Organization audit: job data provenance and ledger (read only).")
public class OrgJobDataAuditResource {

    private final JobDataAuditService service;

    public OrgJobDataAuditResource(JobDataAuditService service) {
        this.service = service;
    }

    @Operation(
        summary = "Job data provenance and ledger",
        description = "{items:[{job:{id,title,employer,captureSource,captureMethod,capturedAt,capturedBy,extensionVersion,capturePayloadHash,detailLevel,storedDetailLevel,levelChangedAt}, "
            + "events:[...]}], total, page, size}. Jobs that have ledger events in [from, to) (ISO instants), newest activity first; jobId narrows to one job. page from 0, size 1 to 100 (default 25). "
            + "Needs audit.view at ORG scope; 404 otherwise."
    )
    @GetMapping
    @OrgPermissionRequired(OrgPermission.AUDIT_VIEW)
    public Response jobData(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestParam(required = false) Long jobId,
        @RequestParam(required = false) Instant from,
        @RequestParam(required = false) Instant to,
        @RequestParam(required = false) Integer page,
        @RequestParam(required = false) Integer size
    ) {
        return service.jobData(me, jobId, from, to, page, size);
    }
}
