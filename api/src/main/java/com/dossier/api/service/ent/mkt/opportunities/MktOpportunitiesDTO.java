package com.dossier.api.service.ent.mkt.opportunities;

import java.time.Instant;
import java.util.List;

/** Wire shapes of {@code /api/orgs/{orgId}/mkt/opportunities}. The id of an opportunity is its {@code requirement_match} id. No sensitive PII: names, job and client labels only. */
public final class MktOpportunitiesDTO {

    private MktOpportunitiesDTO() {}

    public record Kpi(String key, long value, Double deltaPct, List<Long> sparkline) {}

    /** A person on a row. {@code avatarUrl} is null unless the organization has a photo for them (the page then draws initials). */
    public record Person(Long id, String name, String avatarUrl) {}

    /**
     * One row of the Assigned Opportunities table.
     * {@code interest}: VERY_INTERESTED / INTERESTED / OPEN / NOT_INTERESTED / NO_RESPONSE (the consultant's own answer, never the marketer's).
     * {@code resumeStatus}: UPDATED / NEEDS_UPDATE. {@code action}: the one button of the row: REVIEW / ASSIGN / FOLLOW_UP / COMPARE.
     * {@code status}: ASSIGNED / SUGGESTED (the match status).
     */
    public record Item(
        Long id,
        Person consultant,
        Long requirementId,
        String jobTitle,
        String location,
        Long clientId,
        String client,
        int matchScore,
        String interest,
        String resumeStatus,
        Person owner,
        Instant nextActionAt,
        String action,
        String status,
        Instant lastActivityAt,
        boolean stale,
        boolean ready,
        String reason,
        String state
    ) {}

    public record TopMatch(Long id, String jobTitle, String client, String location, int matchScore) {}

    public record Slice(String key, String label, long count) {}

    public record Responses(long total, int days, List<Slice> slices) {}

    public record Activity(Long id, String kind, String consultant, String text, String detail, Instant at) {}

    public record Option(Long id, String name) {}

    public record Filters(List<Option> consultants, List<Option> clients) {}

    public record ListResponse(
        List<Kpi> kpis,
        List<Item> items,
        long total,
        int page,
        int size,
        List<TopMatch> topMatches,
        Responses responses,
        List<Activity> activity,
        Filters filters
    ) {}

    /**
     * The consultant's question about the job and the marketer's answer (MKT-41). {@code awaitingAnswer}: the question is open and the marketer may answer it
     * (state NEEDS_INFO, still assigned). Null on {@link Detail} when the consultant never asked. Free text typed by people, so never part of a list row.
     */
    public record Info(String question, String answer, boolean awaitingAnswer) {}

    public record Detail(Item item, List<Item> alternatives, List<Activity> events, Info info) {}

    /** The answer of a write: the row as it is now, and a short sentence the page shows. {@code changed} is false when the request was already made a moment ago. */
    public record ActionResult(Item item, String message, boolean changed) {}

    public record Skipped(Long id, String code) {}

    public record BulkResult(int done, List<Skipped> skipped, String message) {}

    public record JobOption(Long id, String title, String client, String location) {}

    /** {@code pausedReason} is non-null for a consultant who cannot be assigned right now (shown disabled with these words). */
    public record ConsultantOption(Long id, String name, String pausedReason) {}

    public record Options(List<ConsultantOption> consultants, List<JobOption> jobs) {}

    public record CreateRequest(Long consultantId, Long requirementId) {}

    public record RequestKind(String kind) {}

    /** The marketer's answer to the consultant's question (1 to 1000 characters). */
    public record AnswerInfoRequest(String answer) {}

    /** Why the marketer takes the assignment back (1 to 200 characters, required). */
    public record WithdrawRequest(String reason) {}

    /** The other consultant (inside the caller's scope) a declined or withdrawn opportunity is offered to. */
    public record ReassignRequest(Long consultantId, Boolean confirmDuplicate, String duplicateReason) {}

    /** Optional body of an assign: the answer to a duplicate warning (409 DUPLICATE_WARNING asks for it; BLOCK cannot be answered). */
    public record AssignRequest(Boolean confirmDuplicate, String duplicateReason) {}

    public record NextActionRequest(Instant nextActionAt) {}

    public record BulkRequest(List<Long> ids) {}
}
