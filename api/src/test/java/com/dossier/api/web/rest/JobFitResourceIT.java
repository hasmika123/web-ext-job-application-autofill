package com.dossier.api.web.rest;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
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
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.HashMap;
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
 * The job-fit panel (Phase 13.3) over HTTP: the Pro gate as a 402, the report's shape, the cache
 * making a second look free, and both endpoints scoped to the caller's own resumes and applications.
 */
@IntegrationTest
@AutoConfigureMockMvc
@TestPropertySource(properties = { "dossier.ai.enabled=true" })
@WithMockUser(username = "user")
@Transactional
class JobFitResourceIT {

    private static final String JD =
        "Senior backend engineer, on-site in New York. Build distributed Java services on Spring Boot and Kafka, " +
        "own PostgreSQL schemas, run production on AWS with Terraform. 7+ years of backend experience. " +
        "We are unable to sponsor visas for this role.";

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
                "{\"score\":71,\"summary\":\"Strong Java/Kafka match.\",\"matched\":[\"Java\",\"Kafka\"],\"missing\":[\"Terraform\"],\"redFlags\":[\"On-site in New York\"]}",
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
            .r2ObjectKey("") // no stored file — the check reads parsedJson only
            .parsedJson("{\"skills\":[\"Java\",\"Kafka\"]}")
            .status(ResumeStatus.CONFIRMED)
            .archived(false)
            .defaultResume(true)
            .createdAt(Instant.now());
        r.setUser(owner);
        return resumeRepository.saveAndFlush(r);
    }

    private String body(Long resumeId, String jd) throws Exception {
        Map<String, Object> m = new HashMap<>();
        m.put("resumeId", resumeId);
        m.put("jobDescription", jd);
        m.put("role", "Backend Engineer");
        m.put("company", "Acme");
        m.put("consent", true);
        return om.writeValueAsString(m);
    }

    @Test
    void aFreeUserIsToldItIsPro() throws Exception {
        mockMvc
            .perform(post("/api/ai/job-fit").contentType(MediaType.APPLICATION_JSON).content(body(backend.getId(), JD)))
            .andExpect(status().isPaymentRequired())
            .andExpect(jsonPath("$.code").value("PRO_REQUIRED"));
    }

    @Test
    void proGetsTheReportAndTheSecondLookIsFree() throws Exception {
        ProSubscriptions.makePro(subscriptionRepository, userRepository, "user");
        mockMvc
            .perform(post("/api/ai/job-fit").contentType(MediaType.APPLICATION_JSON).content(body(backend.getId(), JD)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.fit.score").value(71))
            .andExpect(jsonPath("$.fit.label").value("Backend v3"))
            .andExpect(jsonPath("$.fit.matched[0]").value("Java"))
            .andExpect(jsonPath("$.fit.missing[0]").value("Terraform"))
            .andExpect(jsonPath("$.fit.redFlags[0]").value("On-site in New York"))
            .andExpect(jsonPath("$.cached").value(false))
            .andExpect(jsonPath("$.resetsAt").exists());
        mockMvc
            .perform(post("/api/ai/job-fit").contentType(MediaType.APPLICATION_JSON).content(body(backend.getId(), JD)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.cached").value(true));
        verify(aiProvider, times(1)).generate(eq(AiTask.FIT), any(), anyString(), anyString());
    }

    @Test
    void someoneElsesResumeIs404() throws Exception {
        ProSubscriptions.makePro(subscriptionRepository, userRepository, "user");
        Resume theirs = resume(userRepository.findOneByLogin("admin").orElseThrow(), "Theirs");
        mockMvc
            .perform(post("/api/ai/job-fit").contentType(MediaType.APPLICATION_JSON).content(body(theirs.getId(), JD)))
            .andExpect(status().isNotFound());
    }

    @Test
    void theBoardChecksAnApplicationWithItsLinkedResume() throws Exception {
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
                post("/api/profile/applications/" + a.getId() + "/job-fit")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(om.writeValueAsString(Map.of("consent", true)))
            )
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.fit.resumeId").value(backend.getId()))
            .andExpect(jsonPath("$.fit.score").value(71));
    }
}
