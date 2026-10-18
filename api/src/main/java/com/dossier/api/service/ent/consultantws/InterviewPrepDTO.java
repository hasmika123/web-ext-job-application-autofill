package com.dossier.api.service.ent.consultantws;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;
import java.util.List;

/** Wire shapes of the Consultant workspace Interview Prep page (docs/enterprise-v2/page-consultant-interview-prep.md). */
public final class InterviewPrepDTO {

    private InterviewPrepDTO() {}

    /**
     * One tile. {@code value} is null when there is nothing to average yet (never a made-up 0); {@code previous} and {@code delta} are the same
     * measure a month ago and the change (null when there is no earlier data). {@code unit} is COUNT or POINTS (percentage points).
     */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record PrepTile(Integer value, Integer previous, Integer delta, String unit, List<Integer> sparkline) {}

    public record Tiles(PrepTile upcoming, PrepTile score, PrepTile sets, PrepTile weak) {}

    public record Question(String id, String text) {}

    /** {@code action} is PRACTICE (opens the self-scored sheet) or RESEARCH (links to Interviews). {@code kind} is the history type the module records. */
    public record Module(String key, String title, String description, String kind, String action, List<String> chips, boolean chipsFromProfile, List<Question> questions) {}

    public record ChecklistItem(String key, String label, boolean checked, Instant checkedAt) {}

    /** The consultant's next scheduled interview (own row), used to title a practice session and to name the company to research. */
    public record NextInterview(long interviewId, Instant scheduledAt, String role, String company, String round) {}

    public record SessionRow(long id, String title, String kind, int score, int durationMinutes, Instant occurredAt, boolean hasNotes, int answerCount) {}

    public record Response(
        long orgId,
        Instant generatedAt,
        String name,
        Tiles tiles,
        List<Module> modules,
        List<SessionRow> history,
        List<ChecklistItem> checklist,
        NextInterview next,
        List<String> weakKinds
    ) {}

    public record AnswerRow(int position, String question, int score) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record SessionDetail(SessionRow session, String notes, List<AnswerRow> answers) {}

    public record AnswerInput(String questionId, Integer score) {}

    public record SessionRequest(String moduleKey, Integer durationMinutes, String notes, List<AnswerInput> answers) {}

    public record CheckRequest(Boolean checked) {}

    public record CheckResponse(String key, boolean checked, Instant checkedAt) {}
}
