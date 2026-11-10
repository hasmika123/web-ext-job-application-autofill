package com.dossier.api.service.privacy;

import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * The nightly trigger of the retention sweep (see {@link RetentionService} for what it does and why it is safe to run on two instances at once).
 * Runs at 03:50 UTC, after the existing nightly purges (inbox 03:30, tracker 03:40). A failure is logged and the next night tries again.
 */
@Component
public class RetentionJob {

    private static final Logger LOG = LoggerFactory.getLogger(RetentionJob.class);

    private final RetentionService service;

    public RetentionJob(RetentionService service) {
        this.service = service;
    }

    @Scheduled(cron = "${dossier.privacy.retention-cron:0 50 3 * * *}", zone = "UTC")
    public void scheduled() {
        try {
            service.runAll(RetentionService.TRIGGER_SCHEDULE, null, null, Instant.now());
        } catch (RuntimeException e) {
            LOG.warn("Privacy retention sweep failed", e);
        }
    }
}
