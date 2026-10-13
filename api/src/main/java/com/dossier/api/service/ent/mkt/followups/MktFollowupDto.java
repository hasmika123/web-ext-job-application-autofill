package com.dossier.api.service.ent.mkt.followups;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;

/** Wire shapes of the Follow-ups page (`/api/orgs/{orgId}/mkt/followups`). E1: nothing here submits for a consultant or mails anyone. */
public final class MktFollowupDto {

    private MktFollowupDto() {}

    /** Which slice of follow-ups a list call returns. */
    public enum Bucket { TODAY, OVERDUE, UPCOMING, COMPLETED, WAITING }

    /** The window of the Insights card, measured back from now. */
    public enum Window {
        THIS_WEEK(7, 0), LAST_WEEK(14, 7), THIS_MONTH(30, 0);

        public final int fromDaysAgo;
        public final int toDaysAgo;

        Window(int fromDaysAgo, int toDaysAgo) {
            this.fromDaysAgo = fromDaysAgo;
            this.toDaysAgo = toDaysAgo;
        }
    }

    /** One follow-up row. {@code overdue} is derived (not COMPLETED and due before now); {@code avatarUrl} is null unless the org has one. */
    public record Row(
        Long id, String title, String detail, Long consultantId, String consultantName, String avatarUrl, Long applicationId, Long clientAccountId,
        String counterpart, String channel, String priority, String status, boolean overdue, Instant dueAt, Instant completedAt
    ) {}

    public record Page(List<Row> items, long total, int page, int size) {}

    /** {@code deltaPct} is null when there is nothing to compare against. */
    public record Kpi(String key, long value, Double deltaPct, List<Long> sparkline) {}

    /** Follow-up Insights over a window. Nulls mean "no data in this window". */
    public record Insights(String window, Double responseRatePct, Double avgResponseHours, long completed, long waiting) {}

    public record View(Instant generatedAt, List<Kpi> kpis, Page today, Page overdue, Page upcoming, Insights insights) {}

    public record CreateRequest(
        @NotNull Long consultantId, Long applicationId, Long clientAccountId, @NotBlank @Size(max = 160) String title, @Size(max = 200) String detail,
        @Size(max = 120) String counterpartLabel, String channel, String priority, String status, @NotNull Instant dueAt
    ) {}

    public record StatusRequest(@NotBlank String status) {}

    /** {@code awaitingReply} moves the item to WAITING (a call was placed and the other side owes an answer). */
    public record CallRequest(@NotBlank @Size(max = 500) String note, Boolean awaitingReply) {}

    public record ReminderRequest(@Size(max = 500) String note) {}

    /** What a write did. {@code emailed} is always false: a reminder here is a recorded request, never an outbound message. */
    public record ActionResult(Row item, String event, boolean emailed) {}
}
