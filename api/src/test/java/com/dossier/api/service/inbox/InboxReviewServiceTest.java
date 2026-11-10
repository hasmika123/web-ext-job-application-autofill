package com.dossier.api.service.inbox;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.Application;
import com.dossier.api.domain.ApplicationEvent;
import com.dossier.api.domain.InboxHold;
import com.dossier.api.domain.InboxMessage;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.repository.ApplicationEventRepository;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.InboxConnectionRepository;
import com.dossier.api.repository.InboxHoldRepository;
import com.dossier.api.repository.InboxMessageRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.service.ApplicationEventService;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.settings.AdminSettingKeys;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

class InboxReviewServiceTest {

    private static final Instant NOW = Instant.parse("2026-11-10T10:00:00Z");
    private static final Long ME = 1L;

    private InboxHoldRepository holds;
    private InboxMessageRepository messages;
    private ApplicationRepository applications;
    private ApplicationEventRepository eventRows;
    private ApplicationEventService events;
    private InboxReviewService service;
    private Application app;
    private User user;

    @BeforeEach
    void setUp() {
        holds = mock(InboxHoldRepository.class);
        messages = mock(InboxMessageRepository.class);
        applications = mock(ApplicationRepository.class);
        eventRows = mock(ApplicationEventRepository.class);
        events = mock(ApplicationEventService.class);
        InboxConnectionRepository connections = mock(InboxConnectionRepository.class);
        UserRepository users = mock(UserRepository.class);
        ResumeBuilderSettings settings = mock(ResumeBuilderSettings.class);
        when(settings.getInt(AdminSettingKeys.INBOX_UNDO_WINDOW_DAYS)).thenReturn(7);
        user = new User();
        user.setId(ME);
        user.setLogin("me");
        when(users.findById(ME)).thenReturn(Optional.of(user));
        app = new Application().company("Initech").roleTitle("Engineer").status(ApplicationStatus.INTERVIEW);
        app.setId(5L);
        app.setUser(user);
        when(applications.findById(5L)).thenReturn(Optional.of(app));
        service = new InboxReviewService(holds, messages, applications, eventRows, events, connections, users, settings, new InboxCounters(new SimpleMeterRegistry()), Clock.fixed(NOW, ZoneOffset.UTC));
    }

    private InboxHold hold(String state, Long applicationId) {
        InboxHold h = new InboxHold();
        h.setUserId(ME);
        h.setMessageId(9L);
        h.setReason("DESTRUCTIVE");
        h.setCategory("REJECTED");
        h.setProposedStatus("REJECTED");
        h.setApplicationId(applicationId);
        h.setState(state);
        h.setExpiresAt(NOW.plus(Duration.ofDays(5)));
        when(holds.findOneByIdAndUserId(3L, ME)).thenReturn(Optional.of(h));
        return h;
    }

    private ApplicationEvent inboxEvent(Instant at) {
        ApplicationEvent e = new ApplicationEvent();
        e.setApplicationId(5L);
        e.setKind(ApplicationEvent.STATUS);
        e.setSource(ApplicationEvent.SRC_INBOX);
        e.setFromStatus(ApplicationStatus.APPLIED);
        e.setToStatus(ApplicationStatus.INTERVIEW);
        e.setRefId(9L);
        e.setCreatedAt(at);
        org.springframework.test.util.ReflectionTestUtils.setField(e, "id", 40L);
        when(eventRows.findById(40L)).thenReturn(Optional.of(e));
        return e;
    }

    @Test
    void acceptingAHeldRejectionMovesTheStatusOnceAndIsIdempotent() {
        InboxHold h = hold(InboxHold.PENDING, 5L);
        InboxMessage m = new InboxMessage();
        when(messages.findOneByIdAndUserId(9L, ME)).thenReturn(Optional.of(m));

        InboxReviewService.Applied first = service.accept(ME, 3L, null);

        assertThat(first.application().status()).isEqualTo("REJECTED");
        assertThat(h.getState()).isEqualTo(InboxHold.ACCEPTED);
        verify(events).recordStatus(eq(app), eq(ApplicationStatus.INTERVIEW), eq(ApplicationStatus.REJECTED), eq(ApplicationEvent.SRC_INBOX), eq(9L), any(), any());
        assertThat(m.getStatusChange()).isEqualTo("REJECTED");

        InboxReviewService.Applied again = service.accept(ME, 3L, null);
        assertThat(again.application().status()).isEqualTo("REJECTED");
        verify(events, org.mockito.Mockito.times(1)).recordStatus(any(), any(), any(), any(), any(), any(), any());
    }

    @Test
    void anAmbiguousHoldNeedsAChosenCandidate() {
        InboxHold h = hold(InboxHold.PENDING, null);
        h.setCategory("INTERVIEW");
        h.setCandidateIds("5,6");
        assertThatThrownBy(() -> service.accept(ME, 3L, null)).isInstanceOf(InboxReviewService.InboxReviewException.class).hasMessageContaining("which application");
        // an application that is not a candidate is the generic 404
        assertThatThrownBy(() -> service.accept(ME, 3L, 99L)).isInstanceOf(ResponseStatusException.class);

        app.setStatus(ApplicationStatus.APPLIED);
        InboxReviewService.Applied ok = service.accept(ME, 3L, 5L);
        assertThat(ok.application().status()).isEqualTo("INTERVIEW");
        assertThat(h.getResolvedApplicationId()).isEqualTo(5L);
    }

    @Test
    void anExpiredOrDismissedHoldCannotBeAccepted() {
        InboxHold h = hold(InboxHold.PENDING, 5L);
        h.setExpiresAt(NOW.minusSeconds(1));
        assertThatThrownBy(() -> service.accept(ME, 3L, null)).isInstanceOf(InboxReviewService.InboxReviewException.class);
        hold(InboxHold.DISMISSED, 5L);
        assertThatThrownBy(() -> service.accept(ME, 3L, null)).isInstanceOf(InboxReviewService.InboxReviewException.class);
        verify(events, never()).recordStatus(any(), any(), any(), any(), any(), any(), any());
    }

    @Test
    void someoneElsesHoldIsNotFound() {
        when(holds.findOneByIdAndUserId(3L, 2L)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.accept(2L, 3L, null)).isInstanceOf(ResponseStatusException.class).hasMessageContaining("404");
        assertThatThrownBy(() -> service.dismiss(2L, 3L)).isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void dismissingIsRememberedAndIdempotent() {
        InboxHold h = hold(InboxHold.PENDING, 5L);
        service.dismiss(ME, 3L);
        assertThat(h.getState()).isEqualTo(InboxHold.DISMISSED);
        service.dismiss(ME, 3L);
        verify(holds, org.mockito.Mockito.times(1)).save(h);
    }

    @Test
    void undoRestoresThePreviousStatusAndDismissesTheMail() {
        inboxEvent(NOW.minus(Duration.ofDays(2)));
        InboxMessage m = new InboxMessage();
        m.setCategory("INTERVIEW");
        when(messages.findOneByIdAndUserId(9L, ME)).thenReturn(Optional.of(m));
        when(holds.findFirstByUserIdAndMessageId(ME, 9L)).thenReturn(Optional.empty());

        InboxReviewService.Applied r = service.undo(ME, 5L, 40L);

        assertThat(r.application().status()).isEqualTo("APPLIED");
        verify(events).recordStatus(eq(app), eq(ApplicationStatus.INTERVIEW), eq(ApplicationStatus.APPLIED), eq(ApplicationEvent.SRC_WEB), eq(40L), eq("Undone by you"), any());
        assertThat(m.getUndoneAt()).isEqualTo(NOW);
        org.mockito.ArgumentCaptor<InboxHold> held = org.mockito.ArgumentCaptor.forClass(InboxHold.class);
        verify(holds).save(held.capture());
        assertThat(held.getValue().getState()).isEqualTo(InboxHold.DISMISSED);
    }

    @Test
    void undoIsIdempotent() {
        inboxEvent(NOW.minus(Duration.ofDays(2)));
        InboxMessage m = new InboxMessage();
        m.setUndoneAt(NOW.minusSeconds(60));
        when(messages.findOneByIdAndUserId(9L, ME)).thenReturn(Optional.of(m));
        app.setStatus(ApplicationStatus.APPLIED);
        assertThat(service.undo(ME, 5L, 40L).application().status()).isEqualTo("APPLIED");
        verify(events, never()).recordStatus(any(), any(), any(), any(), any(), any(), any());
    }

    @Test
    void undoExpiresAfterTheWindow() {
        inboxEvent(NOW.minus(Duration.ofDays(8)));
        assertThatThrownBy(() -> service.undo(ME, 5L, 40L))
            .isInstanceOf(InboxReviewService.InboxReviewException.class)
            .satisfies(e -> assertThat(((InboxReviewService.InboxReviewException) e).getCode()).isEqualTo("UNDO_EXPIRED"));
    }

    @Test
    void undoRefusesAfterThePersonMovedTheApplication() {
        inboxEvent(NOW.minus(Duration.ofDays(1)));
        app.setStatus(ApplicationStatus.OFFER);
        assertThatThrownBy(() -> service.undo(ME, 5L, 40L))
            .isInstanceOf(InboxReviewService.InboxReviewException.class)
            .satisfies(e -> assertThat(((InboxReviewService.InboxReviewException) e).getCode()).isEqualTo("CHANGED_SINCE"));
    }

    @Test
    void undoOfAnotherPersonsApplicationOrAWebEventIsNotFound() {
        User other = new User();
        other.setId(2L);
        app.setUser(other);
        assertThatThrownBy(() -> service.undo(ME, 5L, 40L)).isInstanceOf(ResponseStatusException.class);
        app.setUser(user);
        ApplicationEvent web = inboxEvent(NOW);
        web.setSource(ApplicationEvent.SRC_WEB);
        assertThatThrownBy(() -> service.undo(ME, 5L, 40L)).isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void kindsAndIds() {
        assertThat(InboxReviewService.kindOf("AMBIGUOUS")).isEqualTo("AMBIGUOUS");
        assertThat(InboxReviewService.kindOf("DESTRUCTIVE")).isEqualTo("REJECTION");
        assertThat(InboxReviewService.kindOf("BACKWARDS")).isEqualTo("STATUS_CHANGE");
        assertThat(InboxReviewService.kindOf("LOW_CONFIDENCE")).isEqualTo("STATUS_CHANGE");
        assertThat(InboxReviewService.ids("1, 2,x,3")).containsExactly(1L, 2L, 3L);
    }
}
