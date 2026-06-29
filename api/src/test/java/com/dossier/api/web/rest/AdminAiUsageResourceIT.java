package com.dossier.api.web.rest;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AiUsage;
import com.dossier.api.repository.AiUsageRepository;
import com.dossier.api.security.AuthoritiesConstants;
import java.time.YearMonth;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/** Admin AI-usage dashboard endpoint (Phase 9.A2.1): ADMIN-gated, aggregates the monthly meter. */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class AdminAiUsageResourceIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private AiUsageRepository repository;

    private void seed(String login, int count) {
        AiUsage u = new AiUsage();
        u.setLogin(login);
        u.setPeriod(YearMonth.now().toString());
        u.setDraftCount(count);
        repository.saveAndFlush(u);
    }

    @Test
    @WithMockUser(username = "leak", authorities = AuthoritiesConstants.USER)
    void normalUserIsForbidden() throws Exception {
        mockMvc.perform(get("/api/admin/ai-usage")).andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser(username = "boss", authorities = AuthoritiesConstants.ADMIN)
    void adminSeesAggregatedUsage() throws Exception {
        seed("heavy", 30);
        seed("light", 2);
        mockMvc
            .perform(get("/api/admin/ai-usage"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.period").value(YearMonth.now().toString()))
            .andExpect(jsonPath("$.totalDrafts").value(32))
            .andExpect(jsonPath("$.userCount").value(2))
            // busiest first
            .andExpect(jsonPath("$.users[0].login").value("heavy"))
            .andExpect(jsonPath("$.users[0].draftCount").value(30));
    }

    @Test
    @WithMockUser(username = "boss", authorities = AuthoritiesConstants.ADMIN)
    void emptyMonthIsZeroes() throws Exception {
        mockMvc
            .perform(get("/api/admin/ai-usage?period=1999-01"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.totalDrafts").value(0))
            .andExpect(jsonPath("$.userCount").value(0));
    }
}
