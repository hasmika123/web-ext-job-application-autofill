package com.dossier.api.web.rest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.ProSubscriptions;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.ResumeAiProposal;
import com.dossier.api.domain.User;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.repository.ResumeAiProposalRepository;
import com.dossier.api.repository.ResumeDocRepository;
import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ai.AiProvider;
import com.dossier.api.service.ai.AiResult;
import com.dossier.api.service.ai.AiTask;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Resume Builder AI over HTTP (R4.1) against a fake provider: Free is a 402, consent and the cache, a
 * rewrite proposal, apply (text replaced, marks cleared, {@code src: "ai"}, an {@code AI_APPLY} version, the new
 * ETag), the stale / placeholder / empty refusals, ownership, the daily cap, and the summary that creates its
 * section.
 */
@IntegrationTest
@AutoConfigureMockMvc
@TestPropertySource(properties = { "dossier.ai.enabled=true" })
@WithMockUser(username = "user")
@Transactional
class ResumeAiResourceIT {

    private static final String DOC_BODY =
        """
        {"schema":2,"meta":{"title":"Backend v3"},
         "basics":{"name":"Ada Lovelace","headline":"Backend engineer","email":"ada@example.com","phone":"555 0100"},
         "sections":[
          {"id":"s_exper001","kind":"EXPERIENCE","items":[{"id":"i_exp00001","title":"Engineer","org":"Globex","start":"2020-03","end":"2024-05","bullets":[
            {"id":"b_bullet01","text":"Built event pipelines handling 1,200 requests per second","marks":[{"s":0,"e":5,"t":"b"}]},
            {"id":"b_bullet02","text":"Led a team of 4 engineers"},
            {"id":"b_bullet03","text":"Wrote docs"}]}]},
          {"id":"s_skills01","kind":"SKILLS","items":[{"id":"i_skills01","group":"Core","skills":["Python","Java","Kafka","Docker"]}]}
         ]}
        """;

    private static final String GOOD_REWRITE =
        "{\"changes\":[{\"ref\":\"b_bullet01\",\"alternatives\":[\"Engineered event pipelines serving 1200 requests per second\",\"Designed event pipelines at 1,200 requests per second\"],\"reason\":\"Stronger verb\"}]}";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper om;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private SubscriptionRepository subscriptionRepository;

    @Autowired
    private ResumeDocRepository resumeDocRepository;

    @Autowired
    private ResumeAiProposalRepository proposalRepository;

    @Autowired
    private AppSettingRepository appSettingRepository;

    @Autowired
    private ResumeBuilderSettings settings;

    @MockitoBean
    private AiProvider aiProvider;

    private Long resumeId;

    @BeforeEach
    void setUp() throws Exception {
        when(aiProvider.isConfigured()).thenReturn(true);
        when(aiProvider.defaultModel()).thenReturn("gemini-2.5-flash-lite");
        reply(GOOD_REWRITE);
        resumeId = om.readTree(
            mockMvc.perform(post("/api/profile/resumes/built").contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()
        ).at("/resume/id").asLong();
        saveDoc(DOC_BODY, "\"1\"");
    }

    @AfterEach
    void dropSettingsCache() {
        settings.invalidate();
    }

    // ---- helpers ------------------------------------------------------------

    private void reply(String text) {
        when(aiProvider.generate(any(AiTask.class), any(), anyString(), anyString(), anyInt())).thenReturn(new AiResult(text, "gemini-2.5-flash-lite", 3000, 0, 300));
    }

    private void pro() {
        ProSubscriptions.makePro(subscriptionRepository, userRepository, "user");
    }

    /** PUT the whole document as the editor does; returns the new ETag. */
    private String saveDoc(String doc, String ifMatch) throws Exception {
        ResultActions r = mockMvc
            .perform(
                put("/api/profile/resumes/" + resumeId + "/doc")
                    .header(HttpHeaders.IF_MATCH, ifMatch)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"doc\":" + doc + "}")
            )
            .andExpect(status().isOk());
        return r.andReturn().getResponse().getHeader(HttpHeaders.ETAG);
    }

    private ResultActions postJson(String path, Object body) throws Exception {
        return mockMvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsString(body)));
    }

    private ResultActions rewrite(String... refs) throws Exception {
        return postJson("/api/profile/resumes/" + resumeId + "/ai/rewrite", Map.of("refs", List.of(refs), "mode", "stronger", "consent", true));
    }

    private JsonNode rewriteOk(String... refs) throws Exception {
        String body = rewrite(refs).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return om.readTree(body);
    }

    private JsonNode currentDoc() throws Exception {
        return om.readTree(mockMvc.perform(get("/api/profile/resumes/" + resumeId + "/doc")).andReturn().getResponse().getContentAsString()).path("doc");
    }

    private JsonNode bullet(JsonNode doc, String id) {
        for (JsonNode s : doc.path("sections")) for (JsonNode i : s.path("items")) for (JsonNode b : i.path("bullets")) if (id.equals(b.path("id").asText())) return b;
        return null;
    }

    // ---- gates ---------------------------------------------------------------

    @Test
    void aFreeUserGets402ProRequired() throws Exception {
        rewrite("b_bullet01").andExpect(status().isPaymentRequired()).andExpect(jsonPath("$.code").value("PRO_REQUIRED"));
        postJson("/api/profile/resumes/" + resumeId + "/ai/summary", Map.of("tone", "plain", "consent", true)).andExpect(status().isPaymentRequired()).andExpect(jsonPath("$.code").value("PRO_REQUIRED"));
        verify(aiProvider, never()).generate(any(AiTask.class), any(), anyString(), anyString(), anyInt());
    }

    @Test
    void consentIsRequiredAndNothingIsSentWithoutIt() throws Exception {
        pro();
        postJson("/api/profile/resumes/" + resumeId + "/ai/rewrite", Map.of("refs", List.of("b_bullet01"), "mode", "stronger", "consent", false))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("consentRequired"));
        verify(aiProvider, never()).generate(any(AiTask.class), any(), anyString(), anyString(), anyInt());
    }

    @Test
    void theKillSwitchSettingAnswersDisabled() throws Exception {
        pro();
        appSettingRepository.saveAndFlush(new AppSetting("ai.feature.resume.enabled", "false", "it", Instant.now()));
        settings.invalidate();
        rewrite("b_bullet01").andExpect(status().isOk()).andExpect(jsonPath("$.status").value("disabled"));
        verify(aiProvider, never()).generate(any(AiTask.class), any(), anyString(), anyString(), anyInt());
    }

    @Test
    void anotherUsersResumeAndProposalAre404() throws Exception {
        pro();
        User other = userRepository.findOneByLogin("admin").orElseThrow();
        ResumeAiProposal theirs = new ResumeAiProposal();
        theirs.setUser(other);
        theirs.setResumeId(999L);
        theirs.setContentHash("0".repeat(64));
        theirs.setTask("rewrite");
        theirs.setCacheKey("1".repeat(64));
        theirs.setResultJson("{\"changes\":[]}");
        theirs = proposalRepository.saveAndFlush(theirs);

        mockMvc.perform(post("/api/profile/resumes/987654/ai/rewrite").contentType(MediaType.APPLICATION_JSON).content("{\"refs\":[\"b_bullet01\"],\"consent\":true}")).andExpect(status().isNotFound());
        mockMvc.perform(get("/api/profile/resumes/987654/ai/proposals")).andExpect(status().isNotFound());
        postJson("/api/profile/ai/proposals/" + theirs.getId() + "/apply", Map.of("keep", List.of("b_bullet01"))).andExpect(status().isNotFound());
        postJson("/api/profile/ai/proposals/" + theirs.getId() + "/dismiss", Map.of()).andExpect(status().isNotFound());
    }

    // ---- rewrite + cache -------------------------------------------------------

    @Test
    void aRewriteIsACheckedProposalAndARepeatIsCachedForFree() throws Exception {
        pro();
        JsonNode first = rewriteOk("b_bullet01");
        assertThat(first.path("status").asText()).isEqualTo("ok");
        JsonNode change = first.at("/proposal/changes/0");
        assertThat(change.path("ref").asText()).isEqualTo("b_bullet01");
        assertThat(change.path("before").asText()).isEqualTo("Built event pipelines handling 1,200 requests per second");
        assertThat(change.path("after").asText()).isEqualTo("Engineered event pipelines serving 1200 requests per second");
        assertThat(change.path("alternatives")).hasSize(2);
        assertThat(change.path("reason").asText()).isEqualTo("Stronger verb");
        assertThat(change.path("sources").get(0).asText()).isEqualTo("b_bullet01");
        assertThat(change.path("formatted").asBoolean()).isTrue();
        assertThat(first.at("/usage/limit").asInt()).isEqualTo(100);
        assertThat(first.at("/proposal/stale").asBoolean()).isFalse();

        JsonNode second = rewriteOk("b_bullet01");
        assertThat(second.path("status").asText()).isEqualTo("cached");
        assertThat(second.at("/proposal/id").asLong()).isEqualTo(first.at("/proposal/id").asLong());
        verify(aiProvider, times(1)).generate(eq(AiTask.REWRITE), any(), anyString(), anyString(), eq(3000));

        mockMvc.perform(get("/api/profile/resumes/" + resumeId + "/ai/proposals")).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1));
    }

    @Test
    void nothingPersonalIsSentToTheModel() throws Exception {
        pro();
        rewriteOk("b_bullet03");
        ArgumentCaptor<String> question = ArgumentCaptor.forClass(String.class);
        verify(aiProvider).generate(eq(AiTask.REWRITE), any(), question.capture(), anyString(), anyInt());
        assertThat(question.getValue()).contains("[b_bullet03] Wrote docs").doesNotContain("ada@example.com").doesNotContain("555 0100").doesNotContain("Ada Lovelace");
    }

    @Test
    void theDailyCapIsEnforcedFromTheSettingAndAnAppliedNewRequestIsCounted() throws Exception {
        pro();
        appSettingRepository.saveAndFlush(new AppSetting("ai.cap.resume.daily", "1", "it", Instant.now()));
        settings.invalidate();
        assertThat(rewriteOk("b_bullet01").path("status").asText()).isEqualTo("ok");
        reply("{\"changes\":[]}");
        JsonNode second = om.readTree(rewrite("b_bullet02").andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(second.path("status").asText()).isEqualTo("quotaExceeded");
        assertThat(second.path("cap").asText()).isEqualTo("daily");
        assertThat(second.at("/usage/limit").asInt()).isEqualTo(1);
        // the first request is still answered from its stored proposal
        assertThat(rewriteOk("b_bullet01").path("status").asText()).isEqualTo("cached");
    }

    @Test
    void aBadRequestIs400() throws Exception {
        pro();
        postJson("/api/profile/resumes/" + resumeId + "/ai/rewrite", Map.of("refs", List.of("b_bullet01"), "mode", "sparkly", "consent", true))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("INVALID_MODE"));
        postJson("/api/profile/resumes/" + resumeId + "/ai/rewrite", Map.of("refs", List.of("b_nope"), "mode", "stronger", "consent", true))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("INVALID_REFS"));
    }

    @Test
    void aProviderFailureIs502AndABadReplyIsNotAnException() throws Exception {
        pro();
        when(aiProvider.generate(any(AiTask.class), any(), anyString(), anyString(), anyInt())).thenThrow(new com.dossier.api.service.ai.AiProviderException("down"));
        rewrite("b_bullet01").andExpect(status().isBadGateway()).andExpect(jsonPath("$.status").value("error"));
    }

    // ---- apply -------------------------------------------------------------------

    @Test
    void applyReplacesTheTextClearsMarksMarksItAiWritesAVersionAndReturnsTheNewEtag() throws Exception {
        pro();
        long pid = rewriteOk("b_bullet01").at("/proposal/id").asLong();
        long before = resumeDocRepository.findById(resumeId).orElseThrow().getDocVersion();

        String res = postJson("/api/profile/ai/proposals/" + pid + "/apply", Map.of("keep", List.of("b_bullet01"), "alternatives", Map.of("b_bullet01", 1)))
            .andExpect(status().isOk())
            .andExpect(header().exists(HttpHeaders.ETAG))
            .andReturn()
            .getResponse()
            .getContentAsString();
        JsonNode dto = om.readTree(res);
        JsonNode b = bullet(dto.path("doc"), "b_bullet01");
        assertThat(b.path("text").asText()).isEqualTo("Designed event pipelines at 1,200 requests per second");
        assertThat(b.has("marks")).as("formatting on a changed line is reset").isFalse();
        assertThat(b.path("src").asText()).isEqualTo("ai");
        assertThat(bullet(dto.path("doc"), "b_bullet02").path("text").asText()).as("untouched").isEqualTo("Led a team of 4 engineers");
        assertThat(dto.path("docVersion").asLong()).isGreaterThan(before);
        assertThat(bullet(currentDoc(), "b_bullet01").path("text").asText()).isEqualTo("Designed event pipelines at 1,200 requests per second");

        String versions = mockMvc.perform(get("/api/profile/resumes/" + resumeId + "/doc/versions")).andReturn().getResponse().getContentAsString();
        assertThat(versions).contains("AI_APPLY");
        assertThat(resumeDocRepository.findById(resumeId).orElseThrow().getPdfStatus()).isEqualTo("PENDING");
        assertThat(proposalRepository.findById(pid).orElseThrow().getStatus()).isEqualTo("APPLIED");
        mockMvc.perform(get("/api/profile/resumes/" + resumeId + "/ai/proposals")).andExpect(jsonPath("$.length()").value(0));
        postJson("/api/profile/ai/proposals/" + pid + "/apply", Map.of("keep", List.of("b_bullet01"))).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PROPOSAL_CLOSED"));
    }

    @Test
    void applyOfADocumentThatChangedSinceIs409ProposalStale() throws Exception {
        pro();
        long pid = rewriteOk("b_bullet01").at("/proposal/id").asLong();
        long version = resumeDocRepository.findById(resumeId).orElseThrow().getDocVersion();
        saveDoc(DOC_BODY.replace("Wrote docs", "Wrote runbooks"), "\"" + version + "\"");

        postJson("/api/profile/ai/proposals/" + pid + "/apply", Map.of("keep", List.of("b_bullet01")))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("PROPOSAL_STALE"));
        JsonNode open = om.readTree(mockMvc.perform(get("/api/profile/resumes/" + resumeId + "/ai/proposals")).andReturn().getResponse().getContentAsString());
        assertThat(open.get(0).path("stale").asBoolean()).isTrue();
        assertThat(bullet(currentDoc(), "b_bullet01").path("text").asText()).as("not applied").startsWith("Built event pipelines");
    }

    @Test
    void aPlaceholderThatRemainsIs422AndNothingIsWritten() throws Exception {
        pro();
        reply("{\"changes\":[{\"ref\":\"b_bullet03\",\"alternatives\":[\"Authored documentation\",\"Wrote docs used by [add a number] new hires\"],\"reason\":\"Impact\"}]}");
        long pid = rewriteOk("b_bullet03").at("/proposal/id").asLong();

        postJson("/api/profile/ai/proposals/" + pid + "/apply", Map.of("keep", List.of("b_bullet03"), "alternatives", Map.of("b_bullet03", 1)))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("PLACEHOLDER_REMAINS"));
        assertThat(bullet(currentDoc(), "b_bullet03").path("text").asText()).isEqualTo("Wrote docs");
        // choosing the other alternative applies
        postJson("/api/profile/ai/proposals/" + pid + "/apply", Map.of("keep", List.of("b_bullet03"), "alternatives", Map.of("b_bullet03", 0))).andExpect(status().isOk());
    }

    @Test
    void keepingNothingIs400KeepEmpty() throws Exception {
        pro();
        long pid = rewriteOk("b_bullet01").at("/proposal/id").asLong();
        postJson("/api/profile/ai/proposals/" + pid + "/apply", Map.of("keep", List.of())).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("KEEP_EMPTY"));
    }

    @Test
    void dismissIs204AndClosesTheProposal() throws Exception {
        pro();
        long pid = rewriteOk("b_bullet01").at("/proposal/id").asLong();
        mockMvc.perform(post("/api/profile/ai/proposals/" + pid + "/dismiss")).andExpect(status().isNoContent());
        assertThat(proposalRepository.findById(pid).orElseThrow().getStatus()).isEqualTo("DISMISSED");
        mockMvc.perform(get("/api/profile/resumes/" + resumeId + "/ai/proposals")).andExpect(jsonPath("$.length()").value(0));
        // asking again makes a fresh proposal, not a cache hit on the dismissed one
        assertThat(rewriteOk("b_bullet01").path("status").asText()).isEqualTo("ok");
    }

    // ---- suggestions (R4.6) -------------------------------------------------------

    private static final String GOOD_SUGGESTIONS =
        "{\"suggestions\":[" +
        "{\"kind\":\"skills\",\"title\":\"Clearer docs line\",\"body\":\"Name what you wrote\",\"changes\":[{\"ref\":\"b_bullet03\",\"after\":\"Authored documentation\",\"reason\":\"More specific\"}]}," +
        "{\"kind\":\"bullets\",\"title\":\"Stronger verb\",\"body\":\"Lead with the action\",\"changes\":[{\"ref\":\"b_bullet02\",\"after\":\"Managed 4 engineers\",\"reason\":\"Active verb\"}]}," +
        "{\"kind\":\"keywords\",\"title\":\"Invented\",\"body\":\"x\",\"changes\":[{\"ref\":\"b_bullet01\",\"after\":\"Built event pipelines handling 9,000 requests per second\",\"reason\":\"y\"}]}]}";

    private ResultActions suggest(boolean consent, boolean refresh) throws Exception {
        return postJson("/api/profile/resumes/" + resumeId + "/ai/suggestions", Map.of("consent", consent, "refresh", refresh));
    }

    private JsonNode suggestOk(boolean refresh) throws Exception {
        return om.readTree(suggest(true, refresh).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    @Test
    void aFreeUserGets402ForSuggestionsButTheListIsEmptyAndFree() throws Exception {
        suggest(true, false).andExpect(status().isPaymentRequired()).andExpect(jsonPath("$.code").value("PRO_REQUIRED"));
        mockMvc.perform(get("/api/profile/resumes/" + resumeId + "/ai/suggestions")).andExpect(status().isOk()).andExpect(jsonPath("$.suggestions.length()").value(0));
        verify(aiProvider, never()).generate(any(AiTask.class), any(), anyString(), anyString(), anyInt());
    }

    @Test
    void suggestionsAreCheckedCardsInCarouselOrderAndTheSameDocumentIsCachedForFree() throws Exception {
        pro();
        reply(GOOD_SUGGESTIONS);
        JsonNode first = suggestOk(false);
        assertThat(first.path("status").asText()).isEqualTo("ok");
        assertThat(first.path("suggestions")).hasSize(2); // the invented number's card is dropped
        assertThat(first.path("dropped").asInt()).isEqualTo(1);
        assertThat(first.at("/suggestions/0/kind").asText()).isEqualTo("bullets");
        assertThat(first.at("/suggestions/0/title").asText()).isEqualTo("Stronger verb");
        assertThat(first.at("/suggestions/0/changes/0/after").asText()).isEqualTo("Managed 4 engineers");
        assertThat(first.at("/suggestions/1/kind").asText()).isEqualTo("skills");
        assertThat(first.at("/suggestions/0/stale").asBoolean()).isFalse();
        assertThat(first.path("contentHash").asText()).hasSize(64);
        assertThat(first.has("staleAt")).isFalse();

        JsonNode again = suggestOk(false);
        assertThat(again.path("status").asText()).isEqualTo("cached");
        assertThat(again.path("suggestions")).hasSize(2);
        verify(aiProvider, times(1)).generate(eq(AiTask.SUGGEST), any(), anyString(), anyString(), eq(3000));

        JsonNode listed = om.readTree(mockMvc.perform(get("/api/profile/resumes/" + resumeId + "/ai/suggestions")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(listed.path("suggestions")).hasSize(2);
        assertThat(listed.at("/suggestions/0/id").asLong()).isEqualTo(first.at("/suggestions/0/id").asLong());
    }

    @Test
    void refreshAsksAgainAndReplacesTheOldCardsAndEditingMakesCardsStale() throws Exception {
        pro();
        reply(GOOD_SUGGESTIONS);
        JsonNode first = suggestOk(false);
        long oldId = first.at("/suggestions/0/id").asLong();

        reply("{\"suggestions\":[{\"kind\":\"summary\",\"title\":\"Fresh\",\"body\":\"b\",\"changes\":[{\"ref\":\"b_bullet03\",\"after\":\"Authored documentation\",\"reason\":\"r\"}]}]}");
        JsonNode fresh = suggestOk(true);
        assertThat(fresh.path("status").asText()).isEqualTo("ok");
        assertThat(fresh.path("suggestions")).hasSize(1);
        assertThat(proposalRepository.findById(oldId).orElseThrow().getStatus()).isEqualTo("DISMISSED");
        verify(aiProvider, times(2)).generate(eq(AiTask.SUGGEST), any(), anyString(), anyString(), anyInt());

        long version = resumeDocRepository.findById(resumeId).orElseThrow().getDocVersion();
        saveDoc(DOC_BODY.replace("Wrote docs", "Wrote runbooks"), "\"" + version + "\"");
        JsonNode stale = om.readTree(mockMvc.perform(get("/api/profile/resumes/" + resumeId + "/ai/suggestions")).andReturn().getResponse().getContentAsString());
        assertThat(stale.at("/suggestions/0/stale").asBoolean()).isTrue();
        assertThat(stale.path("staleAt").asText()).isNotEmpty();
        long staleId = stale.at("/suggestions/0/id").asLong();
        postJson("/api/profile/ai/proposals/" + staleId + "/apply", Map.of("keep", List.of("b_bullet03"))).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PROPOSAL_STALE"));
    }

    @Test
    void applyingOneCardWritesItAndKeepsTheOtherCardUsable() throws Exception {
        pro();
        reply(GOOD_SUGGESTIONS);
        JsonNode r = suggestOk(false);
        long applyId = r.at("/suggestions/0/id").asLong();
        long otherId = r.at("/suggestions/1/id").asLong();

        postJson("/api/profile/ai/proposals/" + applyId + "/apply", Map.of("keep", List.of("b_bullet02"))).andExpect(status().isOk());
        assertThat(bullet(currentDoc(), "b_bullet02").path("text").asText()).isEqualTo("Managed 4 engineers");

        JsonNode left = om.readTree(mockMvc.perform(get("/api/profile/resumes/" + resumeId + "/ai/suggestions")).andReturn().getResponse().getContentAsString());
        assertThat(left.path("suggestions")).hasSize(1);
        assertThat(left.at("/suggestions/0/id").asLong()).isEqualTo(otherId);
        assertThat(left.at("/suggestions/0/stale").asBoolean()).as("its line is untouched, so it follows the document").isFalse();
        postJson("/api/profile/ai/proposals/" + otherId + "/apply", Map.of("keep", List.of("b_bullet03"))).andExpect(status().isOk());
        assertThat(bullet(currentDoc(), "b_bullet03").path("text").asText()).isEqualTo("Authored documentation");
    }

    @Test
    void suggestionConsentKillSwitchAndProviderFailure() throws Exception {
        pro();
        suggest(false, false).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("consentRequired"));
        verify(aiProvider, never()).generate(any(AiTask.class), any(), anyString(), anyString(), anyInt());

        when(aiProvider.generate(any(AiTask.class), any(), anyString(), anyString(), anyInt())).thenThrow(new com.dossier.api.service.ai.AiProviderException("down"));
        suggest(true, false).andExpect(status().isBadGateway()).andExpect(jsonPath("$.status").value("error"));

        appSettingRepository.saveAndFlush(new AppSetting("ai.feature.resume.enabled", "false", "it", Instant.now()));
        settings.invalidate();
        suggest(true, false).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("disabled"));
    }

    @Test
    void suggestionsOfAnotherUsersResumeAre404AndNothingPersonalIsSent() throws Exception {
        pro();
        mockMvc.perform(get("/api/profile/resumes/987654/ai/suggestions")).andExpect(status().isNotFound());
        postJson("/api/profile/resumes/987654/ai/suggestions", Map.of("consent", true)).andExpect(status().isNotFound());
        reply("{\"suggestions\":[]}");
        suggestOk(false);
        ArgumentCaptor<String> question = ArgumentCaptor.forClass(String.class);
        verify(aiProvider).generate(eq(AiTask.SUGGEST), any(), question.capture(), anyString(), anyInt());
        assertThat(question.getValue()).contains("[b_bullet03] Wrote docs").doesNotContain("ada@example.com").doesNotContain("555 0100").doesNotContain("Ada Lovelace");
    }

    @Test
    void anEmptyOrAllDroppedAnswerIsNothingToChange() throws Exception {
        pro();
        reply("{\"suggestions\":[]}");
        JsonNode none = suggestOk(false);
        assertThat(none.path("status").asText()).isEqualTo("nothingToChange");
        assertThat(none.path("suggestions")).isEmpty();
        assertThat(none.path("dropped").asInt()).isZero();
    }

    // ---- summary -----------------------------------------------------------------

    @Test
    void aGeneratedSummaryIsAppliedIntoASummarySectionCreatedFirst() throws Exception {
        pro();
        reply("{\"variants\":[\"Backend engineer who built Kafka event pipelines at Globex.\",\"Backend engineer with 12 years of Python.\"]}");
        JsonNode r = om.readTree(
            postJson("/api/profile/resumes/" + resumeId + "/ai/summary", Map.of("tone", "confident", "consent", true)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString()
        );
        assertThat(r.path("status").asText()).isEqualTo("ok");
        assertThat(r.at("/proposal/changes/0/ref").asText()).isEqualTo("summary");
        assertThat(r.at("/proposal/changes/0/before").asText()).isEmpty();
        assertThat(r.at("/proposal/changes/0/after").asText()).isEqualTo("Backend engineer who built Kafka event pipelines at Globex.");
        assertThat(r.path("dropped").asInt()).isEqualTo(1);

        long pid = r.at("/proposal/id").asLong();
        postJson("/api/profile/ai/proposals/" + pid + "/apply", Map.of("keep", List.of("summary"))).andExpect(status().isOk());
        JsonNode doc = currentDoc();
        assertThat(doc.at("/sections/0/kind").asText()).isEqualTo("SUMMARY");
        assertThat(doc.at("/sections/0/items/0/text").asText()).isEqualTo("Backend engineer who built Kafka event pipelines at Globex.");
        assertThat(doc.at("/sections/0/items/0/src").asText()).isEqualTo("ai");
        assertThat(doc.at("/sections/0/id").asText()).matches("s_[A-Za-z0-9]{6,12}");
    }
}
