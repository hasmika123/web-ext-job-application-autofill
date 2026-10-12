package com.dossier.api.service.onboarding;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.repository.OnboardingDraftRepository;
import java.time.Instant;
import org.junit.jupiter.api.Test;

/** Expired setup drafts are deleted by the nightly job, and only those (R1.8). */
class OnboardingDraftPurgeJobTest {

    private static final Instant NOW = Instant.parse("2026-10-12T03:50:00Z");

    @Test
    void deletesDraftsThatExpiredBeforeNow() {
        OnboardingDraftRepository drafts = mock(OnboardingDraftRepository.class);
        when(drafts.deleteByExpiresAtBefore(NOW)).thenReturn(3);

        int n = new OnboardingDraftPurgeJob(drafts).purge(NOW);

        assertThat(n).isEqualTo(3);
        verify(drafts).deleteByExpiresAtBefore(NOW);
    }

    @Test
    void nothingExpiredIsZero() {
        OnboardingDraftRepository drafts = mock(OnboardingDraftRepository.class);
        assertThat(new OnboardingDraftPurgeJob(drafts).purge(NOW)).isZero();
    }
}
