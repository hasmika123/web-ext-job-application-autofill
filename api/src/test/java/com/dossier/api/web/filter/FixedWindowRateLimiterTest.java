package com.dossier.api.web.filter;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/**
 * Pure unit tests for the fixed-window counter (no Spring, no DB, no clock flakiness — time
 * is injected). The full filter behaviour (429 body, headers, path matching) is exercised by
 * the deployed app; these lock the counting math the rest of it relies on.
 */
class FixedWindowRateLimiterTest {

    private static final long WINDOW = 60_000L; // 1 minute
    private static final int LIMIT = 3;

    @Test
    void allowsUpToTheLimitThenBlocks() {
        FixedWindowRateLimiter limiter = new FixedWindowRateLimiter(WINDOW, WINDOW);
        long now = 1_000_000L;

        // First LIMIT hits are allowed (retryAfter == 0).
        for (int i = 0; i < LIMIT; i++) {
            assertThat(limiter.retryAfterSeconds("ip-a", LIMIT, WINDOW, now)).isZero();
        }
        // The next hit in the same window is blocked with a positive retry-after.
        assertThat(limiter.retryAfterSeconds("ip-a", LIMIT, WINDOW, now)).isPositive();
    }

    @Test
    void resetsAfterTheWindowElapses() {
        FixedWindowRateLimiter limiter = new FixedWindowRateLimiter(WINDOW, WINDOW);
        long now = 5_000_000L;

        for (int i = 0; i < LIMIT; i++) {
            limiter.retryAfterSeconds("ip-b", LIMIT, WINDOW, now);
        }
        assertThat(limiter.retryAfterSeconds("ip-b", LIMIT, WINDOW, now)).isPositive();

        // Once the window fully elapses, the counter resets and traffic is allowed again.
        long later = now + WINDOW + 1;
        assertThat(limiter.retryAfterSeconds("ip-b", LIMIT, WINDOW, later)).isZero();
    }

    @Test
    void limitsAreTrackedPerKeyIndependently() {
        FixedWindowRateLimiter limiter = new FixedWindowRateLimiter(WINDOW, WINDOW);
        long now = 2_000_000L;

        for (int i = 0; i < LIMIT; i++) {
            limiter.retryAfterSeconds("ip-1", LIMIT, WINDOW, now);
        }
        assertThat(limiter.retryAfterSeconds("ip-1", LIMIT, WINDOW, now)).isPositive();

        // A different key (IP) has its own fresh budget.
        assertThat(limiter.retryAfterSeconds("ip-2", LIMIT, WINDOW, now)).isZero();
    }

    @Test
    void retryAfterCountsDownTowardWindowEnd() {
        FixedWindowRateLimiter limiter = new FixedWindowRateLimiter(WINDOW, WINDOW);
        long start = 10_000_000L;

        for (int i = 0; i < LIMIT; i++) {
            limiter.retryAfterSeconds("ip-c", LIMIT, WINDOW, start);
        }
        // Hit again 10s into the window → ~50s left until reset.
        long retry = limiter.retryAfterSeconds("ip-c", LIMIT, WINDOW, start + 10_000L);
        assertThat(retry).isBetween(49L, 51L);
    }

    @Test
    void staleKeysAreSweptOut() {
        // Tiny sweep interval so a later call triggers eviction of an idle key.
        FixedWindowRateLimiter limiter = new FixedWindowRateLimiter(1L, WINDOW);
        long now = 3_000_000L;

        limiter.retryAfterSeconds("old-ip", LIMIT, WINDOW, now);
        assertThat(limiter.trackedKeys()).isEqualTo(1);

        // A request well past the max window triggers a sweep that drops the idle key
        // (the new key is added, the stale one removed → still 1).
        long muchLater = now + WINDOW * 5;
        limiter.retryAfterSeconds("new-ip", LIMIT, WINDOW, muchLater);
        assertThat(limiter.trackedKeys()).isEqualTo(1);
    }
}
