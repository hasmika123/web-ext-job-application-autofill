package com.dossier.api.web.rest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.Resume;
import com.dossier.api.domain.Subscription;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.ResumeStatus;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.repository.ResumeRepository;
import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.service.ProfileService;
import com.dossier.api.service.ResumeBuilderSettings;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithAnonymousUser;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * Integration tests for {@link ResumeBuilderConfigResource} (R2.0): the object's shape, the
 * ETag/304 and Cache-Control contract, plan FREE vs PRO, the resume count and cap, a stored setting
 * reaching both the config and the document validation, and the endpoint being authenticated.
 */
@IntegrationTest
@AutoConfigureMockMvc
@WithMockUser(username = "user")
@Transactional
class ResumeBuilderConfigResourceIT {

    private static final String URL = "/api/profile/resume-builder/config";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper om;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private ResumeRepository resumeRepository;

    @Autowired
    private SubscriptionRepository subscriptionRepository;

    @Autowired
    private AppSettingRepository appSettingRepository;

    @Autowired
    private ResumeBuilderSettings settings;

    private User user() {
        return userRepository.findOneByLogin("user").orElseThrow();
    }

    private JsonNode config() throws Exception {
        settings.invalidate();
        return om.readTree(mockMvc.perform(get(URL)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    private void makePro() {
        Subscription sub = subscriptionRepository.findOneByUserLogin("user").orElseGet(Subscription::new);
        sub.setUser(user());
        sub.setStripeCustomerId("cus_cfg_1");
        sub.setStripeSubscriptionId("sub_cfg_1");
        sub.setPlan(Subscription.PLAN_PRO);
        sub.setStatus("active");
        sub.setCurrentPeriodEnd(Instant.now().plus(10, ChronoUnit.DAYS));
        subscriptionRepository.saveAndFlush(sub);
    }

    private void resume(boolean archived) {
        Resume r = new Resume();
        r.setUser(user());
        r.setLabel("R");
        r.setCreatedAt(Instant.now());
        r.setr2ObjectKey("");
        r.setStatus(ResumeStatus.CONFIRMED);
        r.setArchived(archived);
        resumeRepository.saveAndFlush(r);
    }

    @Test
    void servesTheDesign91ShapeWithTheDeclaredDefaults() throws Exception {
        mockMvc
            .perform(get(URL))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.templates.enabled[0]").value("modern"))
            .andExpect(jsonPath("$.templates.default").value("modern"))
            .andExpect(jsonPath("$.templates.overrides").isMap())
            .andExpect(jsonPath("$.limits.sections").value(20))
            .andExpect(jsonPath("$.limits.items").value(40))
            .andExpect(jsonPath("$.limits.bullets").value(12))
            .andExpect(jsonPath("$.limits.bulletChars").value(600))
            .andExpect(jsonPath("$.limits.summaryChars").value(2000))
            .andExpect(jsonPath("$.limits.marks").value(64))
            .andExpect(jsonPath("$.limits.docBytes").value(262144))
            .andExpect(jsonPath("$.score.rulesetVersion").value("v1"))
            .andExpect(jsonPath("$.score.groupWeights.G2").value(25))
            .andExpect(jsonPath("$.score.weights.E5").value(4))
            .andExpect(jsonPath("$.score.passThreshold").value(0.7))
            .andExpect(jsonPath("$.score.bands[0].title").value("Great match!"))
            .andExpect(jsonPath("$.match.weights.skills").value(50))
            .andExpect(jsonPath("$.match.weights.years").value(10))
            .andExpect(jsonPath("$.match.keySkillsCount").value(10))
            .andExpect(jsonPath("$.match.thresholds.keySkills").value(0.7))
            .andExpect(jsonPath("$.match.maxJdChars").value(8000))
            .andExpect(jsonPath("$.match.embeddings").value(false))
            .andExpect(jsonPath("$.theme.accentPalette.length()").value(6))
            .andExpect(jsonPath("$.features.photo").value(true))
            .andExpect(jsonPath("$.features.docx").value(false))
            .andExpect(jsonPath("$.features.aiSuggestions").value(true))
            .andExpect(jsonPath("$.features.jobMatch").value(true))
            .andExpect(jsonPath("$.features.tailor").value(true))
            .andExpect(jsonPath("$.features.printLayout").value(true))
            .andExpect(jsonPath("$.features.pdfView").value(true))
            .andExpect(jsonPath("$.ai.suggestAutoRefresh").value(false))
            .andExpect(jsonPath("$.ai.suggestStaleMinutes").value(10))
            .andExpect(jsonPath("$.ai.rewriteMaxRefs").value(12))
            .andExpect(jsonPath("$.profile.itemMaxBytes").value(16384))
            .andExpect(jsonPath("$.profile.maxItemsPerUser").value(500))
            .andExpect(jsonPath("$.profile.maxImportItems").value(200))
            .andExpect(jsonPath("$.profile.bioValueMaxChars").value(500))
            .andExpect(jsonPath("$.profile.bioSummaryMaxChars").value(2000))
            .andExpect(jsonPath("$.profile.setupPromptBelowPercent").value(40))
            .andExpect(jsonPath("$.profile.uploadMaxBytes").value(10485760));
    }

    @Test
    void carriesAnEtagThatIsTheSha256OfTheBodyAndAnswers304() throws Exception {
        settings.invalidate();
        MvcResult first = mockMvc.perform(get(URL)).andExpect(status().isOk()).andReturn();
        String etag = first.getResponse().getHeader(HttpHeaders.ETAG);
        assertThat(etag).matches("\"[0-9a-f]{64}\"");
        assertThat(first.getResponse().getHeader(HttpHeaders.CACHE_CONTROL)).contains("private").contains("max-age=60");

        // The tag is the hash of the serialised object, so it changes with the content.
        mockMvc.perform(get(URL).header(HttpHeaders.IF_NONE_MATCH, etag)).andExpect(status().isNotModified());
        setting("resume.doc.limits.items", "50");
        settings.invalidate();
        MvcResult changed = mockMvc.perform(get(URL).header(HttpHeaders.IF_NONE_MATCH, etag)).andExpect(status().isOk()).andReturn();
        assertThat(changed.getResponse().getHeader(HttpHeaders.ETAG)).isNotEqualTo(etag);
    }

    @Test
    void freePlanHasNoAiAndPlanProHas() throws Exception {
        JsonNode free = config();
        assertThat(free.get("plan").asText()).isEqualTo("FREE");
        assertThat(free.get("aiAllowed").asBoolean()).isFalse();
        assertThat(free.at("/resumes/max").asInt()).isEqualTo(ProfileService.FREE_RESUME_LIMIT);

        makePro();
        JsonNode pro = config();
        assertThat(pro.get("plan").asText()).isEqualTo("PRO");
        assertThat(pro.get("aiAllowed").asBoolean()).isTrue();
        assertThat(pro.at("/resumes/max").asInt()).isEqualTo(ProfileService.PRO_RESUME_LIMIT);
    }

    @Test
    void resumesCountSkipsArchivedOnes() throws Exception {
        int before = config().at("/resumes/count").asInt();
        resume(false);
        resume(true);
        assertThat(config().at("/resumes/count").asInt()).isEqualTo(before + 1);
    }

    @Test
    void aStoredSettingReachesTheConfigAndFallsBackWhenOutOfBounds() throws Exception {
        setting("resume.doc.limits.items", "55");
        setting("resume.score.passThreshold", "0.99"); // over the 0.95 bound
        JsonNode cfg = config();
        assertThat(cfg.at("/limits/items").asInt()).isEqualTo(55);
        assertThat(cfg.at("/score/passThreshold").asDouble()).isEqualTo(0.7);
    }

    @Test
    void documentValidationUsesTheConfiguredLimits() throws Exception {
        String created = mockMvc
            .perform(post("/api/profile/resumes/built").contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();
        JsonNode built = om.readTree(created);
        long id = built.at("/resume/id").asLong();
        String version = String.valueOf(built.at("/doc/docVersion").asInt());

        StringBuilder sections = new StringBuilder();
        for (int i = 0; i < 6; i++) {
            if (i > 0) sections.append(',');
            sections.append("{\"id\":\"s_cust00").append(i).append("\",\"kind\":\"CUSTOM\",\"title\":\"C").append(i).append("\",\"hidden\":false,\"items\":[]}");
        }
        String body = "{\"doc\":{\"schema\":1,\"meta\":{\"title\":\"T\"},\"basics\":{\"name\":\"Ada\"},\"sections\":[" + sections + "]}}";

        // Six sections are fine at the default (20) ...
        settings.invalidate();
        String next = mockMvc
            .perform(put("/api/profile/resumes/" + id + "/doc").contentType(MediaType.APPLICATION_JSON).header(HttpHeaders.IF_MATCH, version).content(body))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getHeader(HttpHeaders.ETAG);

        // ... and refused once an admin lowers the limit to 5.
        setting("resume.doc.limits.sections", "5");
        settings.invalidate();
        mockMvc
            .perform(put("/api/profile/resumes/" + id + "/doc").contentType(MediaType.APPLICATION_JSON).header(HttpHeaders.IF_MATCH, next).content(body))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.path").value("$.sections"));
    }

    @Test
    @WithAnonymousUser
    void requiresAnAuthenticatedUser() throws Exception {
        mockMvc.perform(get(URL)).andExpect(status().isUnauthorized());
    }

    private void setting(String key, String value) {
        appSettingRepository.saveAndFlush(new AppSetting(key, value, "it", Instant.now()));
    }
}
