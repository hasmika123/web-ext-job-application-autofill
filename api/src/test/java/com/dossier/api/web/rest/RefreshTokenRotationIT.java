package com.dossier.api.web.rest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;

/**
 * Integration tests for refresh-token rotation + revocation (1.11). Drives the real
 * /api/authenticate, /api/refresh and /api/logout against the seeded "user".
 */
@IntegrationTest
@AutoConfigureMockMvc
class RefreshTokenRotationIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper om;

    private record Tokens(String access, String refresh) {}

    private Tokens login() throws Exception {
        String body = om.writeValueAsString(Map.of("username", "user", "password", "user"));
        String res = mockMvc
            .perform(post("/api/authenticate").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString();
        JsonNode n = om.readTree(res);
        return new Tokens(n.get("accessToken").asText(), n.get("refreshToken").asText());
    }

    private ResultActions refresh(String refreshToken) throws Exception {
        return mockMvc.perform(
            post("/api/refresh")
                .contentType(MediaType.APPLICATION_JSON)
                .content(om.writeValueAsString(Map.of("refreshToken", refreshToken)))
        );
    }

    @Test
    @Transactional
    void refreshRotatesAndReturnsANewRefreshToken() throws Exception {
        Tokens t = login();
        String res = refresh(t.refresh()).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        JsonNode n = om.readTree(res);
        assertThat(n.get("accessToken").asText()).isNotBlank();
        // Rotation: a fresh refresh token is returned, different from the one presented.
        assertThat(n.has("refreshToken")).isTrue();
        assertThat(n.get("refreshToken").asText()).isNotBlank().isNotEqualTo(t.refresh());
    }

    @Test
    @Transactional
    void reusingARotatedRefreshTokenIsRejectedAndRevokesTheFamily() throws Exception {
        Tokens t = login();
        String res = refresh(t.refresh()).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String rotated = om.readTree(res).get("refreshToken").asText();

        // Replaying the spent original is rejected...
        refresh(t.refresh()).andExpect(status().isUnauthorized());
        // ...and that reuse compromises the family, so the rotated token is dead too.
        refresh(rotated).andExpect(status().isUnauthorized());
    }

    @Test
    @Transactional
    void logoutRevokesTheRefreshToken() throws Exception {
        Tokens t = login();
        mockMvc
            .perform(
                post("/api/logout")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(om.writeValueAsString(Map.of("refreshToken", t.refresh())))
            )
            .andExpect(status().isOk());
        refresh(t.refresh()).andExpect(status().isUnauthorized());
    }

    @Test
    @Transactional
    void anAccessTokenCannotBeUsedToRefresh() throws Exception {
        Tokens t = login();
        refresh(t.access()).andExpect(status().isUnauthorized());
    }
}
