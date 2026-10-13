package com.dossier.api.web.rest.ent.consultantws;

import com.dossier.api.service.ent.consultantws.ConsultantHomeDTO;
import com.dossier.api.service.ent.consultantws.ConsultantHomeService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** The Consultant workspace Home: the caller's OWN opportunities, applications, interviews and resume strength. 404 for anyone who is not a consultant of this organization. */
@RestController
@RequestMapping("/api/orgs/{orgId}/me-workspace")
@Tag(name = "consultant-workspace", description = "The signed-in consultant's own workspace (never another member's data).")
public class ConsultantHomeResource {

    private final ConsultantHomeService service;

    public ConsultantHomeResource(ConsultantHomeService service) {
        this.service = service;
    }

    @Operation(
        summary = "Consultant home",
        description = "Tiles, recommended matches, assigned opportunities, applications, upcoming interviews, resume strength, today's focus and tasks, all for the caller's own consultant record. Blocks flagged sample=true are placeholders for other roles' modules. opportunities.respond required; 404 for everyone else."
    )
    @GetMapping("/home")
    @OrgPermissionRequired
    public ConsultantHomeDTO.Response home(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return service.home(me);
    }
}
