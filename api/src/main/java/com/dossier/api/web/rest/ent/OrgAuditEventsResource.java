package com.dossier.api.web.rest.ent;

import com.dossier.api.domain.enumeration.OrgPermission;
import com.dossier.api.service.ent.audit.OrgAuditEventsService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** The organization audit log page (read only): {@code GET /api/orgs/{orgId}/audit}. */
@RestController("entOrgAuditEventsResource")
@RequestMapping("/api/orgs/{orgId}/audit")
@Tag(name = "audit", description = "Organization audit: the log of who did what (read only).")
public class OrgAuditEventsResource {

    private final OrgAuditEventsService service;

    public OrgAuditEventsResource(OrgAuditEventsService service) {
        this.service = service;
    }

    @Operation(
        summary = "The organization audit log",
        description = "{items:[{id, at, action, label, actorName, targetType, targetName}], total, page, size, actions:[{action,label}]}, newest first. Filters: action (an action key), from and to (ISO instants, from inclusive, to exclusive). " +
            "page from 0, size 1 to 100 (default 25). Free text, logins and IP hashes are never sent. audit.view at ORG scope and not row-filtered; 404 otherwise."
    )
    @GetMapping
    @OrgPermissionRequired(OrgPermission.AUDIT_VIEW)
    public OrgAuditEventsService.Response list(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestParam(required = false) String action,
        @RequestParam(required = false) Instant from,
        @RequestParam(required = false) Instant to,
        @RequestParam(required = false) Integer page,
        @RequestParam(required = false) Integer size
    ) {
        return service.list(me, action, from, to, page, size);
    }

    @Operation(
        summary = "The same filtered log as a CSV download",
        description = "Same filters as the list (action, from, to). Newest first, at most the admin setting org.audit.export_max_rows rows (a final line says when cut). Cells that a spreadsheet would read as a formula are neutralised. " +
            "The export itself is audited (EXPORT). audit.view at ORG scope and not row-filtered; 404 otherwise."
    )
    @GetMapping("/export")
    @OrgPermissionRequired(OrgPermission.AUDIT_VIEW)
    public ResponseEntity<byte[]> export(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestParam(required = false) String action,
        @RequestParam(required = false) Instant from,
        @RequestParam(required = false) Instant to
    ) {
        String csv = service.exportCsv(me, action, from, to);
        return ResponseEntity.ok()
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"audit-log.csv\"")
            .cacheControl(CacheControl.noStore())
            .contentType(MediaType.parseMediaType("text/csv;charset=UTF-8"))
            .body(csv.getBytes(StandardCharsets.UTF_8));
    }
}
