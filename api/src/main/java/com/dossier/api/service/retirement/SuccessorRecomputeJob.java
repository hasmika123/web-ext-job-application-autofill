package com.dossier.api.service.retirement;

import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Nightly: recompute the suggestion (and keep the RETIREMENT_SWITCH quote current) of every undecided subscriber of a live retirement, and move a date later when a
 * renewal passed it (docs/subscriptions/11 section 5.2; story K10.2). Idempotent and cheap when nothing is live; a missed run only leaves a suggestion a day older
 * (the subscriber's page and the notice job recompute on demand). Safe to run on several nodes: the work is keyed per item and the quote reuse is hash-checked.
 */
@Component
public class SuccessorRecomputeJob {

    private static final Logger LOG = LoggerFactory.getLogger(SuccessorRecomputeJob.class);

    private final RetirementSuggestionService suggestions;

    public SuccessorRecomputeJob(RetirementSuggestionService suggestions) {
        this.suggestions = suggestions;
    }

    @Scheduled(cron = "0 40 3 * * *")
    public void run() {
        try {
            int n = suggestions.recomputeOpen(Instant.now());
            if (n > 0) LOG.info("retirement suggestions: {} item(s) refreshed", n);
        } catch (RuntimeException e) {
            LOG.warn("retirement suggestion run failed: {}", e.toString());
        }
    }
}
