package com.dossier.api.service.resume;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.repository.ResumeViewEventRepository;
import com.dossier.api.service.ResumeBuilderSettingKeys;
import com.dossier.api.service.ResumeBuilderSettings;
import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/** Who viewed a resume is kept for {@code resume.views.retentionDays} and then dropped (R3.11). */
class ResumeViewEventPurgeJobTest {

    private static final Instant NOW = Instant.parse("2026-10-12T03:45:00Z");

    @Test
    void deletesEventsOlderThanTheConfiguredRetention() {
        ResumeViewEventRepository events = mock(ResumeViewEventRepository.class);
        ResumeBuilderSettings settings = mock(ResumeBuilderSettings.class);
        when(settings.getInt(ResumeBuilderSettingKeys.VIEWS_RETENTION_DAYS)).thenReturn(90);
        when(events.deleteViewedBefore(any())).thenReturn(4);

        int n = new ResumeViewEventPurgeJob(events, settings).purge(NOW);

        assertThat(n).isEqualTo(4);
        ArgumentCaptor<Instant> cutoff = ArgumentCaptor.forClass(Instant.class);
        verify(events).deleteViewedBefore(cutoff.capture());
        assertThat(cutoff.getValue()).isEqualTo(NOW.minus(Duration.ofDays(90)));
    }

    @Test
    void theRetentionIsASettingNotAConstant() {
        ResumeViewEventRepository events = mock(ResumeViewEventRepository.class);
        ResumeBuilderSettings settings = mock(ResumeBuilderSettings.class);
        when(settings.getInt(ResumeBuilderSettingKeys.VIEWS_RETENTION_DAYS)).thenReturn(180).thenReturn(30);
        ResumeViewEventPurgeJob job = new ResumeViewEventPurgeJob(events, settings);
        job.purge(NOW);
        job.purge(NOW);
        ArgumentCaptor<Instant> cutoff = ArgumentCaptor.forClass(Instant.class);
        verify(events, org.mockito.Mockito.times(2)).deleteViewedBefore(cutoff.capture());
        assertThat(cutoff.getAllValues()).containsExactly(NOW.minus(Duration.ofDays(180)), NOW.minus(Duration.ofDays(30)));
    }
}
