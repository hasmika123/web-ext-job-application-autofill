package com.dossier.api.web.rest;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.IntegrationTest;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.security.AuthoritiesConstants;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Admin user actions (Phase 9.A1.4): gating, the self-action guard, role + activation changes,
 * and the full GDPR delete — against the seeded {@code user} account on a real MySQL container.
 * (CSRF is disabled in SecurityConfiguration, so no token is needed on these POST/DELETEs.)
 */
@IntegrationTest
@AutoConfigureMockMvc
class AdminUserActionResourceIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository userRepository;

    @Test
    @WithMockUser(username = "leak", authorities = AuthoritiesConstants.USER)
    void normalUserIsForbidden() throws Exception {
        mockMvc.perform(post("/api/admin/users/user/deactivate")).andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser(username = "boss", authorities = AuthoritiesConstants.ADMIN)
    void adminCanDeactivateAndReactivate() throws Exception {
        mockMvc
            .perform(post("/api/admin/users/user/deactivate"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.activated").value(false));
        mockMvc
            .perform(post("/api/admin/users/user/activate"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.activated").value(true));
    }

    @Test
    @WithMockUser(username = "boss", authorities = AuthoritiesConstants.ADMIN)
    void adminCanGrantAndRevokeAdmin() throws Exception {
        mockMvc
            .perform(post("/api/admin/users/user/grant-admin"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.authorities", org.hamcrest.Matchers.hasItem(AuthoritiesConstants.ADMIN)));
        mockMvc
            .perform(post("/api/admin/users/user/revoke-admin"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.authorities", org.hamcrest.Matchers.not(org.hamcrest.Matchers.hasItem(AuthoritiesConstants.ADMIN))));
    }

    @Test
    @WithMockUser(username = "admin", authorities = AuthoritiesConstants.ADMIN)
    void cannotDeleteSelf() throws Exception {
        // acting as "admin", deleting "admin" must be blocked (400) before any erase.
        mockMvc.perform(delete("/api/admin/users/admin/data")).andExpect(status().isBadRequest());
        assertThat(userRepository.findOneByLogin("admin")).isPresent();
    }

    @Test
    @WithMockUser(username = "admin", authorities = AuthoritiesConstants.ADMIN)
    void adminCanPermanentlyDeleteAnotherUser() throws Exception {
        assertThat(userRepository.findOneByLogin("user")).isPresent();
        mockMvc.perform(delete("/api/admin/users/user/data")).andExpect(status().isNoContent());
        assertThat(userRepository.findOneByLogin("user")).isEmpty();
    }

    @Test
    @WithMockUser(username = "boss", authorities = AuthoritiesConstants.ADMIN)
    void unknownUserIs404() throws Exception {
        mockMvc.perform(post("/api/admin/users/nobody/activate")).andExpect(status().isNotFound());
    }
}
