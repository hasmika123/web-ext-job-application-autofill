package com.dossier.api.service.jobs;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.JobPosting;
import com.dossier.api.domain.JobSource;
import com.dossier.api.repository.JobPostingRepository;
import com.dossier.api.repository.JobSourceRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/** The nightly read's gates (Phase 13.6a): fresh, new, not a duplicate; failures and switch-off. */
class JobIngestServiceTest {

    private static final Instant NOW = Instant.parse("2026-09-22T02:00:00Z");

    private JobSourceRepository sources;
    private JobPostingRepository postings;
    private JobBoardClient client;
    private JobBoardProperties props;
    private JobIngestService service;
    private JobSource acme;
    private final List<JobPosting> saved = new ArrayList<>();

    @BeforeEach
    void setUp() {
        sources = mock(JobSourceRepository.class);
        postings = mock(JobPostingRepository.class);
        client = mock(JobBoardClient.class);
        props = new JobBoardProperties();
        props.setDisableAfterFailures(3);
        JobSourceService sourceService = mock(JobSourceService.class);
        acme = new JobSource("greenhouse", "acme", "Acme", JobSource.SEED);
        acme.setId(1L);
        when(sources.findAllByEnabledTrueOrderByIdAsc()).thenReturn(List.of(acme));
        when(postings.externalIdsForSource(1L)).thenReturn(List.of("known"));
        when(postings.save(any(JobPosting.class))).thenAnswer(inv -> {
            saved.add(inv.getArgument(0));
            return inv.getArgument(0);
        });
        service = new JobIngestService(sources, postings, sourceService, client, props);
    }

    private static FetchedPosting posting(String id, String title, String location, Instant published) {
        return new FetchedPosting(id, title, "Acme", location, null, null, null, null, "https://x/" + id, null, published, "Text");
    }

    @Test
    void keepsFreshNewPostingsOnce() throws Exception {
        Instant fresh = NOW.minus(Duration.ofHours(5));
        when(client.fetch(eq("greenhouse"), eq("acme"), eq("Acme"), any())).thenReturn(
            new JobBoardClient.Result(
                40,
                List.of(
                    posting("1", "Backend Engineer", "NYC", fresh),
                    posting("known", "Already stored", "NYC", fresh),
                    posting("2", "Stale", "NYC", NOW.minus(Duration.ofHours(49))),
                    posting("3", "Backend  engineer!", "nyc", fresh), // same job, second req — a duplicate
                    posting("4", "Designer", "NYC", fresh)
                )
            )
        );
        when(postings.existsByDedupKey(JobIngestService.dedupKey("Acme", "Designer", "NYC"))).thenReturn(true); // stored from another board

        JobIngestService.RunSummary s = service.doRun(NOW);

        assertThat(saved).extracting(JobPosting::getExternalId).containsExactly("1");
        assertThat(s.postingsAdded()).isEqualTo(1);
        assertThat(s.duplicatesSkipped()).isEqualTo(2);
        assertThat(s.boardsRead()).isEqualTo(1);
        assertThat(acme.getLastStatus()).isEqualTo("OK");
        assertThat(acme.getLastJobCount()).isEqualTo(40);
        assertThat(acme.getLastFetchedAt()).isNotNull();
        verify(postings).deletePublishedBefore(NOW.minus(Duration.ofDays(7)));
    }

    @Test
    void aFailingBoardIsRetriedThenSwitchedOff() throws Exception {
        when(client.fetch(anyString(), anyString(), anyString(), any())).thenThrow(new JobBoardClient.BoardException("Board not found (404)", true));

        service.doRun(NOW);
        service.doRun(NOW);
        assertThat(acme.isEnabled()).isTrue();
        assertThat(acme.getConsecutiveFailures()).isEqualTo(2);
        assertThat(acme.getLastStatus()).isEqualTo("FAILED");
        assertThat(acme.getLastError()).contains("404");

        JobIngestService.RunSummary s = service.doRun(NOW);
        assertThat(acme.isEnabled()).isFalse();
        assertThat(s.boardsSwitchedOff()).isEqualTo(1);
        verify(sources, times(3)).save(acme);
    }

    @Test
    void aGoodReadClearsTheFailureCount() throws Exception {
        acme.setConsecutiveFailures(2);
        when(client.fetch(anyString(), anyString(), anyString(), any())).thenReturn(new JobBoardClient.Result(0, List.of()));
        service.doRun(NOW);
        assertThat(acme.getConsecutiveFailures()).isZero();
        assertThat(acme.getLastError()).isNull();
    }

    @Test
    void theClientIsAskedForTheLast48Hours() throws Exception {
        when(client.fetch(anyString(), anyString(), anyString(), any())).thenReturn(new JobBoardClient.Result(0, List.of()));
        service.doRun(NOW);
        ArgumentCaptor<Instant> since = ArgumentCaptor.forClass(Instant.class);
        verify(client).fetch(eq("greenhouse"), eq("acme"), eq("Acme"), since.capture());
        assertThat(since.getValue()).isEqualTo(NOW.minus(Duration.ofHours(48)));
    }

    @Test
    void oneRunAtATime() throws Exception {
        when(client.fetch(anyString(), anyString(), anyString(), any())).thenAnswer(inv -> {
            assertThat(service.isRunning()).isTrue();
            assertThat(service.run()).isNull(); // a second run while one is going is refused
            return new JobBoardClient.Result(0, List.of());
        });
        assertThat(service.run()).isNotNull();
        assertThat(service.isRunning()).isFalse();
        assertThat(service.lastRun()).isNotNull();
    }
}
