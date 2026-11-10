package com.dossier.api.web.rest.org;

import com.dossier.api.domain.enumeration.OrgPermission;
import com.dossier.api.service.DemoGuard;
import com.dossier.api.service.dto.org.OrgCreateRequest;
import com.dossier.api.service.dto.org.OrgDetailDTO;
import com.dossier.api.service.dto.org.OrgMineDTO;
import com.dossier.api.service.dto.org.OrgPatchRequest;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgService;
import java.net.URI;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Organizations (docs/design/org/tenant-model.md section 5): create a DRAFT, list the caller's own, read, configure and
 * close. The org id is in the path, never in a header or body. Handlers that name an org are checked BEFORE their body
 * runs by {@code OrgPermissionInterceptor} (via {@link OrgPermissionRequired}); a caller who is not allowed gets the same
 * 404 as for an org that does not exist. Writes are refused for the shared demo accounts.
 */
@RestController
@RequestMapping("/api/orgs")
public class OrgResource {

    private static final Logger LOG = LoggerFactory.getLogger(OrgResource.class);

    private final OrgService orgService;
    private final DemoGuard demoGuard;

    public OrgResource(OrgService orgService, DemoGuard demoGuard) {
        this.orgService = orgService;
        this.demoGuard = demoGuard;
    }

    /** Creates a DRAFT organization with the caller as OWNER. */
    @PostMapping
    @OrgUnscoped
    public ResponseEntity<OrgDetailDTO> create(@RequestBody OrgCreateRequest request) {
        LOG.debug("REST request to create an organization");
        demoGuard.assertNotDemo();
        OrgDetailDTO created = orgService.create(request);
        return ResponseEntity.created(URI.create("/api/orgs/" + created.org().id())).body(created);
    }

    /** The organizations the caller is an ACTIVE member of. Scoped by the caller's own user id, never by an org id. */
    @GetMapping("/mine")
    @OrgUnscoped
    public List<OrgMineDTO> mine() {
        return orgService.mine();
    }

    /** The org, who the caller is in it, and the permission keys the web gates its UI on. Any ACTIVE member. */
    @GetMapping("/{orgId}")
    @OrgPermissionRequired
    public OrgDetailDTO get(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return orgService.get(me);
    }

    /** Settings, profile fields and the typed settings bag (OWNER / ADMIN). */
    @PatchMapping("/{orgId}")
    @OrgPermissionRequired(OrgPermission.ORG_SETTINGS_MANAGE)
    public OrgDetailDTO patch(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @RequestBody OrgPatchRequest request) {
        demoGuard.assertNotDemo();
        return orgService.patch(me, request);
    }

    /** Closes the org (OWNER only). Soft: members keep their accounts, billing history stays. */
    @PostMapping("/{orgId}/close")
    @OrgPermissionRequired(OrgPermission.ORG_CLOSE)
    public OrgDetailDTO close(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        demoGuard.assertNotDemo();
        return orgService.close(me);
    }
}
