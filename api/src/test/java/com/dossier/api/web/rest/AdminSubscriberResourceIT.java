package com.dossier.api.web.rest;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.EmailSubscriber;
import com.dossier.api.domain.enumeration.SubscriberStatus;
import com.dossier.api.repository.EmailSubscriberRepository;
import com.dossier.api.security.AuthoritiesConstants;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/** Admin subscriber list / counts / CSV export (Phase 9.A4.3): ADMIN-gated, on real MySQL. */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class AdminSubscriberResourceIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private EmailSubscriberRepository repository;

    private void seed(String email, SubscriberStatus status) {
        EmailSubscriber s = new EmailSubscriber();
        s.setEmail(email);
        s.setStatus(status);
        s.setUnsubscribeToken(UUID.randomUUID().toString());
        s.setCreatedDate(Instant.now());
        repository.saveAndFlush(s);
    }

    @Test
    @WithMockUser(username = "leak", authorities = AuthoritiesConstants.USER)
    void normalUserIsForbidden() throws Exception {
        mockMvc.perform(get("/api/admin/subscribers")).andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser(username = "boss", authorities = AuthoritiesConstants.ADMIN)
    void adminListsAndCountsAndFilters() throws Exception {
        seed("conf@example.com", SubscriberStatus.CONFIRMED);
        seed("pend@example.com", SubscriberStatus.PENDING);

        mockMvc.perform(get("/api/admin/subscribers")).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(2));
        mockMvc
            .perform(get("/api/admin/subscribers?status=CONFIRMED"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(1))
            .andExpect(jsonPath("$[0].email").value("conf@example.com"))
            .andExpect(jsonPath("$[0].status").value("CONFIRMED"));
        mockMvc
            .perform(get("/api/admin/subscribers/counts"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.CONFIRMED").value(1))
            .andExpect(jsonPath("$.PENDING").value(1));
    }

    @Test
    @WithMockUser(username = "boss", authorities = AuthoritiesConstants.ADMIN)
    void exportsCsv() throws Exception {
        seed("csv@example.com", SubscriberStatus.CONFIRMED);
        mockMvc
            .perform(get("/api/admin/subscribers/export?status=CONFIRMED"))
            .andExpect(status().isOk())
            .andExpect(content().contentTypeCompatibleWith("text/csv"))
            .andExpect(content().string(org.hamcrest.Matchers.containsString("csv@example.com")));
    }
}
