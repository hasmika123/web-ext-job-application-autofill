package com.dossier.api.web.rest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.repository.AdminAuditEventRepository;
import com.dossier.api.repository.AiCallRepository;
import com.dossier.api.repository.AppSettingHistoryRepository;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ai.AiKeyScrubber;
import com.dossier.api.service.ai.AiProviderRegistry;
import com.dossier.api.service.ai.FakeAdapter;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/**
 * The admin AI config API end to end (I1.11): auth, provenance, writes with history + audit, the reason and
 * in-use rules, the test connection with its limiter and ledger row, the recent-calls list - and that no
 * response ever carries a key.
 *
 * <p>Not {@code @Transactional}: a refused PATCH must be seen to leave nothing behind, and the failure/probe
 * ledger rows are written in their own transaction. That needs more than the test pool's single connection.
 */
@IntegrationTest
@AutoConfigureMockMvc
@TestPropertySource(properties = { "dossier.ai.enabled=true", "spring.datasource.hikari.maximum-pool-size=4" })
class AdminAiConfigResourceIT {

    private static final String SECRET = "AIzaSyD-it-fake-key-0123456789abcdefghij";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private AppSettingRepository settings;

    @Autowired
    private AppSettingHistoryRepository history;

    @Autowired
    private AdminAuditEventRepository auditEvents;

    @Autowired
    private AiCallRepository aiCalls;

    @Autowired
    private ResumeBuilderSettings cache;

    @MockitoBean
    private AiProviderRegistry registry;

    private FakeAdapter gemini;

    @BeforeEach
    void stubRegistry() {
        sweep();
        gemini = new FakeAdapter("gemini");
        when(registry.ids()).thenReturn(Set.of("gemini"));
        when(registry.get("gemini")).thenReturn(gemini);
        when(registry.keyPresent("gemini")).thenReturn(true);
        when(registry.keyRequired("gemini")).thenReturn(true);
        when(registry.keyEnvVar("gemini")).thenReturn("DOSSIER_AI_API_KEY");
        when(registry.label("gemini")).thenReturn("Google Gemini");
        when(registry.kind("gemini")).thenReturn("cloud");
        when(registry.capabilities("gemini")).thenReturn(List.of("STRUCTURED_OUTPUT", "FILES"));
        when(registry.scrubber()).thenReturn(new AiKeyScrubber(List.of(SECRET)));
    }

    @AfterEach
    void sweep() {
        for (AppSetting s : settings.findAll()) if (s.getKey().startsWith("ai.")) settings.delete(s);
        history.deleteAll();
        aiCalls.deleteAll();
        cache.invalidate();
    }

    private static final String ADMIN = "boss";

    private ResultActions patchAi(String path, String json) throws Exception {
        return mockMvc.perform(patch("/api/admin/ai" + path).contentType(MediaType.APPLICATION_JSON).content(json));
    }

    // ---- auth -----------------------------------------------------------------

    @Test
    @WithMockUser(username = "leak", authorities = AuthoritiesConstants.USER)
    void aNormalUserIsForbiddenEverywhere() throws Exception {
        mockMvc.perform(get("/api/admin/ai/config")).andExpect(status().isForbidden());
        mockMvc.perform(get("/api/admin/ai/calls")).andExpect(status().isForbidden());
        mockMvc.perform(get("/api/admin/ai/config/history")).andExpect(status().isForbidden());
        patchAi("/routes/parse", "{\"model\":\"gemini-2.5-flash\"}").andExpect(status().isForbidden());
        mockMvc.perform(post("/api/admin/ai/providers/gemini/test")).andExpect(status().isForbidden());
        assertThat(settings.findAll()).noneMatch(s -> s.getKey().startsWith("ai."));
    }

    @Test
    void anAnonymousCallerIsUnauthorized() throws Exception {
        mockMvc.perform(get("/api/admin/ai/config")).andExpect(status().isUnauthorized());
    }

    // ---- GET config -----------------------------------------------------------

    @Test
    @WithMockUser(username = ADMIN, authorities = AuthoritiesConstants.ADMIN)
    void theConfigShowsProvenanceAndNeverAKey() throws Exception {
        String body = mockMvc
            .perform(get("/api/admin/ai/config"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.envMasterEnabled").value(true))
            .andExpect(jsonPath("$.global.enabled.value").value(true))
            .andExpect(jsonPath("$.global.enabled.source").value("default"))
            .andExpect(jsonPath("$.providers.length()").value(1))
            .andExpect(jsonPath("$.providers[0].id").value("gemini"))
            .andExpect(jsonPath("$.providers[0].keyPresent").value(true))
            .andExpect(jsonPath("$.providers[0].keyEnvVar").value("DOSSIER_AI_API_KEY"))
            .andExpect(jsonPath("$.providers[0].configured").value(true))
            .andExpect(jsonPath("$.providers[0].lastProbe").isEmpty())
            .andExpect(jsonPath("$.routes.length()").value(15))
            .andExpect(jsonPath("$.routes[?(@.task=='probe')]").isEmpty())
            .andExpect(jsonPath("$.routes[?(@.task=='parse')].model.source").value("env"))
            .andExpect(jsonPath("$.routes[?(@.task=='parse')].risk").value("HIGH"))
            .andExpect(jsonPath("$.routes[?(@.task=='parse')].maxOutputTokens.value").value(4000))
            .andExpect(jsonPath("$.prices[?(@.model=='gemini-2.5-flash-lite')].outputPerMtokMicros.value").value(400000))
            .andExpect(jsonPath("$.limits.testPerHour.value").value(30))
            .andReturn()
            .getResponse()
            .getContentAsString();
        assertThat(body).doesNotContain(SECRET).doesNotContainIgnoringCase("apikey");
    }

    // ---- writes ---------------------------------------------------------------

    @Test
    @WithMockUser(username = ADMIN, authorities = AuthoritiesConstants.ADMIN)
    void aRoutePatchIsDbBackedHistoriedAuditedAndDeleteGoesBackToEnv() throws Exception {
        long auditBefore = auditEvents.count();
        patchAi("/routes/parse", "{\"model\":\"gemini-2.5-flash\"}")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.task").value("parse"))
            .andExpect(jsonPath("$.model.value").value("gemini-2.5-flash"))
            .andExpect(jsonPath("$.model.source").value("db"))
            .andExpect(jsonPath("$.model.envDefault").value("gemini-2.5-flash-lite"));

        assertThat(settings.findById("ai.route.parse.model")).get().extracting(AppSetting::getValue).isEqualTo("gemini-2.5-flash");
        assertThat(history.findByKeyOrderByIdDesc("ai.route.parse.model", org.springframework.data.domain.PageRequest.of(0, 5)))
            .hasSize(1)
            .allSatisfy(h -> {
                assertThat(h.getActorLogin()).isEqualTo(ADMIN);
                assertThat(h.getOldValue()).isNull();
                assertThat(h.getNewValue()).isEqualTo("gemini-2.5-flash");
            });
        assertThat(auditEvents.count()).isEqualTo(auditBefore + 1);

        mockMvc
            .perform(get("/api/admin/ai/config/history").param("key", "ai.route.parse.model"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(1))
            .andExpect(jsonPath("$[0].newValue").value("gemini-2.5-flash"))
            .andExpect(jsonPath("$[0].actorLogin").value(ADMIN));

        mockMvc
            .perform(delete("/api/admin/ai/routes/parse"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.model.source").value("env"))
            .andExpect(jsonPath("$.model.value").value("gemini-2.5-flash-lite"));
        assertThat(settings.findById("ai.route.parse.model")).isEmpty();
    }

    @Test
    @WithMockUser(username = ADMIN, authorities = AuthoritiesConstants.ADMIN)
    void turningParseOffNeedsAReasonAndErrorsCarryACode() throws Exception {
        patchAi("/routes/parse", "{\"enabled\":false}")
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("AI_CONFIG_REASON_REQUIRED"))
            .andExpect(jsonPath("$.detail").isNotEmpty());
        assertThat(settings.findById("ai.route.parse.enabled")).isEmpty();

        patchAi("/routes/parse", "{\"enabled\":false,\"reason\":\"Gemini 5xx spike\"}")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.enabled.value").value(false))
            .andExpect(jsonPath("$.enabled.source").value("db"));
        patchAi("/routes/parse", "{\"enabled\":true}").andExpect(status().isOk());
    }

    @Test
    @WithMockUser(username = ADMIN, authorities = AuthoritiesConstants.ADMIN)
    void validationErrorsHaveStableCodes() throws Exception {
        patchAi("/routes/parse", "{\"maxOutputTokens\":5}").andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("AI_CONFIG_OUT_OF_BOUNDS")).andExpect(jsonPath("$.min").value(64.0));
        patchAi("/routes/parse", "{\"model\":\"has space\"}").andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("AI_MODEL_INVALID"));
        patchAi("/routes/nope", "{\"model\":\"x1\"}").andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("AI_CONFIG_UNKNOWN_KEY"));
        patchAi("/routes/parse", "{\"provider\":\"mystery\"}").andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("AI_PROVIDER_UNKNOWN"));
        patchAi("/providers/gemini", "{\"baseUrl\":\"http://example.com\"}").andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("AI_URL_INVALID"));
        patchAi("/providers/gemini", "{\"apiKey\":\"" + SECRET + "\"}").andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("AI_CONFIG_UNKNOWN_KEY"));
        assertThat(settings.findAll()).noneMatch(s -> s.getKey().startsWith("ai."));
    }

    @Test
    @WithMockUser(username = ADMIN, authorities = AuthoritiesConstants.ADMIN)
    void aRefusedMultiFieldPatchChangesNothing() throws Exception {
        patchAi("/routes/map", "{\"model\":\"gemini-2.5-flash\",\"maxOutputTokens\":1}").andExpect(status().isBadRequest());
        assertThat(settings.findById("ai.route.map.model")).as("the valid field was rolled back with the invalid one").isEmpty();
        assertThat(history.count()).isZero();
    }

    @Test
    @WithMockUser(username = ADMIN, authorities = AuthoritiesConstants.ADMIN)
    void disablingAProviderInUseIs409UnlessForced() throws Exception {
        patchAi("/providers/gemini", "{\"enabled\":false,\"reason\":\"outage\"}")
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("AI_PROVIDER_IN_USE"))
            .andExpect(jsonPath("$.tasks[?(@=='parse')]").isNotEmpty());
        patchAi("/providers/gemini", "{\"enabled\":false,\"force\":true,\"reason\":\"outage\"}")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.enabled.value").value(false))
            .andExpect(jsonPath("$.enabled.source").value("db"));
        patchAi("/providers/gemini", "{\"enabled\":null}").andExpect(status().isOk()).andExpect(jsonPath("$.enabled.value").value(true));
    }

    @Test
    @WithMockUser(username = ADMIN, authorities = AuthoritiesConstants.ADMIN)
    void theGlobalSwitchOffNeedsAReasonAndTurnsTheRouterOff() throws Exception {
        patchAi("/config/global", "{\"enabled\":false}").andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("AI_CONFIG_REASON_REQUIRED"));
        patchAi("/config/global", "{\"enabled\":false,\"reason\":\"cost spike\"}").andExpect(status().isOk()).andExpect(jsonPath("$.enabled.value").value(false));
        mockMvc.perform(get("/api/admin/ai/config")).andExpect(jsonPath("$.global.enabled.source").value("db"));
        patchAi("/config/global", "{\"enabled\":true}").andExpect(status().isOk());
    }

    @Test
    @WithMockUser(username = ADMIN, authorities = AuthoritiesConstants.ADMIN)
    void pricesAreSetAndResetAndTheListFollows() throws Exception {
        mockMvc
            .perform(
                put("/api/admin/ai/prices/qwen3:8b")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"inputPerMtokMicros\":0,\"cachedPerMtokMicros\":0,\"outputPerMtokMicros\":0}")
            )
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.model").value("qwen3:8b"))
            .andExpect(jsonPath("$.inputPerMtokMicros.source").value("db"))
            .andExpect(jsonPath("$.custom").value(true))
            .andExpect(jsonPath("$.builtin").value(false));
        mockMvc.perform(get("/api/admin/ai/config")).andExpect(jsonPath("$.prices[?(@.model=='qwen3:8b')].custom").value(true));
        mockMvc
            .perform(
                put("/api/admin/ai/prices/qwen3:8b").contentType(MediaType.APPLICATION_JSON).content("{\"inputPerMtokMicros\":0,\"cachedPerMtokMicros\":0}")
            )
            .andExpect(status().isBadRequest());
        mockMvc.perform(delete("/api/admin/ai/prices/qwen3:8b")).andExpect(status().isOk()).andExpect(jsonPath("$.custom").value(false)).andExpect(jsonPath("$.builtin").value(false));
        assertThat(settings.findAll()).noneMatch(s -> s.getKey().startsWith("ai.price."));
    }

    // ---- test connection and calls --------------------------------------------

    @Test
    @WithMockUser(username = ADMIN, authorities = AuthoritiesConstants.ADMIN)
    void aTestIsRealMeteredAuditedAndShowsUpInCallsAndAsTheLastProbe() throws Exception {
        long auditBefore = auditEvents.count();
        mockMvc
            .perform(post("/api/admin/ai/providers/gemini/test").contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.ok").value(true))
            .andExpect(jsonPath("$.model").value("fake-default-001"))
            .andExpect(jsonPath("$.inputTokens").value(9))
            .andExpect(jsonPath("$.outputTokens").value(1))
            .andExpect(jsonPath("$.error").isEmpty());
        assertThat(auditEvents.count()).isEqualTo(auditBefore + 1);
        assertThat(aiCalls.findFirstByTaskAndProviderOrderByIdDesc("probe", "gemini")).isPresent().get().satisfies(c -> {
            assertThat(c.getLogin()).isEqualTo(ADMIN);
            assertThat(c.isSuccess()).isTrue();
            assertThat(c.getLatencyMs()).isNotNull();
        });

        mockMvc
            .perform(get("/api/admin/ai/calls").param("hours", "1").param("task", "probe"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.summary.calls").value(1))
            .andExpect(jsonPath("$.summary.failed").value(0))
            .andExpect(jsonPath("$.rows[0].task").value("probe"))
            .andExpect(jsonPath("$.rows[0].provider").value("gemini"))
            .andExpect(jsonPath("$.rows[0].success").value(true))
            .andExpect(jsonPath("$.rows[0].login").value(ADMIN))
            .andExpect(jsonPath("$.summary.byProvider[0].provider").value("gemini"))
            .andExpect(jsonPath("$.nextBefore").isEmpty());
        mockMvc.perform(get("/api/admin/ai/config")).andExpect(jsonPath("$.providers[0].lastProbe.ok").value(true));
    }

    @Test
    @WithMockUser(username = ADMIN, authorities = AuthoritiesConstants.ADMIN)
    void aFailedTestIsStill200WithAScrubbedErrorAndAFailureRow() throws Exception {
        gemini.failure = new com.dossier.api.service.ai.AiProviderException("rejected key " + SECRET, com.dossier.api.service.ai.AiErrorKind.HTTP_4XX);
        String body = mockMvc
            .perform(post("/api/admin/ai/providers/gemini/test"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.ok").value(false))
            .andExpect(jsonPath("$.error.kind").value("HTTP_4XX"))
            .andReturn()
            .getResponse()
            .getContentAsString();
        assertThat(body).doesNotContain(SECRET).contains("[redacted]");

        mockMvc
            .perform(get("/api/admin/ai/calls").param("failed", "true"))
            .andExpect(jsonPath("$.rows[0].success").value(false))
            .andExpect(jsonPath("$.rows[0].errorKind").value("HTTP_4XX"))
            .andExpect(jsonPath("$.summary.failed").value(1))
            .andExpect(jsonPath("$.summary.failedPct").value(100.0));
    }

    @Test
    @WithMockUser(username = "limit-admin", authorities = AuthoritiesConstants.ADMIN) // its own window: the limiter lives for the whole context
    void theNthPlusOneTestInAnHourIs429() throws Exception {
        settings.save(new AppSetting("ai.admin.test_per_hour", "2", ADMIN, Instant.now()));
        cache.invalidate();
        mockMvc.perform(post("/api/admin/ai/providers/gemini/test")).andExpect(status().isOk());
        mockMvc.perform(post("/api/admin/ai/providers/gemini/test")).andExpect(status().isOk());
        mockMvc
            .perform(post("/api/admin/ai/providers/gemini/test"))
            .andExpect(status().isTooManyRequests())
            .andExpect(jsonPath("$.code").value("AI_TEST_RATE_LIMITED"))
            .andExpect(jsonPath("$.retryAfterSeconds").isNumber());
        assertThat(gemini.calls).hasSize(2);
    }

    @Test
    @WithMockUser(username = ADMIN, authorities = AuthoritiesConstants.ADMIN)
    void testingAProviderWithoutAKeyIs409AndAnUnknownOneIs404() throws Exception {
        when(registry.get("gemini")).thenReturn(new FakeAdapter("gemini") {
            {
                configured = false;
            }
        });
        mockMvc
            .perform(post("/api/admin/ai/providers/gemini/test"))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("AI_PROVIDER_NOT_CONFIGURED"))
            .andExpect(jsonPath("$.keyEnvVar").value("DOSSIER_AI_API_KEY"));
        mockMvc.perform(post("/api/admin/ai/providers/mystery/test")).andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("AI_PROVIDER_UNKNOWN"));
    }

    @Test
    @WithMockUser(username = ADMIN, authorities = AuthoritiesConstants.ADMIN)
    void callsPageWithACursor() throws Exception {
        for (int i = 0; i < 3; i++) mockMvc.perform(post("/api/admin/ai/providers/gemini/test")).andExpect(status().isOk());
        String first = mockMvc
            .perform(get("/api/admin/ai/calls").param("limit", "2"))
            .andExpect(jsonPath("$.rows.length()").value(2))
            .andExpect(jsonPath("$.nextBefore").isNumber())
            .andReturn()
            .getResponse()
            .getContentAsString();
        long cursor = new com.fasterxml.jackson.databind.ObjectMapper().readTree(first).path("nextBefore").asLong();
        mockMvc
            .perform(get("/api/admin/ai/calls").param("limit", "2").param("before", String.valueOf(cursor)))
            .andExpect(jsonPath("$.rows.length()").value(1))
            .andExpect(jsonPath("$.nextBefore").isEmpty());
        mockMvc.perform(get("/api/admin/ai/calls").param("task", "nonsense")).andExpect(status().isBadRequest());
    }
}
