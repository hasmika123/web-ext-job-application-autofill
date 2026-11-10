package com.dossier.api.web.rest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.ProSubscriptions;
import com.dossier.api.domain.AiCall;
import com.dossier.api.repository.AiCallRepository;
import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ai.AiKeyScrubber;
import com.dossier.api.service.ai.AiProviderRegistry;
import com.dossier.api.service.ai.FakeAdapter;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.transaction.annotation.Transactional;

/**
 * The proof of the admin AI page (I1.14, AI-ADMIN-CONFIG-DESIGN 7.3): an admin changes a route's model through
 * {@code PATCH /api/admin/ai/routes/{task}}, and the VERY NEXT user call - no restart, no cache wait - runs on that
 * model, and the {@code ai_call} ledger row says so. Reset the route and the call after that is back on the env model.
 * Covered for the free exception ({@code parse}, a Free user) and for a Pro task ({@code rewrite}, a Pro user).
 *
 * <p>The provider is a {@link FakeAdapter} behind a mocked {@link AiProviderRegistry}, so the model the adapter was
 * asked for is observed directly rather than inferred.
 */
@IntegrationTest
@AutoConfigureMockMvc
@TestPropertySource(properties = { "dossier.ai.enabled=true", "spring.datasource.hikari.maximum-pool-size=4" })
@Transactional
class AiRouteSwitchIT {

    private static final String ENV_MODEL = "gemini-2.5-flash-lite";
    private static final String ALT_MODEL = "gemini-2.5-flash";

    private static final String DOC_BODY =
        """
        {"schema":2,"meta":{"title":"Backend v3"},
         "basics":{"name":"Ada Lovelace","headline":"Backend engineer","email":"ada@example.com","phone":"555 0100"},
         "sections":[
          {"id":"s_exper001","kind":"EXPERIENCE","items":[{"id":"i_exp00001","title":"Engineer","org":"Globex","start":"2020-03","end":"2024-05","bullets":[
            {"id":"b_bullet01","text":"Built event pipelines handling 1,200 requests per second"},
            {"id":"b_bullet02","text":"Led a team of 4 engineers"}]}]}
         ]}
        """;

    private static final String GOOD_REWRITE =
        "{\"changes\":[{\"ref\":\"b_bullet01\",\"alternatives\":[\"Engineered event pipelines serving 1200 requests per second\"],\"reason\":\"Stronger verb\"}]}";

    private static final RequestPostProcessor ADMIN = user("route-admin").authorities(new SimpleGrantedAuthority(AuthoritiesConstants.ADMIN));
    private static final RequestPostProcessor USER = user("user").authorities(new SimpleGrantedAuthority(AuthoritiesConstants.USER));

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper om;

    @Autowired
    private AiCallRepository aiCalls;

    @Autowired
    private SubscriptionRepository subscriptions;

    @Autowired
    private UserRepository users;

    @Autowired
    private ResumeBuilderSettings settingsCache;

    @MockitoBean
    private AiProviderRegistry registry;

    private FakeAdapter gemini;

    @BeforeEach
    void wireRegistry() {
        gemini = new FakeAdapter("gemini");
        gemini.defaultModel = ENV_MODEL;
        when(registry.ids()).thenReturn(Set.of("gemini"));
        when(registry.has("gemini")).thenReturn(true);
        when(registry.get("gemini")).thenReturn(gemini);
        when(registry.keyPresent("gemini")).thenReturn(true);
        when(registry.keyRequired("gemini")).thenReturn(true);
        when(registry.keyEnvVar("gemini")).thenReturn("DOSSIER_AI_API_KEY");
        when(registry.label("gemini")).thenReturn("Google Gemini");
        when(registry.kind("gemini")).thenReturn("cloud");
        when(registry.capabilities("gemini")).thenReturn(List.of("STRUCTURED_OUTPUT", "FILES"));
        when(registry.scrubber()).thenReturn(AiKeyScrubber.shapesOnly());
        settingsCache.invalidate();
    }

    @AfterEach
    void dropSettingsCache() {
        settingsCache.invalidate(); // the test transaction rolls the rows back; the 60 s snapshot must not outlive them
    }

    // ---- helpers ------------------------------------------------------------

    private ResultActions adminPatch(String path, String json) throws Exception {
        return mockMvc.perform(patch("/api/admin/ai" + path).with(ADMIN).contentType(MediaType.APPLICATION_JSON).content(json));
    }

    private ResultActions parseAsUser(String text) throws Exception {
        return mockMvc.perform(
            post("/api/ai/parse-resume").with(USER).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsString(Map.of("text", text, "consent", true)))
        );
    }

    private AiCall newestLedgerRow(String task) {
        return aiCalls.findFirstByLoginAndTaskOrderByIdDesc("user", task).orElseThrow();
    }

    private String lastModelAsked() {
        return gemini.calls.get(gemini.calls.size() - 1).model();
    }

    private void assertLedgerOk(AiCall row, String expectedModelPrefix) {
        assertThat(row.getModel()).isEqualTo(expectedModelPrefix + "-001"); // FakeAdapter reports "<asked>-001", like a real served id
        assertThat(row.getProvider()).isEqualTo("gemini");
        assertThat(row.isSuccess()).isTrue();
        assertThat(row.getLatencyMs()).isNotNull().isGreaterThanOrEqualTo(0);
    }

    // ---- parse: the free exception ---------------------------------------------

    @Test
    void anAdminChangeToTheParseModelIsUsedByTheNextParseAndLedgered() throws Exception {
        parseAsUser("Ada Lovelace, backend engineer at Globex.").andExpect(status().isOk()).andExpect(jsonPath("$.parsed").exists());
        assertThat(lastModelAsked()).isEqualTo(ENV_MODEL);
        assertLedgerOk(newestLedgerRow("parse"), ENV_MODEL);

        adminPatch("/routes/parse", "{\"model\":\"" + ALT_MODEL + "\"}").andExpect(status().isOk()).andExpect(jsonPath("$.model.source").value("db"));

        parseAsUser("Ada Lovelace, backend engineer at Globex, second upload.").andExpect(status().isOk());
        assertThat(lastModelAsked()).as("the very next call").isEqualTo(ALT_MODEL);
        assertLedgerOk(newestLedgerRow("parse"), ALT_MODEL);

        adminPatch("/routes/parse", "{\"model\":null}").andExpect(status().isOk()).andExpect(jsonPath("$.model.source").value("env"));

        parseAsUser("Ada Lovelace, backend engineer at Globex, third upload.").andExpect(status().isOk());
        assertThat(lastModelAsked()).as("back on the env model").isEqualTo(ENV_MODEL);
        assertLedgerOk(newestLedgerRow("parse"), ENV_MODEL);
    }

    @Test
    void aNeverCollectedValueInAResumeNeverReachesTheProvider() throws Exception {
        parseAsUser("Ada Lovelace\nSSN: 123-45-6789\nBackend engineer at Globex").andExpect(status().isOk());
        assertThat(gemini.prompts).hasSize(1);
        assertThat(gemini.prompts.get(0)).doesNotContain("123-45-6789").contains("[removed]").contains("Backend engineer");
    }

    // ---- rewrite: a Pro task ---------------------------------------------------

    @Test
    void anAdminChangeToTheRewriteModelIsUsedByTheNextRewriteAndLedgered() throws Exception {
        ProSubscriptions.makePro(subscriptions, users, "user");
        gemini.text = GOOD_REWRITE;
        long resumeId = om
            .readTree(mockMvc.perform(post("/api/profile/resumes/built").with(USER).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString())
            .at("/resume/id")
            .asLong();
        mockMvc
            .perform(put("/api/profile/resumes/" + resumeId + "/doc").with(USER).header(HttpHeaders.IF_MATCH, "\"1\"").contentType(MediaType.APPLICATION_JSON).content("{\"doc\":" + DOC_BODY + "}"))
            .andExpect(status().isOk());

        // a different mode each time: the same request would be answered from the stored proposal, which costs nothing and calls nothing
        rewrite(resumeId, "stronger");
        assertThat(lastModelAsked()).isEqualTo(ENV_MODEL);
        assertLedgerOk(newestLedgerRow("rewrite"), ENV_MODEL);

        adminPatch("/routes/rewrite", "{\"model\":\"" + ALT_MODEL + "\"}").andExpect(status().isOk()).andExpect(jsonPath("$.model.source").value("db"));
        rewrite(resumeId, "plain");
        assertThat(lastModelAsked()).as("the very next rewrite").isEqualTo(ALT_MODEL);
        assertLedgerOk(newestLedgerRow("rewrite"), ALT_MODEL);

        adminPatch("/routes/rewrite", "{\"model\":null}").andExpect(status().isOk()).andExpect(jsonPath("$.model.source").value("env"));
        rewrite(resumeId, "formal");
        assertThat(lastModelAsked()).as("back on the env model").isEqualTo(ENV_MODEL);
        assertLedgerOk(newestLedgerRow("rewrite"), ENV_MODEL);
    }

    private JsonNode rewrite(long resumeId, String mode) throws Exception {
        String body = om.writeValueAsString(Map.of("refs", List.of("b_bullet01"), "mode", mode, "consent", true));
        return om.readTree(
            mockMvc
                .perform(post("/api/profile/resumes/" + resumeId + "/ai/rewrite").with(USER).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ok"))
                .andReturn()
                .getResponse()
                .getContentAsString()
        );
    }

    // ---- the draft path --------------------------------------------------------

    @Test
    void aNeverCollectedValueInADraftNeverReachesTheProvider() throws Exception {
        ProSubscriptions.makePro(subscriptions, users, "user");
        gemini.text = "A grounded answer.";
        String body = om.writeValueAsString(Map.of("question", "Why us? My SSN is 123-45-6789.", "context", "Backend engineer. Passport number: X1234567", "consent", true));
        mockMvc.perform(post("/api/ai/draft").with(USER).contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isOk()).andExpect(jsonPath("$.answer").value("A grounded answer."));
        assertThat(gemini.prompts).hasSize(1);
        assertThat(gemini.prompts.get(0)).doesNotContain("123-45-6789").doesNotContain("X1234567").contains("Why us?");
    }
}
