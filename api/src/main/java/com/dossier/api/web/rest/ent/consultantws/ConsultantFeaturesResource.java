package com.dossier.api.web.rest.ent.consultantws;

import com.dossier.api.service.ent.consultantws.ConsultantFeaturesDTO;
import com.dossier.api.service.ent.consultantws.ConsultantFeaturesService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Consultant workspace My Features: the caller's OWN entitlements and usage, read-only. 404 for anyone who is not a consultant of this organization. */
@RestController
@RequestMapping("/api/orgs/{orgId}/me-workspace/features")
@Tag(name = "consultant-workspace", description = "The signed-in consultant's own workspace (never another member's data).")
public class ConsultantFeaturesResource {

    private final ConsultantFeaturesService service;

    public ConsultantFeaturesResource(ConsultantFeaturesService service) {
        this.service = service;
    }

    @Operation(summary = "My Features page", description = "Tiles and the features with status, allowance and usage. Needs features.view. No prices or billing.")
    @GetMapping
    @OrgPermissionRequired
    public ConsultantFeaturesDTO.Response page(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return service.page(me);
    }
}
