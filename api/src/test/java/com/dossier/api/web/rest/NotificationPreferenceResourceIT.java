package com.dossier.api.web.rest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.anonymous;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.InboxConnection;
import com.dossier.api.domain.User;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.repository.InboxConnectionRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.inbox.InboxService;
import java.time.Instant;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;

/**
 * Integration tests for {@link NotificationPreferenceResource} (E2E-U7.0): the admin-configured defaults before a first save,
 * a save read back, the locked kinds, every 422, the demo guard, ownership (user B can never see or change user A's), the
 * link with the Inbox page's switch, and the data export.
 */
@IntegrationTest
@AutoConfigureMockMvc
@WithMockUser(username = "user")
@Transactional
class NotificationPreferenceResourceIT {

    private static final String URL = "/api/profile/notification-preferences";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private AppSettingRepository appSettingRepository;

    @Autowired
    private ResumeBuilderSettings settings;

    @Autowired
    private InboxConnectionRepository connections;

    @Autowired
    private ApplicationEventPublisher events;

    @AfterEach
    void dropSettingsCache() {
        settings.invalidate(); // the setting rows roll back with the test transaction; the cache must not outlive them
    }

    private ResultActions save(String body) throws Exception {
        return mockMvc.perform(put(URL).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private void setting(String key, String value) {
        appSettingRepository.saveAndFlush(new AppSetting(key, value, "it", Instant.now()));
        settings.invalidate();
    }

    // ---- defaults -----------------------------------------------------------

    @Test
    void beforeAFirstSaveYouGetTheDefaults() throws Exception {
        mockMvc
            .perform(get(URL))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.stored").value(false))
            .andExpect(jsonPath("$.matrix.APP_STATUS.inapp").value(true))
            .andExpect(jsonPath("$.matrix.APP_STATUS.email").value("now"))
            .andExpect(jsonPath("$.matrix.SYSTEM.email").value("off"))
            .andExpect(jsonPath("$.matrix.BILLING.email").value("now"))
            .andExpect(jsonPath("$.quietStart").doesNotExist())
            .andExpect(jsonPath("$.tz").value("UTC"))
            .andExpect(jsonPath("$.emailEnabled").value(true))
            .andExpect(jsonPath("$.quietDefaults.start").value("22:00"))
            .andExpect(jsonPath("$.quietDefaults.end").value("08:00"))
            .andExpect(jsonPath("$.kinds.length()").value(6))
            .andExpect(jsonPath("$.kinds[?(@.kind == 'BILLING')].locked").value(true))
            .andExpect(jsonPath("$.kinds[?(@.kind == 'BILLING')].lockedWhy").isNotEmpty())
            .andExpect(jsonPath("$.kinds[?(@.kind == 'SYSTEM')].locked").value(false));
    }

    @Test
    void readingNeverCreatesARow() throws Exception {
        mockMvc.perform(get(URL)).andExpect(status().isOk());
        mockMvc.perform(get(URL)).andExpect(jsonPath("$.stored").value(false));
    }

    @Test
    void theAdminCanChangeTheDefaults() throws Exception {
        setting(
            "notifications.defaults",
            "{\"SYSTEM\":{\"inapp\":true,\"email\":\"now\"},\"APP_STATUS\":{\"inapp\":false,\"email\":\"off\"}}"
        );
        setting("notifications.quiet.defaultEnabled", "true");
        setting("notifications.quiet.defaultStartHour", "23");
        setting("notifications.quiet.defaultEndHour", "7");
        setting("notifications.defaultTz", "Europe/London");

        mockMvc
            .perform(get(URL))
            .andExpect(jsonPath("$.matrix.SYSTEM.email").value("now"))
            .andExpect(jsonPath("$.matrix.APP_STATUS.inapp").value(false))
            .andExpect(jsonPath("$.matrix.PROFILE_SUGGESTION.email").value("off")) // a kind the setting leaves out
            .andExpect(jsonPath("$.matrix.SECURITY.email").value("now"))
            .andExpect(jsonPath("$.quietStart").value("23:00"))
            .andExpect(jsonPath("$.quietEnd").value("07:00"))
            .andExpect(jsonPath("$.tz").value("Europe/London"))
            .andExpect(jsonPath("$.quietDefaults.start").value("23:00"));
    }

    @Test
    void aBadDefaultsSettingFallsBackToTheBuiltInOnes() throws Exception {
        setting("notifications.defaults", "{\"NOT_A_KIND\":{\"inapp\":true,\"email\":\"now\"}}");
        mockMvc.perform(get(URL)).andExpect(jsonPath("$.matrix.APP_STATUS.email").value("now"));
    }

    @Test
    void theEmailKillSwitchIsReported() throws Exception {
        setting("notifications.email.enabled", "false");
        mockMvc.perform(get(URL)).andExpect(jsonPath("$.emailEnabled").value(false));
    }

    // ---- saving -------------------------------------------------------------

    @Test
    void aSaveIsReadBack() throws Exception {
        save(
            "{\"matrix\":{\"APP_STATUS\":{\"inapp\":true,\"email\":\"off\"},\"SYSTEM\":{\"inapp\":false,\"email\":\"off\"}}," +
            "\"quietStart\":\"22:30\",\"quietEnd\":\"07:15\",\"tz\":\"Asia/Kolkata\"}"
        )
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.stored").value(true));

        mockMvc
            .perform(get(URL))
            .andExpect(jsonPath("$.stored").value(true))
            .andExpect(jsonPath("$.matrix.APP_STATUS.email").value("off"))
            .andExpect(jsonPath("$.matrix.SYSTEM.inapp").value(false))
            .andExpect(jsonPath("$.matrix.INTERVIEW_REMINDER.email").value("now")) // not sent, keeps its default
            .andExpect(jsonPath("$.quietStart").value("22:30"))
            .andExpect(jsonPath("$.quietEnd").value("07:15"))
            .andExpect(jsonPath("$.tz").value("Asia/Kolkata"));
    }

    @Test
    void sendingNoQuietHoursTurnsThemOff() throws Exception {
        save("{\"quietStart\":\"22:00\",\"quietEnd\":\"08:00\",\"tz\":\"UTC\"}").andExpect(status().isOk());
        save("{\"tz\":\"UTC\"}").andExpect(jsonPath("$.quietStart").doesNotExist()).andExpect(jsonPath("$.quietEnd").doesNotExist());
    }

    @Test
    void lockedKindsStayOnWhateverIsSent() throws Exception {
        save("{\"matrix\":{\"BILLING\":{\"inapp\":false,\"email\":\"off\"},\"SECURITY\":{\"inapp\":false,\"email\":\"off\"}},\"tz\":\"UTC\"}")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.matrix.BILLING.inapp").value(true))
            .andExpect(jsonPath("$.matrix.BILLING.email").value("now"))
            .andExpect(jsonPath("$.matrix.SECURITY.inapp").value(true))
            .andExpect(jsonPath("$.matrix.SECURITY.email").value("now"));
    }

    // ---- refusals -----------------------------------------------------------

    @Test
    void refusalsAre422AndStoreNothing() throws Exception {
        save("{\"matrix\":{\"NOT_A_KIND\":{\"inapp\":true,\"email\":\"off\"}}}").andExpect(status().isUnprocessableEntity());
        save("{\"matrix\":{\"SYSTEM\":{\"inapp\":true,\"email\":\"digest\"}}}").andExpect(status().isUnprocessableEntity());
        save("{\"matrix\":{\"SYSTEM\":{\"email\":\"off\"}}}").andExpect(status().isUnprocessableEntity());
        save("{\"quietStart\":\"25:00\",\"quietEnd\":\"07:00\"}").andExpect(status().isUnprocessableEntity());
        save("{\"quietStart\":\"22:00\"}").andExpect(status().isUnprocessableEntity()); // a window needs both ends
        save("{\"tz\":\"Mars/Olympus\"}").andExpect(status().isUnprocessableEntity());
        save("{\"tz\":\"+05:30\"}").andExpect(status().isUnprocessableEntity()); // an offset is not an IANA zone

        mockMvc.perform(get(URL)).andExpect(jsonPath("$.stored").value(false));
    }

    @Test
    void aNeverCollectedValueIsRefusedAsSensitive() throws Exception {
        save("{\"tz\":\"078-05-1120\"}").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("SENSITIVE_CONTENT"));
        mockMvc.perform(get(URL)).andExpect(jsonPath("$.stored").value(false));
    }

    @Test
    void demoLoginsCannotWrite() throws Exception {
        mockMvc
            .perform(put(URL).contentType(MediaType.APPLICATION_JSON).content("{\"tz\":\"UTC\"}").with(user("demo")))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.code").value("DEMO_READ_ONLY"));
    }

    @Test
    void signedOutIs401() throws Exception {
        mockMvc.perform(get(URL).with(anonymous())).andExpect(status().isUnauthorized());
        mockMvc.perform(put(URL).with(anonymous()).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isUnauthorized());
    }

    // ---- ownership ----------------------------------------------------------

    @Test
    void anotherUserCanNeitherReadNorChangeMine() throws Exception {
        User me = userRepository.findOneByLogin("user").orElseThrow();
        save("{\"matrix\":{\"SYSTEM\":{\"inapp\":true,\"email\":\"now\"}},\"quietStart\":\"21:00\",\"quietEnd\":\"06:00\",\"tz\":\"Asia/Tokyo\"}")
            .andExpect(status().isOk());

        // B (the seeded admin) sees B's own defaults, never A's values...
        mockMvc
            .perform(get(URL).with(user("admin")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.stored").value(false))
            .andExpect(jsonPath("$.matrix.SYSTEM.email").value("off"))
            .andExpect(jsonPath("$.quietStart").doesNotExist())
            .andExpect(jsonPath("$.tz").value("UTC"));

        // ...B's save touches only B's row...
        mockMvc
            .perform(put(URL).with(user("admin")).contentType(MediaType.APPLICATION_JSON).content("{\"matrix\":{\"SYSTEM\":{\"inapp\":false,\"email\":\"off\"}},\"tz\":\"Europe/Paris\"}"))
            .andExpect(status().isOk());
        mockMvc
            .perform(get(URL))
            .andExpect(jsonPath("$.matrix.SYSTEM.email").value("now"))
            .andExpect(jsonPath("$.matrix.SYSTEM.inapp").value(true))
            .andExpect(jsonPath("$.quietStart").value("21:00"))
            .andExpect(jsonPath("$.tz").value("Asia/Tokyo"));

        // ...and there is no way to name someone else's row: a user id in the path is a 404 for everybody.
        mockMvc.perform(get(URL + "/" + me.getId())).andExpect(status().isNotFound());
        mockMvc.perform(get(URL + "/" + me.getId()).with(user("admin"))).andExpect(status().isNotFound());
        mockMvc
            .perform(put(URL + "/" + me.getId()).with(user("admin")).contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isNotFound());
    }

    // ---- the Inbox page's switch --------------------------------------------

    private InboxConnection connectInbox(boolean notifyEmail) {
        User me = userRepository.findOneByLogin("user").orElseThrow();
        InboxConnection c = new InboxConnection(me.getId());
        c.setAddress("sam.applies@gmail.com");
        c.setPasswordEnc("not-a-real-secret");
        c.setNotifyEmail(notifyEmail);
        return connections.saveAndFlush(c);
    }

    @Test
    void anInboxSwitchAlreadyOffShowsAsOffBeforeAnySave() throws Exception {
        connectInbox(false);
        mockMvc.perform(get(URL)).andExpect(jsonPath("$.stored").value(false)).andExpect(jsonPath("$.matrix.APP_STATUS.email").value("off"));
    }

    @Test
    void changingApplicationUpdatesCarriesIntoTheInboxSwitch() throws Exception {
        InboxConnection c = connectInbox(true);
        save("{\"matrix\":{\"APP_STATUS\":{\"inapp\":true,\"email\":\"off\"}},\"tz\":\"UTC\"}").andExpect(status().isOk());
        assertThat(connections.findById(c.getUserId()).orElseThrow().isNotifyEmail()).isFalse();

        save("{\"matrix\":{\"APP_STATUS\":{\"inapp\":true,\"email\":\"now\"}},\"tz\":\"UTC\"}").andExpect(status().isOk());
        assertThat(connections.findById(c.getUserId()).orElseThrow().isNotifyEmail()).isTrue();
    }

    @Test
    void theInboxPageSwitchCarriesIntoSavedPreferences() throws Exception {
        InboxConnection c = connectInbox(true);
        save("{\"tz\":\"UTC\"}").andExpect(status().isOk()); // a row now exists
        mockMvc.perform(get(URL)).andExpect(jsonPath("$.matrix.APP_STATUS.email").value("now"));

        events.publishEvent(new InboxService.NotifyEmailChanged(c.getUserId(), false));

        mockMvc.perform(get(URL)).andExpect(jsonPath("$.matrix.APP_STATUS.email").value("off"));
    }

    // ---- the data export ----------------------------------------------------

    @Test
    void theExportCarriesWhatWasSaved() throws Exception {
        mockMvc.perform(get("/api/account/export")).andExpect(status().isOk()).andExpect(jsonPath("$.notificationPreferences").doesNotExist());

        save("{\"matrix\":{\"SYSTEM\":{\"inapp\":true,\"email\":\"now\"}},\"quietStart\":\"22:00\",\"quietEnd\":\"08:00\",\"tz\":\"Asia/Tokyo\"}")
            .andExpect(status().isOk());

        mockMvc
            .perform(get("/api/account/export"))
            .andExpect(jsonPath("$.notificationPreferences.tz").value("Asia/Tokyo"))
            .andExpect(jsonPath("$.notificationPreferences.quietStart").value("22:00"))
            .andExpect(jsonPath("$.notificationPreferences.matrix.SYSTEM.email").value("now"));
    }
}
