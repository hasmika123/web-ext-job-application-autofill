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

    /**
     * One resume of the page. {@code resumeId} is the Resume Builder document behind it (null for a record that has no document: the
     * builder cannot open it); {@code awaitingMyApproval} is true while a resume a marketer made or edited for the consultant waits for them;
     * {@code updatedBy} is who last changed it (a display name, "Sarah Chen (marketer)" for a marketer), null when nobody is known to have.
     */
    public record ResumeRow(
        Long id,
        String title,
        String targetRole,
        boolean primary,
        Instant updatedAt,
        String visibility,
        int versionNo,
        String approvalStatus,
        Long resumeId,
        boolean awaitingMyApproval,
        String updatedBy,
        String contentHash
    ) {}

    /**
     * Body of {@code POST .../{id}/approve}: WHICH version the consultant reviewed ({@code versionNo} and {@code contentHash} of the row they were shown),
     * so an approval can never cover a version they did not see (a marketer may save again between the click and the request: 409 RESUME_CHANGED).
     */
    public record ResumeApproval(Integer versionNo, String contentHash) {}

    /** Body of {@code POST /built}: the personal builder's create (template, target, name, source: profile, scratch, upload or copy). */
    public record BuiltResumeBody(String templateId, String target, String label, com.fasterxml.jackson.databind.JsonNode source) {}

    /** What the new-resume chooser says about the consultant's profile source (counts and the headline only). */
    public record SourceProfile(int itemCount, int roles, int schools, int skills, String headline) {}

    /**
     * A resume the "copy" source can start from. {@code resumeId} is the Resume Builder resume (copy it with {@code {kind:'copy', fromResumeId}}); null for a
     * directory record with no builder document, which is copied with {@code {kind:'directory', orgResumeId: id}}.
     */
    public record SourceResume(Long id, Long resumeId, String name, java.time.Instant updatedAt) {}

    /** {@code GET .../sources}: what "Use my profile" and "Copy an existing resume" offer, read from the organization's records. */
    public record Sources(SourceProfile profile, java.util.List<SourceResume> resumes) {}

    /** The new resume: the directory row's id, the Resume Builder resume id (open it at `/w/consultant/resumes/{resumeId}`) and the row as the page lists it. */
    public record BuiltResumeCreated(Long orgResumeId, Long resumeId, ResumeRow row) {}

    /** Body of {@code POST .../{id}/request-changes}: what the marketer should change (optional, at most 200 characters). */
    public record ResumeChangeRequest(String note, Integer versionNo, String contentHash) {}

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
