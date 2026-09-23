package com.dossier.api.service.jobs;

import org.springframework.scheduling.annotation.Async;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * When the job-board read runs (Phase 13.6a): nightly at {@code dossier.jobs.fetch-cron} (UTC) when
 * {@code dossier.jobs.enabled}, or on demand from the admin page. The on-demand run is async — a
 * full read takes a few minutes — and runs even with the nightly switch off, so an admin can try it
 * on prod before turning it on.
 */
@Component
public class JobIngestScheduler {

    private final JobIngestService ingest;
    private final JobBoardProperties props;

    public JobIngestScheduler(JobIngestService ingest, JobBoardProperties props) {
        this.ingest = ingest;
        this.props = props;
    }

    @Scheduled(cron = "${dossier.jobs.fetch-cron:0 0 2 * * *}", zone = "UTC")
    public void nightly() {
        if (props.isEnabled()) ingest.run();
    }

    @Async
    public void runNow() {
        ingest.run();
    }
}
