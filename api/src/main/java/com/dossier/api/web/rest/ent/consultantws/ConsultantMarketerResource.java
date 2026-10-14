package com.dossier.api.web.rest.ent.consultantws;

import com.dossier.api.service.ent.consultantws.ConsultantMarketerDTO;
import com.dossier.api.service.ent.consultantws.ConsultantMarketerService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** The Consultant workspace "My Marketer" page: the caller's OWN marketer, focus opportunities and follow-ups. 404 for anyone who is not a consultant of this organization. */
@RestController
@RequestMapping("/api/orgs/{orgId}/me-workspace")
@Tag(name = "consultant-workspace", description = "The signed-in consultant's own workspace (never another member's data).")
public class ConsultantMarketerResource {

    private final ConsultantMarketerService service;

    public ConsultantMarketerResource(ConsultantMarketerService service) {
        this.service = service;
    }

    @Operation(
        summary = "Consultant: My Marketer",
        description = "The caller's current marketer (name and title), their own focus opportunities and follow-ups, and a derived focus summary. Blocks flagged sample=true (messages, shared plan, notes, response badge) are placeholders for the marketer role's module. opportunities.respond required; 404 for everyone else."
    )
    @GetMapping("/marketer")
    @OrgPermissionRequired
    public ConsultantMarketerDTO.Response marketer(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return service.page(me);
    }
}
