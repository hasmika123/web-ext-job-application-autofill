package com.dossier.api.web.rest.ent.mkt;

import com.dossier.api.service.ent.mkt.home.MktHomeDto.View;
import com.dossier.api.service.ent.mkt.home.MktHomeService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The Marketing workspace Home board (`/w/marketing`). Permission {@code consultants.view}, ASSIGNED scope: only the caller's consultants (anyone else: the
 * generic 404). Read-only (E1): nothing here submits for a consultant.
 */
@RestController
@RequestMapping("/api/orgs/{orgId}/mkt/home")
@Tag(name = "mkt-home", description = "Marketing workspace: the Home board (read-only).")
public class MktHomeResource {

    private final MktHomeService service;

    public MktHomeResource(MktHomeService service) {
        this.service = service;
    }

    @Operation(
        summary = "The Marketing Home board (one call)",
        description = "{kpis[6], talent[5], streams[5], openings[5], pipeline, tasks[5], interviews[4], activity[5]}. Each section is empty (or null) when its source has no rows or the caller may not read its page. 404 without consultants.view."
    )
    @GetMapping
    @OrgPermissionRequired
    public View get(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return service.home(me);
    }
}
