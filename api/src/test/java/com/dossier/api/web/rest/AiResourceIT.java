package com.dossier.api.web.rest;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Integration test for {@link AiResource}. The test profile leaves the AI feature off
 * (no key), so a valid request returns {@code {disabled:true}} — this verifies the
 * endpoint is wired and auth-gated. The quota/consent/success branches are unit-tested
 * in {@code AiDraftServiceTest}.
 */
@IntegrationTest
@AutoConfigureMockMvc
class AiResourceIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper om;

    @Test
    @WithMockUser(username = "user")
    void draftIsDisabledWhenNoProviderConfigured() throws Exception {
        String body = om.writeValueAsString(Map.of("question", "Why do you want this role?", "context", "Backend engineer.", "consent", true));
        mockMvc
            .perform(post("/api/ai/draft").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.disabled").value(true));
    }

    @Test
    void draftRequiresAuthentication() throws Exception {
        String body = om.writeValueAsString(Map.of("question", "Why?", "consent", true));
        mockMvc
            .perform(post("/api/ai/draft").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isUnauthorized());
    }
}
