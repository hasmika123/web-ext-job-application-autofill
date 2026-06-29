package com.dossier.api.service;

import com.dossier.api.domain.Authority;
import com.dossier.api.domain.User;
import com.dossier.api.repository.AuthorityRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.dto.AdminUserDTO;
import java.time.Instant;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tech.jhipster.security.RandomUtil;

/**
 * Admin actions against a single user account (Phase 9.A1.4). Each mutation is audited and
 * destructive/self-harming actions are guarded:
 *   - an admin can't deactivate, demote, force-logout, or delete THEIR OWN account
 *     (prevents locking yourself out / losing your own session mid-operation).
 *
 * User mutations are done on the managed entity from {@code findOneByLogin} (not the cached
 * finder), then the user caches are evicted so the change is reflected immediately.
 */
@Service
@Transactional
public class AdminUserActionService {

    private static final Logger LOG = LoggerFactory.getLogger(AdminUserActionService.class);

    private final UserRepository userRepository;
    private final AuthorityRepository authorityRepository;
    private final RefreshTokenService refreshTokenService;
    private final AccountDeletionService accountDeletionService;
    private final MailService mailService;
    private final AdminAuditService auditService;
    private final CacheManager cacheManager;

    public AdminUserActionService(
        UserRepository userRepository,
        AuthorityRepository authorityRepository,
        RefreshTokenService refreshTokenService,
        AccountDeletionService accountDeletionService,
        MailService mailService,
        AdminAuditService auditService,
        CacheManager cacheManager
    ) {
        this.userRepository = userRepository;
        this.authorityRepository = authorityRepository;
        this.refreshTokenService = refreshTokenService;
        this.accountDeletionService = accountDeletionService;
        this.mailService = mailService;
        this.auditService = auditService;
        this.cacheManager = cacheManager;
    }

    /** Activate or deactivate an account. Deactivating also force-logs-out the user. */
    public AdminUserDTO setActivated(String login, boolean activated) {
        if (!activated) {
            assertNotSelf(login, "deactivate");
        }
        User user = loadUser(login);
        user.setActivated(activated);
        userRepository.save(user);
        evictUserCaches(user);
        if (!activated) {
            refreshTokenService.revokeAllForUser(user.getId());
        }
        auditService.record(
            activated ? AdminAuditService.USER_ACTIVATE : AdminAuditService.USER_DEACTIVATE,
            AdminAuditService.TARGET_USER,
            user.getLogin()
        );
        return new AdminUserDTO(user);
    }

    /** Grant or revoke the ROLE_ADMIN authority. */
    public AdminUserDTO setAdminRole(String login, boolean grant) {
        if (!grant) {
            assertNotSelf(login, "revoke your own admin role");
        }
        User user = loadUser(login);
        Optional<Authority> adminAuthority = authorityRepository.findById(AuthoritiesConstants.ADMIN);
        if (adminAuthority.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "ROLE_ADMIN authority missing");
        }
        if (grant) {
            user.getAuthorities().add(adminAuthority.get());
        } else {
            user.getAuthorities().removeIf(a -> AuthoritiesConstants.ADMIN.equals(a.getName()));
        }
        userRepository.save(user);
        evictUserCaches(user);
        auditService.record(
            grant ? AdminAuditService.USER_GRANT_ADMIN : AdminAuditService.USER_REVOKE_ADMIN,
            AdminAuditService.TARGET_USER,
            user.getLogin()
        );
        return new AdminUserDTO(user);
    }

    /** Generate a reset key and email the user a password-reset link. */
    public void triggerPasswordReset(String login) {
        User user = loadUser(login);
        if (user.getEmail() == null || user.getEmail().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "User has no email to send a reset to");
        }
        user.setResetKey(RandomUtil.generateResetKey());
        user.setResetDate(Instant.now());
        userRepository.save(user);
        evictUserCaches(user);
        mailService.sendPasswordResetMail(user);
        auditService.record(AdminAuditService.USER_RESET_PASSWORD, AdminAuditService.TARGET_USER, user.getLogin());
    }

    /** Force-logout: revoke all of the user's refresh tokens so they must sign in again. */
    public int forceLogout(String login) {
        assertNotSelf(login, "force-logout your own session");
        User user = loadUser(login);
        int revoked = refreshTokenService.revokeAllForUser(user.getId());
        auditService.record(
            AdminAuditService.USER_FORCE_LOGOUT,
            AdminAuditService.TARGET_USER,
            user.getLogin(),
            null,
            revoked + " token(s) revoked"
        );
        return revoked;
    }

    /** Permanently erase the account and all of its data (GDPR). */
    public void deleteAccount(String login) {
        assertNotSelf(login, "delete your own account from the admin console");
        // Confirm existence (and normalise) before erasing, so we audit a real target.
        User user = loadUser(login);
        String targetLogin = user.getLogin();
        accountDeletionService.deleteUserAccountByLogin(targetLogin);
        auditService.record(AdminAuditService.USER_DELETE, AdminAuditService.TARGET_USER, targetLogin);
    }

    private User loadUser(String login) {
        return userRepository
            .findOneByLogin(login.toLowerCase())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such user"));
    }

    private void assertNotSelf(String login, String action) {
        String current = SecurityUtils.getCurrentUserLogin().orElse("");
        if (current.equalsIgnoreCase(login)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "You can't " + action + ".");
        }
    }

    private void evictUserCaches(User user) {
        Cache byLogin = cacheManager.getCache(UserRepository.USERS_BY_LOGIN_CACHE);
        if (byLogin != null) {
            byLogin.evictIfPresent(user.getLogin());
        }
        if (user.getEmail() != null) {
            Cache byEmail = cacheManager.getCache(UserRepository.USERS_BY_EMAIL_CACHE);
            if (byEmail != null) {
                byEmail.evictIfPresent(user.getEmail());
            }
        }
        LOG.debug("Evicted user caches for {}", user.getLogin());
    }
}
