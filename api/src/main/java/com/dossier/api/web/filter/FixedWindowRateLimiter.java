package com.dossier.api.web.filter;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Tiny, dependency-free fixed-window rate limiter. Keeps a per-key counter that resets once
 * its time window elapses; {@link #retryAfterSeconds} returns 0 while under the limit, or the
 * seconds until the window rolls over once the limit is hit.
 *
 * <p>Pure and clock-injected (callers pass {@code now}), so it's unit-testable without time
 * flakiness. Thread-safe: each key's window is mutated under its own monitor. Used by
 * {@link RateLimitFilter}; see that class for why per-instance state is sufficient here.
 */
class FixedWindowRateLimiter {

    private static final class Window {

        long startMs;
        int count;

        Window(long startMs) {
            this.startMs = startMs;
        }
    }

    private final ConcurrentHashMap<String, Window> windows = new ConcurrentHashMap<>();
    private final AtomicLong lastSweepMs = new AtomicLong(0);
    private final long sweepIntervalMs;
    private final long maxWindowMs;

    /**
     * @param sweepIntervalMs how often to evict stale counters
     * @param maxWindowMs the largest window any caller will use — counters idle longer than
     *     this are safe to drop (keys with different windows share one map)
     */
    FixedWindowRateLimiter(long sweepIntervalMs, long maxWindowMs) {
        this.sweepIntervalMs = sweepIntervalMs;
        this.maxWindowMs = maxWindowMs;
    }

    /**
     * Record one hit against {@code key} and report whether it's over the limit.
     *
     * @return 0 if allowed; otherwise the number of seconds the caller should wait (>= 1).
     */
    long retryAfterSeconds(String key, int limit, long windowMs, long now) {
        maybeSweep(now);
        Window w = windows.computeIfAbsent(key, k -> new Window(now));
        synchronized (w) {
            if (now - w.startMs >= windowMs) {
                w.startMs = now;
                w.count = 0;
            }
            w.count++;
            if (w.count > limit) {
                return Math.max(1, (w.startMs + windowMs - now + 999) / 1000);
            }
            return 0;
        }
    }

    /** Drop counters whose window has fully elapsed so the map can't grow unbounded. */
    private void maybeSweep(long now) {
        long last = lastSweepMs.get();
        if (now - last < sweepIntervalMs || !lastSweepMs.compareAndSet(last, now)) {
            return;
        }
        windows.values().removeIf(w -> now - w.startMs > maxWindowMs);
    }

    /** Visible for tests. */
    int trackedKeys() {
        return windows.size();
    }
}
