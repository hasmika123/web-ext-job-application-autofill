package com.dossier.api.web.rest.ent.mkt;

import com.dossier.api.service.ent.mkt.matches.MktCanonicalMatchesDto;
import com.dossier.api.service.ent.mkt.matches.MktCanonicalMatchesService;
import com.dossier.api.service.ent.pipeline.OrgMatchViews;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Canonical opportunity-match feed for the marketer workspace migration. */
@RestController
@RequestMapping("/api/orgs/{orgId}/mkt/matches/canonical")
@Tag(name = "mkt-matches-canonical", description = "Marketing workspace compatibility feed for canonical opportunity matches.")
public class MktCanonicalMatchesResource {

    private final MktCanonicalMatchesService service;

    public MktCanonicalMatchesResource(MktCanonicalMatchesService service) {
        this.service = service;
    }

    @Operation(
        summary = "List canonical marketer matches",
        description = "Returns source-labelled opportunity_match rows for the marketer workspace. The response is read-only and contains the canonical non-PII opportunity view; tenant, module, permission, and consultant scope are enforced by the service boundary."
    )
    @GetMapping
    @OrgPermissionRequired
    public MktCanonicalMatchesDto.Response list(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestParam(required = false) Long consultant,
        @RequestParam(required = false) String status
    ) {
        return service.list(me, new OrgMatchViews.Query(consultant, status));
    }

    @Operation(summary = "Read one canonical marketer match", description = "Returns one canonical non-PII match row after tenant, permission, and effective consultant scope checks.")
    @GetMapping("/{id}")
    @OrgPermissionRequired
    public OrgMatchViews.Row get(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long id
    ) {
        return service.detail(me, id);
    }

    @Operation(summary = "Assign one canonical marketer match", description = "Delegates the canonical assign transition; it never uses the legacy requirement_match duplicate-guard path.")
    @PostMapping("/{id}/assign")
    @OrgPermissionRequired
    public OrgMatchViews.Row assign(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long id
    ) {
        return service.assign(me, id);
    }

    @Operation(summary = "Dismiss one canonical marketer match", description = "Delegates the canonical dismiss transition; it never directly mutates status.")
    @PostMapping("/{id}/dismiss")
    @OrgPermissionRequired
    public OrgMatchViews.Row dismiss(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long id
    ) {
        return service.dismiss(me, id);
    }
}
