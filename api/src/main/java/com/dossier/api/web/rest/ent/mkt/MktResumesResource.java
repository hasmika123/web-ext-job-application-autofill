package com.dossier.api.web.rest.ent.mkt;

import com.dossier.api.service.ent.mkt.resumes.MktResumesDto;
import com.dossier.api.service.ent.mkt.resumes.MktResumesService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Marketing workspace, Resumes board. Every handler goes through {@code MktScope} in the service (generic 404 for a non-member, a flag that
 * is off, a missing permission or a consultant the caller is not assigned to). A marketer prepares and requests; nothing here submits
 * anything for a consultant, and nobody approves their own request.
 */
@RestController
@RequestMapping("/api/orgs/{orgId}/mkt/resumes")
@Tag(name = "mkt-resumes", description = "Marketing workspace: consultant resumes (metadata), preview, edit, approval request, activity.")
public class MktResumesResource {

    private final MktResumesService service;

    public MktResumesResource(MktResumesService service) {
        this.service = service;
    }

    @Operation(
        summary = "The Resumes board (one call)",
        description = "{kpis (total, profilesReady, needUpdates, approvalsPending), items, total, page, size, skills, activity, canApprove}. resumes.view_for (ASSIGNED for a marketer). "
            + "Query: q (consultant, resume title or target role), skill, status (APPROVED|PENDING|NEEDS_UPDATE), updated (7d|30d|3m|6m|all), availability, sort (modified|consultant|title|version|completeness|approval[,asc|desc]), page (from 0), size (1-100)."
    )
    @GetMapping
    @OrgPermissionRequired
    public MktResumesDto.Page list(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestParam(required = false) String q,
        @RequestParam(required = false) String skill,
        @RequestParam(required = false) String status,
        @RequestParam(required = false) String updated,
        @RequestParam(required = false) String availability,
        @RequestParam(required = false) String sort,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "10") int size
    ) {
        return service.list(me, new MktResumesDto.Query(q, skill, status, updated, availability, sort, page, size));
    }

    @Operation(summary = "Read-only preview of one resume", description = "Headline, summary, skills (primary first), experience and the change history. 404 for a consultant outside the caller's scope.")
    @GetMapping("/{id}")
    @OrgPermissionRequired
    public MktResumesDto.Detail get(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long id) {
        return service.detail(me, id);
    }

    @Operation(summary = "Download", description = "Resumes are metadata only: 404 NO_FILE_STORED with a message. Never invents a file.")
    @GetMapping("/{id}/download")
    @OrgPermissionRequired
    public void download(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long id) {
        service.download(me, id);
    }

    @Operation(
        summary = "Edit a resume's metadata (a new version)",
        description = "Body: any of title, headline, summary, targetRole (a JSON null clears all but title); other keys 422. resumes.edit_for (ASSIGNED). "
            + "A real change bumps the version, goes back to PENDING approval when it was approved, writes a change-log row and one audit row; a request that changes nothing writes none."
    )
    @PatchMapping("/{id}")
    @OrgPermissionRequired
    public MktResumesDto.Detail patch(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long id, @RequestBody Map<String, Object> body) {
        return service.edit(me, id, body);
    }

    @Operation(summary = "Ask the org admin to approve this resume", description = "resumes.edit_for. Sets it PENDING; never approves. Already pending: no change.")
    @PostMapping("/{id}/approval-request")
    @OrgPermissionRequired
    public MktResumesDto.Detail requestApproval(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long id) {
        return service.requestApproval(me, id);
    }

    @Operation(summary = "Mark a resume as needing an update", description = "resumes.edit_for. Optional body {note}. The next edit clears it.")
    @PostMapping("/{id}/needs-update")
    @OrgPermissionRequired
    public MktResumesDto.Detail needsUpdate(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long id,
        @RequestBody(required = false) Map<String, Object> body
    ) {
        Object note = body == null ? null : body.get("note");
        return service.markNeedsUpdate(me, id, note instanceof String s ? s : null);
    }

    @Operation(summary = "Approve a pending resume", description = "resumes.approve_request (org admin). 409 SELF_APPROVAL for the person who requested or edited it, 409 NOT_PENDING otherwise.")
    @PostMapping("/{id}/approve")
    @OrgPermissionRequired
    public MktResumesDto.Detail approve(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long id) {
        return service.approve(me, id);
    }
}
