package com.dossier.api.service.onboarding;

import com.dossier.api.repository.OnboardingDraftRepository;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * An unfinished setup draft is kept for {@code onboarding.draft.ttlDays} after its last save (written into
 * {@code expires_at} at save time, so a change of the setting applies to the next save) and no longer: every night
 * the expired rows are deleted. Same pattern as {@code ResumeViewEventPurgeJob}. The user's confirmed profile is
 * untouched; the dashboard card simply shows its not-started state again.
 */
@Component
public class OnboardingDraftPurgeJob {

    private static final Logger LOG = LoggerFactory.getLogger(OnboardingDraftPurgeJob.class);

    private final OnboardingDraftRepository drafts;

    public OnboardingDraftPurgeJob(OnboardingDraftRepository drafts) {
        this.drafts = drafts;
    }

    @Scheduled(cron = "${dossier.onboarding.draft-purge-cron:0 50 3 * * *}", zone = "UTC")
    public void purge() {
        purge(Instant.now());
    }

    /** Delete drafts that expired before {@code now}; returns how many went. */
    @Transactional
    public int purge(Instant now) {
        int n = drafts.deleteByExpiresAtBefore(now);
        if (n > 0) LOG.info("Deleted {} expired onboarding draft(s)", n);
        return n;
    }
}
