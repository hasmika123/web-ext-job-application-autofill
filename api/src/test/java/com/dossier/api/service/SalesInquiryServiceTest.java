package com.dossier.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.SalesInquiry;
import com.dossier.api.domain.enumeration.InquiryStatus;
import com.dossier.api.repository.SalesInquiryRepository;
import java.util.Optional;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.server.ResponseStatusException;

/** Unit tests for "Contact us" intake + follow-up (Phase 15.6). */
class SalesInquiryServiceTest {

    private SalesInquiryRepository repository;
    private MailService mailService;
    private AdminAuditService auditService;
    private SalesInquiryService service;

    @BeforeEach
    void setUp() {
        repository = Mockito.mock(SalesInquiryRepository.class);
        mailService = Mockito.mock(MailService.class);
        auditService = Mockito.mock(AdminAuditService.class);
        when(repository.save(any(SalesInquiry.class))).thenAnswer(i -> {
            SalesInquiry s = i.getArgument(0);
            if (s.getId() == null) s.setId(1L);
            return s;
        });
        service = new SalesInquiryService(repository, mailService, auditService, "support@kiwiply.com");
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private SalesInquiry saved() {
        ArgumentCaptor<SalesInquiry> captor = ArgumentCaptor.forClass(SalesInquiry.class);
        verify(repository).save(captor.capture());
        return captor.getValue();
    }

    @Test
    void submitSavesNewInquiryAndNotifiesSales() {
        service.submit("organization", " Dana ", "dana@acme.com", "Acme", "11-50", "We place 40 consultants a quarter.");

        SalesInquiry s = saved();
        assertThat(s.getStatus()).isEqualTo(InquiryStatus.NEW);
        assertThat(s.getTopic()).isEqualTo("organization");
        assertThat(s.getName()).isEqualTo("Dana");
        assertThat(s.getCompany()).isEqualTo("Acme");
        assertThat(s.getTeamSize()).isEqualTo("11-50");
        assertThat(s.getCreatedDate()).isNotNull();
        verify(mailService).sendEmail(eq("support@kiwiply.com"), anyString(), anyString(), anyBoolean(), anyBoolean());
    }

    @Test
    void unknownTopicIsStoredAsOther() {
        service.submit("free-money", "Sam", "sam@x.com", null, null, null);
        assertThat(saved().getTopic()).isEqualTo("other");
    }

    @Test
    void topicIsCaseInsensitive() {
        service.submit(" Autopilot ", "Sam", "sam@x.com", null, null, null);
        assertThat(saved().getTopic()).isEqualTo("autopilot");
    }

    @Test
    void blankOptionalFieldsAreStoredAsNull() {
        service.submit("coaching", "Sam", "sam@x.com", "  ", "", "   ");
        SalesInquiry s = saved();
        assertThat(s.getCompany()).isNull();
        assertThat(s.getTeamSize()).isNull();
        assertThat(s.getMessage()).isNull();
    }

    @Test
    void submitFillsUserLoginWhenSignedIn() {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken("alice", null));
        service.submit("autopilot", "Alice", "alice@x.com", null, null, null);
        assertThat(saved().getUserLogin()).isEqualTo("alice");
    }

    @Test
    void nameIsRequired() {
        assertThatThrownBy(() -> service.submit("autopilot", "  ", "a@x.com", null, null, null)).isInstanceOf(ResponseStatusException.class);
        verify(repository, never()).save(any());
    }

    @Test
    void emailMustLookValid() {
        assertThatThrownBy(() -> service.submit("autopilot", "Sam", "not-an-email", null, null, null)).isInstanceOf(
            ResponseStatusException.class
        );
        assertThatThrownBy(() -> service.submit("autopilot", "Sam", null, null, null, null)).isInstanceOf(ResponseStatusException.class);
        verify(repository, never()).save(any());
    }

    @Test
    void longMessageIsClipped() {
        service.submit("other", "Sam", "sam@x.com", null, null, "x".repeat(5000));
        assertThat(saved().getMessage()).hasSize(4000);
    }

    @Test
    void noNotifyAddressMeansNoEmail() {
        service = new SalesInquiryService(repository, mailService, auditService, "");
        service.submit("other", "Sam", "sam@x.com", null, null, null);
        verify(mailService, never()).sendEmail(anyString(), anyString(), anyString(), anyBoolean(), anyBoolean());
    }

    @Test
    void updateSetsStatusAndNotesAndAudits() {
        SalesInquiry existing = new SalesInquiry();
        existing.setId(7L);
        existing.setStatus(InquiryStatus.NEW);
        when(repository.findById(7L)).thenReturn(Optional.of(existing));

        var dto = service.update(7L, InquiryStatus.CONTACTED, " Call booked Tue ");

        assertThat(dto.getStatus()).isEqualTo(InquiryStatus.CONTACTED);
        assertThat(dto.getAdminNotes()).isEqualTo("Call booked Tue");
        verify(auditService).record(
            eq(AdminAuditService.INQUIRY_UPDATE),
            eq(AdminAuditService.TARGET_SALES_INQUIRY),
            eq("7"),
            isNull(),
            eq("status=CONTACTED")
        );
    }

    @Test
    void updateUnknownIdIs404() {
        when(repository.findById(9L)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.update(9L, InquiryStatus.WON, null)).isInstanceOf(ResponseStatusException.class);
    }
}
