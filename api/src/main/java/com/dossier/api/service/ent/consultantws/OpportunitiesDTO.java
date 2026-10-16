package com.dossier.api.service.ent.consultantws;

import com.dossier.api.service.ent.consultantws.ConsultantHomeDTO.Tile;
import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/** Wire shapes of the Consultant workspace Assigned Opportunities page (docs/enterprise-v2/page-consultant-opportunities.md). */
public final class OpportunitiesDTO {

    private OpportunitiesDTO() {}

    public record Tiles(Tile total, Tile high, Tile awaiting, Tile inReview, Tile declined) {}

    /**
     * One assigned opportunity. {@code status} is NEW, AWAITING_RESPONSE, IN_REVIEW or DECLINED. {@code priority} is HIGH, MEDIUM or LOW;
     * {@code priorityDerived} says it came from the match score (no marketer input stored) and {@code dueDerived} that the due date is the
     * assignment date plus 14 days. {@code sourceUrl} (https only, or null), {@code sourceName} and {@code quickInfo} are the marketer's entries (Kiwiply holds no full posting); {@code sourceSample} marks demo stand-in rows. {@code appliedAt} is set once the consultant pressed "I applied" (null = not). {@code daysLeft} is whole days from today (UTC) to the due date; negative = overdue.
     */
    public record Row(
        long matchId,
        long requirementId,
        String title,
        List<String> skills,
        String company,
        String location,
        String workMode,
        String marketer,
        String status,
        String priority,
        boolean priorityDerived,
        LocalDate dueOn,
        boolean dueDerived,
        int daysLeft,
        int score,
        int missingSkills,
        boolean interestSent,
        Instant assignedAt,
        String sourceUrl,
        String sourceName,
        String quickInfo,
        boolean sourceSample,
        Instant appliedAt
    ) {}

    /** What the right rail's "Recommended Next Steps" are derived from. */
    public record NextSteps(int toRespond, Integer soonestDueDays, int resumeGaps, int upcomingInterviews, boolean hasMarketer) {}

    public record Response(long orgId, Instant generatedAt, String name, Tiles tiles, List<Row> rows, int page, int size, long total, String sort, NextSteps nextSteps) {}

    public record SkillFit(String skill, boolean present) {}

    public record TimelineEvent(String key, String label, Instant at) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Detail(
        Row row,
        String description,
        String employment,
        String duration,
        String experienceLevel,
        List<SkillFit> skills,
        Long rateMinMinor,
        Long rateMaxMinor,
        String rateUnit,
        String currency,
        String reason,
        String declineReason,
        String infoRequest,
        String resumeUpdateNote,
        Instant resumeUpdateRequestedAt,
        Instant interestSentAt,
        String interestNote,
        List<TimelineEvent> timeline
    ) {}

    public record InterestRequest(String note) {}

    public record InfoRequest(String message) {}

    public record DeclineRequest(String reason) {}

    public record ResumeUpdateRequest(String note) {}

    /** What a write did. {@code status} is the row's status afterwards. */
    public record Outcome(long matchId, String status, boolean interestSent, Instant interestSentAt, boolean resumeUpdateRequested) {}

    /** What "I applied" did: the pipeline state afterwards (APPLIED) and when. */
    public record Applied(long matchId, String state, Instant appliedAt) {}
}
