package com.dossier.api.web.rest;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.Application;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.UserRepository;
import java.time.Instant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/** U6.13: {@code GET /api/profile/applications/{id}/events}: the owner's full history, newest first, paged; anyone else's application is a 404. */
@IntegrationTest
@AutoConfigureMockMvc
@WithMockUser(username = "user")
@Transactional
class TrackerEventsPagingIT {

    private static final String BASE = "/api/profile/applications";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ApplicationRepository applications;

    @Autowired
    private UserRepository users;

    private Application make(User owner) {
        Application a = new Application();
        a.setUser(owner);
        a.setCompany("Acme");
        a.setRoleTitle("Engineer");
        a.setStatus(ApplicationStatus.APPLIED);
        a.setCreatedAt(Instant.parse("2026-09-01T10:00:00Z"));
        a.setUpdatedAt(Instant.parse("2026-09-01T10:00:00Z"));
        a.setArchived(false);
        return applications.saveAndFlush(a);
    }

    private Application mine;

    @BeforeEach
    void app() throws Exception {
        mine = make(users.findOneByLogin("user").orElseThrow());
        // 7 history rows, each on its own (a star and an unstar alternate)
        for (int i = 0; i < 7; i++) {
            mockMvc.perform(patch(BASE + "/" + mine.getId()).contentType(MediaType.APPLICATION_JSON).content("{\"starred\":" + (i % 2 == 0) + "}")).andExpect(status().isOk());
        }
    }

    @Test
    void pagesAreNewestFirstWithAStableOrderAndATotal() throws Exception {
        mockMvc
            .perform(get(BASE + "/" + mine.getId() + "/events").param("page", "0").param("size", "3"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.total").value(7))
            .andExpect(jsonPath("$.page").value(0))
            .andExpect(jsonPath("$.size").value(3))
            .andExpect(jsonPath("$.items", hasSize(3)))
            .andExpect(jsonPath("$.items[0].summary").value("Starred")) // i = 6 starred last
            .andExpect(jsonPath("$.items[1].summary").value("Unstarred"))
            .andExpect(jsonPath("$.items[0].actorKind").value("PERSON"))
            .andExpect(jsonPath("$.items[0].changes[0].f").value("starred"));
        mockMvc
            .perform(get(BASE + "/" + mine.getId() + "/events").param("page", "2").param("size", "3"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.items", hasSize(1)));
    }

    @Test
    void theDefaultAndMaximumPageSizesComeFromSettings() throws Exception {
        mockMvc.perform(get(BASE + "/" + mine.getId() + "/events")).andExpect(status().isOk()).andExpect(jsonPath("$.size").value(50)).andExpect(jsonPath("$.items", hasSize(7)));
        mockMvc.perform(get(BASE + "/" + mine.getId() + "/events").param("size", "5000")).andExpect(status().isOk()).andExpect(jsonPath("$.size").value(100));
    }

    @Test
    void someoneElsesApplicationIsAGenericNotFoundHistoryIncluded() throws Exception {
        Application theirs = make(users.findOneByLogin("admin").orElseThrow());
        mockMvc.perform(get(BASE + "/" + theirs.getId() + "/events")).andExpect(status().isNotFound());
        mockMvc.perform(get(BASE + "/99999999/events")).andExpect(status().isNotFound());
    }
}
