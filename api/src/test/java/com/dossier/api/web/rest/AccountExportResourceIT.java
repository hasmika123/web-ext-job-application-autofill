package com.dossier.api.web.rest;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/** Self-service data export (Phase 9.X.2): returns the current user's own data; auth required. */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class AccountExportResourceIT {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void unauthenticatedIsRejected() throws Exception {
        mockMvc.perform(get("/api/account/export")).andExpect(status().isUnauthorized());
    }

    @Test
    @WithMockUser(username = "user")
    void returnsCurrentUsersData() throws Exception {
        mockMvc
            .perform(get("/api/account/export"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.exportedAt").exists())
            .andExpect(jsonPath("$.account.login").value("user"))
            .andExpect(jsonPath("$.resumes").isArray())
            .andExpect(jsonPath("$.applications").isArray());
    }
}
