package com.dossier.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.RefreshToken;
import com.dossier.api.domain.User;
import com.dossier.api.repository.RefreshTokenRepository;
import com.dossier.api.repository.UserRepository;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.web.server.ResponseStatusException;

/** Unit tests for the admin sessions view + per-family revoke (Phase 9.A2.3). */
class AdminSessionServiceTest {

    private RefreshTokenRepository refreshTokenRepository;
    private UserRepository userRepository;
    private AdminAuditService auditService;
    private AdminSessionService service;

    @BeforeEach
    void setUp() {
        refreshTokenRepository = Mockito.mock(RefreshTokenRepository.class);
        userRepository = Mockito.mock(UserRepository.class);
        auditService = Mockito.mock(AdminAuditService.class);
        service = new AdminSessionService(refreshTokenRepository, userRepository, auditService);
        User u = new User();
        u.setId(42L);
        u.setLogin("alice");
        when(userRepository.findOneByLogin("alice")).thenReturn(Optional.of(u));
    }

    private RefreshToken token(String family, boolean revoked, Instant created, Instant expires) {
        RefreshToken t = new RefreshToken();
        t.setFamilyId(family);
        t.setUserId(42L);
        t.setRevoked(revoked);
        t.setCreatedAt(created);
        t.setExpiresAt(expires);
        return t;
    }

    @Test
    void listGroupsByFamilyWithActiveFlag() {
        Instant now = Instant.now();
        when(refreshTokenRepository.findByUserId(42L)).thenReturn(
            List.of(
                // family A: rotated twice, latest still valid → active
                token("A", true, now.minus(2, ChronoUnit.DAYS), now.minus(2, ChronoUnit.DAYS)),
                token("A", false, now.minus(1, ChronoUnit.DAYS), now.plus(30, ChronoUnit.DAYS)),
                // family B: revoked → inactive
                token("B", true, now.minus(5, ChronoUnit.DAYS), now.plus(30, ChronoUnit.DAYS))
            )
        );

        List<AdminSessionService.SessionFamily> families = service.listFamilies("alice");

        assertThat(families).hasSize(2);
        var a = families.stream().filter(f -> f.familyId().equals("A")).findFirst().orElseThrow();
        assertThat(a.tokenCount()).isEqualTo(2);
        assertThat(a.active()).isTrue();
        var b = families.stream().filter(f -> f.familyId().equals("B")).findFirst().orElseThrow();
        assertThat(b.active()).isFalse();
    }

    @Test
    void revokeOwnedFamilyRevokesAndAudits() {
        Instant now = Instant.now();
        when(refreshTokenRepository.findByUserId(42L)).thenReturn(List.of(token("A", false, now, now.plus(30, ChronoUnit.DAYS))));

        service.revokeFamily("alice", "A");

        verify(refreshTokenRepository).revokeFamily("A");
        verify(auditService).record(
            org.mockito.ArgumentMatchers.eq(AdminAuditService.SESSION_REVOKE),
            org.mockito.ArgumentMatchers.eq(AdminAuditService.TARGET_USER),
            org.mockito.ArgumentMatchers.eq("alice"),
            org.mockito.ArgumentMatchers.eq(null),
            anyString()
        );
    }

    @Test
    void revokingAnotherUsersFamilyIs404() {
        when(refreshTokenRepository.findByUserId(42L)).thenReturn(List.of());
        assertThatThrownBy(() -> service.revokeFamily("alice", "SOMEONE_ELSE")).isInstanceOf(ResponseStatusException.class);
        verify(refreshTokenRepository, never()).revokeFamily(anyString());
    }

    @Test
    void unknownUserIs404() {
        when(userRepository.findOneByLogin("ghost")).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.listFamilies("ghost")).isInstanceOf(ResponseStatusException.class);
    }
}
