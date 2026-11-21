package com.dossier.api.service.ent.billing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.ent.billing.UsageCounter;
import com.dossier.api.domain.ent.billing.UsageEvent;
import com.dossier.api.repository.ent.billing.UsageCounterRepository;
import com.dossier.api.repository.ent.billing.UsageEventRepository;
import java.time.Instant;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class JpaMatchingUsageLedgerTest {

    private static final Instant NOW = Instant.parse("2026-11-21T10:00:00Z");
    private final UsageEventRepository events = mock(UsageEventRepository.class);
    private final UsageCounterRepository counters = mock(UsageCounterRepository.class);
    private final JpaMatchingUsageLedger ledger = new JpaMatchingUsageLedger(events, counters);

    @Test
    void reserveIsBoundedAndWritesAReservedEvent() {
        UsageCounter counter = counter(2L);
        when(events.findByOrgIdAndIdempotencyKey(7L, "run-1")).thenReturn(Optional.empty());
        when(counters.findByOrgIdAndConsultantIdAndFeatureKeyAndPeriodKey(7L, 41L, "ai.job_matching", "M:2026-11"))
            .thenReturn(Optional.of(counter));
        when(counters.saveAndFlush(any(UsageCounter.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(events.saveAndFlush(any(UsageEvent.class))).thenAnswer(invocation -> {
            UsageEvent event = invocation.getArgument(0);
            event.setId(99L);
            return event;
        });

        MatchingUsageLedger.Reservation reservation = ledger.reserve(request("run-1", 5));

        assertThat(reservation.status()).isEqualTo(MatchingUsageLedger.ReserveStatus.RESERVED);
        assertThat(reservation.id()).isEqualTo(99L);
        assertThat(counter.getUsed()).isEqualTo(7L);
        org.mockito.ArgumentCaptor<UsageEvent> event = org.mockito.ArgumentCaptor.forClass(UsageEvent.class);
        verify(events).saveAndFlush(event.capture());
        assertThat(event.getValue().getAllowanceSnapshot()).isEqualTo(20L);
    }

    @Test
    void reserveReturnsTheExistingReservationForTheSameRunKey() {
        UsageEvent existing = event(99L, "RESERVED", 5L);
        when(events.findByOrgIdAndIdempotencyKey(7L, "run-1")).thenReturn(Optional.of(existing));

        MatchingUsageLedger.Reservation reservation = ledger.reserve(request("run-1", 5));

        assertThat(reservation.status()).isEqualTo(MatchingUsageLedger.ReserveStatus.EXISTING);
        assertThat(reservation.id()).isEqualTo(99L);
        verifyNoInteractions(counters);
    }

    @Test
    void commitReturnsUnusedReservedUnitsAndReleaseReturnsAllUnits() {
        UsageEvent committed = event(99L, "RESERVED", 5L);
        UsageCounter counter = counter(5L);
        when(events.findByOrgIdAndId(7L, 99L)).thenReturn(Optional.of(committed));
        when(counters.findByOrgIdAndConsultantIdAndFeatureKeyAndPeriodKey(7L, 41L, "ai.job_matching", "M:2026-11"))
            .thenReturn(Optional.of(counter));
        when(counters.saveAndFlush(any(UsageCounter.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(events.saveAndFlush(any(UsageEvent.class))).thenAnswer(invocation -> invocation.getArgument(0));

        ledger.commit(7L, 99L, 3, NOW.plusSeconds(1));

        assertThat(committed.getStatus()).isEqualTo("COMMITTED");
        assertThat(committed.getQuantity()).isEqualTo(3L);
        assertThat(counter.getUsed()).isEqualTo(3L);

        UsageEvent released = event(100L, "RESERVED", 5L);
        UsageCounter releaseCounter = counter(5L);
        when(events.findByOrgIdAndId(7L, 100L)).thenReturn(Optional.of(released));
        when(counters.findByOrgIdAndConsultantIdAndFeatureKeyAndPeriodKey(7L, 41L, "ai.job_matching", "M:2026-11"))
            .thenReturn(Optional.of(releaseCounter));

        ledger.release(7L, 100L, "provider error", NOW.plusSeconds(2));

        assertThat(released.getStatus()).isEqualTo("RELEASED");
        assertThat(released.getQuantity()).isZero();
        assertThat(releaseCounter.getUsed()).isZero();
        assertThat(released.getReleaseReason()).isEqualTo("PROVIDER ERROR");
    }

    private static MatchingUsageLedger.Request request(String key, long quantity) {
        return new MatchingUsageLedger.Request(
            7L,
            20L,
            41L,
            10L,
            "actor",
            "beneficiary",
            "ai.job_matching",
            "matches",
            quantity,
            20,
            "M:2026-11",
            NOW,
            NOW.plusSeconds(3600),
            key,
            "matching_run",
            20L,
            NOW,
            900
        );
    }

    private static UsageCounter counter(long used) {
        UsageCounter counter = new UsageCounter();
        counter.setOrgId(7L);
        counter.setConsultantId(41L);
        counter.setFeatureKey("ai.job_matching");
        counter.setPeriodKey("M:2026-11");
        counter.setUsed(used);
        counter.setAllowance(20L);
        return counter;
    }

    private static UsageEvent event(Long id, String status, long reserved) {
        UsageEvent event = new UsageEvent();
        event.setId(id);
        event.setOrgId(7L);
        event.setConsultantId(41L);
        event.setFeatureKey("ai.job_matching");
        event.setPeriodKey("M:2026-11");
        event.setQuantity(reserved);
        event.setReservedQuantity(reserved);
        event.setStatus(status);
        return event;
    }
}
