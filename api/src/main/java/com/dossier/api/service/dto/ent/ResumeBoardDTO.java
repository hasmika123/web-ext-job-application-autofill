package com.dossier.api.service.dto.ent;

import java.time.Instant;
import java.util.List;

/**
 * The wire shapes of the Resumes board (/api/orgs/{orgId}/resumes). Metadata only: there is no file store, so a resume is a record with the
 * structured fields the preview and the exports are drawn from. No phone, date of birth, address or document number exists in any of these.
 */
public final class ResumeBoardDTO {

    private ResumeBoardDTO() {}

    public record PersonRef(Long memberId, String name) {}

    /** The consultant a resume belongs to (directory facts only). */
    public record ConsultantRef(Long id, String name, String initials, String email, String jobTitle, String location, String workMode, String availability, String status) {}

    public record Row(
        Long id,
        ConsultantRef consultant,
        String name,
        String fileName,
        String targetRole,
        int version,
        boolean primary,
        String visibility,
        String approvalStatus,
        Instant createdAt,
        Instant updatedAt,
        PersonRef owner,
        Integer fileSizeKb,
        Long resumeId
    ) {}

    public record Page(List<Row> items, int page, int size, long total, boolean hasNext) {}

    /**
     * One KPI tile. {@code previous} (and so the deltas) is null when the history to rebuild it does not exist; {@code series} is eight weekly points
     * oldest to newest, always rebuilt from the rows.
     */
    public record Tile(long value, Long previous, Long delta, Double deltaPercent, List<Long> series) {
        public static Tile of(long value, Long previous, List<Long> series) {
            if (previous == null) return new Tile(value, null, null, null, series);
            long d = value - previous;
            Double pct = previous == 0 ? null : Math.round(1000.0 * d / previous) / 10.0;
            return new Tile(value, previous, d, pct, series);
        }
    }

    public record Counts(Instant asOf, String scope, Tile total, Tile primary, Tile needsApproval, Tile updatedThisWeek) {}

    public record Experience(String title, String employer, Integer startYear, Integer endYear) {}

    /** What the preview paper and the exports are rendered from. */
    public record Preview(String headline, String summary, List<String> skills, List<Experience> experience) {}

    /** What the caller may do with this one resume (the drawer draws exactly these; the server enforces them again on every call). */
    public record Actions(boolean setPrimary, boolean setVisibility, boolean decide, boolean export) {}

    public record Detail(Row row, Preview preview, Actions actions) {}

    public record Option(String value, String label) {}

    public record FilterOptions(List<Option> departments, List<Option> owners) {}

    public record ConsultantOption(Long id, String name, String email) {}

    // ---- requests ------------------------------------------------------------------------------------------------------------

    public record ExperienceInput(String title, String employer, Integer startYear, Integer endYear) {}

    public record CreateRequest(
        Long consultantId,
        String name,
        String fileName,
        String targetRole,
        String headline,
        String summary,
        String visibility,
        List<ExperienceInput> experience
    ) {}

    public record PrimaryRequest(Boolean primary) {}

    public record VisibilityRequest(String visibility) {}

    /** {@code decision}: APPROVE, REJECT (a PENDING resume) or REOPEN (puts a decided resume back to PENDING: the Undo of the other two). */
    public record DecisionRequest(String decision, String note) {}

    /** {@code action}: VISIBILITY (needs {@code visibility}), APPROVE, REJECT or REOPEN. */
    public record BulkRequest(List<Long> ids, String action, String visibility) {}

    /** {@code previous} is the value to put back for an Undo (the old visibility, or the old approval status). */
    public record BulkRowResult(Long id, String outcome, String reason, String previous) {}

    public record BulkResult(int applied, int skipped, List<BulkRowResult> results) {}

    /** The answer to a primary change: the fresh detail and which resume lost the flag (so Undo can give it back). */
    public record PrimaryResult(Detail detail, Long previousPrimaryId) {}

    /** The answer to a visibility change. */
    public record VisibilityResult(Detail detail, String previous) {}

    /** The answer to a decision: the fresh detail and the status it had before. */
    public record DecisionResult(Detail detail, String previous) {}
}
