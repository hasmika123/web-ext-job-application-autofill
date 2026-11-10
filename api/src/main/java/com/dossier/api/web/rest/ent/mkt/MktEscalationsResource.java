package com.dossier.api.web.rest.ent.mkt;

import com.dossier.api.service.DemoGuard;
import com.dossier.api.service.ent.IdempotencyService;
import com.dossier.api.service.ent.mkt.escalations.EscalationDTO;
import com.dossier.api.service.ent.mkt.escalations.MktEscalationsService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * "Escalate to my manager": the marketer's side of the escalations. Permission {@code opportunities.manage}, resolved by {@code MktScope}: a caller without it,
 * a non-member, an organization outside the flags and a consultant or opportunity outside the caller's scope all get the same generic 404. The row is a MANUAL
 * escalation; the rules raise the others. Nothing here changes a consultant's application.
 */
@RestController
@RequestMapping("/api/orgs/{orgId}/mkt/escalations")
@Tag(name = "mkt-escalations", description = "Marketing: escalate an opportunity or a consultant to the marketing manager.")
public class MktEscalationsResource {

    private final MktEscalationsService service;
    private final IdempotencyService idempotency;
    private final DemoGuard demoGuard;

    public MktEscalationsResource(MktEscalationsService service, IdempotencyService idempotency, DemoGuard demoGuard) {
        this.service = service;
        this.idempotency = idempotency;
        this.demoGuard = demoGuard;
    }

    @Operation(
        summary = "Escalate to my manager",
        description = "opportunities.manage for a consultant the caller may see. Body: kind (MANUAL), severity (LOW, MEDIUM or HIGH; MEDIUM by default), subjectType (MKT_OPPORTUNITY with subjectId = the opportunity's id as the Opportunities routes use it, or CONSULTANT with the profile id), " +
            "title (required, 160 characters), detail (optional, 500 characters); both are scanned for sensitive data. The managers of the consultant's marketer see it on their Escalations page. One audit row. Idempotency-Key required."
    )
    @PostMapping
    @OrgPermissionRequired
    public ResponseEntity<EscalationDTO> raise(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestHeader(value = "Idempotency-Key", required = false) String key,
        @RequestBody EscalationDTO.RaiseRequest body,
        HttpServletRequest request
    ) {
        demoGuard.assertNotDemo();
        service.gate(me); // the permission wall first
        IdempotencyService.Outcome<EscalationDTO> out = idempotency.execute(me, key, true, "POST", request.getRequestURI(), body, 200, EscalationDTO.class, () -> service.raise(me, body));
        ResponseEntity.BodyBuilder ok = ResponseEntity.status(out.status());
        if (out.replayed()) ok.header("Idempotent-Replayed", "true");
        return ok.body(out.body());
    }
}
