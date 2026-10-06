package com.dossier.api.web.rest;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
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
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
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
 * The ATS resume score (Phase 13.5) over HTTP: the Pro gate, the structure-only score on the
 * Resumes page, the keyword blend for a tracked application, and ownership.
 */
@IntegrationTest
@AutoConfigureMockMvc
@TestPropertySource(properties = { "dossier.ai.enabled=true" })
@WithMockUser(username = "user")
@Transactional
class AtsScoreResourceIT {

    private static final String JD =
        "Senior backend engineer, on-site in New York. Build distributed Java services on Spring Boot and Kafka, " +
        "own PostgreSQL schemas, run production on AWS with Terraform. 7+ years of backend experience. " +
        "We are unable to sponsor visas for this role.";

    /** Passes everything except "has a file" (10) and the summary length (3): structure 87. */
    private static final String PARSED =
        "{\"summary\":\"Backend engineer.\",\"skills\":[\"Java\",\"Kafka\",\"Spring Boot\",\"PostgreSQL\",\"AWS\"]," +
        "\"experience\":[{\"company\":\"Globex\",\"title\":\"Engineer\",\"startDate\":\"2021\",\"current\":true,\"bullets\":[" +
        "\"Built Kafka pipelines handling 1,200 requests per second\",\"Reduced latency by 40% with a new cache layer\"]}]," +
        "\"education\":[{\"school\":\"State U\",\"degree\":\"BS\"}]}";

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

    private Resume backend;

    @BeforeEach
    void setUp() {
        when(aiProvider.isConfigured()).thenReturn(true);
        when(aiProvider.defaultModel()).thenReturn("gemini-2.5-flash-lite");
        when(aiProvider.generate(eq(AiTask.FIT), any(), anyString(), anyString())).thenReturn(
            new AiResult(
                "{\"score\":71,\"summary\":\"Strong Java/Kafka match.\",\"matched\":[\"Java\",\"Kafka\",\"AWS\"],\"missing\":[\"Terraform\"],\"redFlags\":[]}",
                "gemini-2.5-flash-lite",
                2400,
                0,
                200
            )
        );
        backend = resume(userRepository.findOneByLogin("user").orElseThrow(), "Backend v3");
    }

    private Resume resume(User owner, String label) {
        Resume r = new Resume()
            .label(label)
            .r2ObjectKey("")
            .parsedJson(PARSED)
            .status(ResumeStatus.CONFIRMED)
            .archived(false)
            .defaultResume(true)
            .createdAt(Instant.now());
        r.setUser(owner);
        return resumeRepository.saveAndFlush(r);
    }

    @Test
    void aFreeUserIsToldItIsPro() throws Exception {
        mockMvc
            .perform(get("/api/profile/resumes/" + backend.getId() + "/ats-score"))
            .andExpect(status().isPaymentRequired())
            .andExpect(jsonPath("$.code").value("PRO_REQUIRED"));
    }

    @Test
    void proGetsTheStructureScore() throws Exception {
        ProSubscriptions.makePro(subscriptionRepository, userRepository, "user");
        mockMvc
            .perform(get("/api/profile/resumes/" + backend.getId() + "/ats-score"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.score").value(87))
            .andExpect(jsonPath("$.passed").value(13))
            .andExpect(jsonPath("$.total").value(15))
            .andExpect(jsonPath("$.label").value("Backend v3"))
            .andExpect(jsonPath("$.checks[?(@.id=='file')].passed").value(false))
            .andExpect(jsonPath("$.keywords").doesNotExist());
    }

    @Test
    void anApplicationBlendsInKeywordCoverage() throws Exception {
        ProSubscriptions.makePro(subscriptionRepository, userRepository, "user");
        Application a = new Application()
            .company("Acme")
            .roleTitle("Backend Engineer")
            .status(ApplicationStatus.SAVED)
            .createdAt(Instant.now())
            .updatedAt(Instant.now());
        a.setJobDescription(JD);
        a.setResume(backend);
        a.setUser(userRepository.findOneByLogin("user").orElseThrow());
        a = applicationRepository.saveAndFlush(a);

        mockMvc
            .perform(
                post("/api/profile/applications/" + a.getId() + "/ats-score")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(om.writeValueAsString(Map.of("resumeId", backend.getId(), "consent", true)))
            )
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.keywords.coveragePercent").value(75))
            .andExpect(jsonPath("$.keywords.missingTerms[0]").value("Terraform"))
            // 87 × 0.7 + 75 × 0.3 = 83.4
            .andExpect(jsonPath("$.score").value(83));
    }

    @Test
    void someoneElsesResumeIs404() throws Exception {
        ProSubscriptions.makePro(subscriptionRepository, userRepository, "user");
        Resume theirs = resume(userRepository.findOneByLogin("admin").orElseThrow(), "Theirs");
        mockMvc.perform(get("/api/profile/resumes/" + theirs.getId() + "/ats-score")).andExpect(status().isNotFound());
    }
}
