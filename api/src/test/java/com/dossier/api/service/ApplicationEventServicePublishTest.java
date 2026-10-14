package com.dossier.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.Application;
import com.dossier.api.domain.ApplicationEvent;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.repository.ApplicationEventRepository;
import com.dossier.api.repository.ApplicationRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.context.ApplicationEventPublisher;

/** {@code record()} is the single writer of the tracker's memory, so it is the single publisher of {@link ApplicationEventRecorded} (doc 60 section 5). */
class ApplicationEventServicePublishTest {

    private static final Instant NOW = Instant.parse("2026-10-13T15:00:00Z");

    private final List<ApplicationEvent> saved = new ArrayList<>();
    private ApplicationEventPublisher publisher;
    private ApplicationEventService service;

    @BeforeEach
    void setUp() {
        ApplicationEventRepository events = mock(ApplicationEventRepository.class);
        when(events.save(any(ApplicationEvent.class))).thenAnswer(inv -> {
            saved.add(inv.getArgument(0));
            return inv.getArgument(0);
        });
        publisher = mock(ApplicationEventPublisher.class);
        service = new ApplicationEventService(events, mock(ApplicationRepository.class), TrackerTestSupport.settings(), mock(TrackerUsers.class), publisher, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    private static Application app(ApplicationStatus status, Long userId) {
        Application a = new Application();
        a.setId(42L);
        a.setStatus(status);
        if (userId != null) {
            User u = new User();
            u.setId(userId);
            a.setUser(u);
        }
        return a;
    }

    private ApplicationEventRecorded published() {
        ArgumentCaptor<Object> c = ArgumentCaptor.forClass(Object.class);
        verify(publisher).publishEvent(c.capture());
        return (ApplicationEventRecorded) c.getValue();
    }

    @Test
    void aCreationPublishesItsFirstStatusAfterTheSave() {
        service.recordCreated(app(ApplicationStatus.APPLIED, 7L), "EXTENSION");
        ApplicationEventRecorded e = published();
        assertThat(e).isEqualTo(new ApplicationEventRecorded(7L, 42L, ApplicationEvent.CREATED, null, ApplicationStatus.APPLIED, "EXTENSION"));
        assertThat(e.relevant()).isTrue();
        assertThat(saved).hasSize(1);
    }

    @Test
    void aStatusChangePublishesFromAndTo() {
        service.recordStatus(app(ApplicationStatus.REJECTED, 7L), ApplicationStatus.INTERVIEW, ApplicationStatus.REJECTED, ApplicationEvent.SRC_INBOX, 3L, null);
        assertThat(published()).isEqualTo(new ApplicationEventRecorded(7L, 42L, ApplicationEvent.STATUS, ApplicationStatus.INTERVIEW, ApplicationStatus.REJECTED, "INBOX"));
    }

    @Test
    void otherKindsArePublishedToo_andTheLinkerIgnoresThemByCondition() {
        service.record(app(ApplicationStatus.APPLIED, 7L), ApplicationEvent.NOTE, null, null, ApplicationEvent.SRC_WEB, 9L, "Note added");
        ApplicationEventRecorded e = published();
        assertThat(e.kind()).isEqualTo(ApplicationEvent.NOTE);
        assertThat(e.relevant()).isFalse();
    }

    @Test
    void noStatusChangeAndBackDatedHistoryPublishNothing() {
        Application a = app(ApplicationStatus.APPLIED, 7L);
        service.recordStatus(a, ApplicationStatus.APPLIED, ApplicationStatus.APPLIED, "WEB", null, null);
        service.recordAt(a, ApplicationEvent.STATUS, null, ApplicationStatus.APPLIED, ApplicationEvent.SRC_SYSTEM, null, "seed", NOW.minusSeconds(86_400));
        verify(publisher, never()).publishEvent(any(Object.class));
        assertThat(saved).hasSize(1); // the back-dated write is still saved
    }

    @Test
    void anApplicationWithoutAnOwnerPublishesANullUserThatIsNotRelevant() {
        service.recordCreated(app(ApplicationStatus.APPLIED, null), "WEB");
        ApplicationEventRecorded e = published();
        assertThat(e.userId()).isNull();
        assertThat(e.relevant()).isFalse();
    }

    @Test
    void withoutAPublisherTheServiceBehavesAsBefore() {
        ApplicationEventService plain = new ApplicationEventService(mock(ApplicationEventRepository.class), mock(ApplicationRepository.class), TrackerTestSupport.settings(), mock(TrackerUsers.class), Clock.fixed(NOW, ZoneOffset.UTC));
        Application a = app(ApplicationStatus.APPLIED, 7L);
        plain.recordCreated(a, "WEB");
        assertThat(a.getLastEventAt()).isEqualTo(NOW);
    }
}
