package com.dossier.api.service.inbox;

import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * What the inbox did to applications, counted (inbox-safety): applied, held, accepted, dismissed, undone, expired. One Micrometer counter
 * ({@code inbox.changes}, tag {@code outcome}) plus a log line with the outcome and the count only - never a mail, an address or an application.
 */
@Component
public class InboxCounters {

    private static final Logger LOG = LoggerFactory.getLogger(InboxCounters.class);

    public static final String APPLIED = "applied";
    public static final String HELD = "held";
    public static final String ACCEPTED = "accepted";
    public static final String DISMISSED = "dismissed";
    public static final String UNDONE = "undone";
    public static final String EXPIRED = "expired";

    private final MeterRegistry registry;

    public InboxCounters(MeterRegistry registry) {
        this.registry = registry;
    }

    public void count(String outcome) {
        count(outcome, 1);
    }

    public void count(String outcome, int n) {
        if (n <= 0) return;
        registry.counter("inbox.changes", "outcome", outcome).increment(n);
        LOG.info("Inbox change {}: {}", outcome, n);
    }
}
