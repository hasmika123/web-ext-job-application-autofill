package com.dossier.api.service.billing.personal;

import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Housekeeping of confirmed personal changes (story K5.4): retry the Stripe side of a change that failed (same idempotency keys, bounded by
 * {@code billing.change.retry_max_attempts}), settle scheduled removals and decreases whose date has arrived, and expire stale open quotes. Idempotent and
 * cheap when nothing is due; a missed run only delays a change. Webhook events and the period-end reminder remain the primary drivers of the mirror.
 */
@Component
public class SubscriptionChangeJob {

    private static final Logger LOG = LoggerFactory.getLogger(SubscriptionChangeJob.class);

    private final SubscriptionChangeApplier applier;
    private final SubscriptionChangeService changes;
    private final PersonalQuoteService quotes;

    public SubscriptionChangeJob(SubscriptionChangeApplier applier, SubscriptionChangeService changes, PersonalQuoteService quotes) {
        this.applier = applier;
        this.changes = changes;
        this.quotes = quotes;
    }

    @Scheduled(fixedDelay = 300_000L, initialDelay = 420_000L)
    public void run() {
        try {
            int retried = applier.retryFailed();
            int settled = changes.settleDue(Instant.now());
            int expired = quotes.expireOpenQuotes();
            if (retried + settled + expired > 0) LOG.info("subscription changes: retried {} batch(es), settled {}, expired {} quote(s)", retried, settled, expired);
        } catch (RuntimeException e) {
            LOG.warn("subscription change run failed: {}", e.toString());
        }
    }
}
