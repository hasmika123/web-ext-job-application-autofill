package com.dossier.api.web.rest;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.ProSubscriptions;
import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.service.ai.AiProvider;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * The daily-job-match switch (Phase 13.6b) over HTTP: off until switched on, on is Pro-only, off
 * always works. (Matching itself is covered by JobMatchServiceTest; the provider is mocked so
 * switching on never reaches a real model.)
 */
@IntegrationTest
@AutoConfigureMockMvc
@WithMockUser(username = "user")
@Transactional
class JobMatchResourceIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private SubscriptionRepository subscriptionRepository;

    @MockitoBean
    private AiProvider aiProvider;

    private static final String ON = "{\"enabled\":true}";
    private static final String OFF = "{\"enabled\":false}";

    @Test
    void offUntilSwitchedOn() throws Exception {
        mockMvc.perform(get("/api/profile/job-matches/settings")).andExpect(status().isOk()).andExpect(jsonPath("$.enabled").value(false));
    }

    @Test
    void aFreeUserCantSwitchItOnButCanSwitchItOff() throws Exception {
        mockMvc
            .perform(put("/api/profile/job-matches/settings").contentType(MediaType.APPLICATION_JSON).content(ON))
            .andExpect(status().isPaymentRequired())
            .andExpect(jsonPath("$.code").value("PRO_REQUIRED"));
        mockMvc
            .perform(put("/api/profile/job-matches/settings").contentType(MediaType.APPLICATION_JSON).content(OFF))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.enabled").value(false));
    }

    @Test
    void proSwitchesItOnAndOff() throws Exception {
        ProSubscriptions.makePro(subscriptionRepository, userRepository, "user");
        mockMvc
            .perform(put("/api/profile/job-matches/settings").contentType(MediaType.APPLICATION_JSON).content(ON))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.enabled").value(true));
        mockMvc.perform(get("/api/profile/job-matches/settings")).andExpect(jsonPath("$.enabled").value(true));
        mockMvc
            .perform(put("/api/profile/job-matches/settings").contentType(MediaType.APPLICATION_JSON).content(OFF))
            .andExpect(jsonPath("$.enabled").value(false));
    }
}
