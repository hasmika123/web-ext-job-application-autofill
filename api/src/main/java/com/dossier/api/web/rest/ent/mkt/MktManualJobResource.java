package com.dossier.api.web.rest.ent.mkt;

import com.dossier.api.service.ent.IdempotencyService.Outcome;
import com.dossier.api.service.ent.jobs.IdempotentCreate;
import com.dossier.api.service.ent.mkt.opportunities.MktManualJobService;
import com.dossier.api.service.ent.mkt.opportunities.MktManualJobService.Request;
import com.dossier.api.service.ent.mkt.opportunities.MktManualJobService.Response;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * MKT-40: a marketer adds a job by hand. Permission {@code opportunities.manage} (resolved by {@code MktScope} inside the service: anyone without it,
 * a non-member and an organization outside the flags get the same generic 404). It prepares a job only: it never assigns, applies or signs in as anyone.
 */
@RestController
@RequestMapping("/api/orgs/{orgId}/mkt/opportunities")
@Tag(name = "mkt-opportunities", description = "Marketing: opportunities, including adding a job by hand.")
public class MktManualJobResource {

    private final MktManualJobService service;

    public MktManualJobResource(MktManualJobService service) {
        this.service = service;
    }

    @Operation(
        summary = "Add a job by hand",
        description = "Requires the Idempotency-Key header (a UUID). Body: title, company, location, workMode (ONSITE, HYBRID or REMOTE), description and optionally jobUrl (https) and skills (8). "
            + "The job is org-owned with source MANUAL; the same job (the link, else company + title + place) answers the stored one with existingJob true. "
            + "Answers 201 {jobId, existingJob, source}. 400 VALIDATION, 422 SENSITIVE_CONTENT. Needs opportunities.manage, not requirements.manage."
    )
    @PostMapping(value = "/job", consumes = "application/json")
    @OrgPermissionRequired
    public ResponseEntity<Response> create(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestHeader(value = IdempotentCreate.HEADER, required = false) String idempotencyKey,
        @RequestBody(required = false) Request body
    ) {
        Outcome<Response> out = service.create(me, idempotencyKey, body);
        ResponseEntity.BodyBuilder ok = ResponseEntity.status(out.status());
        if (out.replayed()) ok = ok.header(IdempotentCreate.REPLAYED_HEADER, "true");
        return ok.body(out.body());
    }
}
