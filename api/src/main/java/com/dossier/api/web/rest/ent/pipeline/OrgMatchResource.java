package com.dossier.api.web.rest.ent.pipeline;

import com.dossier.api.service.ent.IdempotencyService;
import com.dossier.api.domain.ent.pipeline.OpportunityMatch;
import com.dossier.api.service.ent.pipeline.OpportunityMatchLifecycleService;
import com.dossier.api.service.ent.pipeline.OrgMatchService;
import com.dossier.api.service.ent.pipeline.OrgMatchQueryService;
import com.dossier.api.service.ent.pipeline.OrgMatchViews;
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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** On-demand organization matching for one consultant. The producer owns all dynamic authorization and metering decisions. */
@RestController
@RequestMapping("/api/orgs/{orgId}")
@Tag(name = "organization-matches", description = "Organization consultant matching and suggestions.")
public class OrgMatchResource {

    private final OrgMatchService service;
    private final IdempotencyService idempotency;
    private final OrgMatchQueryService query;
    private final OpportunityMatchLifecycleService lifecycle;

    public OrgMatchResource(
        OrgMatchService service,
        IdempotencyService idempotency,
        OrgMatchQueryService query,
        OpportunityMatchLifecycleService lifecycle
    ) {
        this.service = service;
        this.idempotency = idempotency;
        this.query = query;
        this.lifecycle = lifecycle;
    }

    @Operation(summary = "Review organization matches", description = "Lists canonical opportunity matches visible to the caller. Optional consultant and status filters are applied after dynamic matches.run authorization; no personal resume or profile data is returned.")
    @org.springframework.web.bind.annotation.GetMapping("/matches")
    @OrgPermissionRequired(beneficiary = Beneficiary.QUERY_MEMBER)
    public OrgMatchViews.Response list(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestParam(required = false) Long consultant,
        @RequestParam(required = false) String status
    ) {
        return query.list(me, new OrgMatchViews.Query(consultant, status));
    }

    @Operation(
        summary = "Run matching for one consultant",
        description = "Runs the bounded organization matching producer for the path consultant. The caller must be authorized to act for that consultant, and the consultant's feature license and FULL consent are checked before any personal profile data or AI provider call is reached. An Idempotency-Key is required."
    )
    @PostMapping("/consultants/{memberId}/matches/run")
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

    @Operation(summary = "Dismiss a suggested organization match", description = "Moves a SUGGESTED canonical match to DISMISSED through the lifecycle transition service. Retrying an already dismissed match is idempotent; assigned matches cannot be dismissed.")
    @PostMapping("/matches/{id}/dismiss")
    @OrgPermissionRequired
    public OrgMatchViews.Row dismiss(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long id
    ) {
        OpportunityMatch match = lifecycle.dismiss(me, id);
        return query.row(match);
    }
}
