package com.dossier.api.service.ops;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Server errors collected between two digest emails (Phase 15.1b). The same error — the same
 * logger, the same message template, the same exception class — is one {@link Kind} with a count,
 * so a failure repeating every 15 seconds is one line saying "×60", not sixty. At most
 * {@code maxKinds} kinds are kept; anything past that is still counted, so the email can say so.
 * Thread-safe: every logging thread writes here.
 */
public class ErrorDigest {

    /** What makes two errors "the same". */
    public record Kind(String logger, String template, String exception) {}

    /** One kind, with a sample of what it looked like. */
    public record Entry(Kind kind, int count, Instant first, Instant last, String sample, String trace) {}

    /** What {@link #drain()} hands over: the kinds, and the errors that didn't fit. */
    public record Batch(List<Entry> entries, int overflowErrors, int overflowKinds) {
        public boolean isEmpty() {
            return entries.isEmpty() && overflowErrors == 0;
        }

        public int totalErrors() {
            return entries.stream().mapToInt(Entry::count).sum() + overflowErrors;
        }

        public int totalKinds() {
            return entries.size() + overflowKinds;
        }
    }

    private static final int MAX_SAMPLE = 500;
    private static final int MAX_OVERFLOW_KINDS = 10_000;

    private final int maxKinds;
    private final Map<Kind, Entry> entries = new LinkedHashMap<>();
    private final Set<Kind> overflow = new HashSet<>();
    private int overflowErrors;

    public ErrorDigest(int maxKinds) {
        this.maxKinds = Math.max(1, maxKinds);
    }

    public synchronized void add(String logger, String template, String message, String exception, String trace, Instant at) {
        Kind kind = new Kind(logger, template == null ? "" : template, exception);
        Entry seen = entries.get(kind);
        if (seen != null) {
            entries.put(kind, new Entry(kind, seen.count() + 1, seen.first(), at, seen.sample(), seen.trace()));
            return;
        }
        if (entries.size() >= maxKinds) {
            // Distinct kinds past the cap are only counted, and only up to a point: a flood of
            // unique messages must not become a memory leak of its own.
            if (overflow.size() < MAX_OVERFLOW_KINDS) overflow.add(kind);
            overflowErrors++;
            return;
        }
        entries.put(kind, new Entry(kind, 1, at, at, clip(message), trace == null ? "" : trace));
    }

    /** Everything collected so far, and start over. */
    public synchronized Batch drain() {
        Batch batch = new Batch(new ArrayList<>(entries.values()), overflowErrors, overflow.size());
        entries.clear();
        overflow.clear();
        overflowErrors = 0;
        return batch;
    }

    private static String clip(String s) {
        if (s == null) return "";
        return s.length() <= MAX_SAMPLE ? s : s.substring(0, MAX_SAMPLE) + "…";
    }
}
