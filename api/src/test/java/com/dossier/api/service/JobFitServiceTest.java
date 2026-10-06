package com.dossier.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.Application;
import com.dossier.api.domain.JobFit;
import com.dossier.api.domain.Resume;
import com.dossier.api.domain.User;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.JobFitRepository;
import com.dossier.api.repository.ResumeRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.service.AiBudgetService.Decision;
import com.dossier.api.service.AiBudgetService.Verdict;
import com.dossier.api.service.ai.AiProvider;
import com.dossier.api.service.ai.AiResult;
import com.dossier.api.service.ai.AiTask;
import com.dossier.api.service.dto.BioDTO;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.server.ResponseStatusException;

/**
 * The job-fit panel (Phase 13.3): gating, which resume is checked, the profile facts red flags may
 * use (and nothing else), parsing the report, and the cache. Mocks only.
 */
class JobFitServiceTest {

    private static final String MODEL = "gemini-2.5-flash-lite";
    private static final Instant RESET = Instant.parse("2026-10-01T00:00:00Z");
    private static final String JD =
        "Senior backend engineer, on-site in New York. Build distributed Java services on Spring Boot and Kafka, " +
        "own PostgreSQL schemas, run production on AWS with Terraform. 7+ years of backend experience. " +
        "We are unable to sponsor visas for this role.";
    private static final String REPORT =
        "{\"score\":71,\"summary\":\"Strong Java/Kafka match; location and sponsorship are problems.\"," +
        "\"matched\":[\"Java\",\"Kafka\",\"java\",\"Spring Boot\"],\"missing\":[\"Terraform\",\"PostgreSQL\"]," +
        "\"redFlags\":[\"No visa sponsorship; you need it\",\"On-site in New York\"]}";

    private AiProvider provider;
    private AiBudgetService budget;
    private AiMeteringService metering;
    private ResumeRepository resumes;
    private ApplicationRepository applications;
    private JobFitRepository fits;
    private ProfileService profile;
    private JobFitService service;
    private User user;
    private Resume backend;

    @BeforeEach
    void setUp() {
        provider = Mockito.mock(AiProvider.class);
        when(provider.isConfigured()).thenReturn(true);
        budget = Mockito.mock(AiBudgetService.class);
        allow(Verdict.OK);
        metering = Mockito.mock(AiMeteringService.class);
        resumes = Mockito.mock(ResumeRepository.class);
        applications = Mockito.mock(ApplicationRepository.class);
        fits = Mockito.mock(JobFitRepository.class);
        profile = Mockito.mock(ProfileService.class);
        UserRepository users = Mockito.mock(UserRepository.class);
        user = new User();
        user.setId(7L);
        user.setLogin("user");
        when(users.findOneByLogin("user")).thenReturn(Optional.of(user));

        backend = resume(11L, "Backend v3", "{\"skills\":[\"Java\",\"Kafka\"]}", true);
        when(resumes.findById(11L)).thenReturn(Optional.of(backend));
        when(resumes.findByUserId(7L)).thenReturn(List.of(backend));
        bio("{\"firstName\":\"Ada\",\"email\":\"ada@example.com\",\"requireSponsorship\":\"Yes\",\"city\":\"Atlanta\",\"willingToRelocate\":\"No\",\"gender\":\"Female\"}");

        service = new JobFitService(provider, budget, metering, resumes, applications, fits, users, profile, true);
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken("user", "x"));
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private Resume resume(Long id, String label, String json, boolean isDefault) {
        Resume r = new Resume().label(label).parsedJson(json).archived(false).defaultResume(isDefault).createdAt(Instant.parse("2026-09-01T00:00:00Z"));
        r.setId(id);
        r.setUser(user);
        return r;
    }

    private void bio(String payload) {
        BioDTO b = new BioDTO();
        b.setPayload(payload);
        when(profile.getProfile()).thenReturn(Optional.of(b));
    }

    private void allow(Verdict v) {
        when(budget.decide(anyString(), any())).thenReturn(new Decision(v, v == Verdict.OK ? MODEL : null, true, 20, 100, RESET, false));
    }

    private void modelSays(String json) {
        when(provider.generate(eq(AiTask.FIT), any(), anyString(), anyString())).thenReturn(new AiResult(json, MODEL, 2400, 0, 200));
    }

    @Test
    void itIsPro() {
        allow(Verdict.PRO_REQUIRED);
        assertThatThrownBy(() -> service.fitJob(11L, JD, "Backend Engineer", "Acme", true)).isInstanceOf(ProRequiredException.class);
    }

    @Test
    void anotherUsersResumeIs404() {
        User other = new User();
        other.setId(99L);
        Resume theirs = resume(50L, "Theirs", "{}", false);
        theirs.setUser(other);
        when(resumes.findById(50L)).thenReturn(Optional.of(theirs));
        assertThatThrownBy(() -> service.fitJob(50L, JD, "Engineer", "Acme", true)).isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void anArchivedResumeHasNothingToCheck() {
        backend.setArchived(true);
        assertThat(service.fitJob(11L, JD, "Engineer", "Acme", true).status()).isEqualTo(JobFitService.Status.NO_RESUME);
    }

    @Test
    void aPageSummaryIsNotChecked() {
        assertThat(service.fitJob(11L, "Join Acme!", "Engineer", "Acme", true).status()).isEqualTo(JobFitService.Status.NO_JOB_DESCRIPTION);
        verify(provider, never()).generate(any(), any(), anyString(), anyString());
    }

    @Test
    void theReportIsParsedCappedAndCached() {
        modelSays(REPORT);
        JobFitService.Result r = service.fitJob(11L, JD, "Backend Engineer", "Acme", true);
        assertThat(r.status()).isEqualTo(JobFitService.Status.OK);
        JobFitService.Fit f = r.fit();
        assertThat(f.score()).isEqualTo(71);
        assertThat(f.label()).isEqualTo("Backend v3");
        assertThat(f.matched()).as("case-insensitive duplicates dropped").containsExactly("Java", "Kafka", "Spring Boot");
        assertThat(f.missing()).containsExactly("Terraform", "PostgreSQL");
        assertThat(f.redFlags()).hasSize(2);
        verify(metering).record(eq("user"), eq(AiTask.FIT), any());
        ArgumentCaptor<JobFit> saved = ArgumentCaptor.forClass(JobFit.class);
        verify(fits).save(saved.capture());
        assertThat(saved.getValue().getResultJson()).contains("Terraform").doesNotContain("unable to sponsor");
    }

    @Test
    void aCachedReportIsFreeEvenWithTheBudgetSpent() {
        allow(Verdict.EXHAUSTED);
        JobFit cached = new JobFit();
        cached.setResultJson(REPORT);
        when(fits.findFirstByUserIdAndCacheKeyOrderByCreatedAtDesc(eq(7L), anyString())).thenReturn(Optional.of(cached));
        JobFitService.Result r = service.fitJob(11L, JD, "Engineer", "Acme", true);
        assertThat(r.status()).isEqualTo(JobFitService.Status.OK);
        assertThat(r.cached()).isTrue();
        verify(provider, never()).generate(any(), any(), anyString(), anyString());
    }

    @Test
    void anUnusableReplyIsAnErrorButStillMetered() {
        modelSays("{\"summary\":\"no score here\"}");
        assertThat(service.fitJob(11L, JD, "Engineer", "Acme", true).status()).isEqualTo(JobFitService.Status.ERROR);
        verify(metering).record(eq("user"), eq(AiTask.FIT), any());
        verify(fits, never()).save(any());
    }

    /** Red flags may use location, work authorization and the like — never name, contact or EEO. */
    @Test
    void onlyTheRedFlagFactsLeaveTheProfile() {
        Map<String, String> facts = service.candidateFacts();
        assertThat(facts).containsEntry("requireSponsorship", "Yes").containsEntry("city", "Atlanta").containsEntry("willingToRelocate", "No");
        assertThat(facts).doesNotContainKeys("firstName", "email", "gender");
        String prompt = service.buildPrompt(JD, "Backend Engineer", "Acme", backend, facts);
        assertThat(prompt).contains("requireSponsorship: Yes").doesNotContain("ada@example.com").doesNotContain("Female");
    }

    @Test
    void theCacheKeyFollowsTheResumeTheJobAndTheFacts() {
        Map<String, String> facts = service.candidateFacts();
        String k = JobFitService.cacheKey(JD, "Engineer", backend, facts);
        assertThat(JobFitService.cacheKey(JD, "Engineer", backend, facts)).isEqualTo(k);
        assertThat(JobFitService.cacheKey(JD + " Remote OK.", "Engineer", backend, facts)).isNotEqualTo(k);
        backend.setParsedJson("{\"skills\":[\"Java\",\"Kafka\",\"Terraform\"]}");
        assertThat(JobFitService.cacheKey(JD, "Engineer", backend, facts)).as("an edited resume").isNotEqualTo(k);
        String k2 = JobFitService.cacheKey(JD, "Engineer", backend, facts);
        bio("{\"requireSponsorship\":\"No\",\"city\":\"Atlanta\",\"willingToRelocate\":\"No\"}");
        assertThat(JobFitService.cacheKey(JD, "Engineer", backend, service.candidateFacts())).as("a changed answer").isNotEqualTo(k2);
    }

    @Test
    void theBoardUsesTheLinkedResumeByDefault() {
        Resume linked = resume(12L, "Linked one", "{\"skills\":[\"Go\"]}", false);
        Application mine = new Application();
        mine.setId(5L);
        mine.setUser(user);
        mine.setJobDescription(JD);
        mine.setResume(linked);
        when(applications.findById(5L)).thenReturn(Optional.of(mine));
        modelSays(REPORT);
        assertThat(service.fitApplication(5L, null, true).fit().label()).isEqualTo("Linked one");

        mine.setResume(null);
        assertThat(service.fitApplication(5L, null, true).fit().label()).as("else the default").isEqualTo("Backend v3");
    }

    @Test
    void anApplicationThatIsntYoursIs404() {
        User other = new User();
        other.setId(99L);
        Application theirs = new Application();
        theirs.setUser(other);
        when(applications.findById(6L)).thenReturn(Optional.of(theirs));
        assertThatThrownBy(() -> service.fitApplication(6L, null, true)).isInstanceOf(ResponseStatusException.class);
    }
}
