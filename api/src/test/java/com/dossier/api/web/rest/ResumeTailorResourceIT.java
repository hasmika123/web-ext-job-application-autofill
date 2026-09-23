package com.dossier.api.web.rest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.ProSubscriptions;
import com.dossier.api.domain.Application;
import com.dossier.api.domain.Resume;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.domain.enumeration.ResumeStatus;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.ResumeRepository;
import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.service.ai.AiProvider;
import com.dossier.api.service.ai.AiResult;
import com.dossier.api.service.ai.AiTask;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * Resume tailoring (Phase 13.4) over HTTP: propose → keep some changes → a NEW resume exists, linked
 * to the application, with the original untouched; Pro-only; a changed resume refuses an old
 * proposal.
 */
@IntegrationTest
@AutoConfigureMockMvc
@TestPropertySource(properties = { "dossier.ai.enabled=true" })
@WithMockUser(username = "user")
@Transactional
class ResumeTailorResourceIT {

    private static final String JD =
        "Senior backend engineer. Build distributed Java services on Spring Boot and Kafka, own PostgreSQL schemas, " +
        "run production on AWS with Terraform. Mentor engineers and partner with product on the payments roadmap.";
    private static final String RESUME_JSON =
        "{\"summary\":\"Backend engineer.\",\"skills\":[\"Python\",\"Java\",\"Kafka\"]," +
        "\"experience\":[{\"company\":\"Globex\",\"title\":\"Engineer\",\"bullets\":[\"Built event pipelines\",\"Wrote docs\"]}]}";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper om;

    @Autowired
    private ResumeRepository resumeRepository;

    @Autowired
    private ApplicationRepository applicationRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private SubscriptionRepository subscriptionRepository;

    @MockitoBean
    private AiProvider aiProvider;

    private Resume resume;
    private Application app;

    @BeforeEach
    void setUp() {
        when(aiProvider.isConfigured()).thenReturn(true);
        when(aiProvider.defaultModel()).thenReturn("gemini-2.5-flash-lite");
        when(aiProvider.generate(eq(AiTask.TAILOR), any(), anyString(), anyString())).thenReturn(
            new AiResult(
                "{\"bullets\":[{\"ref\":\"e0b0\",\"text\":\"Built Kafka event pipelines in Java\"},{\"ref\":\"e0b1\",\"text\":\"Wrote design docs\"}]," +
                "\"skillsOrder\":[\"Kafka\",\"Java\",\"Python\"],\"suggestions\":[\"Terraform\"]}",
                "gemini-2.5-flash-lite",
                3000,
                0,
                300
            )
        );
        User user = userRepository.findOneByLogin("user").orElseThrow();
        Resume r = new Resume()
            .label("Backend v3")
            .r2ObjectKey("")
            .parsedJson(RESUME_JSON)
            .status(ResumeStatus.CONFIRMED)
            .archived(false)
            .defaultResume(true)
            .createdAt(Instant.now());
        r.setUser(user);
        resume = resumeRepository.saveAndFlush(r);
        Application a = new Application()
            .company("Acme")
            .roleTitle("Backend Engineer")
            .status(ApplicationStatus.SAVED)
            .createdAt(Instant.now())
            .updatedAt(Instant.now());
        a.setJobDescription(JD);
        a.setUser(user);
        app = applicationRepository.saveAndFlush(a);
    }

    private JsonNode propose() throws Exception {
        String body = mockMvc
            .perform(
                post("/api/profile/applications/" + app.getId() + "/tailor")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(om.writeValueAsString(Map.of("resumeId", resume.getId(), "consent", true)))
            )
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString();
        return om.readTree(body);
    }

    @Test
    void aFreeUserIsToldItIsPro() throws Exception {
        mockMvc
            .perform(
                post("/api/profile/applications/" + app.getId() + "/tailor")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(om.writeValueAsString(Map.of("resumeId", resume.getId(), "consent", true)))
            )
            .andExpect(status().isPaymentRequired())
            .andExpect(jsonPath("$.code").value("PRO_REQUIRED"));
    }

    @Test
    void proposeThenSaveMakesANewLinkedResumeAndLeavesTheOriginal() throws Exception {
        ProSubscriptions.makePro(subscriptionRepository, userRepository, "user");
        JsonNode r = propose();
        JsonNode proposal = r.path("proposal");
        assertThat(proposal.path("changes").size()).isEqualTo(3); // two bullets + skills
        assertThat(proposal.path("changes").get(0).path("before").asText()).isEqualTo("Built event pipelines");
        assertThat(proposal.path("suggestions").get(0).asText()).isEqualTo("Terraform");
        long proposalId = proposal.path("proposalId").asLong();

        String saved = mockMvc
            .perform(
                post("/api/profile/tailor/" + proposalId + "/apply")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(om.writeValueAsString(Map.of("keep", List.of("e0b0"), "label", "Backend v3 — Acme", "applicationId", app.getId())))
            )
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.label").value("Backend v3 — Acme"))
            .andReturn()
            .getResponse()
            .getContentAsString();
        long newId = om.readTree(saved).path("resumeId").asLong();

        Resume created = resumeRepository.findById(newId).orElseThrow();
        JsonNode doc = om.readTree(created.getParsedJson());
        assertThat(doc.path("experience").get(0).path("bullets").get(0).asText()).isEqualTo("Built Kafka event pipelines in Java");
        assertThat(doc.path("experience").get(0).path("bullets").get(1).asText()).as("not kept").isEqualTo("Wrote docs");
        assertThat(resumeRepository.findById(resume.getId()).orElseThrow().getParsedJson()).isEqualTo(RESUME_JSON);
        assertThat(applicationRepository.findById(app.getId()).orElseThrow().getResume().getId()).isEqualTo(newId);
    }

    @Test
    void aResumeChangedSinceRefusesTheOldProposal() throws Exception {
        ProSubscriptions.makePro(subscriptionRepository, userRepository, "user");
        long proposalId = propose().path("proposal").path("proposalId").asLong();
        Resume r = resumeRepository.findById(resume.getId()).orElseThrow();
        r.setParsedJson(RESUME_JSON.replace("Wrote docs", "Wrote runbooks"));
        resumeRepository.saveAndFlush(r);

        mockMvc
            .perform(
                post("/api/profile/tailor/" + proposalId + "/apply")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(om.writeValueAsString(Map.of("keep", List.of("e0b0"))))
            )
            .andExpect(status().isConflict());
    }
}
