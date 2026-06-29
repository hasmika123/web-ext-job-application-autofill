package com.dossier.api.web.rest;

import com.dossier.api.config.Constants;
import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.AdminUserActionService;
import com.dossier.api.service.dto.AdminUserDTO;
import jakarta.validation.constraints.Pattern;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Admin actions on a single user account (Phase 9.A1.4): activate/deactivate, password reset,
 * grant/revoke admin, force-logout, and permanent GDPR delete. ADMIN-gated (by `/api/admin/**`
 * and a method-level guard); each action is audited and self-harming ones are blocked in the
 * service. Lives alongside the JHipster UserResource (`/api/admin/users`) but adds the verbs it
 * doesn't have — the destructive delete here is a FULL data erase, not the soft user-row delete.
 */
@RestController
@RequestMapping("/api/admin/users/{login}")
@PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
public class AdminUserActionResource {

    private static final Logger LOG = LoggerFactory.getLogger(AdminUserActionResource.class);

    private final AdminUserActionService service;

    public AdminUserActionResource(AdminUserActionService service) {
        this.service = service;
    }

    @PostMapping("/activate")
    public ResponseEntity<AdminUserDTO> activate(@PathVariable("login") @Pattern(regexp = Constants.LOGIN_REGEX) String login) {
        LOG.debug("REST request to activate user {}", login);
        return ResponseEntity.ok(service.setActivated(login, true));
    }

    @PostMapping("/deactivate")
    public ResponseEntity<AdminUserDTO> deactivate(@PathVariable("login") @Pattern(regexp = Constants.LOGIN_REGEX) String login) {
        LOG.debug("REST request to deactivate user {}", login);
        return ResponseEntity.ok(service.setActivated(login, false));
    }

    @PostMapping("/grant-admin")
    public ResponseEntity<AdminUserDTO> grantAdmin(@PathVariable("login") @Pattern(regexp = Constants.LOGIN_REGEX) String login) {
        LOG.debug("REST request to grant admin to user {}", login);
        return ResponseEntity.ok(service.setAdminRole(login, true));
    }

    @PostMapping("/revoke-admin")
    public ResponseEntity<AdminUserDTO> revokeAdmin(@PathVariable("login") @Pattern(regexp = Constants.LOGIN_REGEX) String login) {
        LOG.debug("REST request to revoke admin from user {}", login);
        return ResponseEntity.ok(service.setAdminRole(login, false));
    }

    @PostMapping("/reset-password")
    public ResponseEntity<Map<String, Boolean>> resetPassword(
        @PathVariable("login") @Pattern(regexp = Constants.LOGIN_REGEX) String login
    ) {
        LOG.debug("REST request to trigger password reset for user {}", login);
        service.triggerPasswordReset(login);
        return ResponseEntity.ok(Map.of("ok", true));
    }

    @PostMapping("/force-logout")
    public ResponseEntity<Map<String, Integer>> forceLogout(
        @PathVariable("login") @Pattern(regexp = Constants.LOGIN_REGEX) String login
    ) {
        LOG.debug("REST request to force-logout user {}", login);
        return ResponseEntity.ok(Map.of("revoked", service.forceLogout(login)));
    }

    @DeleteMapping("/data")
    public ResponseEntity<Void> deleteAccount(@PathVariable("login") @Pattern(regexp = Constants.LOGIN_REGEX) String login) {
        LOG.debug("REST request to permanently delete user {}", login);
        service.deleteAccount(login);
        return ResponseEntity.noContent().build();
    }
}
