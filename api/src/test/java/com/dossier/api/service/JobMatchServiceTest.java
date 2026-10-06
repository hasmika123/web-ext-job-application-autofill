package com.dossier.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.Bio;
import com.dossier.api.domain.JobMatch;
import com.dossier.api.domain.JobMatchSetting;
import com.dossier.api.domain.JobPosting;
import com.dossier.api.domain.Resume;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.JobMode;
import com.dossier.api.domain.enumeration.JobType;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.BioRepository;
import com.dossier.api.repository.JobMatchRepository;
import com.dossier.api.repository.JobMatchSettingRepository;
import com.dossier.api.repository.JobPostingRepository;
import com.dossier.api.repository.ResumeRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.service.ai.AiProvider;
import com.dossier.api.service.ai.AiResult;
import com.dossier.api.service.ai.AiTask;
import com.dossier.api.service.jobs.JobBoardProperties;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.context.ApplicationEventPublisher;

/** Nightly job matching for one user (Phase 13.6b): gates, the one call, what gets stored. */
class JobMatchServiceTest {

    private static final Instant NOW = Instant.parse("2026-09-22T04:00:00Z");
    private static final AtomicLong IDS = new AtomicLong();

    private AiProvider provider;
    private AiBudgetService budget;
    private AiMeteringService metering;
    private JobMatchSettingRepository settings;
    private JobMatchRepository matches;
    private ResumeRepository resumes;
    private JobMatchService service;
    private JobMatchSetting setting;
    private final List<JobMatch> saved = new ArrayList<>();

    @BeforeEach
    void setUp() {
        provider = mock(AiProvider.class);
        budget = mock(AiBudgetService.class);
        metering = mock(AiMeteringService.class);
        settings = mock(JobMatchSettingRepository.class);
        matches = mock(JobMatchRepository.class);
        resumes = mock(ResumeRepository.class);
        BioRepository bios = mock(BioRepository.class);
        UserRepository users = mock(UserRepository.class);

        User user = new User();
        user.setId(7L);
        user.setLogin("user");
        when(users.findById(7L)).thenReturn(Optional.of(user));
        when(users.getReferenceById(7L)).thenReturn(user);
        setting = new JobMatchSetting(7L);
        setting.setEnabled(true);
        when(settings.findById(7L)).thenReturn(Optional.of(setting));
        when(provider.isConfigured()).thenReturn(true);
        when(budget.decide("user", AiTask.JOBS)).thenReturn(decision(AiBudgetService.Verdict.OK));

        Resume r = new Resume()
            .label("Backend v3")
            .parsedJson(
                "{\"summary\":\"Backend engineer.\",\"skills\":[\"Java\",\"Kafka\"],\"experience\":[" +
                "{\"title\":\"Senior Backend Engineer\",\"company\":\"Globex\",\"startDate\":\"2019\",\"current\":true}]}"
            )
            .r2ObjectKey("")
            .archived(false)
            .defaultResume(true)
            .createdAt(NOW);
        when(resumes.findByUserId(7L)).thenReturn(List.of(r));
        Bio bio = new Bio();
        bio.setPayload("{\"city\":\"Brooklyn\",\"state\":\"NY\",\"country\":\"United States\",\"workPreference\":\"Remote\",\"requireSponsorship\":\"Yes\"}");
        when(bios.findByUserId(7L)).thenReturn(List.of(bio));
        when(matches.save(any(JobMatch.class))).thenAnswer(inv -> {
            saved.add(inv.getArgument(0));
            return inv.getArgument(0);
        });

        service = new JobMatchService(
            provider,
            budget,
            metering,
            settings,
            matches,
            mock(JobPostingRepository.class),
            resumes,
            bios,
            mock(ApplicationRepository.class),
            users,
            mock(EntitlementService.class),
            new JobBoardProperties(),
            mock(ApplicationEventPublisher.class),
            mock(ApplicationSyncService.class),
            true
        );
    }

    private static AiBudgetService.Decision decision(AiBudgetService.Verdict v) {
        return new AiBudgetService.Decision(v, "gemini-2.5-flash-lite", true, 10, 100, NOW, false);
    }

    private static JobPosting job(String title, String location, String description) {
        JobPosting j = new JobPosting() {
            private final Long id = IDS.incrementAndGet();

            @Override
            public Long getId() {
                return id;
            }
        };
        j.setTitle(title);
        j.setCompany("Acme");
        j.setLocation(location);
        j.setRemote(location.contains("Remote"));
        j.setUrl("https://jobs.example/" + j.getId());
        j.setDescriptionText(description);
        j.setPublishedAt(NOW.minus(Duration.ofHours(6)));
        return j;
    }

    private void reply(String json) throws Exception {
        when(provider.generate(eq(AiTask.JOBS), eq("gemini-2.5-flash-lite"), anyString(), eq(""))).thenReturn(
            new AiResult(json, "gemini-2.5-flash-lite", 9000, 0, 800)
        );
    }

    @Test
    void scoresTheCandidatesInOneMeteredCallAndKeepsEveryOne() throws Exception {
        List<JobPosting> pool = List.of(
            job("Backend Engineer", "Remote (US)", "About us. Requirements: 5+ years of Java and Kafka."),
            job("Senior Backend Engineer", "New York, NY", "We use Java."),
            job("Account Executive", "Remote (US)", "Sell things.") // filtered out before the model
        );
        reply("{\"scores\":[{\"id\":\"j1\",\"score\":88,\"why\":\"Java and Kafka, remote in the US\"},{\"id\":\"j2\",\"score\":41,\"why\":\"On-site\"}]}");

        JobMatchService.Outcome o = service.matchUser(7L, pool, NOW);

        assertThat(o.status()).isEqualTo("OK");
        assertThat(o.candidates()).isEqualTo(2);
        assertThat(o.shown()).isEqualTo(1);
        verify(metering).record(eq("user"), eq(AiTask.JOBS), any());
        assertThat(saved).hasSize(2);
        assertThat(saved).extracting(JobMatch::getScore).containsExactlyInAnyOrder(88, 41);
        assertThat(saved).allMatch(m -> JobMatch.NEW.equals(m.getStatus()));
        assertThat(setting.getLastStatus()).isEqualTo("OK");
        assertThat(setting.getLastMatched()).isEqualTo(1);

        ArgumentCaptor<String> prompt = ArgumentCaptor.forClass(String.class);
        verify(provider).generate(eq(AiTask.JOBS), any(), prompt.capture(), eq(""));
        assertThat(prompt.getValue())
            .contains("[j1]")
            .contains("Requirements: 5+ years") // the excerpt starts at the requirements, not the company blurb
            .doesNotContain("About us.")
            .contains("Needs visa sponsorship: yes")
            .contains("Prefers: remote work")
            .doesNotContain("Account Executive");
    }

    @Test
    void aPostingTheModelSkipsIsStillKeptAtZero() throws Exception {
        reply("{\"scores\":[{\"id\":\"j1\",\"score\":75,\"why\":\"Good\"}]}");
        service.matchUser(7L, List.of(job("Backend Engineer", "Remote (US)", "Java"), job("Backend Platform Engineer", "Remote (US)", "Kafka")), NOW);
        assertThat(saved).extracting(JobMatch::getScore).containsExactlyInAnyOrder(75, 0);
    }

    @Test
    void offRecentOrOutOfBudgetMeansNoCall() throws Exception {
        List<JobPosting> pool = List.of(job("Backend Engineer", "Remote (US)", "Java"));

        setting.setLastRunAt(NOW.minus(Duration.ofHours(3)));
        setting.setLastStatus("OK");
        assertThat(service.matchUser(7L, pool, NOW).status()).isEqualTo("RECENT");

        setting.setLastRunAt(null);
        when(budget.decide("user", AiTask.JOBS)).thenReturn(decision(AiBudgetService.Verdict.EXHAUSTED));
        assertThat(service.matchUser(7L, pool, NOW).status()).isEqualTo("BUDGET_EXHAUSTED");

        when(budget.decide("user", AiTask.JOBS)).thenReturn(decision(AiBudgetService.Verdict.PRO_REQUIRED));
        assertThat(service.matchUser(7L, pool, NOW).status()).isEqualTo("NOT_PRO");

        setting.setEnabled(false);
        assertThat(service.matchUser(7L, pool, NOW).status()).isEqualTo("OFF");

        verify(provider, never()).generate(any(), any(), anyString(), anyString());
    }

    @Test
    void noResumeOrNothingFreshMeansNoCall() throws Exception {
        assertThat(service.matchUser(7L, List.of(job("Chef", "Remote (US)", "Cooking")), NOW).status()).isEqualTo("NO_CANDIDATES");
        when(resumes.findByUserId(7L)).thenReturn(List.of());
        assertThat(service.matchUser(7L, List.of(job("Backend Engineer", "Remote (US)", "Java")), NOW).status()).isEqualTo("NO_RESUME");
        verify(provider, never()).generate(any(), any(), anyString(), anyString());
    }

    @Test
    void anUnusableReplyStoresNothing() throws Exception {
        reply("sorry, I can't");
        assertThat(service.matchUser(7L, List.of(job("Backend Engineer", "Remote (US)", "Java")), NOW).status()).isEqualTo("ERROR");
        verify(metering).record(eq("user"), eq(AiTask.JOBS), any()); // billed all the same
        assertThat(saved).isEmpty();
    }

    @Test
    void scoresAreClampedAndIdsForgiving() {
        assertThat(service.parseScores("{\"scores\":[{\"id\":\"[J3]\",\"score\":140,\"why\":\"x\"},{\"id\":\"j4\",\"score\":-5}]}"))
            .containsEntry("j3", new JobMatchService.Scored(100, "x"))
            .containsEntry("j4", new JobMatchService.Scored(0, ""));
    }

    @Test
    void theExcerptPrefersRequirements() {
        assertThat(JobMatchService.excerpt("We are Acme, founded 1999. What you bring: Java.")).isEqualTo("What you bring: Java.");
        assertThat(JobMatchService.excerpt(null)).isEqualTo("(no description)");
        assertThat(JobMatchService.excerpt("x".repeat(2000))).hasSize(JobMatchService.EXCERPT_CHARS);
    }

    @Test
    void postingFieldsMapOntoTheBoard() {
        assertThat(JobMatchService.jobType("Full-time")).isEqualTo(JobType.FULL_TIME);
        assertThat(JobMatchService.jobType("FullTime")).isEqualTo(JobType.FULL_TIME);
        assertThat(JobMatchService.jobType("Intern")).isEqualTo(JobType.INTERNSHIP);
        assertThat(JobMatchService.jobType("Contract")).isEqualTo(JobType.CONTRACT);
        assertThat(JobMatchService.jobType(null)).isNull();
        assertThat(JobMatchService.jobMode("ONSITE")).isEqualTo(JobMode.ON_SITE);
        assertThat(JobMatchService.jobMode(null)).isNull();
    }
}
