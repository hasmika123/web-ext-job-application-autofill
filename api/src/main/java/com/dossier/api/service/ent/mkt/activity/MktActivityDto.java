package com.dossier.api.service.ent.mkt.activity;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;

/** Wire shapes of the Activities page (`/api/orgs/{orgId}/mkt/activity`). E1: nothing here submits for a consultant, mails anyone or signs in as anyone. */
public final class MktActivityDto {

    private MktActivityDto() {}

    /** A person on a row (the marketer who did it, or the consultant). {@code avatarUrl} is null unless the org has one: the page draws initials. */
    public record Person(Long id, String name, String avatarUrl) {}

    /** The client a row relates to; null when the source has none. */
    public record Client(Long id, String name) {}

    /**
     * One feed line. {@code id} is "SOURCE:n" (the source table family), {@code group} the filter key (RESUME, OPPORTUNITY, ...), {@code tag} the second chip,
     * {@code manual} true for a "Log Activity" row (only those can change status).
     */
    public record Row(
        String id, String source, String type, String group, String groupLabel, String title, String subtitle, Instant at, Person actor, Person consultant, Client client,
        String tag, String status, boolean manual
    ) {}

    public record Page(List<Row> items, long total, int page, int size) {}

    /** {@code deltaPct} is null when the previous week had nothing to compare to. {@code sparkline} = the last 8 weekly buckets. */
    public record Kpi(String key, long value, Double deltaPct, List<Long> sparkline) {}

    /** One row of "Activity Summary by Type": {@code pct} is the share of the total in the chosen window (0 when the window is empty). */
    public record SummaryRow(String key, String label, long count, double pct) {}

    public record Summary(String range, String from, String to, long total, List<SummaryRow> rows) {}

    /** One line of "Upcoming Activities": an open follow-up, a scheduled interview or a planned manual entry. */
    public record Upcoming(String id, String kind, String icon, String title, String consultantName, Instant at) {}

    public record Option(Long id, String name) {}

    /** What the filter selects and the Log Activity dialog can offer (names only; capped). */
    public record Options(List<Option> consultants, List<Option> clients, List<Option> owners, List<Choice> types, List<Choice> manualTypes, List<Choice> statuses, List<Choice> summaryRanges) {}

    /** A fixed choice: {@code key} goes back as a query parameter, {@code label} is what the select shows. */
    public record Choice(String key, String label) {}

    /** The whole board in one call. {@code canLog} is false for a caller who may read but not record (no followups.manage). */
    public record View(
        Instant generatedAt, String from, String to, boolean canLog, List<Kpi> kpis, Page activities, Summary summary, List<Upcoming> upcoming, long upcomingTotal, Options options
    ) {}

    /** Filters of the board (all optional). Dates are yyyy-MM-dd, UTC, inclusive. */
    public record Query(
        String from, String to, Long consultantId, String type, String status, Long clientId, Long ownerId, String q, String sort, String summaryRange, int page, int size
    ) {}

    public record CreateRequest(
        @NotNull Long consultantId, Long clientAccountId, @NotBlank String type, @NotBlank @Size(max = 160) String title, @Size(max = 200) String detail,
        @Size(max = 100) String tags, String status, Instant occurredAt
    ) {}

    public record StatusRequest(@NotBlank String status) {}

    public record ActionResult(Row item) {}
}
