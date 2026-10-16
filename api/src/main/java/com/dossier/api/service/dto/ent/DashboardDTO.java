package com.dossier.api.service.dto.ent;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonValue;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * The wire shapes of {@code GET /api/orgs/{orgId}/dashboard} (X2.4, 14-organization-administration.md section 2.2). The page
 * renders only what is here: a widget with {@code state = "ok"} carries real numbers, anything else carries none.
 */
public final class DashboardDTO {

    private DashboardDTO() {}

    /** What a widget has to show. {@code unavailable} and {@code error} never carry data; {@code empty} says why in {@code reason}. */
    public enum State {
        OK,
        EMPTY,
        UNAVAILABLE,
        ERROR;

        @JsonValue
        public String wire() {
            return name().toLowerCase(java.util.Locale.ROOT);
        }
    }

    @Schema(description = "The widgets the caller may see, in board order. A widget the caller has no permission for is absent, never greyed.")
    public record Response(Long orgId, Instant generatedAt, List<Widget> widgets) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    @Schema(description = "One widget. data is present only when state is ok; its shape is named by key (see the *Data schemas).")
    public record Widget(
        @Schema(
            description = "consultants.total, employees.active, applications.active, interviews.upcoming, placements, finance.summary, team.performance, pipeline.overview, quick.actions, alerts, activity.recent, invites.pending, subscription.summary, checklist"
        )
        String key,
        State state,
        @Schema(
            description = "Why the widget is empty or unavailable: NOT_ENABLED (its module is off or not built yet), NO_CONSULTANTS, NO_EMPLOYEES, NO_APPLICATIONS, NO_INTERVIEWS, NO_PLACEMENTS, NO_SPEND, NO_ALERTS, NO_ACTIVITY, NOTHING_PENDING, PROVIDER_FAILED"
        )
        String reason,
        @Schema(description = "The module the widget belongs to, when it is unavailable because of it")
        String module,
        @Schema(
            oneOf = { StatTile.class, TeamPerformance.class, Pipeline.class, Invites.class, Checklist.class, Activity.class, Alerts.class, QuickActions.class, SubscriptionSummary.class },
            description = "consultants.total, employees.active: StatTile. invites.pending: Invites. activity.recent: Activity. alerts: Alerts. quick.actions: QuickActions. checklist: ChecklistData. subscription.summary: SubscriptionSummary."
        )
        Object data
    ) {}

    @Schema(
        name = "StatTileData",
        description = "A count with its real change. previous is the same count 30 days ago (from seat start and end dates); deltaPct is null when previous is 0."
    )
    public record StatTile(
        long value,
        Long previous,
        Double deltaPct,
        @Schema(description = "Eight weekly points, oldest first, the last equal to value") List<Long> sparkline,
        String comparedTo,
        @Schema(description = "Named parts of the number, for example consultants: active, invited, suspended") Map<String, Long> counts,
        @Schema(description = "null or 'count' for a plain count; 'money' when value is in minor units of currency") String unit,
        String currency
    ) {
        /** A plain count tile (no unit). */
        public StatTile(long value, Long previous, Double deltaPct, List<Long> sparkline, String comparedTo, Map<String, Long> counts) {
            this(value, previous, deltaPct, sparkline, comparedTo, counts, null, null);
        }
    }

    @Schema(name = "ChecklistItem", description = "One step of the activation checklist: done is computed from the organization's real state; href is where to do it.")
    public record ChecklistItem(String key, String label, String hint, boolean done, String href) {}

    @Schema(name = "ChecklistData", description = "The activation checklist (14 section 2.4). The widget is empty (reason COMPLETE or DISMISSED) once nothing is left to show.")
    public record Checklist(int done, int total, List<ChecklistItem> items) {}

    @Schema(name = "InvitesData")
    public record Invites(long invited, long expiringSoon, long suspended) {}

    @Schema(name = "ActivityItem")
    public record ActivityItem(
        Long id,
        String action,
        String label,
        String actorLogin,
        String actorName,
        String targetType,
        String targetLogin,
        String targetName,
        Instant at,
        @Schema(description = "audit (the organization's own trail) or application (an application event)") String source,
        @Schema(description = "What it was about, for example the job title; null for audit rows") String subject
    ) {
        public ActivityItem(Long id, String action, String label, String actorLogin, String actorName, String targetType, String targetLogin, String targetName, Instant at) {
            this(id, action, label, actorLogin, actorName, targetType, targetLogin, targetName, at, "audit", null);
        }
    }

    @Schema(name = "ActivityData")
    public record Activity(List<ActivityItem> items) {}

    @Schema(name = "AlertItem")
    public record Alert(String key, String severity, String title, String message, String href, long count, Instant at) {
        public Alert(String key, String severity, String title, String message, String href, long count) {
            this(key, severity, title, message, href, count, null);
        }
    }

    @Schema(name = "TeamPerformanceData", description = "Counts per calendar month (UTC), oldest first, the last month being the current partial one")
    public record TeamPerformance(List<String> months, List<Series> series) {}

    public record Series(String key, String label, List<Long> values) {}

    @Schema(name = "PipelineData", description = "Applications by stage; total is the sum of the slices")
    public record Pipeline(long total, List<Slice> slices) {}

    public record Slice(String key, String label, long value, Double pct) {}

    @Schema(name = "AlertsData")
    public record Alerts(List<Alert> items) {}

    @Schema(name = "QuickActionItem", description = "available=false renders a 'soon' chip, never a dead link; soonModule names what it waits for")
    public record QuickAction(String key, String label, String description, String href, String permission, boolean available, String soonModule) {}

    @Schema(name = "QuickActionsData")
    public record QuickActions(List<QuickAction> items) {}

    @Schema(name = "SubscriptionSummaryData", description = "Status only until billing is connected")
    public record SubscriptionSummary(String orgStatus, Instant setupFeePaidAt) {}

    public record DismissResponse(String key, Instant until) {}
}
