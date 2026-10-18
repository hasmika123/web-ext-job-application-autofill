package com.dossier.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.repository.AiCallRepository;
import java.time.Instant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** The demo accounts' daily AI cap and the nightly reset schedule (demo sandbox). */
class DemoAiCapTest {

    private static final Instant NOW = Instant.parse("2026-10-12T15:30:00Z");

    private DemoAccountService accounts;
    private AiCallRepository calls;

    @BeforeEach
    void setUp() {
        accounts = mock(DemoAccountService.class);
        when(accounts.isDemo("demo")).thenReturn(true);
        calls = mock(AiCallRepository.class);
    }

    @Test
    void aDemoAccountIsCappedOnceTodaysCallsReachTheLimit() {
        DemoAiCap cap = new DemoAiCap(calls, 3);
        Instant midnight = Instant.parse("2026-10-12T00:00:00Z");
        when(calls.countSuccessfulSince("demo", midnight)).thenReturn(2L, 3L);

        assertThat(cap.reached("demo", NOW)).isFalse();
        assertThat(cap.reached("demo", NOW)).isTrue();
        assertThat(cap.resetsAt(NOW)).isEqualTo(Instant.parse("2026-10-13T00:00:00Z"));
    }

    @Test
    void aRealUserIsNeverCappedAndNeverCounted() {
        DemoAiCap cap = new DemoAiCap(calls, 0);

        assertThat(cap.reached("jane", NOW)).isFalse();
        verify(calls, never()).countSuccessfulSince(anyString(), any());
    }

    @Test
    void zeroTurnsDemoAiOff() {
        assertThat(new DemoAiCap(calls, 0).reached("demo", NOW)).isTrue();
    }

    @Test
    void theResetScheduleIsOffWhenTheCronIsBlankAndTheResetOnlyRunsWhileTheDemoIsOn() {
        assertThat(new DemoResetScheduler(accounts, "").scheduled()).isFalse();
        assertThat(new DemoResetScheduler(accounts, " - ").scheduled()).isFalse();
        assertThat(new DemoResetScheduler(accounts, "0 0 4 * * *").scheduled()).isTrue();

        DemoResetScheduler scheduler = new DemoResetScheduler(accounts, "0 0 4 * * *");
        when(accounts.isEnabled()).thenReturn(false);
        scheduler.runReset();
        verify(accounts, never()).resetData();

        when(accounts.isEnabled()).thenReturn(true);
        scheduler.runReset();
        verify(accounts).resetData();
    }
}
