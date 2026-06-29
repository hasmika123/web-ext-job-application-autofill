package com.dossier.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.BugReport;
import com.dossier.api.domain.enumeration.BugCategory;
import com.dossier.api.domain.enumeration.BugSeverity;
import com.dossier.api.domain.enumeration.BugStatus;
import com.dossier.api.repository.BugReportRepository;
import java.util.Optional;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.server.ResponseStatusException;

/** Unit tests for bug-report intake + triage (Phase 9.A5). */
class BugReportServiceTest {

    private BugReportRepository repository;
    private MailService mailService;
    private AdminAuditService auditService;
    private BugReportService service;

    @BeforeEach
    void setUp() {
        repository = Mockito.mock(BugReportRepository.class);
        mailService = Mockito.mock(MailService.class);
        auditService = Mockito.mock(AdminAuditService.class);
        when(repository.save(any(BugReport.class))).thenAnswer(i -> {
            BugReport b = i.getArgument(0);
            if (b.getId() == null) b.setId(1L);
            return b;
        });
        service = new BugReportService(repository, mailService, auditService, "support@kiwiply.com");
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void submitSavesNewReportAndNotifiesSupport() {
        service.submit("web", "It broke", "BUG", "me@x.com", "https://kiwiply.com/board", "0.21.4", "UA");

        ArgumentCaptor<BugReport> captor = ArgumentCaptor.forClass(BugReport.class);
        verify(repository).save(captor.capture());
        BugReport b = captor.getValue();
        assertThat(b.getStatus()).isEqualTo(BugStatus.NEW);
        assertThat(b.getCategory()).isEqualTo(BugCategory.BUG);
        assertThat(b.getMessage()).isEqualTo("It broke");
        assertThat(b.getUrl()).isEqualTo("https://kiwiply.com/board");
        verify(mailService).sendEmail(eq("support@kiwiply.com"), anyString(), anyString(), anyBoolean(), anyBoolean());
    }

    @Test
    void submitFillsUserLoginFromSecurityContext() {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken("alice", null));
        service.submit("web", "hi", "IDEA", null, null, null, null);
        ArgumentCaptor<BugReport> captor = ArgumentCaptor.forClass(BugReport.class);
        verify(repository).save(captor.capture());
        assertThat(captor.getValue().getUserLogin()).isEqualTo("alice");
        assertThat(captor.getValue().getCategory()).isEqualTo(BugCategory.IDEA);
    }

    @Test
    void submitRejectsEmptyMessage() {
        assertThatThrownBy(() -> service.submit("web", "   ", "BUG", null, null, null, null)).isInstanceOf(ResponseStatusException.class);
        verify(repository, never()).save(any());
    }

    @Test
    void submitDefaultsUnknownCategoryToBug() {
        service.submit("extension", "x", "garbage", null, null, null, null);
        ArgumentCaptor<BugReport> captor = ArgumentCaptor.forClass(BugReport.class);
        verify(repository).save(captor.capture());
        assertThat(captor.getValue().getCategory()).isEqualTo(BugCategory.BUG);
    }

    @Test
    void updateTriageSetsFieldsAndAudits() {
        BugReport b = new BugReport();
        b.setId(5L);
        b.setStatus(BugStatus.NEW);
        when(repository.findById(5L)).thenReturn(Optional.of(b));

        service.updateTriage(5L, BugStatus.RESOLVED, BugSeverity.HIGH, "fixed in 0.22");

        assertThat(b.getStatus()).isEqualTo(BugStatus.RESOLVED);
        assertThat(b.getSeverity()).isEqualTo(BugSeverity.HIGH);
        assertThat(b.getAdminNotes()).isEqualTo("fixed in 0.22");
        verify(auditService).record(
            eq(AdminAuditService.BUG_TRIAGE_UPDATE),
            eq(AdminAuditService.TARGET_BUG_REPORT),
            eq("5"),
            eq(null),
            anyString()
        );
    }

    @Test
    void updateTriageUnknownIs404() {
        when(repository.findById(99L)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.updateTriage(99L, BugStatus.TRIAGED, null, null)).isInstanceOf(ResponseStatusException.class);
    }
}
