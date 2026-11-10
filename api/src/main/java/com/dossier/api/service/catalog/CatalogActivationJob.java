package com.dossier.api.service.catalog;

import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Lets the clock catch up with the catalog: a price published with a future effective date goes live, and a price whose end date has passed stops
 * being active ({@link CatalogService#activateDue}). Idempotent and cheap (two indexed reads when nothing is due), so a missed run only delays a change.
 */
@Component
public class CatalogActivationJob {

    private static final Logger LOG = LoggerFactory.getLogger(CatalogActivationJob.class);

    private final CatalogService catalog;

    public CatalogActivationJob(CatalogService catalog) {
        this.catalog = catalog;
    }

    @Scheduled(fixedDelay = 300_000L, initialDelay = 600_000L)
    public void run() {
        try {
            int changed = catalog.activateDue(Instant.now());
            if (changed > 0) LOG.info("catalog: {} price row(s) changed state on schedule", changed);
        } catch (RuntimeException e) {
            LOG.warn("catalog activation run failed: {}", e.toString());
        }
    }
}
