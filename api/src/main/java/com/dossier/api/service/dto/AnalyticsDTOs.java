package com.dossier.api.service.dto;

import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;

/**
 * The analytics page's one response (APP-E2E U12.1), computed from {@code application_event}
 * ("first became X"). Every number is a count of applications, never an average of invented data.
 */
public final class AnalyticsDTOs {

    private AnalyticsDTOs() {}

    /**
     * @param range days covered, ending today (already clamped)
     * @param granularity {@code week} or {@code month}: what one {@code overTime} bar is
     * @param real false when the account has never applied anywhere, so the page shows its empty state
     * @param inboxSeen whether any status change came from a reading of the user's mail; response-by-company
     *                  only means something then, so the list is empty (and the page says why) without it
     */
    public record Analytics(
        int range,
        String granularity,
        boolean real,
        AnalyticsStats stats,
        List<AnalyticsBucket> overTime,
        List<AnalyticsStatusCount> byStatus,
        boolean inboxSeen,
        List<AnalyticsCompany> responseByCompany
    ) {}

    /**
     * Applications that first reached each stage inside the range.
     *
     * @param appliedPrev applications first applied in the range just before this one (for the delta)
     * @param responseRate percent of the applications first applied in the range that have had any reply since;
     *                     null when none were applied (no rate is shown rather than 0%)
     */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record AnalyticsStats(int applied, int appliedPrev, int replies, int interviews, int offers, Integer responseRate) {}

    /** One bar: {@code start} is the first day (yyyy-MM-dd) of the week (Monday) or month, in the requested zone. */
    public record AnalyticsBucket(String start, int applied, int interviews, int offers) {}

    /** Applications touched in the range, by the status they have now. */
    public record AnalyticsStatusCount(ApplicationStatus status, String label, int count) {}

    public record AnalyticsCompany(String company, int applied, int replied) {}
}
