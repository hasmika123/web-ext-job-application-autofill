package com.dossier.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.Authority;
import com.dossier.api.domain.User;
import com.dossier.api.repository.AuthorityRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.security.AuthoritiesConstants;
import java.util.HashSet;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.cache.CacheManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.server.ResponseStatusException;

/** Unit tests for admin user actions: guards, audit wiring, and delegation (Phase 9.A1.4). */
class AdminUserActionServiceTest {

    private UserRepository userRepository;
    private AuthorityRepository authorityRepository;
    private RefreshTokenService refreshTokenService;
    private AccountDeletionService accountDeletionService;
    private MailService mailService;
    private AdminAuditService auditService;
    private CacheManager cacheManager;
    private AdminUserActionService service;

    @BeforeEach
    void setUp() {
        userRepository = Mockito.mock(UserRepository.class);
        authorityRepository = Mockito.mock(AuthorityRepository.class);
        refreshTokenService = Mockito.mock(RefreshTokenService.class);
        accountDeletionService = Mockito.mock(AccountDeletionService.class);
        mailService = Mockito.mock(MailService.class);
        auditService = Mockito.mock(AdminAuditService.class);
        cacheManager = Mockito.mock(CacheManager.class);
        when(cacheManager.getCache(anyString())).thenReturn(null); // eviction is a no-op in tests
        service = new AdminUserActionService(
            userRepository,
            authorityRepository,
            refreshTokenService,
            accountDeletionService,
            mailService,
            auditService,
            cacheManager
        );
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private User user(String login) {
        User u = new User();
        u.setId(42L);
        u.setLogin(login);
        u.setEmail(login + "@example.com");
        u.setActivated(true);
        Authority role = new Authority();
        role.setName(AuthoritiesConstants.USER);
        u.setAuthorities(new HashSet<>(Set.of(role)));
        when(userRepository.findOneByLogin(login)).thenReturn(Optional.of(u));
        return u;
    }

    private void actAs(String login) {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(login, null));
    }

    @Test
    void deactivateRevokesTokensAndAudits() {
        User u = user("alice");
        service.setActivated("alice", false);
        assertThat(u.isActivated()).isFalse();
        verify(userRepository).save(u);
        verify(refreshTokenService).revokeAllForUser(42L);
        verify(auditService).record(eq(AdminAuditService.USER_DEACTIVATE), eq(AdminAuditService.TARGET_USER), eq("alice"));
    }

    @Test
    void activateDoesNotRevokeTokens() {
        User u = user("alice");
        u.setActivated(false);
        service.setActivated("alice", true);
        assertThat(u.isActivated()).isTrue();
        verify(refreshTokenService, never()).revokeAllForUser(anyLong());
        verify(auditService).record(eq(AdminAuditService.USER_ACTIVATE), eq(AdminAuditService.TARGET_USER), eq("alice"));
    }

    @Test
    void cannotDeactivateSelf() {
        actAs("boss");
        assertThatThrownBy(() -> service.setActivated("boss", false)).isInstanceOf(ResponseStatusException.class);
        verify(userRepository, never()).save(any());
        verify(auditService, never()).record(anyString(), anyString(), anyString());
    }

    @Test
    void grantAdminAddsAuthorityAndAudits() {
        User u = user("alice");
        Authority admin = new Authority();
        admin.setName(AuthoritiesConstants.ADMIN);
        when(authorityRepository.findById(AuthoritiesConstants.ADMIN)).thenReturn(Optional.of(admin));

        service.setAdminRole("alice", true);

        assertThat(u.getAuthorities()).extracting(Authority::getName).contains(AuthoritiesConstants.ADMIN);
        verify(auditService).record(eq(AdminAuditService.USER_GRANT_ADMIN), eq(AdminAuditService.TARGET_USER), eq("alice"));
    }

    @Test
    void revokeAdminRemovesAuthority() {
        User u = user("alice");
        Authority admin = new Authority();
        admin.setName(AuthoritiesConstants.ADMIN);
        u.getAuthorities().add(admin);
        when(authorityRepository.findById(AuthoritiesConstants.ADMIN)).thenReturn(Optional.of(admin));

        service.setAdminRole("alice", false);

        assertThat(u.getAuthorities()).extracting(Authority::getName).doesNotContain(AuthoritiesConstants.ADMIN);
        verify(auditService).record(eq(AdminAuditService.USER_REVOKE_ADMIN), eq(AdminAuditService.TARGET_USER), eq("alice"));
    }

    @Test
    void cannotRevokeOwnAdmin() {
        actAs("boss");
        assertThatThrownBy(() -> service.setAdminRole("boss", false)).isInstanceOf(ResponseStatusException.class);
        verify(userRepository, never()).save(any());
    }

    @Test
    void triggerPasswordResetSetsKeyAndSendsMail() {
        User u = user("alice");
        service.triggerPasswordReset("alice");
        assertThat(u.getResetKey()).isNotBlank();
        assertThat(u.getResetDate()).isNotNull();
        verify(mailService).sendPasswordResetMail(u);
        verify(auditService).record(eq(AdminAuditService.USER_RESET_PASSWORD), eq(AdminAuditService.TARGET_USER), eq("alice"));
    }

    @Test
    void forceLogoutRevokesAndAudits() {
        user("alice");
        when(refreshTokenService.revokeAllForUser(42L)).thenReturn(3);
        int n = service.forceLogout("alice");
        assertThat(n).isEqualTo(3);
        verify(auditService).record(
            eq(AdminAuditService.USER_FORCE_LOGOUT),
            eq(AdminAuditService.TARGET_USER),
            eq("alice"),
            eq(null),
            anyString()
        );
    }

    @Test
    void cannotForceLogoutSelf() {
        actAs("boss");
        assertThatThrownBy(() -> service.forceLogout("boss")).isInstanceOf(ResponseStatusException.class);
        verify(refreshTokenService, never()).revokeAllForUser(anyLong());
    }

    @Test
    void deleteDelegatesToEraseAndAudits() {
        user("alice");
        service.deleteAccount("alice");
        verify(accountDeletionService).deleteUserAccountByLogin("alice");
        verify(auditService).record(eq(AdminAuditService.USER_DELETE), eq(AdminAuditService.TARGET_USER), eq("alice"));
    }

    @Test
    void cannotDeleteSelf() {
        actAs("boss");
        assertThatThrownBy(() -> service.deleteAccount("boss")).isInstanceOf(ResponseStatusException.class);
        verify(accountDeletionService, never()).deleteUserAccountByLogin(anyString());
    }
}
