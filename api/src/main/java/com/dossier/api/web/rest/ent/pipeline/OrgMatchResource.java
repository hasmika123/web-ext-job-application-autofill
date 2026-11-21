package com.dossier.api.web.rest.ent.pipeline;

import com.dossier.api.service.ent.IdempotencyService;
import com.dossier.api.service.ent.pipeline.OrgMatchService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.ent.authz.Beneficiary;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import com.dossier.api.service.ent.jobs.IdempotentCreate;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** On-demand organization matching for one consultant. The producer owns all dynamic authorization and metering decisions. */
@RestController
@RequestMapping("/api/orgs/{orgId}/consultants/{memberId}/matches")
@Tag(name = "organization-matches", description = "Organization consultant matching and suggestions.")
public class OrgMatchResource {

    private final OrgMatchService service;
    private final IdempotencyService idempotency;

    public OrgMatchResource(OrgMatchService service, IdempotencyService idempotency) {
        this.service = service;
        this.idempotency = idempotency;
    }

    @Operation(
        summary = "Run matching for one consultant",
        description = "Runs the bounded organization matching producer for the path consultant. The caller must be authorized to act for that consultant, and the consultant's feature license and FULL consent are checked before any personal profile data or AI provider call is reached. An Idempotency-Key is required."
    )
    @PostMapping("/run")
    @OrgPermissionRequired(beneficiary = Beneficiary.PATH_MEMBER)
    public ResponseEntity<OrgMatchService.Result> run(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long memberId,
        @RequestHeader(value = IdempotentCreate.HEADER, required = false) String idempotencyKey,
        HttpServletRequest request
    ) {
        IdempotencyService.Outcome<OrgMatchService.Result> out = idempotency.execute(
            me,
            idempotencyKey,
            true,
            "POST",
            request.getRequestURI(),
            Map.of(),
            200,
            OrgMatchService.Result.class,
            () -> service.matchOne(me, memberId, idempotencyKey)
        );
        ResponseEntity.BodyBuilder ok = ResponseEntity.status(out.status());
        if (out.replayed()) ok.header(IdempotentCreate.REPLAYED_HEADER, "true");
        return ok.body(out.body());
    }
}
