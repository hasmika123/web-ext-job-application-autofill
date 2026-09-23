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
 * Resume recommendation per job (Phase 13.2) over HTTP: the Pro gate as a 402, the best match with
 * every score, the cache making a second look free, and the board endpoint scoped to the caller's
 * own applications.
 */
@IntegrationTest
@AutoConfigureMockMvc
@TestPropertySource(properties = { "dossier.ai.enabled=true" })
@WithMockUser(username = "user")
@Transactional
class ResumeMatchResourceIT {

    private static final String JD =
        "We are hiring a backend engineer to build distributed Java services on Spring Boot and Kafka, " +
        "own PostgreSQL schemas, and run production on AWS with Terraform. You will mentor two engineers " +
        "and work with product on the payments roadmap. 5+ years of backend experience required.";

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
        // The default resume is listed first (r1); the other second (r2).
        when(aiProvider.generate(eq(AiTask.MATCH), any(), anyString(), anyString())).thenReturn(
            new AiResult(
                "{\"scores\":[{\"id\":\"r1\",\"score\":84,\"why\":\"Java, Kafka and AWS\"},{\"id\":\"r2\",\"score\":38,\"why\":\"Frontend focus\"}]}",
                "gemini-2.5-flash-lite",
                1500,
                0,
                120
            )
        );
        User user = userRepository.findOneByLogin("user").orElseThrow();
        backend = resume(user, "Backend v3", "{\"skills\":[\"Java\",\"Kafka\"]}", true);
        resume(user, "Frontend", "{\"skills\":[\"React\"]}", false);
    }

    private Resume resume(User user, String label, String json, boolean isDefault) {
        Resume r = new Resume()
            .label(label)
            .parsedJson(json)
            .status(ResumeStatus.CONFIRMED)
            .archived(false)
            .defaultResume(isDefault)
            .createdAt(Instant.now());
        r.setUser(user);
        return resumeRepository.saveAndFlush(r);
    }

    private String jobBody(String jd, boolean consent) throws Exception {
        return om.writeValueAsString(Map.of("jobDescription", jd, "role", "Backend Engineer", "company", "Acme", "consent", consent));
    }

    @Test
    void aFreeUserIsToldItIsPro() throws Exception {
        mockMvc
            .perform(post("/api/ai/resume-match").contentType(MediaType.APPLICATION_JSON).content(jobBody(JD, true)))
            .andExpect(status().isPaymentRequired())
            .andExpect(jsonPath("$.code").value("PRO_REQUIRED"));
    }

    @Test
    void proGetsTheBestMatchAndEveryScoreAndTheSecondLookIsFree() throws Exception {
        ProSubscriptions.makePro(subscriptionRepository, userRepository, "user");
        mockMvc
            .perform(post("/api/ai/resume-match").contentType(MediaType.APPLICATION_JSON).content(jobBody(JD, true)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.best.label").value("Backend v3"))
            .andExpect(jsonPath("$.best.resumeId").value(backend.getId()))
            .andExpect(jsonPath("$.best.score").value(84))
            .andExpect(jsonPath("$.scores.length()").value(2))
            .andExpect(jsonPath("$.scores[1].label").value("Frontend"))
            .andExpect(jsonPath("$.cached").value(false))
            .andExpect(jsonPath("$.resetsAt").exists());

        mockMvc
            .perform(post("/api/ai/resume-match").contentType(MediaType.APPLICATION_JSON).content(jobBody(JD, true)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.cached").value(true))
            .andExpect(jsonPath("$.best.score").value(84));
        verify(aiProvider, times(1)).generate(eq(AiTask.MATCH), any(), anyString(), anyString());
    }

    @Test
    void aShortPageSnippetIsNotScored() throws Exception {
        ProSubscriptions.makePro(subscriptionRepository, userRepository, "user");
        mockMvc
            .perform(post("/api/ai/resume-match").contentType(MediaType.APPLICATION_JSON).content(jobBody("Join Acme!", true)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.noJobDescription").value(true));
    }

    @Test
    void anApplicationIsScoredOnItsJobDescriptionAndOnlyForItsOwner() throws Exception {
        ProSubscriptions.makePro(subscriptionRepository, userRepository, "user");
        User me = userRepository.findOneByLogin("user").orElseThrow();
        User them = userRepository.findOneByLogin("admin").orElseThrow();
        Application mine = application(me);
        Application theirs = application(them);

        String consent = om.writeValueAsString(Map.of("consent", true));
        mockMvc
            .perform(post("/api/profile/applications/" + mine.getId() + "/resume-match").contentType(MediaType.APPLICATION_JSON).content(consent))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.best.label").value("Backend v3"));
        mockMvc
            .perform(post("/api/profile/applications/" + theirs.getId() + "/resume-match").contentType(MediaType.APPLICATION_JSON).content(consent))
            .andExpect(status().isNotFound());
    }

    private Application application(User owner) {
        Application a = new Application()
            .company("Acme")
            .roleTitle("Backend Engineer")
            .status(ApplicationStatus.SAVED)
            .createdAt(Instant.now())
            .updatedAt(Instant.now());
        a.setJobDescription(JD);
        a.setUser(owner);
        return applicationRepository.saveAndFlush(a);
    }
}
