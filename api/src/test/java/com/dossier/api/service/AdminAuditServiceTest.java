package com.dossier.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.AdminAuditEvent;
import com.dossier.api.repository.AdminAuditEventRepository;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

/** Unit tests for the admin audit trail writer/reader (Phase 9.A1). */
class AdminAuditServiceTest {

    private AdminAuditEventRepository repository;
    private AdminAuditService service;

    @BeforeEach
    void setUp() {
        repository = Mockito.mock(AdminAuditEventRepository.class);
        service = new AdminAuditService(repository);
        when(repository.save(any(AdminAuditEvent.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void recordCapturesActorFromSecurityContextAndStampsTime() {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken("boss", null));

        service.record(AdminAuditService.USER_DEACTIVATE, AdminAuditService.TARGET_USER, "victim", "policy violation", "was active");

        ArgumentCaptor<AdminAuditEvent> captor = ArgumentCaptor.forClass(AdminAuditEvent.class);
        verify(repository).save(captor.capture());
        AdminAuditEvent e = captor.getValue();
        assertThat(e.getActorLogin()).isEqualTo("boss");
        assertThat(e.getAction()).isEqualTo("USER_DEACTIVATE");
        assertThat(e.getTargetType()).isEqualTo("USER");
        assertThat(e.getTargetId()).isEqualTo("victim");
        assertThat(e.getReason()).isEqualTo("policy violation");
        assertThat(e.getDetails()).isEqualTo("was active");
        assertThat(e.getCreatedDate()).isNotNull();
    }

    @Test
    void recordFallsBackToSystemActorWhenUnauthenticated() {
        service.record(AdminAuditService.USER_DELETE, AdminAuditService.TARGET_USER, "ghost");

        ArgumentCaptor<AdminAuditEvent> captor = ArgumentCaptor.forClass(AdminAuditEvent.class);
        verify(repository).save(captor.capture());
        assertThat(captor.getValue().getActorLogin()).isEqualTo("system");
        assertThat(captor.getValue().getReason()).isNull();
    }

    @Test
    void findAllUsesPlainPageWhenNoActorFilter() {
        Pageable pageable = PageRequest.of(0, 20);
        when(repository.findAll(pageable)).thenReturn(new PageImpl<>(List.of(new AdminAuditEvent())));

        Page<?> result = service.findAll(null, pageable);

        assertThat(result.getContent()).hasSize(1);
        verify(repository).findAll(pageable);
        verify(repository, never()).findAllByActorLoginContainingIgnoreCase(any(), any());
    }

    @Test
    void findAllFiltersByActorWhenProvided() {
        Pageable pageable = PageRequest.of(0, 20);
        when(repository.findAllByActorLoginContainingIgnoreCase(eq("boss"), eq(pageable))).thenReturn(
            new PageImpl<>(List.of(new AdminAuditEvent()))
        );

        service.findAll("  boss  ", pageable);

        verify(repository).findAllByActorLoginContainingIgnoreCase("boss", pageable);
        verify(repository, never()).findAll(pageable);
    }
}
