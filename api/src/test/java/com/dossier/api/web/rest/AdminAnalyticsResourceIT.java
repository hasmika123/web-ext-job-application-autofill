package com.dossier.api.web.rest;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.security.AuthoritiesConstants;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * Admin analytics overview (Phase 9.A3): ADMIN-gated, and the aggregate queries
 * (counts, distinct-user funnel, per-status, time-window) execute on a real MySQL container.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class AdminAnalyticsResourceIT {

    @Autowired
    private MockMvc mockMvc;

    @Test
    @WithMockUser(username = "leak", authorities = AuthoritiesConstants.USER)
    void normalUserIsForbidden() throws Exception {
        mockMvc.perform(get("/api/admin/analytics")).andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser(username = "boss", authorities = AuthoritiesConstants.ADMIN)
    void adminGetsOverviewShape() throws Exception {
        mockMvc
            .perform(get("/api/admin/analytics"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.totalUsers").isNumber())
            .andExpect(jsonPath("$.activatedUsers").isNumber())
            .andExpect(jsonPath("$.activationRatePct").isNumber())
            .andExpect(jsonPath("$.signups7d").isNumber())
            .andExpect(jsonPath("$.activeUsers7d").isNumber())
            .andExpect(jsonPath("$.totalResumes").isNumber())
            .andExpect(jsonPath("$.totalApplications").isNumber())
            .andExpect(jsonPath("$.funnel.signedUp").isNumber())
            .andExpect(jsonPath("$.funnel.applied").isNumber())
            .andExpect(jsonPath("$.applicationsByStatus.DRAFT").isNumber())
            .andExpect(jsonPath("$.applicationsByStatus.APPLIED").isNumber());
    }
}
