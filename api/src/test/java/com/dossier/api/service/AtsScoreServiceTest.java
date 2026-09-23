package com.dossier.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.Resume;
import com.dossier.api.domain.User;
import com.dossier.api.repository.ResumeRepository;
import com.dossier.api.repository.UserRepository;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.server.ResponseStatusException;

/** How the ATS score is put together (Phase 13.5): structure alone, or 70/30 with a job's keywords. */
class AtsScoreServiceTest {

    private static final String JSON =
        "{\"summary\":\"Backend engineer who builds event-driven Java services for payments and logistics teams at scale.\"," +
        "\"skills\":[\"Java\",\"Kafka\",\"Spring Boot\",\"PostgreSQL\",\"AWS\"]," +
        "\"experience\":[{\"company\":\"Globex\",\"title\":\"Engineer\",\"startDate\":\"2021\",\"current\":true,\"bullets\":[" +
        "\"Built Kafka pipelines handling 1,200 requests per second\",\"Reduced latency by 40% with a new cache\"]}]," +
        "\"education\":[{\"school\":\"State U\",\"degree\":\"BS\"}]}";

    private EntitlementService entitlement;
    private JobFitService jobFit;
    private AtsScoreService service;
    private Resume resume;

    @BeforeEach
    void setUp() {
        ResumeRepository resumes = Mockito.mock(ResumeRepository.class);
        UserRepository users = Mockito.mock(UserRepository.class);
        entitlement = Mockito.mock(EntitlementService.class);
        jobFit = Mockito.mock(JobFitService.class);
        User user = new User();
        user.setId(7L);
        user.setLogin("user");
        when(users.findOneByLogin("user")).thenReturn(Optional.of(user));
        resume = new Resume().label("Backend v3").parsedJson(JSON).r2ObjectKey("resumes/7/abc.pdf").createdAt(Instant.now());
        resume.setId(11L);
        resume.setUser(user);
        when(resumes.findById(11L)).thenReturn(Optional.of(resume));
        service = new AtsScoreService(resumes, users, entitlement, jobFit);
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken("user", "x"));
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void itIsPro() {
        doThrow(new ProRequiredException(ProRequiredException.CODE_PRO_REQUIRED, "Pro")).when(entitlement).requirePro(anyString());
        assertThatThrownBy(() -> service.forResume(11L)).isInstanceOf(ProRequiredException.class);
        assertThatThrownBy(() -> service.forApplication(5L, 11L, true)).isInstanceOf(ProRequiredException.class);
        verify(jobFit, never()).fitApplication(Mockito.any(), Mockito.any(), Mockito.anyBoolean());
    }

    @Test
    void withoutAJobTheStructureIsTheScore() {
        AtsScoreService.Report r = service.forResume(11L);
        assertThat(r.total()).isEqualTo(15);
        assertThat(r.keywords()).isNull();
        int structure = r.checks().stream().filter(AtsScoreService.CheckView::passed).mapToInt(AtsScoreService.CheckView::weight).sum();
        assertThat(r.score()).isEqualTo(structure);
    }

    @Test
    void withAJobKeywordsAreThirtyPercent() {
        when(jobFit.fitApplication(5L, 11L, true)).thenReturn(
            new JobFitService.Result(
                JobFitService.Status.OK,
                new JobFitService.Fit(11L, "Backend v3", 80, "ok", List.of("Java", "Kafka", "AWS"), List.of("Terraform"), List.of()),
                true,
                10,
                100,
                Instant.now()
            )
        );
        AtsScoreService.Report r = service.forApplication(5L, 11L, true);
        int structure = r.checks().stream().filter(AtsScoreService.CheckView::passed).mapToInt(AtsScoreService.CheckView::weight).sum();
        assertThat(r.keywords().coveragePercent()).isEqualTo(75); // 3 of 4
        assertThat(r.keywords().missingTerms()).containsExactly("Terraform");
        assertThat(r.score()).isEqualTo(Math.round(structure * 0.7f + 75 * 0.3f));
    }

    @Test
    void whenTheJobCantBeReadTheStructureStandsAlone() {
        when(jobFit.fitApplication(5L, 11L, true)).thenReturn(new JobFitService.Result(JobFitService.Status.QUOTA_EXCEEDED, null, false, 100, 100, Instant.now()));
        AtsScoreService.Report r = service.forApplication(5L, 11L, true);
        assertThat(r.keywords()).isNull();
        assertThat(r.jobNote()).isEqualTo("quotaExceeded");
        int structure = r.checks().stream().filter(AtsScoreService.CheckView::passed).mapToInt(AtsScoreService.CheckView::weight).sum();
        assertThat(r.score()).isEqualTo(structure);
    }

    @Test
    void anotherUsersResumeIs404() {
        User other = new User();
        other.setId(99L);
        resume.setUser(other);
        assertThatThrownBy(() -> service.forResume(11L)).isInstanceOf(ResponseStatusException.class);
    }
}
