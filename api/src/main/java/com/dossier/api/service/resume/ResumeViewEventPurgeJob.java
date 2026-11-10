package com.dossier.api.service.resume;

import com.dossier.api.repository.ResumeViewEventRepository;
import com.dossier.api.service.ResumeBuilderSettingKeys;
import com.dossier.api.service.ResumeBuilderSettings;
import java.time.Duration;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Who viewed a resume is kept for {@code resume.views.retentionDays} (DESIGN 8.7, default 180) and no longer:
 * every night the older events are deleted. Same pattern as {@code InboxRetention}. The grants themselves
 * (and their running view counts) stay until the owner revokes them or the resume goes.
 */
@Component
public class ResumeViewEventPurgeJob {

    private static final Logger LOG = LoggerFactory.getLogger(ResumeViewEventPurgeJob.class);

    private final ResumeViewEventRepository events;
    private final ResumeBuilderSettings settings;

    public ResumeViewEventPurgeJob(ResumeViewEventRepository events, ResumeBuilderSettings settings) {
        this.events = events;
        this.settings = settings;
    }

    @Scheduled(cron = "${dossier.resume.views-purge-cron:0 45 3 * * *}", zone = "UTC")
    public void purge() {
        purge(Instant.now());
    }

    /** Delete events older than the retention window as of {@code now}; returns how many went. */
    @Transactional
    public int purge(Instant now) {
        int days = settings.getInt(ResumeBuilderSettingKeys.VIEWS_RETENTION_DAYS);
        int n = events.deleteViewedBefore(now.minus(Duration.ofDays(days)));
        if (n > 0) LOG.info("Deleted {} resume view event(s) past the {}-day retention", n, days);
        return n;
    }
}
