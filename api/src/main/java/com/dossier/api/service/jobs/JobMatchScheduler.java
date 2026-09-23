package com.dossier.api.service.jobs;

import com.dossier.api.service.JobMatchService;
import org.springframework.scheduling.annotation.Async;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * When daily job matching runs (Phase 13.6b): nightly at {@code dossier.jobs.match-cron} (UTC, after
 * the 02:00 job-board read) when {@code dossier.jobs.enabled}; on demand from the admin page; and for
 * one user the moment they switch matches on — after their switch is committed, in the background —
 * so their first list doesn't wait for the night.
 */
@Component
public class JobMatchScheduler {

    private final JobMatchService matches;
    private final JobBoardProperties props;

    public JobMatchScheduler(JobMatchService matches, JobBoardProperties props) {
        this.matches = matches;
        this.props = props;
    }

    @Scheduled(cron = "${dossier.jobs.match-cron:0 0 4 * * *}", zone = "UTC")
    public void nightly() {
        if (props.isEnabled()) matches.runAll();
    }

    @Async
    public void runNow() {
        matches.runAll();
    }

    @Async
    @TransactionalEventListener(fallbackExecution = true)
    public void onSwitchedOn(JobMatchService.MatchRequested e) {
        matches.matchOne(e.userId());
    }
}
