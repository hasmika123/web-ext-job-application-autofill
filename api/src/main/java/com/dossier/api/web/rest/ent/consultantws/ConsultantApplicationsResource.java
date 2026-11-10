package com.dossier.api.web.rest.ent.consultantws;

import com.dossier.api.service.ent.consultantws.ConsultantApplicationsDTO;
import com.dossier.api.service.ent.consultantws.ConsultantApplicationsService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Consultant workspace My Applications: the caller's OWN applications, read-only. 404 for anyone who is not a consultant of this organization, and for an application that is not theirs. */
@RestController
@RequestMapping("/api/orgs/{orgId}/me-workspace/applications")
@Tag(name = "consultant-workspace", description = "The signed-in consultant's own workspace (never another member's data).")
public class ConsultantApplicationsResource {

    private final ConsultantApplicationsService service;

    public ConsultantApplicationsResource(ConsultantApplicationsService service) {
        this.service = service;
    }

    @Operation(
        summary = "My Applications page",
        description = "Tiles with 30-day deltas and weekly sparklines, one page of the caller's own applications (status filter and sort run in the API; size is capped at 50), the pipeline funnel and the latest status updates."
    )
    @GetMapping
    @OrgPermissionRequired
    public ConsultantApplicationsDTO.Response page(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestParam(required = false, defaultValue = "ALL") String status,
        @RequestParam(required = false, defaultValue = "applied") String sort,
        @RequestParam(required = false, defaultValue = "0") int page,
        @RequestParam(required = false, defaultValue = "10") int size
    ) {
        return service.page(me, status, sort, page, size);
    }

    @Operation(summary = "Application detail", description = "Dates and the stage timeline of one of the caller's own applications. Internal notes are never returned.")
    @GetMapping("/{applicationId}")
    @OrgPermissionRequired
    public ConsultantApplicationsDTO.Detail detail(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable long applicationId) {
        return service.detail(me, applicationId);
    }
}
