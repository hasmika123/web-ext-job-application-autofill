package com.dossier.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.EmailSubscriber;
import com.dossier.api.domain.enumeration.SubscriberStatus;
import com.dossier.api.repository.EmailSubscriberRepository;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.web.server.ResponseStatusException;
import tech.jhipster.config.JHipsterProperties;

/** Unit tests for newsletter double opt-in (Phase 9.A4). */
class NewsletterServiceTest {

    private EmailSubscriberRepository repository;
    private MailService mailService;
    private NewsletterService service;

    @BeforeEach
    void setUp() {
        repository = Mockito.mock(EmailSubscriberRepository.class);
        mailService = Mockito.mock(MailService.class);
        JHipsterProperties props = Mockito.mock(JHipsterProperties.class);
        JHipsterProperties.Mail mail = Mockito.mock(JHipsterProperties.Mail.class);
        when(props.getMail()).thenReturn(mail);
        when(mail.getBaseUrl()).thenReturn("https://kiwiply.com");
        when(mail.getFrom()).thenReturn("no-reply@kiwiply.com");
        when(repository.save(any(EmailSubscriber.class))).thenAnswer(i -> i.getArgument(0));
        service = new NewsletterService(repository, mailService, props);
    }

    @Test
    void subscribeNewCreatesPendingAndSendsConfirmation() {
        when(repository.findByEmailIgnoreCase("a@b.com")).thenReturn(Optional.empty());

        service.subscribe("  A@B.com ", "footer");

        ArgumentCaptor<EmailSubscriber> captor = ArgumentCaptor.forClass(EmailSubscriber.class);
        verify(repository).save(captor.capture());
        EmailSubscriber s = captor.getValue();
        assertThat(s.getEmail()).isEqualTo("a@b.com"); // normalized
        assertThat(s.getStatus()).isEqualTo(SubscriberStatus.PENDING);
        assertThat(s.getConfirmToken()).isNotBlank();
        assertThat(s.getUnsubscribeToken()).isNotBlank();
        assertThat(s.getConsentSource()).isEqualTo("footer");
        assertThat(s.getConsentAt()).isNotNull();
        verify(mailService).sendEmail(anyString(), anyString(), anyString(), anyBoolean(), anyBoolean());
    }

    @Test
    void subscribeInvalidEmailIsRejected() {
        assertThatThrownBy(() -> service.subscribe("not-an-email", "footer")).isInstanceOf(ResponseStatusException.class);
        verify(repository, never()).save(any());
    }

    @Test
    void subscribeAlreadyConfirmedIsNoop() {
        EmailSubscriber existing = new EmailSubscriber();
        existing.setEmail("a@b.com");
        existing.setStatus(SubscriberStatus.CONFIRMED);
        when(repository.findByEmailIgnoreCase("a@b.com")).thenReturn(Optional.of(existing));

        service.subscribe("a@b.com", "footer");

        verify(repository, never()).save(any());
        verify(mailService, never()).sendEmail(anyString(), anyString(), anyString(), anyBoolean(), anyBoolean());
    }

    @Test
    void confirmFlipsPendingToConfirmed() {
        EmailSubscriber s = new EmailSubscriber();
        s.setStatus(SubscriberStatus.PENDING);
        s.setConfirmToken("tok");
        when(repository.findByConfirmToken("tok")).thenReturn(Optional.of(s));

        assertThat(service.confirm("tok")).isTrue();
        assertThat(s.getStatus()).isEqualTo(SubscriberStatus.CONFIRMED);
        assertThat(s.getConfirmToken()).isNull();
        assertThat(s.getConfirmedAt()).isNotNull();
    }

    @Test
    void confirmUnknownTokenReturnsFalse() {
        when(repository.findByConfirmToken("nope")).thenReturn(Optional.empty());
        assertThat(service.confirm("nope")).isFalse();
    }

    @Test
    void unsubscribeSetsUnsubscribed() {
        EmailSubscriber s = new EmailSubscriber();
        s.setStatus(SubscriberStatus.CONFIRMED);
        s.setUnsubscribeToken("u");
        when(repository.findByUnsubscribeToken("u")).thenReturn(Optional.of(s));

        assertThat(service.unsubscribe("u")).isTrue();
        assertThat(s.getStatus()).isEqualTo(SubscriberStatus.UNSUBSCRIBED);
        assertThat(s.getUnsubscribedAt()).isNotNull();
    }

    @Test
    void unsubscribeUnknownTokenReturnsFalse() {
        when(repository.findByUnsubscribeToken("nope")).thenReturn(Optional.empty());
        assertThat(service.unsubscribe("nope")).isFalse();
    }
}
