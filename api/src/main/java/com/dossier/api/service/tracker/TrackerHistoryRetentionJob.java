package com.dossier.api.service.tracker;

import com.dossier.api.repository.ApplicationEventRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.settings.AdminSettingKeys;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * How long the personal tracker keeps an application's history (docs/change-audit/README.md section 4.4, U6.15). Every night, when
 * {@code tracker.history.retention_months} is above 0, the {@code application_event} rows older than that many months are deleted, EXCEPT the newest row
 * of every application, so an application never loses its last known "who and when". At 0 (the default: "for the life of the record") nothing is touched.
 * The application's own {@code created_by_*} / {@code updated_by_*} columns are never read or written here.
 *
 * <p>This job and account erasure are the only deleters of {@code application_event}: the two repository methods it uses are named for it and no service
 * calls them. Each batch commits on its own, so a long backlog is worked off over a few nights without a long transaction; re-running is a no-op. It
 * writes no audit row (the personal tracker has no organization trail); it logs a count. Plain {@code @Scheduled} like the other nightly jobs: there is no
 * distributed-lock library in this codebase, and a second concurrent run only deletes rows that are already gone.
 */
@Component
public class TrackerHistoryRetentionJob {

    private static final Logger LOG = LoggerFactory.getLogger(TrackerHistoryRetentionJob.class);
    static final int BATCH = 500;
    static final int MAX_BATCHES = 200;

    private final ResumeBuilderSettings settings;
    private final TrackerHistoryRetentionWork work;

    public TrackerHistoryRetentionJob(ResumeBuilderSettings settings, TrackerHistoryRetentionWork work) {
        this.settings = settings;
        this.work = work;
    }

    @Scheduled(cron = "${dossier.tracker.history-retention-cron:0 40 3 * * *}", zone = "UTC")
    public void scheduled() {
        try {
            int n = runOnce(Instant.now());
            if (n > 0) LOG.info("Purged {} application history row(s) past the retention window", n);
        } catch (RuntimeException e) {
            LOG.warn("Tracker history retention run failed", e); // the next night retries; nothing here is time critical
        }
    }

    /** One pass; returns how many history rows were deleted as of {@code now}. */
    public int runOnce(Instant now) {
        int months = settings.getInt(AdminSettingKeys.TRACKER_HISTORY_RETENTION_MONTHS);
        if (months <= 0) return 0; // 0 = for the life of the application
        Instant cutoff = now.atZone(ZoneOffset.UTC).minusMonths(months).toInstant();
        int total = 0;
        for (int i = 0; i < MAX_BATCHES; i++) {
            int n = work.purgeBatch(cutoff);
            total += n;
            if (n < BATCH) break;
        }
        return total;
    }

    /** The transactional step, split out so the proxy applies to it. */
    @Component
    public static class TrackerHistoryRetentionWork {

        private final ApplicationEventRepository events;

        public TrackerHistoryRetentionWork(ApplicationEventRepository events) {
            this.events = events;
        }

        /** Deletes up to one page of the purgeable events (never the newest of an application); returns how many went. */
        @Transactional
        public int purgeBatch(Instant cutoff) {
            List<Long> ids = events.purgeableIds(cutoff, PageRequest.of(0, BATCH));
            return ids.isEmpty() ? 0 : events.deletePurgeable(ids);
        }
    }
}
