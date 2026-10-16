package com.dossier.api.service.usage;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dossier.api.service.usage.AllowanceResolver.PeriodWindow;
import com.dossier.api.service.usage.UsageLedgerService.Request;
import com.dossier.api.service.usage.UsageLedgerService.Result;
import com.dossier.api.service.usage.UsageLedgerService.Status;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class UsageLedgerPersonalTest {

    private static final Instant NOW = Instant.parse("2026-10-15T12:00:00Z");
    private static final PeriodWindow WINDOW = new PeriodWindow("M:2026-10", Instant.parse("2026-10-01T00:00:00Z"), Instant.parse("2026-11-01T00:00:00Z"));

    private InMemoryLedger store;
    private UsageLedgerService ledger;

    @BeforeEach
    void setUp() {
        store = new InMemoryLedger();
        ledger = new UsageLedgerService(store, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    private static Request req(String key, long qty, long allowance) {
        return new Request(7, "anika", "ai.resume_tailoring", "default", qty, allowance, WINDOW, "tailorings", key, Duration.ofMinutes(5));
    }

    private Result reserve(Request r) {
        return store.tx(() -> ledger.reserve(r));
    }

    @Test
    void reservationsCountAtOnceAndStopAtTheAllowance() {
        assertThat(reserve(req("a", 30, 40)).used()).isEqualTo(30);
        Result second = reserve(req("b", 10, 40));
        assertThat(second.status()).isEqualTo(Status.RESERVED);
        assertThat(second.used()).isEqualTo(40);
        Result third = reserve(req("c", 1, 40));
        assertThat(third.status()).isEqualTo(Status.EXHAUSTED);
        assertThat(third.granted()).isFalse();
        assertThat(store.eventCount()).as("a refusal writes no event").isEqualTo(2);
    }

    @Test
    void twoConcurrentReservesWithOneUnitLeftYieldExactlyOneWinner() throws Exception {
        reserve(req("seed", 39, 40));
        int threads = 8;
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        CountDownLatch go = new CountDownLatch(1);
        List<Future<Result>> out = new ArrayList<>();
        for (int i = 0; i < threads; i++) {
            String key = "race-" + i;
            out.add(pool.submit(() -> {
                go.await();
                return reserve(req(key, 1, 40));
            }));
        }
        go.countDown();
        long granted = 0;
        for (Future<Result> f : out) if (f.get().granted()) granted++;
        pool.shutdown();
        assertThat(granted).isEqualTo(1);
        assertThat(store.counter(7, "ai.resume_tailoring", "default", "M:2026-10").getUsed()).isEqualTo(40);
    }

    @Test
    void theSameIdempotencyKeyIsOneRowAndAReleasedKeyIsRefused() {
        Result first = reserve(req("same", 5, 40));
        Result again = reserve(req("same", 5, 40));
        assertThat(again.status()).isEqualTo(Status.REPLAYED);
        assertThat(again.eventId()).isEqualTo(first.eventId());
        assertThat(store.eventCount()).isEqualTo(1);
        assertThat(store.counter(7, "ai.resume_tailoring", "default", "M:2026-10").getUsed()).isEqualTo(5);

        store.tx(() -> {
            ledger.release(first.eventId(), "FAILED");
            return null;
        });
        assertThatThrownBy(() -> reserve(req("same", 5, 40)))
            .isInstanceOfSatisfying(UsageLedgerException.class, e -> assertThat(e.getCode()).isEqualTo(UsageLedgerException.ALREADY_RELEASED));
        assertThat(store.counter(7, "ai.resume_tailoring", "default", "M:2026-10").getUsed()).isZero();
    }

    @Test
    void aPartialCommitGivesTheDifferenceBackAndCommittingTwiceIsANoOp() {
        Result r = reserve(req("p", 10, 40));
        store.tx(() -> {
            ledger.commit(r.eventId(), 6L);
            return null;
        });
        assertThat(store.counter(7, "ai.resume_tailoring", "default", "M:2026-10").getUsed()).isEqualTo(6);
        store.tx(() -> {
            ledger.commit(r.eventId(), null);
            return null;
        });
        assertThat(store.counter(7, "ai.resume_tailoring", "default", "M:2026-10").getUsed()).isEqualTo(6);
        assertThatThrownBy(() -> store.tx(() -> {
            ledger.release(r.eventId(), "CANCELLED");
            return null;
        })).isInstanceOfSatisfying(UsageLedgerException.class, e -> assertThat(e.getCode()).isEqualTo(UsageLedgerException.ALREADY_COMMITTED));
    }

    @Test
    void aCommitCannotExceedTheReservation() {
        Result r = reserve(req("x", 3, 40));
        assertThatThrownBy(() -> store.tx(() -> {
            ledger.commit(r.eventId(), 4L);
            return null;
        })).isInstanceOfSatisfying(UsageLedgerException.class, e -> assertThat(e.getCode()).isEqualTo(UsageLedgerException.INVALID_QUANTITY));
    }

    @Test
    void theSweeperReleasesOnlyExpiredReservations() {
        Result stale = reserve(new Request(7, "anika", "ai.resume_tailoring", "default", 4, 40, WINDOW, "t", "stale", Duration.ofMinutes(-1)));
        Result fresh = reserve(req("fresh", 2, 40));
        int n = store.tx(() -> ledger.sweepExpired(NOW, 10));
        assertThat(n).isEqualTo(1);
        assertThat(store.counter(7, "ai.resume_tailoring", "default", "M:2026-10").getUsed()).isEqualTo(2);
        assertThatThrownBy(() -> reserve(req("stale", 4, 40))).isInstanceOf(UsageLedgerException.class);
        assertThat(stale.eventId()).isNotEqualTo(fresh.eventId());
    }

    @Test
    void windowsAreSeparatePerPeriodKey() {
        reserve(req("m1", 40, 40));
        PeriodWindow next = new PeriodWindow("M:2026-11", Instant.parse("2026-11-01T00:00:00Z"), Instant.parse("2026-12-01T00:00:00Z"));
        Result r = reserve(new Request(7, "anika", "ai.resume_tailoring", "default", 1, 40, next, "t", "n1", Duration.ofMinutes(5)));
        assertThat(r.granted()).isTrue();
    }

    @Test
    void aZeroOrNegativeQuantityIsRefused() {
        assertThatThrownBy(() -> reserve(req("z", 0, 40))).isInstanceOf(UsageLedgerException.class);
    }
}
