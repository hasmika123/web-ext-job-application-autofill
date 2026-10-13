package com.dossier.api.web.rest;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.ResumeRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.DemoAccountService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.cache.CacheManager;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * The demo accounts end to end (phase demo): the public list, the one-click login with the switch on
 * and off, the password back door, the read-only guard, and the admin switch. Runs against a real
 * MySQL container like the other ITs.
 *
 * <p>{@code @Transactional} so users and seed rows roll back. The switch is a plain field fed by
 * {@code dossier.demo.enabled}, so every test sets it itself and {@link #tearDown()} turns it off again.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class DemoAuthenticateIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper om;

    @Autowired
    private DemoAccountService demoAccountService;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private ApplicationRepository applicationRepository;

    @Autowired
    private ResumeRepository resumeRepository;

    @Autowired
    private CacheManager cacheManager;

    @BeforeEach
    void setUp() {
        // The by-login user lookup is cached; a rolled-back test must not leave its user id behind.
        cacheManager.getCacheNames().forEach(n -> cacheManager.getCache(n).clear());
        demoAccountService.ensureAccounts();
    }

    @AfterEach
    void tearDown() {
        setEnabled(false);
    }

    private void setEnabled(boolean enabled) {
        // The switch is server config at runtime; the suite pokes the field the property fills.
        ReflectionTestUtils.setField(demoAccountService, "enabled", enabled);
    }

    private String demoLoginBody(String login) throws Exception {
        return om.writeValueAsString(java.util.Map.of("login", login));
    }

    private String accessTokenFor(String login) throws Exception {
        String json = mockMvc
            .perform(post("/api/authenticate/demo").contentType(MediaType.APPLICATION_JSON).content(demoLoginBody(login)))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString();
        JsonNode tree = om.readTree(json);
        return tree.get("accessToken").asText();
    }

    // ---- switch off (the shipped default) -----------------------------------------------------

    @Test
    void publicListIsEmptyAndDisabledByDefault() throws Exception {
        setEnabled(false);

        mockMvc
            .perform(get("/api/public/demo"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.enabled").value(false))
            .andExpect(jsonPath("$.accounts").isEmpty());
    }

    @Test
    void demoLoginIsRefusedWhileDisabled() throws Exception {
        setEnabled(false);

        mockMvc
            .perform(post("/api/authenticate/demo").contentType(MediaType.APPLICATION_JSON).content(demoLoginBody("demo")))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.code").value("DEMO_DISABLED"));
    }

    @Test
    void thePasswordBackDoorIsClosedWhileDisabled() throws Exception {
        setEnabled(false);

        String body = om.writeValueAsString(java.util.Map.of("username", "demo", "password", "test-demo-password"));
        mockMvc
            .perform(post("/api/authenticate").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.code").value("DEMO_DISABLED"));

        String byEmail = om.writeValueAsString(java.util.Map.of("username", "demo@kiwiply.com", "password", "test-demo-password"));
        mockMvc
            .perform(post("/api/authenticate").contentType(MediaType.APPLICATION_JSON).content(byEmail))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.code").value("DEMO_DISABLED"));
    }

    // ---- switch on ----------------------------------------------------------------------------

    @Test
    void publicListShowsTheTwoAccountsAndNeverAPassword() throws Exception {
        setEnabled(true);

        mockMvc
            .perform(get("/api/public/demo"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.enabled").value(true))
            .andExpect(jsonPath("$.accounts.length()").value(2))
            .andExpect(jsonPath("$.accounts[0].login").value("demo"))
            .andExpect(jsonPath("$.accounts[0].label").value("Job seeker"))
            .andExpect(jsonPath("$.accounts[0].landing").value("/dashboard"))
            .andExpect(jsonPath("$.accounts[1].login").value("demo-org"))
            .andExpect(jsonPath("$.accounts[1].landing").value("/org"))
            .andExpect(content().string(not(containsString("test-demo-password"))))
            .andExpect(content().string(not(containsString("assword"))));
    }

    @Test
    void demoLoginIssuesTheSameTokenPairAsAPasswordLogin() throws Exception {
        setEnabled(true);

        mockMvc
            .perform(post("/api/authenticate/demo").contentType(MediaType.APPLICATION_JSON).content(demoLoginBody("demo")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.accessToken").isNotEmpty())
            .andExpect(jsonPath("$.refreshToken").isNotEmpty())
            .andExpect(header().exists("Authorization"));
    }

    @Test
    void theFirstJobSeekerLoginSeedsAnEmptyDemo() throws Exception {
        setEnabled(true); // the switch is on from config, nothing was seeded yet
        Long demoId = userRepository.findOneByLogin("demo").orElseThrow().getId();
        org.junit.jupiter.api.Assertions.assertEquals(0, applicationRepository.findByUserId(demoId).size());

        accessTokenFor("demo");

        org.junit.jupiter.api.Assertions.assertEquals(8, applicationRepository.findByUserId(demoId).size());
    }

    @Test
    void demoLoginForAnyOtherLoginIs404AndNeverIssuesAToken() throws Exception {
        setEnabled(true);

        mockMvc
            .perform(post("/api/authenticate/demo").contentType(MediaType.APPLICATION_JSON).content(demoLoginBody("admin")))
            .andExpect(status().isNotFound())
            .andExpect(content().string(not(containsString("accessToken"))));
    }

    @Test
    void theDemoTokenWorksLikeAnyOtherAndIsFree() throws Exception {
        setEnabled(true);
        String token = accessTokenFor("demo");

        mockMvc
            .perform(get("/api/account").header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.login").value("demo"))
            .andExpect(jsonPath("$.authorities[0]").value("ROLE_USER"));
        mockMvc
            .perform(get("/api/billing/me").header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.plan").value("FREE"));
    }

    @Test
    void aDemoSessionIsReadOnlyForAccountBillingAndInbox() throws Exception {
        setEnabled(true);
        String token = accessTokenFor("demo");
        String auth = "Bearer " + token;

        mockMvc
            .perform(
                post("/api/account")
                    .header("Authorization", auth)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"login\":\"demo\",\"firstName\":\"X\",\"lastName\":\"Y\",\"email\":\"demo@kiwiply.com\",\"langKey\":\"en\"}")
            )
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.code").value("DEMO_READ_ONLY"));
        mockMvc
            .perform(
                post("/api/account/change-password")
                    .header("Authorization", auth)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"currentPassword\":\"a\",\"newPassword\":\"b-long-enough\"}")
            )
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.code").value("DEMO_READ_ONLY"));
        mockMvc
            .perform(get("/api/account/export").header("Authorization", auth))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.code").value("DEMO_READ_ONLY"));
        mockMvc
            .perform(post("/api/billing/portal").header("Authorization", auth))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.code").value("DEMO_READ_ONLY"));
        mockMvc
            .perform(
                post("/api/billing/checkout")
                    .header("Authorization", auth)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"plan\":\"PRO_MONTHLY\"}")
            )
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.code").value("DEMO_READ_ONLY"));
        mockMvc
            .perform(
                post("/api/profile/inbox")
                    .header("Authorization", auth)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"address\":\"a@gmail.com\",\"appPassword\":\"x\"}")
            )
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.code").value("DEMO_READ_ONLY"));
        mockMvc
            .perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete("/api/account").header("Authorization", auth))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.code").value("DEMO_READ_ONLY"));
        // ...and the account is still there.
        org.junit.jupiter.api.Assertions.assertTrue(userRepository.findOneByLogin("demo").isPresent());
    }

    @Test
    void aDemoSessionStaysUsableForReadsAndTheBoard() throws Exception {
        setEnabled(true);
        demoAccountService.resetData();
        String auth = "Bearer " + accessTokenFor("demo");

        mockMvc.perform(get("/api/profile").header("Authorization", auth)).andExpect(status().isOk());
        mockMvc
            .perform(get("/api/profile/resumes").header("Authorization", auth))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(2));
    }

    // ---- seed and file-less resumes ------------------------------------------------------------

    @Test
    void resetSeedsEightApplicationsAndTwoFilelessResumesAndTheFileEndpointIs404NotAnError() throws Exception {
        setEnabled(true);
        demoAccountService.resetData();
        Long demoId = userRepository.findOneByLogin("demo").orElseThrow().getId();

        org.junit.jupiter.api.Assertions.assertEquals(8, applicationRepository.findByUserId(demoId).size());
        var resumes = resumeRepository.findByUserId(demoId);
        org.junit.jupiter.api.Assertions.assertEquals(2, resumes.size());

        String auth = "Bearer " + accessTokenFor("demo");
        mockMvc
            .perform(get("/api/resumes/" + resumes.get(0).getId() + "/file").header("Authorization", auth))
            .andExpect(status().isNotFound());
    }

    @Test
    void resetIsRepeatable() {
        demoAccountService.resetData();
        demoAccountService.resetData();
        Long demoId = userRepository.findOneByLogin("demo").orElseThrow().getId();

        org.junit.jupiter.api.Assertions.assertEquals(8, applicationRepository.findByUserId(demoId).size());
        org.junit.jupiter.api.Assertions.assertEquals(2, resumeRepository.findByUserId(demoId).size());
    }

    // ---- the admin switch ---------------------------------------------------------------------

    @Test
    @WithMockUser(username = "leak", authorities = AuthoritiesConstants.USER)
    void aNormalUserCannotTouchTheAdminSwitch() throws Exception {
        mockMvc.perform(get("/api/admin/settings/demo")).andExpect(status().isForbidden());
        mockMvc
            .perform(put("/api/admin/settings/demo").contentType(MediaType.APPLICATION_JSON).content("{\"enabled\":true}"))
            .andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser(username = "boss", authorities = AuthoritiesConstants.ADMIN)
    void thereIsNoEndpointToFlipTheSwitch() throws Exception {
        setEnabled(false);

        mockMvc
            .perform(put("/api/admin/settings/demo").contentType(MediaType.APPLICATION_JSON).content("{\"enabled\":true}"))
            .andExpect(status().isMethodNotAllowed());
        mockMvc.perform(get("/api/admin/settings/demo")).andExpect(jsonPath("$.enabled").value(false));
    }

    @Test
    @WithMockUser(username = "boss", authorities = AuthoritiesConstants.ADMIN)
    void adminResetReseedsTheDemo() throws Exception {
        mockMvc
            .perform(post("/api/admin/settings/demo/reset"))
            .andExpect(status().isOk());
        Long demoId = userRepository.findOneByLogin("demo").orElseThrow().getId();
        org.junit.jupiter.api.Assertions.assertEquals(8, applicationRepository.findByUserId(demoId).size());
    }
}
