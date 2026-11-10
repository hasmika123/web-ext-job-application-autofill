package com.dossier.api.web.rest.ent;

import com.dossier.api.service.dto.ApplicationDTO;
import com.dossier.api.service.ent.tracker.SaveForConsultantService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.filter.FixedWindowRateLimiter;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * X9.12 (re-scoped): "Save a job for a consultant". The HTTP path of {@link SaveForConsultantService}: an enterprise marketer SAVES a job (status SAVED) onto
 * an ASSIGNED consultant's tracker. It never applies, fills or submits (E1; the single ArchUnit exception for that service is decision D8). Every refusal is
 * the generic 404 (unassigned, a consultant of another organization, a caller who is not a marketer with {@code member.act_for}, the module off); saving the
 * same posting twice returns the same application ({@code alreadySaved = true}); one marketer may save at most {@value #LIMIT} jobs a minute.
 */
@RestController
@RequestMapping("/api/orgs/{orgId}/consultants/{memberId}/applications/save")
@Tag(name = "tracker-act-for", description = "A marketer saves a job for an assigned consultant (save only, never submit).")
public class SaveForConsultantResource {

    static final int LIMIT = 30;
    static final long WINDOW_MS = 60_000L;

    private final SaveForConsultantService service;
    private final FixedWindowRateLimiter limiter = new FixedWindowRateLimiter(10 * WINDOW_MS, WINDOW_MS);

    public SaveForConsultantResource(SaveForConsultantService service) {
        this.service = service;
    }

    /** What the marketer is told: the consultant's application id, the job, its status, and whether it was already there. Nothing else of the consultant's tracker. */
    public record Saved(Long applicationId, String company, String roleTitle, String status, boolean alreadySaved) {}

    @Operation(
        summary = "Save a job for an assigned consultant",
        description = "Body: {company, roleTitle, jobUrl?, location?, externalJobId?, atsPlatform?, postingId?}. Creates the application on the CONSULTANT's tracker with status SAVED, source org, "
            + "history 'Updated by <marketer> on behalf of <consultant>'; a job the consultant already has keeps its status (alreadySaved = true). Needs member.act_for and an active assignment; "
            + "404 for anything else; 429 over 30 saves a minute. Never submits."
    )
    @PostMapping
    @OrgPermissionRequired
    public ResponseEntity<Saved> save(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long memberId,
        @RequestBody SaveForConsultantService.Request body
    ) {
        long retry = limiter.retryAfterSeconds("save-for " + me.orgId() + ':' + me.memberId(), LIMIT, WINDOW_MS, System.currentTimeMillis());
        if (retry > 0) return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).header(HttpHeaders.RETRY_AFTER, Long.toString(retry)).build();
        SaveForConsultantService.Outcome out = service.saveWithOutcome(me, memberId, body);
        ApplicationDTO a = out.application();
        return ResponseEntity.ok(new Saved(a.getId(), a.getCompany(), a.getRoleTitle(), a.getStatus() == null ? null : a.getStatus().name(), out.alreadySaved()));
    }
}
