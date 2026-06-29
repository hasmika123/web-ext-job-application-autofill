package com.dossier.api.web.rest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.RefreshToken;
import com.dossier.api.repository.RefreshTokenRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.security.AuthoritiesConstants;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/** Admin sessions endpoint (Phase 9.A2.3): list + per-family revoke against the seeded {@code user}. */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class AdminSessionResourceIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private RefreshTokenRepository refreshTokenRepository;

    @Autowired
    private UserRepository userRepository;

    private void seedFamily(String family, String jti) {
        Long userId = userRepository.findOneByLogin("user").orElseThrow().getId();
        RefreshToken t = new RefreshToken();
        t.setJti(jti);
        t.setFamilyId(family);
        t.setUserId(userId);
        t.setRevoked(false);
        t.setCreatedAt(Instant.now());
        t.setExpiresAt(Instant.now().plus(30, ChronoUnit.DAYS));
        refreshTokenRepository.saveAndFlush(t);
    }

    @Test
    @WithMockUser(username = "leak", authorities = AuthoritiesConstants.USER)
    void normalUserIsForbidden() throws Exception {
        mockMvc.perform(get("/api/admin/users/user/sessions")).andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser(username = "boss", authorities = AuthoritiesConstants.ADMIN)
    void listsFamiliesThenRevokes() throws Exception {
        seedFamily("fam-1", "jti-1");

        mockMvc
            .perform(get("/api/admin/users/user/sessions"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].familyId").value("fam-1"))
            .andExpect(jsonPath("$[0].active").value(true));

        mockMvc.perform(post("/api/admin/users/user/sessions/fam-1/revoke")).andExpect(status().isNoContent());

        assertThat(refreshTokenRepository.findByJti("jti-1").orElseThrow().isRevoked()).isTrue();
    }

    @Test
    @WithMockUser(username = "boss", authorities = AuthoritiesConstants.ADMIN)
    void revokingUnknownFamilyIs404() throws Exception {
        mockMvc.perform(post("/api/admin/users/user/sessions/nope/revoke")).andExpect(status().isNotFound());
    }
}
