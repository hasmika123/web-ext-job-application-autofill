package com.dossier.api.web.rest.ent;

import com.dossier.api.service.DemoGuard;
import com.dossier.api.service.dto.ent.ResumeBoardDTO;
import com.dossier.api.service.ent.IdempotencyService;
import com.dossier.api.service.ent.resumes.ResumeBoardQueryService;
import com.dossier.api.service.ent.resumes.ResumeBoardWriteService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The Resumes board (Enterprise V2 talent pages). Metadata only: there is no file store, so Download and Print export a generated copy of the
 * structured resume. What a caller sees and may change is decided in the services from the keys they hold ({@code resumes.view_for},
 * {@code resumes.edit_for}, {@code resumes.approve_request}) and the scope each is held at; a missing key, a row outside the scope and a resume of
 * another organization all answer the same generic 404.
 */
@RestController("entOrgResumeResource")
@RequestMapping("/api/orgs/{orgId}/resumes")
@Tag(name = "resumes", description = "Resumes board: table, KPI tiles, detail with preview, primary / visibility / approval, upload (metadata) and exports.")
public class OrgResumeResource {

    private final ResumeBoardQueryService query;
    private final ResumeBoardWriteService write;
    private final IdempotencyService idempotency;
    private final DemoGuard demoGuard;

    public OrgResumeResource(ResumeBoardQueryService query, ResumeBoardWriteService write, IdempotencyService idempotency, DemoGuard demoGuard) {
        this.query = query;
        this.write = write;
        this.idempotency = idempotency;
        this.demoGuard = demoGuard;
    }

    @Operation(
        summary = "List resumes",
        description = "Paged, server-driven table. Needs resumes.view_for; the rows are only the consultants inside the scope it is held at. Query: tab (all, pending, recent), q (2 to 80 characters: " +
            "resume, file, target role, headline, consultant, email or skill), departmentId, visibility (INTERNAL, PUBLIC, PRIVATE), status (APPROVED, PENDING, REJECTED), primary (true or false), ownerId, " +
            "consultantId, updated (days, 1 to 365), sort=field,dir (consultant, name, role, version, modified, created, status, size; 400 SORT_INVALID otherwise; default modified,desc), page (from 0), size (1 to 100, default 25). " +
            "Answers a page and X-Total-Count."
    )
    @GetMapping
    @OrgPermissionRequired
    public ResponseEntity<ResumeBoardDTO.Page> list(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestParam(name = "tab", required = false) String tab,
        @RequestParam(name = "q", required = false) String q,
        @RequestParam(name = "departmentId", required = false) Long departmentId,
        @RequestParam(name = "visibility", required = false) String visibility,
        @RequestParam(name = "status", required = false) String status,
        @RequestParam(name = "primary", required = false) Boolean primary,
        @RequestParam(name = "ownerId", required = false) Long ownerId,
        @RequestParam(name = "consultantId", required = false) Long consultantId,
        @RequestParam(name = "updated", required = false) Integer updatedDays,
        @RequestParam(name = "page", required = false) Integer page,
        @RequestParam(name = "size", required = false) Integer size,
        HttpServletRequest request
    ) {
        String sort = request.getParameter("sort"); // raw: "modified,desc" must not be split
        ResumeBoardDTO.Page result = query.list(me, new ResumeBoardQueryService.ListQuery(tab, q, departmentId, visibility, status, primary, ownerId, consultantId, updatedDays, sort, page, size));
        return noStore(result.total(), result);
    }

    @Operation(
        summary = "The four KPI tiles",
        description = "Total, Primary, Needs Approval and Updated This Week, each with its value, the figure one month (week for updates) ago when it can be rebuilt from the rows, and eight weekly points. " +
            "previous and the deltas are null when no history exists (the primary flag is not versioned): never estimated."
    )
    @GetMapping("/counts")
    @OrgPermissionRequired
    public ResponseEntity<ResumeBoardDTO.Counts> counts(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(query.counts(me));
    }

    @Operation(summary = "Filter options", description = "Departments and owners that appear on resumes inside the caller's scope.")
    @GetMapping("/filters")
    @OrgPermissionRequired
    public ResponseEntity<ResumeBoardDTO.FilterOptions> filters(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(query.filters(me));
    }

    @Operation(summary = "Consultants a resume can be added for", description = "Needs resumes.edit_for. q filters by name or email; at most 50.")
    @GetMapping("/consultants")
    @OrgPermissionRequired
    public ResponseEntity<List<ResumeBoardDTO.ConsultantOption>> consultants(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestParam(name = "q", required = false) String q
    ) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(query.consultants(me, q));
    }

    @Operation(
        summary = "One resume: the drawer",
        description = "The row, the preview data (headline, summary, skills, experience) and what the caller may do with it (actions). 404 outside the caller's scope."
    )
    @GetMapping("/{resumeId}")
    @OrgPermissionRequired
    public ResponseEntity<ResumeBoardDTO.Detail> get(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long resumeId) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(query.detail(me, resumeId));
    }

    @Operation(
        summary = "Set or clear the primary resume",
        description = "Body {primary: true|false}. Needs resumes.edit_for covering the consultant. Only an APPROVED resume can become primary (409 NOT_APPROVED); the consultant's previous primary " +
            "is cleared in the same transaction and returned as previousPrimaryId so an Undo can give it back. One RESUME_PRIMARY audit row when something changed."
    )
    @PutMapping("/{resumeId}/primary")
    @OrgPermissionRequired
    public ResumeBoardDTO.PrimaryResult primary(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long resumeId,
        @RequestBody ResumeBoardDTO.PrimaryRequest body
    ) {
        demoGuard.assertNotDemo();
        return write.setPrimary(me, resumeId, body == null ? null : body.primary());
    }

    @Operation(
        summary = "Change who can see a resume",
        description = "Body {visibility: INTERNAL|PUBLIC|PRIVATE}. Needs resumes.edit_for covering the consultant. Answers the previous value for Undo. One RESUME_VISIBILITY audit row when it changed."
    )
    @PutMapping("/{resumeId}/visibility")
    @OrgPermissionRequired
    public ResumeBoardDTO.VisibilityResult visibility(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long resumeId,
        @RequestBody ResumeBoardDTO.VisibilityRequest body
    ) {
        demoGuard.assertNotDemo();
        return write.setVisibility(me, resumeId, body == null ? null : body.visibility());
    }

    @Operation(
        summary = "Approve, reject or reopen a resume",
        description = "Body {decision: APPROVE|REJECT|REOPEN, note?}. Needs resumes.approve_request. APPROVE and REJECT apply to a PENDING resume (409 NOT_PENDING) and are refused for the person who prepared it " +
            "(422 SELF_DECISION). REOPEN puts a decided resume back to PENDING (the Undo). One RESUME_APPROVE / RESUME_REJECT / RESUME_REOPEN audit row."
    )
    @PostMapping("/{resumeId}/decision")
    @OrgPermissionRequired
    public ResumeBoardDTO.DecisionResult decision(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long resumeId,
        @RequestBody ResumeBoardDTO.DecisionRequest body
    ) {
        demoGuard.assertNotDemo();
        return write.decide(me, resumeId, body == null ? null : body.decision(), body == null ? null : body.note());
    }

    @Operation(
        summary = "Add a resume (metadata only)",
        description = "Body: consultantId, name, fileName? (a plain label, no folders), targetRole?, headline?, summary?, visibility? (default INTERNAL), experience[] (title, employer, startYear, endYear). " +
            "Needs resumes.edit_for covering the consultant. The record starts PENDING at version 1, not primary, owned by the caller. No file is stored. Text containing a never-collected value is 422 SENSITIVE_CONTENT. " +
            "Idempotency-Key required. One RESUME_CREATE audit row."
    )
    @PostMapping
    @OrgPermissionRequired
    public ResponseEntity<ResumeBoardDTO.Detail> create(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestHeader(value = "Idempotency-Key", required = false) String key,
        @RequestBody ResumeBoardDTO.CreateRequest body,
        HttpServletRequest request
    ) {
        demoGuard.assertNotDemo();
        IdempotencyService.Outcome<ResumeBoardDTO.Detail> out = idempotency.execute(me, key, true, "POST", request.getRequestURI(), body, 201, ResumeBoardDTO.Detail.class, () -> write.create(me, body));
        ResponseEntity.BodyBuilder res = ResponseEntity.status(out.status());
        if (out.replayed()) res.header("Idempotent-Replayed", "true");
        return res.body(out.body());
    }

    @Operation(
        summary = "Change many resumes at once",
        description = "Body {ids (1 to 100), action: VISIBILITY|APPROVE|REJECT|REOPEN, visibility?}. VISIBILITY needs resumes.edit_for, the others resumes.approve_request. Each resume is applied or skipped with a reason " +
            "(NOT_FOUND, UNCHANGED, NOT_PENDING, SELF_DECISION, NOT_APPROVED); previous is the value an Undo puts back. One audit row per change plus one RESUME_BULK row. Idempotency-Key required."
    )
    @PostMapping("/bulk")
    @OrgPermissionRequired
    public ResponseEntity<ResumeBoardDTO.BulkResult> bulk(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestHeader(value = "Idempotency-Key", required = false) String key,
        @RequestBody ResumeBoardDTO.BulkRequest body,
        HttpServletRequest request
    ) {
        demoGuard.assertNotDemo();
        write.validateBulk(body); // the shape of the body, outside any transaction
        IdempotencyService.Outcome<ResumeBoardDTO.BulkResult> out = idempotency.execute(me, key, true, "POST", request.getRequestURI(), body, 200, ResumeBoardDTO.BulkResult.class, () -> write.bulk(me, body));
        ResponseEntity.BodyBuilder res = ResponseEntity.status(out.status());
        if (out.replayed()) res.header("Idempotent-Replayed", "true");
        return res.body(out.body());
    }

    @Operation(
        summary = "Download or print a generated copy",
        description = "format=txt (attachment) or html (a script-free, self-contained printable page). Generated from the structured resume: there is no stored file. Needs resumes.view_for. One RESUME_EXPORT audit row."
    )
    @GetMapping("/{resumeId}/export")
    @OrgPermissionRequired
    public ResponseEntity<byte[]> export(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long resumeId,
        @RequestParam(name = "format", required = false) String format
    ) {
        ResumeBoardQueryService.Export e = query.export(me, resumeId, format);
        boolean html = e.contentType().startsWith("text/html");
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.parseMediaType(e.contentType()));
        headers.setContentDisposition((html ? ContentDisposition.inline() : ContentDisposition.attachment()).filename(e.fileName()).build());
        headers.add("X-Content-Type-Options", "nosniff");
        headers.add("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
        headers.setCacheControl(CacheControl.noStore());
        return ResponseEntity.ok().headers(headers).body(e.body());
    }

    private static <T> ResponseEntity<T> noStore(long total, T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header("X-Total-Count", String.valueOf(total)).body(body);
    }
}
