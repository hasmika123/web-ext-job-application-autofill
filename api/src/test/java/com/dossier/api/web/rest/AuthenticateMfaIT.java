package com.dossier.api.web.rest;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AdminMfaChallenge;
import com.dossier.api.repository.AdminMfaChallengeRepository;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * The MFA completion endpoint (Phase 9.X.3): a seeded challenge + correct code yields tokens;
 * a bad token is 401. (MFA is off in the test profile, so the password-login ITs are unaffected;
 * this exercises /authenticate/mfa directly with a pre-seeded challenge.)
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class AuthenticateMfaIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private AdminMfaChallengeRepository repository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    private String seedChallenge(String code) {
        AdminMfaChallenge c = new AdminMfaChallenge();
        c.setMfaToken(UUID.randomUUID().toString());
        c.setLogin("admin");
        c.setUserId(1L);
        c.setAuthorities("ROLE_ADMIN ROLE_USER");
        c.setCodeHash(passwordEncoder.encode(code));
        c.setExpiresAt(Instant.now().plusSeconds(300));
        c.setAttempts(0);
        return repository.saveAndFlush(c).getMfaToken();
    }

    @Test
    void correctCodeIssuesTokens() throws Exception {
        String token = seedChallenge("123456");
        mockMvc
            .perform(
                post("/api/authenticate/mfa")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"mfaToken\":\"" + token + "\",\"code\":\"123456\"}")
            )
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.accessToken").isNotEmpty())
            .andExpect(jsonPath("$.refreshToken").isNotEmpty());
    }

    @Test
    void wrongCodeIsUnauthorized() throws Exception {
        String token = seedChallenge("123456");
        mockMvc
            .perform(
                post("/api/authenticate/mfa").contentType(MediaType.APPLICATION_JSON).content("{\"mfaToken\":\"" + token + "\",\"code\":\"000000\"}")
            )
            .andExpect(status().isUnauthorized());
    }

    @Test
    void unknownTokenIsUnauthorized() throws Exception {
        mockMvc
            .perform(post("/api/authenticate/mfa").contentType(MediaType.APPLICATION_JSON).content("{\"mfaToken\":\"nope\",\"code\":\"123456\"}"))
            .andExpect(status().isUnauthorized());
    }
}
