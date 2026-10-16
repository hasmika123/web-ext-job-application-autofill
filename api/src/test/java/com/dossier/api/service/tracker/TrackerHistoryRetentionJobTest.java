package com.dossier.api.service.tracker;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.dossier.api.repository.ApplicationEventRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.settings.AdminSettingKeys;
import com.dossier.api.service.tracker.TrackerHistoryRetentionJob.TrackerHistoryRetentionWork;
import java.lang.reflect.Method;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.LongStream;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Modifying;

/** U6.15: the job's arithmetic and its guards, without a database (the real deletes are {@code TrackerHistoryRetentionJobIT}). */
class TrackerHistoryRetentionJobTest {

    private final Instant now = Instant.parse("2026-10-15T03:00:00Z");
    private final ApplicationEventRepository events = mock(ApplicationEventRepository.class);
    private final ResumeBuilderSettings settings = mock(ResumeBuilderSettings.class);
    private final TrackerHistoryRetentionJob job = new TrackerHistoryRetentionJob(settings, new TrackerHistoryRetentionWork(events));

    @Test
    void zeroMonthsNeverReadsOrDeletesAnything() {
        when(settings.getInt(AdminSettingKeys.TRACKER_HISTORY_RETENTION_MONTHS)).thenReturn(0);

        assertThat(job.runOnce(now)).isZero();

        verifyNoInteractions(events);
    }

    @Test
    void theCutoffIsExactlyNMonthsBeforeNowInUtc() {
        when(settings.getInt(AdminSettingKeys.TRACKER_HISTORY_RETENTION_MONTHS)).thenReturn(12);
        when(events.purgeableIds(any(), any())).thenReturn(List.of());

        job.runOnce(now);

        ArgumentCaptor<Instant> cutoff = ArgumentCaptor.forClass(Instant.class);
        verify(events).purgeableIds(cutoff.capture(), any(Pageable.class));
        assertThat(cutoff.getValue()).isEqualTo(Instant.parse("2025-10-15T03:00:00Z"));
        verify(events, never()).deletePurgeable(anyCollection());
    }

    @Test
    void aBacklogIsWorkedOffInBatchesUntilAShortBatchEndsTheRun() {
        when(settings.getInt(AdminSettingKeys.TRACKER_HISTORY_RETENTION_MONTHS)).thenReturn(6);
        List<Long> full = new ArrayList<>(LongStream.rangeClosed(1, TrackerHistoryRetentionJob.BATCH).boxed().toList());
        List<Long> rest = List.of(9001L, 9002L);
        when(events.purgeableIds(any(), any())).thenReturn(full, rest);
        when(events.deletePurgeable(full)).thenReturn(full.size());
        when(events.deletePurgeable(rest)).thenReturn(rest.size());

        assertThat(job.runOnce(now)).isEqualTo(TrackerHistoryRetentionJob.BATCH + 2);
    }

    @Test
    void theOnlyBulkDeletesOfTheEventRepositoryAreErasureAndThisJob() {
        List<String> modifying = new ArrayList<>();
        for (Method m : ApplicationEventRepository.class.getMethods()) if (m.isAnnotationPresent(Modifying.class)) modifying.add(m.getName());
        assertThat(modifying).containsExactlyInAnyOrder("deleteByUser", "deletePurgeable");
    }
}
