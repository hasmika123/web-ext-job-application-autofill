package com.dossier.api.service.jobs;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.JobPosting;
import com.dossier.api.domain.JobSource;
import com.dossier.api.repository.JobPostingRepository;
import com.dossier.api.repository.JobSourceRepository;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** The demo's searchable postings: only when the store has none of its own, fictional, and never fetched. */
class DemoJobSeederTest {

    private JobPostingRepository postings;
    private JobSourceRepository sources;
    private DemoJobSeeder seeder;
    private final List<JobPosting> saved = new ArrayList<>();
    private final List<JobSource> savedSources = new ArrayList<>();
    private final Set<String> keys = new HashSet<>();

    @BeforeEach
    void setUp() {
        postings = mock(JobPostingRepository.class);
        sources = mock(JobSourceRepository.class);
        when(sources.findOneByAtsAndBoardTokenIgnoreCase(anyString(), anyString())).thenReturn(Optional.empty());
        when(sources.save(any(JobSource.class))).thenAnswer(inv -> {
            JobSource s = inv.getArgument(0);
            savedSources.add(s);
            return s;
        });
        when(postings.findBySourceId(any())).thenReturn(List.of());
        when(postings.existsByDedupKey(anyString())).thenAnswer(inv -> keys.contains(inv.<String>getArgument(0)));
        when(postings.save(any(JobPosting.class))).thenAnswer(inv -> {
            JobPosting p = inv.getArgument(0);
            keys.add(p.getDedupKey());
            saved.add(p);
            return p;
        });
        seeder = new DemoJobSeeder(postings, sources, new JobBoardProperties(), mock(JobSearchDataService.class));
    }

    @Test
    void anEmptyStoreGetsTheDemoSetOnDisabledSources() {
        when(postings.countByPublishedAtAfter(any(Instant.class))).thenReturn(0L);

        int added = seeder.seedIfStale();

        assertThat(added).isEqualTo(saved.size()).isGreaterThan(40);
        assertThat(savedSources).hasSize(3).allSatisfy(s -> assertThat(s.isEnabled()).isFalse());
        assertThat(savedSources).extracting(JobSource::getPlatform).containsExactlyInAnyOrder("greenhouse", "lever", "ashby");
    }

    @Test
    void theSetIsFictionalVariedAndSearchable() {
        when(postings.countByPublishedAtAfter(any(Instant.class))).thenReturn(0L);
        seeder.seedIfStale();

        assertThat(saved).allSatisfy(p -> {
            assertThat(p.getUrl()).startsWith("https://jobs.example.com/");
            assertThat(p.getDescriptionText()).contains("not a real job");
            assertThat(p.getSearchText()).isEqualTo(JobSearchText.of(p.getTitle(), p.getCompany(), p.getLocation(), p.getDescriptionText()));
            assertThat(p.getPublishedAt()).isBefore(Instant.now());
        });
        assertThat(saved).extracting(JobPosting::getWorkplaceType).contains("REMOTE", "HYBRID", "ONSITE");
        assertThat(saved).extracting(JobPosting::getEmploymentType).contains("Full-time", "Contract", "Part-time", "Internship");
        assertThat(saved).extracting(JobPosting::getDedupKey).doesNotHaveDuplicates();
    }

    @Test
    void aStoreWithLivePostingsIsLeftAlone() {
        when(postings.countByPublishedAtAfter(any(Instant.class))).thenReturn(7L);

        assertThat(seeder.seedIfStale()).isZero();
        verify(postings, never()).save(any(JobPosting.class));
        verify(sources, never()).save(any(JobSource.class));
    }

    @Test
    void aStaleDemoSetIsReplacedNeverARealPosting() {
        when(postings.countByPublishedAtAfter(any(Instant.class))).thenReturn(0L);
        JobSource demo = new JobSource("greenhouse", DemoJobSeeder.TOKEN, "Demo", JobSource.ADMIN);
        when(sources.findOneByAtsAndBoardTokenIgnoreCase("greenhouse", DemoJobSeeder.TOKEN)).thenReturn(Optional.of(demo));
        JobPosting old = new JobPosting();
        when(postings.findBySourceId(any())).thenReturn(List.of(old));

        seeder.seedIfStale();

        verify(postings, org.mockito.Mockito.atLeastOnce()).deleteAll(List.of(old)); // only the demo source's own rows are looked up and removed
    }
}
