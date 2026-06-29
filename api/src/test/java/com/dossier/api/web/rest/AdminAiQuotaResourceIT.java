package com.dossier.api.web.rest;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.security.AuthoritiesConstants;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/** Per-user AI quota override endpoint (Phase 9.A2.2): ADMIN-gated set/clear against seeded {@code user}. */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class AdminAiQuotaResourceIT {

    @Autowired
    private MockMvc mockMvc;

    @Test
    @WithMockUser(username = "leak", authorities = AuthoritiesConstants.USER)
    void normalUserIsForbidden() throws Exception {
        mockMvc.perform(get("/api/admin/users/user/ai-quota")).andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser(username = "boss", authorities = AuthoritiesConstants.ADMIN)
    void setThenGetThenClear() throws Exception {
        mockMvc.perform(get("/api/admin/users/user/ai-quota")).andExpect(status().isOk()).andExpect(jsonPath("$.override").isEmpty());

        mockMvc
            .perform(put("/api/admin/users/user/ai-quota").contentType(MediaType.APPLICATION_JSON).content("{\"quota\":7}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.override").value(7));

        mockMvc.perform(get("/api/admin/users/user/ai-quota")).andExpect(status().isOk()).andExpect(jsonPath("$.override").value(7));

        mockMvc.perform(delete("/api/admin/users/user/ai-quota")).andExpect(status().isNoContent());
        mockMvc.perform(get("/api/admin/users/user/ai-quota")).andExpect(status().isOk()).andExpect(jsonPath("$.override").isEmpty());
    }

    @Test
    @WithMockUser(username = "boss", authorities = AuthoritiesConstants.ADMIN)
    void negativeQuotaIsRejected() throws Exception {
        mockMvc
            .perform(put("/api/admin/users/user/ai-quota").contentType(MediaType.APPLICATION_JSON).content("{\"quota\":-3}"))
            .andExpect(status().isBadRequest());
    }

    @Test
    @WithMockUser(username = "boss", authorities = AuthoritiesConstants.ADMIN)
    void unknownUserIs404() throws Exception {
        mockMvc
            .perform(put("/api/admin/users/ghost/ai-quota").contentType(MediaType.APPLICATION_JSON).content("{\"quota\":5}"))
            .andExpect(status().isNotFound());
    }
}
