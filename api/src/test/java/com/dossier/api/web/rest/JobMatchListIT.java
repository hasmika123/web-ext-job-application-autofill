package com.dossier.api.web.rest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.ProSubscriptions;
import com.dossier.api.domain.Application;
import com.dossier.api.domain.JobMatch;
import com.dossier.api.domain.JobPosting;
import com.dossier.api.domain.JobSource;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.domain.enumeration.JobMode;
import com.dossier.api.domain.enumeration.JobType;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.JobMatchRepository;
import com.dossier.api.repository.JobPostingRepository;
import com.dossier.api.repository.JobSourceRepository;
import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.service.ai.AiProvider;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Matches page's API (Phase 13.6c) over HTTP: Pro only; undecided matches scoring 60+ best
 * first; dismiss hides one; save puts it on the board from the stored posting; nobody else's match.
 */
@IntegrationTest
@AutoConfigureMockMvc
@WithMockUser(username = "user")
@Transactional
class JobMatchListIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper om;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private SubscriptionRepository subscriptionRepository;

    @Autowired
    private JobSourceRepository sourceRepository;

    @Autowired
    private JobPostingRepository postingRepository;

    @Autowired
    private JobMatchRepository matchRepository;

    @Autowired
    private ApplicationRepository applicationRepository;

    @MockitoBean
    private AiProvider aiProvider;

    private JobSource source;
    private User me;

    @BeforeEach
    void setUp() {
        me = userRepository.findOneByLogin("user").orElseThrow();
        source = sourceRepository.saveAndFlush(new JobSource("ashby", "acme-list-it", "Acme", JobSource.SEED));
    }

    private JobMatch match(User owner, String title, int score, String status) {
        JobPosting p = new JobPosting();
        p.setSource(source);
        p.setExternalId("ext-" + title.hashCode());
        p.setTitle(title);
        p.setCompany("Acme");
        p.setLocation("Remote (US)");
        p.setWorkplaceType("REMOTE");
        p.setRemote(true);
        p.setEmploymentType("FullTime");
        p.setUrl("https://jobs.ashbyhq.com/acme-list-it/" + title.hashCode());
        p.setDescriptionText("Requirements: Java and Kafka.");
        p.setPublishedAt(Instant.now());
        p.setDedupKey(Integer.toHexString(title.hashCode()));
        p = postingRepository.saveAndFlush(p);
        JobMatch m = new JobMatch();
        m.setUser(owner);
        m.setPosting(p);
        m.setScore(score);
        m.setReason("Java and Kafka, remote");
        m.setStatus(status);
        return matchRepository.saveAndFlush(m);
    }

    @Test
    void aFreeUserIsToldItIsPro() throws Exception {
        mockMvc.perform(get("/api/profile/job-matches")).andExpect(status().isPaymentRequired());
    }

    @Test
    void showsUndecidedMatchesOfSixtyAndUpBestFirst() throws Exception {
        ProSubscriptions.makePro(subscriptionRepository, userRepository, "user");
        match(me, "Backend Engineer", 72, JobMatch.NEW);
        match(me, "Platform Engineer", 91, JobMatch.NEW);
        match(me, "Weak fit", 45, JobMatch.NEW);
        match(me, "Dismissed", 95, JobMatch.DISMISSED);
        mockMvc
            .perform(get("/api/profile/job-matches"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.setting.enabled").value(false))
            .andExpect(jsonPath("$.matches.length()").value(2))
            .andExpect(jsonPath("$.matches[0].title").value("Platform Engineer"))
            .andExpect(jsonPath("$.matches[0].score").value(91))
            .andExpect(jsonPath("$.matches[0].ats").value("ashby"))
            .andExpect(jsonPath("$.matches[1].title").value("Backend Engineer"));
    }

    @Test
    void dismissHidesAMatch() throws Exception {
        ProSubscriptions.makePro(subscriptionRepository, userRepository, "user");
        JobMatch m = match(me, "Backend Engineer", 80, JobMatch.NEW);
        mockMvc.perform(post("/api/profile/job-matches/" + m.getId() + "/dismiss")).andExpect(status().isOk());
        mockMvc.perform(get("/api/profile/job-matches")).andExpect(jsonPath("$.matches.length()").value(0));
    }

    @Test
    void saveBuildsTheApplicationFromThePosting() throws Exception {
        ProSubscriptions.makePro(subscriptionRepository, userRepository, "user");
        JobMatch m = match(me, "Backend Engineer", 80, JobMatch.NEW);
        String body = mockMvc
            .perform(post("/api/profile/job-matches/" + m.getId() + "/save"))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString();
        JsonNode json = om.readTree(body);
        Application a = applicationRepository.findById(json.path("applicationId").asLong()).orElseThrow();
        assertThat(a.getUser().getId()).isEqualTo(me.getId());
        assertThat(a.getCompany()).isEqualTo("Acme");
        assertThat(a.getRoleTitle()).isEqualTo("Backend Engineer");
        assertThat(a.getStatus()).isEqualTo(ApplicationStatus.SAVED);
        assertThat(a.getJobMode()).isEqualTo(JobMode.REMOTE);
        assertThat(a.getJobType()).isEqualTo(JobType.FULL_TIME);
        assertThat(a.getJobDescription()).contains("Java and Kafka");
        assertThat(a.getAtsPlatform()).isEqualTo("ashby");
        assertThat(a.getSource()).isEqualTo("match");
        assertThat(matchRepository.findById(m.getId()).orElseThrow().getStatus()).isEqualTo(JobMatch.SAVED);
    }

    @Test
    void someoneElsesMatchIs404() throws Exception {
        ProSubscriptions.makePro(subscriptionRepository, userRepository, "user");
        JobMatch theirs = match(userRepository.findOneByLogin("admin").orElseThrow(), "Theirs", 80, JobMatch.NEW);
        mockMvc.perform(post("/api/profile/job-matches/" + theirs.getId() + "/save")).andExpect(status().isNotFound());
        mockMvc.perform(post("/api/profile/job-matches/" + theirs.getId() + "/dismiss")).andExpect(status().isNotFound());
    }
}
