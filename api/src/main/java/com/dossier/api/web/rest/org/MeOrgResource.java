package com.dossier.api.web.rest.org;

import com.dossier.api.domain.enumeration.OrgPermission;
import com.dossier.api.service.DemoGuard;
import com.dossier.api.service.dto.org.MyOrgDTO;
import com.dossier.api.service.dto.org.ShareChangeRequest;
import com.dossier.api.service.org.DataShareService.ShareContext;
import com.dossier.api.service.org.MyOrgService;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.filter.RateLimitFilter;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * An organization from the member's side (O6.2; consent-data-sharing.md section 4): the ones I belong to and what each
 * can see, what I share with each, and leaving. The org id is in the path and checked BEFORE the body runs
 * ({@code OrgPermissionInterceptor} covers {@code /api/me/orgs/**}); a caller who is not an ACTIVE member of that org is
 * told 404 like for an org that does not exist. Only the caller's own seat can be acted on.
 */
@RestController
@RequestMapping("/api/me/orgs")
@Tag(name = "org-me", description = "A member's organizations: what they share, and leaving.")
public class MeOrgResource {

    private final MyOrgService myOrgs;
    private final DemoGuard demoGuard;

    public MeOrgResource(MyOrgService myOrgs, DemoGuard demoGuard) {
        this.myOrgs = myOrgs;
        this.demoGuard = demoGuard;
    }

    @Operation(summary = "My organizations", description = "Every organization the caller is an active (or suspended) member of: their role, what they share and, in plain words, what that lets the org see. Scoped by the caller, never by an org id.")
    @GetMapping
    @OrgUnscoped
    public List<MyOrgDTO> mine() {
        return myOrgs.mine();
    }

    @Operation(summary = "Change what I share", description = "NONE, SUMMARY or FULL with the consent text version shown. Effective on the next request. FULL needs a named active marketer of the org (422 otherwise).")
    @PutMapping("/{orgId}/share")
    @OrgPermissionRequired(OrgPermission.SELF_SHARE_SCOPE_SET)
    public MyOrgDTO changeShare(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestBody ShareChangeRequest request,
        HttpServletRequest http
    ) {
        demoGuard.assertNotDemo();
        return myOrgs.changeShare(me, request, new ShareContext(OrgAuditService.hashIp(RateLimitFilter.clientIp(http)), OrgAuditService.hashIp(http.getHeader(HttpHeaders.USER_AGENT))));
    }

    @Operation(summary = "Leave an organization", description = "Ends all sharing and the seat. Nothing is deleted from the account. 409 OWNER_MUST_TRANSFER for an owner, 409 LEAVE_NOT_ALLOWED when the org does not let members leave.")
    @PostMapping("/{orgId}/leave")
    @OrgPermissionRequired(OrgPermission.SELF_LEAVE)
    public ResponseEntity<Void> leave(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        demoGuard.assertNotDemo();
        myOrgs.leave(me);
        return ResponseEntity.noContent().build();
    }
}
