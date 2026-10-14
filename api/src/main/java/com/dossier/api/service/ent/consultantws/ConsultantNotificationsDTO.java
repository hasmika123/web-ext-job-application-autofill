package com.dossier.api.service.ent.consultantws;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;
import java.util.List;
import java.util.Map;

/** Wire shapes of the Consultant workspace Notifications page (docs/enterprise-v2/page-consultant-notifications.md). */
public final class ConsultantNotificationsDTO {

    private ConsultantNotificationsDTO() {}

    /**
     * A tile: the value now, the value one period earlier ({@code vs} says which: "week" or "day"), the plain difference, the percent change (null
     * when there was nothing earlier to compare with) and six points for the sparkline (oldest first).
     */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Tile(long value, long previous, long delta, Double deltaPct, List<Long> sparkline, String vs) {}

    public record Tiles(Tile unread, Tile highPriority, Tile today, Tile upcomingReminders, Tile resolvedThisWeek) {}

    /** One notification as the feed shows it. {@code status} is the effective state: UNREAD, READ, RESOLVED or SNOOZED. */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Row(
        long id,
        String category,
        String title,
        String body,
        String priority,
        String actionLabel,
        String actionHref,
        String relatedType,
        Long relatedId,
        String status,
        Instant createdAt,
        Instant readAt,
        Instant resolvedAt,
        Instant snoozedUntil
    ) {}

    public record NotificationPage(List<Row> items, int page, int size, long total, int totalPages) {}

    /** One "Notifications by Category" tile: how many were created in the chosen period and in the period before it. */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record CategoryTile(String category, long count, long previous, Double deltaPct) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Categories(String period, String vs, Instant from, Instant to, List<CategoryTile> items) {}

    /** One category's preference. {@code smsAvailable} is always false: there is no SMS channel, so {@code sms} is always false. */
    public record Pref(String category, boolean enabled, boolean email, boolean inApp, boolean sms, boolean smsAvailable, boolean critical) {}

    /**
     * {@code tabs} counts the feed per category under the current status / priority / search filters (key ALL for every category). {@code muted} is
     * true when every non-critical category is switched off.
     */
    public record Response(
        Long orgId,
        Instant generatedAt,
        String name,
        Tiles tiles,
        Map<String, Long> tabs,
        NotificationPage notifications,
        Categories categories,
        List<Pref> prefs,
        boolean muted
    ) {}

    // ---- writes ---------------------------------------------------------------------------------------------------

    public record IdsRequest(List<Long> ids) {}

    public record ReadRequest(List<Long> ids, Boolean read) {}

    public record SnoozeRequest(List<Long> ids, Instant until) {}

    /** How many rows a write actually changed (a repeated write changes none). */
    public record Changed(int changed) {}

    public record SnoozeResult(int changed, Instant until) {}

    /** A partial preference update: only the fields that are present change. */
    public record PrefRequest(Boolean enabled, Boolean email, Boolean inApp, Boolean sms) {}

    public record PrefItem(String category, Boolean enabled, Boolean email, Boolean inApp, Boolean sms) {}

    public record PrefsRequest(List<PrefItem> items) {}

    public record PrefsResult(List<Pref> prefs, boolean muted) {}

    /** The mute answer carries what the preferences were before, so the page can offer Undo by writing them back. */
    public record MuteResult(List<Pref> previous, List<Pref> prefs, boolean muted) {}
}
