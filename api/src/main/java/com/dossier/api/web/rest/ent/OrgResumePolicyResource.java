package com.dossier.api.web.rest.ent;

import com.dossier.api.domain.enumeration.OrgPermission;
import com.dossier.api.service.DemoGuard;
import com.dossier.api.service.dto.ent.OrgResumePolicyDTO;
import com.dossier.api.service.ent.resumes.OrgResumePolicyService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The org admin's Resume Builder policy switch: may consultants of this organization create share links for their organization resumes
 * (default off). Needs {@code org.settings.manage} (OWNER, ADMIN). The organization is the one in the path, authorised against the caller's
 * seat; another organization's id is the usual generic 404.
 */
@RestController
@RequestMapping("/api/orgs/{orgId}/resume-policy")
@Tag(name = "org-resume-policy", description = "Organization Resume Builder policy: consultant share links (default off).")
public class OrgResumePolicyResource {

    private final OrgResumePolicyService service;
    private final DemoGuard demoGuard;

    public OrgResumePolicyResource(OrgResumePolicyService service, DemoGuard demoGuard) {
        this.service = service;
        this.demoGuard = demoGuard;
    }

    @Operation(
        summary = "The organization's resume policy",
        description = "consultantShareLinks is the value in force; overridden says whether this organization set it itself; activeConsultantLinks is how many live share links and named-person grants on the organization's resumes switching it off would pause."
    )
    @GetMapping
    @OrgPermissionRequired(OrgPermission.ORG_SETTINGS_MANAGE)
    public ResponseEntity<OrgResumePolicyDTO> get(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.get(me));
    }

    @Operation(
        summary = "Let consultants create share links, or stop them",
        description = "Body {consultantShareLinks: true|false} (422 otherwise). A marketer acting for a consultant can never create share links, whatever this says. Off pauses every existing consultant share link of the organization's resumes right away (they open nothing, not even a hint); on restores those not revoked or expired meanwhile. One ORG_SETTINGS audit row when the value changed (old, new, linksPaused or linksRestored)."
    )
    @PutMapping
    @OrgPermissionRequired(OrgPermission.ORG_SETTINGS_MANAGE)
    public ResponseEntity<OrgResumePolicyDTO> put(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestBody OrgResumePolicyDTO.Update body
    ) {
        demoGuard.assertNotDemo();
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.setConsultantShareLinks(me, body == null ? null : body.consultantShareLinks()));
    }
}
