package com.dossier.api.web.rest.ent.mkt;

import com.dossier.api.service.ent.IdempotencyService.Outcome;
import com.dossier.api.service.ent.jobs.IdempotentCreate;
import com.dossier.api.service.ent.mkt.opportunities.MktFromExtensionDTO;
import com.dossier.api.service.ent.mkt.opportunities.MktFromExtensionDTO.Response;
import com.dossier.api.service.ent.mkt.opportunities.MktFromExtensionService;
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
 * "Save for consultant" from the marketer's extension (docs/enterprise-v2/60-job-phase1-contract.md section 4). Permission
 * {@code opportunities.manage}, resolved by {@code MktScope} inside the service: a caller without it, a non-member and an organization outside the
 * flags all get the same generic 404. The body is read as raw bytes so the 8 KB cap and the field whitelist (unknown fields are 400, including
 * {@code jobDescription}, {@code state} and {@code appliedAt}) are enforced by {@link MktFromExtensionDTO#parse}, not left to the mapper's defaults.
 * E1: this prepares and assigns; it never fetches the link, applies, or signs in as anyone.
 */
@RestController
@RequestMapping("/api/orgs/{orgId}/mkt/opportunities")
@Tag(name = "mkt-opportunities", description = "Marketing: opportunities, including the extension's Save for consultant.")
public class MktFromExtensionResource {

    private final MktFromExtensionService service;

    public MktFromExtensionResource(MktFromExtensionService service) {
        this.service = service;
    }

    @Operation(
        summary = "Save a job from the extension for one or more consultants",
        description = "Requires the Idempotency-Key header (a UUID; 400 IDEMPOTENCY_KEY_MISSING). Body (at most 8 KB, unknown fields are 400): jobUrl, title, company, keyInfo, consultantIds (1 to 20) "
            + "and optionally location, workMode, employmentType, payLabel, payMin, payMax, payPeriod, externalJobId, atsPlatform, postedOn, skills (8), priority, dueOn, extensionVersion. "
            + "Answers {jobId, existingJob, results:[{consultantId, opportunityId, existing, reason?}]}; a consultant that cannot be assigned is reported in results, not as an error. "
            + "422 SENSITIVE_CONTENT, 409 JOB_NOT_OPEN."
    )
    @PostMapping(value = "/from-extension", consumes = "application/json")
    @OrgPermissionRequired
    public ResponseEntity<Response> fromExtension(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestHeader(value = IdempotentCreate.HEADER, required = false) String idempotencyKey,
        @RequestBody(required = false) byte[] body
    ) {
        Outcome<Response> out = service.fromExtension(me, idempotencyKey, body);
        ResponseEntity.BodyBuilder ok = ResponseEntity.status(out.status());
        if (out.replayed()) ok = ok.header(IdempotentCreate.REPLAYED_HEADER, "true");
        return ok.body(out.body());
    }
}
