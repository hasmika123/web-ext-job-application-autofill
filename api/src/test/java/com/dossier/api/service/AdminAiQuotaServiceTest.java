package com.dossier.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.AiQuotaOverride;
import com.dossier.api.domain.User;
import com.dossier.api.repository.AiQuotaOverrideRepository;
import com.dossier.api.repository.UserRepository;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.web.server.ResponseStatusException;

/** Unit tests for admin AI quota overrides (Phase 9.A2.2). */
class AdminAiQuotaServiceTest {

    private AiQuotaOverrideRepository overrideRepository;
    private UserRepository userRepository;
    private AdminAuditService auditService;
    private AdminAiQuotaService service;

    @BeforeEach
    void setUp() {
        overrideRepository = Mockito.mock(AiQuotaOverrideRepository.class);
        userRepository = Mockito.mock(UserRepository.class);
        auditService = Mockito.mock(AdminAuditService.class);
        service = new AdminAiQuotaService(overrideRepository, userRepository, auditService);
        when(overrideRepository.save(any(AiQuotaOverride.class))).thenAnswer(i -> i.getArgument(0));
    }

    private void userExists(String login) {
        User u = new User();
        u.setLogin(login);
        when(userRepository.findOneByLogin(login)).thenReturn(Optional.of(u));
    }

    @Test
    void setOverridePersistsAndAudits() {
        userExists("alice");
        int q = service.setOverride("alice", 5);
        assertThat(q).isEqualTo(5);
        verify(overrideRepository).save(any(AiQuotaOverride.class));
        verify(auditService).record(eq(AdminAuditService.AI_QUOTA_SET), eq(AdminAuditService.TARGET_USER), eq("alice"), eq(null), anyString());
    }

    @Test
    void setOverrideRejectsNegative() {
        assertThatThrownBy(() -> service.setOverride("alice", -1)).isInstanceOf(ResponseStatusException.class);
        verify(overrideRepository, never()).save(any());
    }

    @Test
    void setOverrideRejectsAboveMax() {
        assertThatThrownBy(() -> service.setOverride("alice", AdminAiQuotaService.MAX_QUOTA + 1)).isInstanceOf(
            ResponseStatusException.class
        );
        verify(overrideRepository, never()).save(any());
    }

    @Test
    void setOverrideUnknownUserIs404() {
        when(userRepository.findOneByLogin("ghost")).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.setOverride("ghost", 5)).isInstanceOf(ResponseStatusException.class);
        verify(overrideRepository, never()).save(any());
    }

    @Test
    void clearOverrideDeletesAndAuditsWhenPresent() {
        userExists("alice");
        when(overrideRepository.existsById("alice")).thenReturn(true);
        service.clearOverride("alice");
        verify(overrideRepository).deleteById("alice");
        verify(auditService).record(eq(AdminAuditService.AI_QUOTA_CLEAR), eq(AdminAuditService.TARGET_USER), eq("alice"));
    }

    @Test
    void clearOverrideNoopWhenAbsent() {
        userExists("alice");
        when(overrideRepository.existsById("alice")).thenReturn(false);
        service.clearOverride("alice");
        verify(overrideRepository, never()).deleteById(anyString());
        verify(auditService, never()).record(anyString(), anyString(), anyString());
    }

    @Test
    void getOverrideReturnsValue() {
        AiQuotaOverride o = new AiQuotaOverride();
        o.setLogin("alice");
        o.setMonthlyQuota(7);
        when(overrideRepository.findById("alice")).thenReturn(Optional.of(o));
        assertThat(service.getOverride("alice")).contains(7);
    }
}
