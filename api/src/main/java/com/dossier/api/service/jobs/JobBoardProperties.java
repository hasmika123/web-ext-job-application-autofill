package com.dossier.api.service.jobs;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * How job boards are read for daily job matches (Phase 13.6a), under {@code dossier.jobs.*}.
 *
 * <ul>
 *   <li><b>{@code enabled}</b> — run the nightly read at all. Off by default so dev and CI never
 *       call the job boards; prod turns it on.</li>
 *   <li><b>{@code fetch-cron}</b> — when (UTC). 02:00, so matching can run after it.</li>
 *   <li><b>{@code fresh-hours}</b> — keep postings first published within this many hours (48).</li>
 *   <li><b>{@code keep-days}</b> — delete stored postings older than this (7).</li>
 *   <li><b>{@code request-delay-ms}</b> — pause between requests: one at a time, politely.</li>
 *   <li><b>{@code disable-after-failures}</b> — switch a board off after this many failed nights
 *       in a row (a company that left the ATS, or a mistyped board).</li>
 * </ul>
 */
@ConfigurationProperties(prefix = "dossier.jobs")
public class JobBoardProperties {

    private boolean enabled = false;
    private String fetchCron = "0 0 2 * * *";
    private int freshHours = 48;
    private int keepDays = 7;
    private long requestDelayMs = 400;
    private int disableAfterFailures = 5;

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public String getFetchCron() {
        return fetchCron;
    }

    public void setFetchCron(String fetchCron) {
        this.fetchCron = fetchCron;
    }

    public int getFreshHours() {
        return freshHours;
    }

    public void setFreshHours(int freshHours) {
        this.freshHours = freshHours;
    }

    public int getKeepDays() {
        return keepDays;
    }

    public void setKeepDays(int keepDays) {
        this.keepDays = keepDays;
    }

    public long getRequestDelayMs() {
        return requestDelayMs;
    }

    public void setRequestDelayMs(long requestDelayMs) {
        this.requestDelayMs = requestDelayMs;
    }

    public int getDisableAfterFailures() {
        return disableAfterFailures;
    }

    public void setDisableAfterFailures(int disableAfterFailures) {
        this.disableAfterFailures = disableAfterFailures;
    }
}
