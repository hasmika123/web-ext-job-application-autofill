package com.dossier.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.Notification;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.NotificationKind;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.repository.NotificationRepository;
import com.dossier.api.repository.UserRepository;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * {@link NotificationService#publish} against the real database (E2E-U7.0): a replay with the same dedupe key makes nothing,
 * a kind switched off in-app is stored but never listed or counted, and the email follows the user's saved switches.
 */
@IntegrationTest
@AutoConfigureMockMvc
@WithMockUser(username = "user")
@Transactional
class NotificationServiceIT {

    @Autowired
    private NotificationService service;

    @Autowired
    private NotificationRepository notifications;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private AppSettingRepository appSettingRepository;

    @Autowired
    private ResumeBuilderSettings settings;

    @MockitoBean
    private MailService mail;

    private User me() {
        return userRepository.findOneByLogin("user").orElseThrow();
    }

    private void prefs(String body) throws Exception {
        mockMvc
            .perform(put("/api/profile/notification-preferences").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isOk());
    }

    @Test
    void aReplayWithTheSameDedupeKeyMakesNothing() {
        var payload = NotificationService.Payload.of("You have a new match", "3 new roles", "/jobs").deduped("alert:7:run:1").grouped("alert:7");

        var first = service.publish(NotificationKind.SYSTEM, me().getId(), payload);
        var second = service.publish(NotificationKind.SYSTEM, me().getId(), payload);

        assertThat(first).isPresent();
        assertThat(second).isEmpty();
        assertThat(notifications.findByUserIdOrderByCreatedAtDesc(me().getId())).hasSize(1);
        Notification n = first.orElseThrow();
        assertThat(n.getKind()).isEqualTo("SYSTEM");
        assertThat(n.getDedupeKey()).isEqualTo("alert:7:run:1");
        assertThat(n.getGroupKey()).isEqualTo("alert:7");
    }

    @Test
    void theSameKeyIsFreshForAnotherUser() {
        User admin = userRepository.findOneByLogin("admin").orElseThrow();
        var payload = NotificationService.Payload.of("Hello", null, null).deduped("same-key");

        assertThat(service.publish(NotificationKind.SYSTEM, me().getId(), payload)).isPresent();
        assertThat(service.publish(NotificationKind.SYSTEM, admin.getId(), payload)).isPresent();
    }

    @Test
    void aKindSwitchedOffInAppIsStoredButNeverListedOrCounted() throws Exception {
        prefs("{\"matrix\":{\"SYSTEM\":{\"inapp\":false,\"email\":\"off\"}},\"tz\":\"UTC\"}");

        var made = service.publish(NotificationKind.SYSTEM, me().getId(), NotificationService.Payload.of("News", "A thing", "/dashboard").deduped("news-1"));
        service.publish(NotificationKind.PROFILE_SUGGESTION, me().getId(), NotificationService.Payload.of("We learned something", null, "/profiles"));

        assertThat(made).isPresent();
        assertThat(made.orElseThrow().isInappMuted()).isTrue();
        mockMvc
            .perform(get("/api/profile/notifications"))
            .andExpect(jsonPath("$.unread").value(1))
            .andExpect(jsonPath("$.items.length()").value(1))
            .andExpect(jsonPath("$.items[0].title").value("We learned something"));
        // the muted one still blocks a replay
        assertThat(service.publish(NotificationKind.SYSTEM, me().getId(), NotificationService.Payload.of("News", "A thing", "/dashboard").deduped("news-1"))).isEmpty();
    }

    @Test
    void emailOnlyWhenTheSavedSwitchSaysNow() throws Exception {
        service.publish(NotificationKind.SYSTEM, me().getId(), NotificationService.Payload.of("News", "off by default", "/dashboard"));
        verify(mail, never()).sendNotificationEmail(any(), anyString(), anyString(), any(), anyString());

        prefs("{\"matrix\":{\"SYSTEM\":{\"inapp\":true,\"email\":\"now\"}},\"tz\":\"UTC\"}");
        service.publish(NotificationKind.SYSTEM, me().getId(), NotificationService.Payload.of("News", "now it is on", "/dashboard"));

        verify(mail).sendNotificationEmail(any(User.class), eq("Kiwiply news"), eq("News"), eq("now it is on"), anyString());
    }

    @Test
    void billingAlwaysEmailsEvenIfEveryoneElseIsOff() throws Exception {
        prefs("{\"matrix\":{\"BILLING\":{\"inapp\":false,\"email\":\"off\"}},\"tz\":\"UTC\"}");

        var made = service.publish(NotificationKind.BILLING, me().getId(), NotificationService.Payload.of("Card declined", "Update your card", "/settings#billing"));

        assertThat(made.orElseThrow().isInappMuted()).isFalse();
        verify(mail).sendNotificationEmail(any(User.class), eq("Billing"), eq("Card declined"), eq("Update your card"), anyString());
    }

    @Test
    void theAdminKillSwitchSendsNoEmail() throws Exception {
        prefs("{\"matrix\":{\"SYSTEM\":{\"inapp\":true,\"email\":\"now\"}},\"tz\":\"UTC\"}");
        appSettingRepository.saveAndFlush(new AppSetting("notifications.email.enabled", "false", "it", Instant.now()));
        settings.invalidate();
        try {
            var made = service.publish(NotificationKind.SYSTEM, me().getId(), NotificationService.Payload.of("News", "quiet please", "/dashboard"));
            assertThat(made).isPresent(); // still in-app
            verify(mail, never()).sendNotificationEmail(any(), anyString(), anyString(), any(), anyString());
        } finally {
            settings.invalidate(); // the row rolls back with the test; the cache must not outlive it
        }
    }
}
