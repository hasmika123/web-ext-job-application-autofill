package com.dossier.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.Application;
import com.dossier.api.domain.Resume;
import com.dossier.api.domain.ResumeMatch;
import com.dossier.api.domain.User;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.ResumeMatchRepository;
import com.dossier.api.repository.ResumeRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.service.AiBudgetService.Decision;
import com.dossier.api.service.AiBudgetService.Verdict;
import com.dossier.api.service.ai.AiProvider;
import com.dossier.api.service.ai.AiResult;
import com.dossier.api.service.ai.AiTask;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
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
 * Resume recommendation per job (Phase 13.2): gating, the bounded inputs, parsing the model's
 * scores, and the cache that makes a second look free. Mocks only.
 */
class ResumeMatchServiceTest {

    private static final String MODEL = "gemini-2.5-flash-lite";
    private static final Instant RESET = Instant.parse("2026-10-01T00:00:00Z");
    private static final String JD =
        "We are hiring a backend engineer to build distributed Java services on Spring Boot and Kafka, " +
        "own PostgreSQL schemas, and run production on AWS with Terraform. You will mentor two engineers " +
        "and work with product on the payments roadmap. 5+ years of backend experience required.";

    private AiProvider provider;
    private AiBudgetService budget;
    private AiMeteringService metering;
    private ResumeRepository resumes;
    private ApplicationRepository applications;
    private ResumeMatchRepository matches;
    private ResumeMatchService service;
    private User user;
    private Resume backend;
    private Resume frontend;

    @BeforeEach
    void setUp() {
        provider = Mockito.mock(AiProvider.class);
        when(provider.isConfigured()).thenReturn(true);
        budget = Mockito.mock(AiBudgetService.class);
        allow(Verdict.OK);
        metering = Mockito.mock(AiMeteringService.class);
        resumes = Mockito.mock(ResumeRepository.class);
        applications = Mockito.mock(ApplicationRepository.class);
        matches = Mockito.mock(ResumeMatchRepository.class);
        UserRepository users = Mockito.mock(UserRepository.class);
        user = new User();
        user.setId(7L);
        user.setLogin("user");
        when(users.findOneByLogin("user")).thenReturn(Optional.of(user));

        backend = resume(11L, "Backend v3", "{\"summary\":\"Java engineer\",\"skills\":[\"Java\",\"Kafka\"]}", true);
        frontend = resume(12L, "Frontend", "{\"skills\":[\"React\"]}", false);
        when(resumes.findByUserId(7L)).thenReturn(List.of(frontend, backend));

        service = new ResumeMatchService(provider, budget, metering, resumes, applications, matches, users, true);
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken("user", "x"));
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private static Resume resume(Long id, String label, String json, boolean isDefault) {
        Resume r = new Resume().label(label).parsedJson(json).archived(false).defaultResume(isDefault).createdAt(Instant.parse("2026-09-01T00:00:00Z"));
        r.setId(id);
        return r;
    }

    private void allow(Verdict v) {
        when(budget.decide(anyString(), any())).thenReturn(new Decision(v, v == Verdict.OK ? MODEL : null, true, 12, 100, RESET, false));
    }

    private void modelSays(String json) {
        when(provider.generate(eq(AiTask.MATCH), any(), anyString(), anyString())).thenReturn(new AiResult(json, MODEL, 1500, 0, 120));
    }

    // ---- gating ---------------------------------------------------------------------------

    @Test
    void itIsPro() {
        allow(Verdict.PRO_REQUIRED);
        assertThatThrownBy(() -> service.matchJob(JD, "Backend Engineer", "Acme", true)).isInstanceOf(ProRequiredException.class);
        verify(provider, never()).generate(any(), any(), anyString(), anyString());
    }

    @Test
    void consentIsRequired() {
        assertThat(service.matchJob(JD, "Backend Engineer", "Acme", false).status()).isEqualTo(ResumeMatchService.Status.CONSENT_REQUIRED);
    }

    @Test
    void aPageSummaryIsNotAJobDescription() {
        assertThat(service.matchJob("Apply now at Acme!", "Engineer", "Acme", true).status()).isEqualTo(ResumeMatchService.Status.NO_JOB_DESCRIPTION);
        verify(provider, never()).generate(any(), any(), anyString(), anyString());
    }

    @Test
    void noLiveResumesIsSaidPlainly() {
        backend.setArchived(true);
        frontend.setArchived(true);
        assertThat(service.matchJob(JD, "Engineer", "Acme", true).status()).isEqualTo(ResumeMatchService.Status.NO_RESUMES);
    }

    @Test
    void aSpentBudgetStopsANewScoreButNotACachedOne() {
        allow(Verdict.EXHAUSTED);
        assertThat(service.matchJob(JD, "Engineer", "Acme", true).status()).isEqualTo(ResumeMatchService.Status.QUOTA_EXCEEDED);

        ResumeMatch cached = new ResumeMatch();
        cached.setResultJson("{\"scores\":[{\"resumeId\":11,\"score\":82,\"why\":\"Java and Kafka match\"}]}");
        when(matches.findFirstByUserIdAndCacheKeyOrderByCreatedAtDesc(eq(7L), anyString())).thenReturn(Optional.of(cached));
        ResumeMatchService.Result r = service.matchJob(JD, "Engineer", "Acme", true);
        assertThat(r.status()).isEqualTo(ResumeMatchService.Status.OK);
        assertThat(r.cached()).isTrue();
        verify(provider, never()).generate(any(), any(), anyString(), anyString());
    }

    // ---- the call --------------------------------------------------------------------------

    @Test
    void oneCallScoresEveryResumeBestFirstAndIsCached() {
        // The default resume is listed first, so it is r1.
        modelSays("{\"scores\":[{\"id\":\"r2\",\"score\":40,\"why\":\"Frontend only\"},{\"id\":\"r1\",\"score\":86,\"why\":\"Java, Kafka, AWS\"}]}");
        ResumeMatchService.Result r = service.matchJob(JD, "Backend Engineer", "Acme", true);

        assertThat(r.status()).isEqualTo(ResumeMatchService.Status.OK);
        assertThat(r.best().label()).isEqualTo("Backend v3");
        assertThat(r.best().score()).isEqualTo(86);
        assertThat(r.scores()).extracting(ResumeMatchService.Score::resumeId).containsExactly(11L, 12L);
        verify(provider).generate(eq(AiTask.MATCH), eq(MODEL), anyString(), anyString());
        verify(metering).record(eq("user"), eq(AiTask.MATCH), any());
        ArgumentCaptor<ResumeMatch> saved = ArgumentCaptor.forClass(ResumeMatch.class);
        verify(matches).save(saved.capture());
        assertThat(saved.getValue().getResultJson()).contains("\"resumeId\":11").doesNotContain("backend engineer to build");
    }

    @Test
    void anUnusableReplyIsAnErrorButStillMetered() {
        modelSays("I think the first one is best.");
        assertThat(service.matchJob(JD, "Engineer", "Acme", true).status()).isEqualTo(ResumeMatchService.Status.ERROR);
        verify(metering).record(eq("user"), eq(AiTask.MATCH), any()); // the provider billed us anyway
        verify(matches, never()).save(any());
    }

    @Test
    void anApplicationThatIsntYoursIs404() {
        User other = new User();
        other.setId(99L);
        Application theirs = new Application();
        theirs.setId(5L);
        theirs.setUser(other);
        when(applications.findById(5L)).thenReturn(Optional.of(theirs));
        assertThatThrownBy(() -> service.matchApplication(5L, true)).isInstanceOf(ResponseStatusException.class);
        when(applications.findById(anyLong())).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.matchApplication(6L, true)).isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void anApplicationIsScoredOnItsOwnJobDescription() {
        Application mine = new Application();
        mine.setId(5L);
        mine.setUser(user);
        mine.setJobDescription(JD);
        mine.setRoleTitle("Backend Engineer");
        mine.setCompany("Acme");
        when(applications.findById(5L)).thenReturn(Optional.of(mine));
        modelSays("{\"scores\":[{\"id\":\"r1\",\"score\":90}]}");
        assertThat(service.matchApplication(5L, true).best().score()).isEqualTo(90);
    }

    // ---- inputs and outputs, pure ------------------------------------------------------

    @Test
    void scoresAreClampedDedupedAndUnknownIdsDropped() {
        Map<String, Resume> refs = new LinkedHashMap<>();
        refs.put("r1", backend);
        refs.put("r2", frontend);
        List<ResumeMatchService.Score> s = service.parseScores(
            "```json\n{\"scores\":[{\"id\":\"r1\",\"score\":140},{\"id\":\"r1\",\"score\":10},{\"id\":\"r9\",\"score\":99},{\"id\":\"r2\",\"score\":-5}]}",
            refs
        );
        assertThat(s).extracting(ResumeMatchService.Score::score).containsExactly(100, 0);
        assertThat(service.parseScores("no json here", refs)).isEmpty();
    }

    @Test
    void theCacheKeyFollowsTheContent() {
        List<Resume> both = List.of(backend, frontend);
        String k = ResumeMatchService.cacheKey(JD, "Engineer", both);
        assertThat(ResumeMatchService.cacheKey(JD, "Engineer", List.of(frontend, backend))).as("order doesn't matter").isEqualTo(k);
        frontend.setParsedJson("{\"skills\":[\"React\",\"TypeScript\"]}");
        assertThat(ResumeMatchService.cacheKey(JD, "Engineer", both)).as("an edited resume misses the cache").isNotEqualTo(k);
        assertThat(ResumeMatchService.cacheKey(JD + " Remote.", "Engineer", both)).as("another posting misses too").isNotEqualTo(k);
    }

    @Test
    void inputsAreBounded() {
        List<String> skills = new ArrayList<>();
        for (int i = 0; i < 80; i++) skills.add("\"Skill" + i + "\"");
        StringBuilder exp = new StringBuilder();
        for (int i = 0; i < 12; i++) exp.append(i == 0 ? "" : ",").append("{\"title\":\"Role").append(i).append("\",\"company\":\"Co\",\"bullets\":[\"").append("x".repeat(400)).append("\"]}");
        Resume big = resume(20L, "Big", "{\"skills\":[" + String.join(",", skills) + "],\"experience\":[" + exp + "]}", false);
        String d = service.digest(big);
        assertThat(d).contains("Skill39").doesNotContain("Skill40");
        assertThat(d).contains("Role5").doesNotContain("Role6");
        assertThat(d.length()).isLessThan(2500);
        assertThat(ResumeMatchService.cleanJobDescription("a ".repeat(10_000)).length()).isEqualTo(ResumeMatchService.MAX_JD_CHARS);

        List<Resume> many = new ArrayList<>();
        for (long i = 1; i <= 15; i++) many.add(resume(100 + i, "R" + i, "{}", false));
        when(resumes.findByUserId(7L)).thenReturn(many);
        assertThat(service.liveResumes(user)).hasSize(ResumeMatchService.MAX_RESUMES);
    }
}
