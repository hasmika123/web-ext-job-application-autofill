package com.dossier.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.Notification;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.domain.enumeration.NotificationKind;
import com.dossier.api.repository.NotificationRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.service.inbox.InboxParser;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Who hears about what (Phase 14.6): in-app for news, email for interviews and offers only. */
class NotificationServiceTest {

    private static final Instant NOW = Instant.parse("2026-09-23T12:00:00Z");

    private NotificationRepository notifications;
    private MailService mail;
    private NotificationPreferenceService preferences;
    private NotificationService service;
    private final List<Notification> saved = new ArrayList<>();
    private User user;

    @BeforeEach
    void setUp() {
        notifications = mock(NotificationRepository.class);
        when(notifications.save(any(Notification.class))).thenAnswer(inv -> {
            saved.add(inv.getArgument(0));
            return inv.getArgument(0);
        });
        preferences = mock(NotificationPreferenceService.class);
        when(preferences.decide(eq(7L), any(NotificationKind.class), any(Instant.class))).thenReturn(new NotificationPolicy.Decision(true, true));
        UserRepository users = mock(UserRepository.class);
        user = new User();
        user.setId(7L);
        user.setLogin("user");
        user.setEmail("sam@real-address.com");
        when(users.findById(7L)).thenReturn(Optional.of(user));
        mail = mock(MailService.class);
        service = new NotificationService(notifications, preferences, users, mail, "https://kiwiply.com/");
    }

    private static InboxParser.StatusChanged changed(ApplicationStatus to, Duration ago) {
        return new InboxParser.StatusChanged(7L, 42L, "Acme", "Backend Engineer", ApplicationStatus.APPLIED, to, 1L, NOW.minus(ago));
    }

    @Test
    void aFreshInterviewIsNotifiedAndEmailed() {
        service.notify(changed(ApplicationStatus.INTERVIEW, Duration.ofHours(2)), NOW);

        assertThat(saved).hasSize(1);
        Notification n = saved.get(0);
        assertThat(n.getTitle()).isEqualTo("Acme · Backend Engineer");
        assertThat(n.getBody()).startsWith("Moved to Interview");
        assertThat(n.getLink()).isEqualTo("/board?app=42");
        assertThat(n.getStatus()).isEqualTo("INTERVIEW");
        verify(mail).sendStatusChangeEmail(user, "Acme", "Backend Engineer", "INTERVIEW", "https://kiwiply.com/board?app=42");
    }

    @Test
    void rejectionsAndConfirmationsAreInAppOnly() {
        service.notify(changed(ApplicationStatus.REJECTED, Duration.ofHours(1)), NOW);
        service.notify(changed(ApplicationStatus.APPLIED, Duration.ofHours(1)), NOW);
        assertThat(saved).hasSize(2);
        verify(mail, never()).sendStatusChangeEmail(any(), anyString(), anyString(), anyString(), anyString());
    }

    @Test
    void oldMailIsHistoryNotNews() {
        service.notify(changed(ApplicationStatus.OFFER, Duration.ofDays(20)), NOW); // a backfill
        assertThat(saved).isEmpty();
        service.notify(changed(ApplicationStatus.OFFER, Duration.ofDays(3)), NOW); // this week, but not today
        assertThat(saved).hasSize(1);
        verify(mail, never()).sendStatusChangeEmail(any(), anyString(), anyString(), anyString(), anyString());
    }

    @Test
    void theSameNewsIsNeverSentTwice() {
        when(notifications.existsByUserIdAndApplicationIdAndStatus(7L, 42L, "INTERVIEW")).thenReturn(true);
        service.notify(changed(ApplicationStatus.INTERVIEW, Duration.ofHours(1)), NOW);
        assertThat(saved).isEmpty();
        verify(mail, never()).sendStatusChangeEmail(any(), anyString(), anyString(), anyString(), anyString());
    }

    @Test
    void theUserCanTurnTheEmailsOff() {
        when(preferences.decide(eq(7L), eq(NotificationKind.APP_STATUS), any(Instant.class))).thenReturn(new NotificationPolicy.Decision(true, false));
        service.notify(changed(ApplicationStatus.OFFER, Duration.ofHours(1)), NOW);
        assertThat(saved).hasSize(1); // still in-app
        verify(mail, never()).sendStatusChangeEmail(any(), anyString(), anyString(), anyString(), eq("https://kiwiply.com/board?app=42"));
    }

    // ---- publish (E2E-U7.0) -------------------------------------------------

    @Test
    void publishStoresTheNoticeAndEmailsWhenThePolicySaysSo() {
        var payload = NotificationService.Payload.of("Your plan renews soon", "It renews on the 3rd.", "/settings#billing").deduped("billing:renewal:2026-11");

        var made = service.publish(NotificationKind.BILLING, 7L, payload, NOW);

        assertThat(made).isPresent();
        assertThat(saved).hasSize(1);
        assertThat(saved.get(0).getKind()).isEqualTo("BILLING");
        assertThat(saved.get(0).getDedupeKey()).isEqualTo("billing:renewal:2026-11");
        assertThat(saved.get(0).isInappMuted()).isFalse();
        verify(mail).sendNotificationEmail(user, "Billing", "Your plan renews soon", "It renews on the 3rd.", "https://kiwiply.com/settings#billing");
    }

    @Test
    void publishIsIdempotentOnTheDedupeKey() {
        when(notifications.existsByUserIdAndDedupeKey(7L, "k1")).thenReturn(true);

        var made = service.publish(NotificationKind.SYSTEM, 7L, NotificationService.Payload.of("Hello", null, null).deduped("k1"), NOW);

        assertThat(made).isEmpty();
        assertThat(saved).isEmpty();
        verify(mail, never()).sendNotificationEmail(any(), anyString(), anyString(), any(), anyString());
    }

    @Test
    void aKindSwitchedOffInAppIsStoredButMutedAndNeverEmailedWhenEmailIsOff() {
        when(preferences.decide(eq(7L), eq(NotificationKind.SYSTEM), any(Instant.class))).thenReturn(new NotificationPolicy.Decision(false, false));

        service.publish(NotificationKind.SYSTEM, 7L, NotificationService.Payload.of("News", "Something new", "/dashboard"), NOW);

        assertThat(saved).hasSize(1);
        assertThat(saved.get(0).isInappMuted()).isTrue(); // the dedupe ledger keeps it; the bell never shows it
        verify(mail, never()).sendNotificationEmail(any(), anyString(), anyString(), any(), anyString());
    }
}
