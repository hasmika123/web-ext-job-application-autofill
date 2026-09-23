package com.dossier.api.web.rest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.ProSubscriptions;
import com.dossier.api.domain.AiCall;
import com.dossier.api.domain.AiQuotaOverride;
import com.dossier.api.repository.AiAnswerRepository;
import com.dossier.api.repository.AiCallRepository;
import com.dossier.api.repository.AiQuotaOverrideRepository;
import com.dossier.api.repository.AiUsageRepository;
import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.service.ai.AiProvider;
import com.dossier.api.service.ai.AiResult;
import com.dossier.api.service.ai.AiTask;
import java.util.List;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;
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

/**
 * Integration test for {@link AiResource} — that the endpoint is wired, auth-gated, and that the
 * Pro gate (Phase 12.4) surfaces as a 402 the clients can branch on.
 *
 * <p>The AI feature is turned ON here with a stubbed provider, because the interesting branches
 * only exist when there is something to gate. The quota/consent/cache branches stay unit-tested
 * in {@code AiDraftServiceTest}; what is worth an integration test is the HTTP shape of the
 * refusal and the fact that resume parsing did <b>not</b> get gated along with everything else.
 *
 * <p>Two testing-only concessions, both forced by the same thing: a successful draft caches its
 * answer in a {@code REQUIRES_NEW} transaction, which needs a <b>second</b> connection while the
 * request's own transaction holds the first. The shared test config pins Hikari to one connection,
 * so this context asks for a few and the tests are not {@code @Transactional}; either alone would
 * hang instead of failing. Production pools are far larger, so this is a test-harness limit, not a
 * property of the code. Nothing rolls back, so state is swept around each test.
 */
@IntegrationTest
@AutoConfigureMockMvc
@TestPropertySource(properties = { "dossier.ai.enabled=true", "spring.datasource.hikari.maximum-pool-size=4" })
class AiResourceIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper om;

    @Autowired
    private SubscriptionRepository subscriptionRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private AiQuotaOverrideRepository quotaOverrideRepository;

    @Autowired
    private AiAnswerRepository aiAnswerRepository;

    @Autowired
    private AiUsageRepository aiUsageRepository;

    @Autowired
    private AiCallRepository aiCallRepository;

    /** Stubbed: these tests are about our gating, not about anyone's model. */
    @MockitoBean
    private AiProvider aiProvider;

    @BeforeEach
    void stubProvider() {
        reset();
        when(aiProvider.isConfigured()).thenReturn(true);
        // 120 input + 30 output tokens on Flash-Lite ($0.10 / $0.40 per M) = 12 + 12 = 24 micro-dollars.
        when(aiProvider.generate(any(), anyString(), anyString())).thenReturn(new AiResult("A grounded answer.", "gemini-2.5-flash-lite", 120, 0, 30));
    }

    @AfterEach
    void cleanUp() {
        reset();
    }

    /** Nothing here rolls back, so anything a draft wrote has to be swept up explicitly. */
    private void reset() {
        aiAnswerRepository.deleteAll();
        aiUsageRepository.deleteAll();
        aiCallRepository.deleteAll();
        quotaOverrideRepository.deleteAll();
        subscriptionRepository.deleteAll();
    }

    private String draftBody() throws Exception {
        return om.writeValueAsString(Map.of("question", "Why do you want this role?", "context", "Backend engineer.", "consent", true));
    }

    private String bodyFor(String question, String task) throws Exception {
        return om.writeValueAsString(Map.of("question", question, "context", "", "consent", true, "task", task));
    }

    @Test
    void draftRequiresAuthentication() throws Exception {
        String body = om.writeValueAsString(Map.of("question", "Why?", "consent", true));
        mockMvc
            .perform(post("/api/ai/draft").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isUnauthorized());
    }

    @Test
    @WithMockUser(username = "user")
    void freeUserGetsPaymentRequired() throws Exception {
        mockMvc
            .perform(post("/api/ai/draft").contentType(MediaType.APPLICATION_JSON).content(draftBody()))
            .andExpect(status().isPaymentRequired())
            .andExpect(jsonPath("$.code").value("PRO_REQUIRED"))
            // `detail` is what the extension shows; `title` is overwritten with the reason phrase.
            .andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString("Pro")));
    }

    @Test
    @WithMockUser(username = "user")
    void proUserDrafts() throws Exception {
        ProSubscriptions.makePro(subscriptionRepository, userRepository, "user");
        mockMvc
            .perform(post("/api/ai/draft").contentType(MediaType.APPLICATION_JSON).content(draftBody()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.answer").value("A grounded answer."));
    }

    /** A hand-granted admin quota outranks the plan gate (a locked decision). */
    @Test
    @WithMockUser(username = "user")
    void freeUserWithAnAdminOverrideDrafts() throws Exception {
        AiQuotaOverride override = new AiQuotaOverride();
        override.setLogin("user");
        override.setMonthlyQuota(5);
        quotaOverrideRepository.save(override);

        mockMvc
            .perform(post("/api/ai/draft").contentType(MediaType.APPLICATION_JSON).content(draftBody()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.quota").value(5));
    }

    /**
     * Resume parsing is the one free server-AI exception: it is how a profile builds itself, so
     * gating it would defeat the whole "don't make people fill forms" premise. A Free user who
     * can't draft must still be able to parse.
     */
    @Test
    @WithMockUser(username = "user")
    void parseResumeIsNotGated() throws Exception {
        when(aiProvider.parseResume(anyString(), any(), any())).thenReturn(new AiResult("{}", "gemini-2.5-flash-lite", 2000, 0, 500));
        String body = om.writeValueAsString(Map.of("text", "Jane Doe, backend engineer, 6 years Java.", "consent", true));
        mockMvc
            .perform(post("/api/ai/parse-resume").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").doesNotExist())
            .andExpect(jsonPath("$.quota").value(50)); // Free: the free quota
    }

    // ---- 13.1a: cost tracking --------------------------------------------------------------

    /** Every successful call lands in the ledger as its kind, with the tokens and what they cost. */
    @Test
    @WithMockUser(username = "user")
    void aCallIsRecordedAtWhatItCost() throws Exception {
        ProSubscriptions.makePro(subscriptionRepository, userRepository, "user");
        mockMvc.perform(post("/api/ai/draft").contentType(MediaType.APPLICATION_JSON).content(draftBody())).andExpect(status().isOk());

        List<AiCall> calls = aiCallRepository.findByLoginOrderByCreatedAtDesc("user");
        assertThat(calls).hasSize(1);
        AiCall c = calls.get(0);
        assertThat(c.getTask()).isEqualTo("draft");
        assertThat(c.getModel()).isEqualTo("gemini-2.5-flash-lite");
        assertThat(c.getInputTokens()).isEqualTo(120);
        assertThat(c.getOutputTokens()).isEqualTo(30);
        assertThat(c.getCostMicros()).isEqualTo(24);
    }

    /** The request's task reaches the provider and the ledger; an unknown one is a draft. */
    @Test
    @WithMockUser(username = "user")
    void theTaskIsHonoured() throws Exception {
        ProSubscriptions.makePro(subscriptionRepository, userRepository, "user");
        mockMvc.perform(post("/api/ai/draft").contentType(MediaType.APPLICATION_JSON).content(bodyFor("Map: 1. First name", "map"))).andExpect(status().isOk());
        mockMvc.perform(post("/api/ai/draft").contentType(MediaType.APPLICATION_JSON).content(bodyFor("Anything", "bogus"))).andExpect(status().isOk());

        verify(aiProvider).generate(eq(AiTask.MAP), eq("Map: 1. First name"), anyString());
        verify(aiProvider).generate(eq(AiTask.DRAFT), eq("Anything"), anyString());
        assertThat(aiCallRepository.findByLoginOrderByCreatedAtDesc("user")).extracting(AiCall::getTask).containsExactlyInAnyOrder("map", "draft");
    }

    /** The month's count is kept in the database: the first call creates it, the next adds to it. */
    @Test
    @WithMockUser(username = "user")
    void theMonthlyCountAccumulates() throws Exception {
        ProSubscriptions.makePro(subscriptionRepository, userRepository, "user");
        mockMvc.perform(post("/api/ai/draft").contentType(MediaType.APPLICATION_JSON).content(bodyFor("First question?", "draft"))).andExpect(jsonPath("$.used").value(1));
        mockMvc.perform(post("/api/ai/draft").contentType(MediaType.APPLICATION_JSON).content(bodyFor("Second question?", "draft"))).andExpect(jsonPath("$.used").value(2));
    }

    /** The bug 13.1a fixes: parsing used the Free quota for everyone, Pro included. */
    @Test
    @WithMockUser(username = "user")
    void aProUserParsesOnTheProQuota() throws Exception {
        ProSubscriptions.makePro(subscriptionRepository, userRepository, "user");
        when(aiProvider.parseResume(anyString(), any(), any())).thenReturn(new AiResult("{}", "gemini-2.5-flash-lite", 2000, 0, 500));
        String body = om.writeValueAsString(Map.of("text", "Jane Doe, backend engineer, 6 years Java.", "consent", true));
        mockMvc
            .perform(post("/api/ai/parse-resume").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.quota").value(2000));
        assertThat(aiCallRepository.findByLoginOrderByCreatedAtDesc("user")).extracting(AiCall::getTask).containsExactly("parse");
    }
}
