package com.dossier.api.service.usage;

import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Releases personal reservations nobody settled (story K7.5): a crashed handler never holds a user's allowance for more than the reservation's TTL. */
@Component
public class UsageSweeperJob {

    private static final Logger LOG = LoggerFactory.getLogger(UsageSweeperJob.class);
    static final int BATCH = 200;

    private final UsageLedgerService ledger;

    public UsageSweeperJob(UsageLedgerService ledger) {
        this.ledger = ledger;
    }

    @Scheduled(fixedDelay = 60_000L, initialDelay = 120_000L)
    public void sweep() {
        try {
            int n = ledger.sweepExpired(Instant.now(), BATCH);
            if (n > 0) LOG.info("usage sweeper released {} expired reservation(s)", n);
        } catch (RuntimeException e) {
            LOG.warn("usage sweeper failed: {}", e.toString());
        }
    }
}
