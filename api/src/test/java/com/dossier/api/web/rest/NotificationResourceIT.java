package com.dossier.api.web.rest;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.Notification;
import com.dossier.api.domain.User;
import com.dossier.api.repository.NotificationRepository;
import com.dossier.api.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/** In-app notifications over HTTP (Phase 14.6): listed with an unread count, marked read, owned. */
@IntegrationTest
@AutoConfigureMockMvc
@WithMockUser(username = "user")
@Transactional
class NotificationResourceIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private NotificationRepository notifications;

    private Notification note(User owner, String title) {
        Notification n = new Notification();
        n.setUserId(owner.getId());
        n.setKind(Notification.STATUS_FROM_MAIL);
        n.setTitle(title);
        n.setBody("Moved to Interview — from an email in your inbox.");
        n.setLink("/board?app=1");
        return notifications.saveAndFlush(n);
    }

    @Test
    void listedWithAnUnreadCountThenMarkedRead() throws Exception {
        User me = userRepository.findOneByLogin("user").orElseThrow();
        Notification a = note(me, "Acme · Backend Engineer");
        note(me, "Globex · Designer");

        mockMvc
            .perform(get("/api/profile/notifications"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.unread").value(2))
            .andExpect(jsonPath("$.items.length()").value(2))
            .andExpect(jsonPath("$.items[0].link").value("/board?app=1"));

        mockMvc.perform(post("/api/profile/notifications/" + a.getId() + "/read")).andExpect(status().isOk());
        mockMvc.perform(get("/api/profile/notifications")).andExpect(jsonPath("$.unread").value(1));

        mockMvc.perform(post("/api/profile/notifications/read-all")).andExpect(status().isOk());
        mockMvc.perform(get("/api/profile/notifications")).andExpect(jsonPath("$.unread").value(0));
    }

    @Test
    void nobodyElsesNotifications() throws Exception {
        User admin = userRepository.findOneByLogin("admin").orElseThrow();
        Notification theirs = note(admin, "Secret");
        mockMvc.perform(get("/api/profile/notifications")).andExpect(jsonPath("$.items[?(@.id == " + theirs.getId() + ")]").isEmpty());
        mockMvc.perform(post("/api/profile/notifications/" + theirs.getId() + "/read")).andExpect(status().isNotFound());
    }
}
