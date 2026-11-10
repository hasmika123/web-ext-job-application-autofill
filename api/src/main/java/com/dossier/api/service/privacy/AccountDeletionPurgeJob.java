package com.dossier.api.service.privacy;

import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Every few minutes, erases the accounts whose undo window has passed (see {@link AccountDeletionRequestService#purgeDue}). */
@Component
public class AccountDeletionPurgeJob {

    private static final Logger LOG = LoggerFactory.getLogger(AccountDeletionPurgeJob.class);

    private final AccountDeletionRequestService requests;

    public AccountDeletionPurgeJob(AccountDeletionRequestService requests) {
        this.requests = requests;
    }

    @Scheduled(fixedDelayString = "${dossier.privacy.deletion-purge-ms:300000}", initialDelayString = "${dossier.privacy.deletion-purge-initial-ms:120000}")
    public void scheduled() {
        try {
            int n = requests.purgeDue(Instant.now());
            if (n > 0) LOG.info("Erased {} account(s) whose undo window had passed", n);
        } catch (RuntimeException e) {
            LOG.warn("Scheduled account erasure sweep failed", e);
        }
    }
}
