package com.dossier.api.service.ent.consultantws;

import java.time.Instant;
import java.util.List;

/**
 * Wire shape of {@code /api/orgs/{orgId}/me-workspace/resumes}: the signed-in consultant's own resumes page, one call. Everything is
 * computed from that consultant's rows. This page has no sample blocks: resumes and their view/download/share activity are the
 * consultant's own data.
 */
public final class ConsultantResumesDTO {

    private ConsultantResumesDTO() {}

    public record Response(
        Long orgId,
        Instant generatedAt,
        Me me,
        Tiles tiles,
        List<ResumeRow> resumes,
        Strength resumeStrength,
        List<Improvement> improvements,
        List<ActivityRow> recentActivity
    ) {}

    public record Me(Long consultantId, String name) {}

    /** A count with its change since 30 days ago: {@code delta} is the absolute change, {@code deltaPct} is null when the earlier value was 0. */
    public record Tile(long value, Long previous, Long delta, Double deltaPct, List<Long> sparkline) {}

    public record PrimaryTile(long value, String title) {}

    public record Tiles(Tile totalResumes, PrimaryTile primary, Tile totalViews, Tile totalDownloads, Tile timesShared) {}

    public record ResumeRow(Long id, String title, String targetRole, boolean primary, Instant updatedAt, String visibility, int versionNo, String approvalStatus) {}

    public record Check(String key, String label, boolean done) {}

    public record Strength(int percent, boolean hasResume, List<Check> checks) {}

    /** {@code action} is "set-primary" (done on this page) or "link" (go to {@code href}). */
    public record Improvement(String key, String title, String hint, String action, String href, Long resumeId) {}

    /** kind: VIEWED, DOWNLOADED, SHARED, UPDATED. */
    public record ActivityRow(String kind, Long resumeId, String resumeTitle, int versionNo, Instant at) {}

    public record Patch(String name, String visibility) {}

    public record ActivityBody(String kind) {}

    public record Experience(String title, String employer, Integer startYear, Integer endYear) {}

    /** The structured fields a paper-style preview, a download and a print are drawn from (no stored file). */
    public record Preview(
        Long id,
        String title,
        String targetRole,
        int versionNo,
        String visibility,
        Instant updatedAt,
        String name,
        String email,
        String jobTitle,
        String headline,
        String summary,
        List<String> skills,
        List<Experience> experience
    ) {}
}
