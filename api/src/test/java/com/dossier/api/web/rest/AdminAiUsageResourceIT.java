package com.dossier.api.web.rest;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AiCall;
import com.dossier.api.repository.AiCallRepository;
import com.dossier.api.security.AuthoritiesConstants;
import java.time.YearMonth;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * Admin AI-usage dashboard endpoint (Phase 9.A2.1; cost-based since 13.1c): ADMIN-gated, and it
 * aggregates the {@code ai_call} ledger by user and by task for a UTC month.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class AdminAiUsageResourceIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private AiCallRepository repository;

    private void call(String login, String task, long costMicros) {
        AiCall c = new AiCall();
        c.setLogin(login);
        c.setTask(task);
        c.setModel("gemini-2.5-flash-lite");
        c.setCostMicros(costMicros);
        repository.saveAndFlush(c);
    }

    @Test
    @WithMockUser(username = "leak", authorities = AuthoritiesConstants.USER)
    void normalUserIsForbidden() throws Exception {
        mockMvc.perform(get("/api/admin/ai-usage")).andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser(username = "boss", authorities = AuthoritiesConstants.ADMIN)
    void adminSeesCostByUserAndByTask() throws Exception {
        call("heavy", "draft", 2_000_000L); // $2.00 — 40 % of the $5 Pro budget
        call("heavy", "map", 500_000L);
        call("light", "pick", 1_000L);
        call(null, "parse", 10_000L); // a deleted account: in the totals, not a user
        mockMvc
            .perform(get("/api/admin/ai-usage"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.period").value(YearMonth.now(ZoneOffset.UTC).toString()))
            .andExpect(jsonPath("$.proBudgetMicros").value(5_000_000))
            .andExpect(jsonPath("$.totalCostMicros").value(2_511_000))
            .andExpect(jsonPath("$.totalCalls").value(4))
            .andExpect(jsonPath("$.userCount").value(2))
            // dearest first
            .andExpect(jsonPath("$.users[0].login").value("heavy"))
            .andExpect(jsonPath("$.users[0].calls").value(2))
            .andExpect(jsonPath("$.users[0].costMicros").value(2_500_000))
            .andExpect(jsonPath("$.users[0].percentOfProBudget").value(50))
            .andExpect(jsonPath("$.tasks[0].task").value("draft"))
            .andExpect(jsonPath("$.tasks[0].costMicros").value(2_000_000));
    }

    @Test
    @WithMockUser(username = "boss", authorities = AuthoritiesConstants.ADMIN)
    void emptyMonthIsZeroes() throws Exception {
        mockMvc
            .perform(get("/api/admin/ai-usage?period=1999-01"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.period").value("1999-01"))
            .andExpect(jsonPath("$.totalCostMicros").value(0))
            .andExpect(jsonPath("$.userCount").value(0));
    }
}
