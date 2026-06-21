package com.dossier.api.web.rest;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.User;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.web.rest.vm.LoginVM;
import com.dossier.api.web.rest.vm.RefreshVM;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * Integration tests for the stateless access/refresh token flow on
 * {@link AuthenticateController}.
 */
@AutoConfigureMockMvc
@IntegrationTest
class RefreshTokenControllerIT {

    @Autowired
    private ObjectMapper om;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private MockMvc mockMvc;

    private void createUser(String login) {
        User user = new User();
        user.setLogin(login);
        user.setEmail(login + "@example.com");
        user.setActivated(true);
        user.setPassword(passwordEncoder.encode("test"));
        userRepository.saveAndFlush(user);
    }

    /** Authenticate and return the parsed {accessToken, refreshToken} body. */
    private JsonNode authenticate(String login) throws Exception {
        LoginVM vm = new LoginVM();
        vm.setUsername(login);
        vm.setPassword("test");
        String body = mockMvc
            .perform(post("/api/authenticate").contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(vm)))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString();
        return om.readTree(body);
    }

    @Test
    @Transactional
    void refreshTokenYieldsWorkingAccessToken() throws Exception {
        createUser("refresh-happy");
        String refreshToken = authenticate("refresh-happy").get("refreshToken").asText();

        RefreshVM refreshVM = new RefreshVM();
        refreshVM.setRefreshToken(refreshToken);
        String body = mockMvc
            .perform(post("/api/refresh").contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(refreshVM)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.accessToken").isString())
            .andExpect(jsonPath("$.accessToken").isNotEmpty())
            // refresh returns only a new access token, no new refresh token
            .andExpect(jsonPath("$.refreshToken").doesNotExist())
            .andReturn()
            .getResponse()
            .getContentAsString();

        // the freshly minted access token must actually authenticate a request
        String newAccess = om.readTree(body).get("accessToken").asText();
        mockMvc.perform(get("/api/authenticate").header("Authorization", "Bearer " + newAccess)).andExpect(status().isNoContent());
    }

    @Test
    @Transactional
    void refreshTokenIsRejectedAsAnAccessToken() throws Exception {
        createUser("refresh-not-access");
        String refreshToken = authenticate("refresh-not-access").get("refreshToken").asText();

        // Presenting the refresh token as an access bearer token must be rejected.
        mockMvc
            .perform(get("/api/authenticate").header("Authorization", "Bearer " + refreshToken))
            .andExpect(status().isUnauthorized());
    }

    @Test
    @Transactional
    void accessTokenCannotBeUsedToRefresh() throws Exception {
        createUser("access-not-refresh");
        String accessToken = authenticate("access-not-refresh").get("accessToken").asText();

        RefreshVM refreshVM = new RefreshVM();
        refreshVM.setRefreshToken(accessToken); // wrong token type
        mockMvc
            .perform(post("/api/refresh").contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(refreshVM)))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void garbageRefreshTokenIsRejected() throws Exception {
        RefreshVM refreshVM = new RefreshVM();
        refreshVM.setRefreshToken("not-a-real-jwt");
        mockMvc
            .perform(post("/api/refresh").contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(refreshVM)))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void missingRefreshTokenIsBadRequest() throws Exception {
        // @NotNull on RefreshVM.refreshToken → 400 before the controller body runs
        mockMvc
            .perform(post("/api/refresh").contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isBadRequest());
    }
}
