package com.dossier.api.web.rest;

import com.dossier.api.config.Constants;
import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.AdminSessionService;
import com.dossier.api.service.AdminSessionService.SessionFamily;
import jakarta.validation.constraints.Pattern;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Admin sessions/security (Phase 9.A2.3): list a user's refresh-token families and revoke one.
 * ADMIN-gated; revoke is audited in the service. The blanket "force-logout" (revoke all) lives in
 * AdminUserActionResource; this is the per-session control.
 */
@RestController
@RequestMapping("/api/admin/users/{login}/sessions")
@PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
public class AdminSessionResource {

    private static final Logger LOG = LoggerFactory.getLogger(AdminSessionResource.class);

    private final AdminSessionService service;

    public AdminSessionResource(AdminSessionService service) {
        this.service = service;
    }

    @GetMapping
    public List<SessionFamily> list(@PathVariable("login") @Pattern(regexp = Constants.LOGIN_REGEX) String login) {
        LOG.debug("REST request to list sessions for {}", login);
        return service.listFamilies(login);
    }

    @PostMapping("/{familyId}/revoke")
    public ResponseEntity<Void> revoke(
        @PathVariable("login") @Pattern(regexp = Constants.LOGIN_REGEX) String login,
        @PathVariable("familyId") String familyId
    ) {
        LOG.debug("REST request to revoke session {} for {}", familyId, login);
        service.revokeFamily(login, familyId);
        return ResponseEntity.noContent().build();
    }
}
