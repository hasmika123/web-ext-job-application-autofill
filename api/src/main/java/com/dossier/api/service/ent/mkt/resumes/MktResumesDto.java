package com.dossier.api.service.ent.mkt.resumes;

import java.time.Instant;
import java.util.List;

/** Wire shapes of {@code /api/orgs/{orgId}/mkt/resumes} (Marketing workspace, Resumes board). */
public final class MktResumesDto {

    private MktResumesDto() {}

    /** Approval chip of a row: APPROVED, PENDING ("Pending Review") or NEEDS_UPDATE. */
    public static final String APPROVED = "APPROVED";
    public static final String PENDING = "PENDING";
    public static final String NEEDS_UPDATE = "NEEDS_UPDATE";

    /** {@code deltaPct} is null when there is no earlier figure to compare with (no chip is drawn). */
    public record Kpi(String key, long value, Double deltaPct, List<Long> sparkline) {}

    public record Row(
        Long id,
        Long consultantId,
        String consultantName,
        String consultantTitle,
        String avatarUrl,
        String title,
        String targetRole,
        int version,
        Instant lastModifiedAt,
        boolean primary,
        int completeness,
        String approval,
        boolean hasFile,
        boolean canEdit
    ) {}

    /** "Recent Resume Activity": the consultant the resume belongs to, what happened, when. */
    public record Activity(Long id, Long resumeId, Long consultantId, String consultantName, String avatarUrl, String kind, String text, Instant at) {}

    public record Page(List<Kpi> kpis, List<Row> items, long total, int page, int size, List<String> skills, List<Activity> activity, boolean canApprove) {}

    public record Skill(String name, boolean primary) {}

    public record Experience(String title, String employer, int startYear, Integer endYear) {}

    /** The read-only preview (headline, summary, skills, experience); no file bytes exist. */
    public record Detail(Row row, String headline, String summary, String fileName, Integer fileSizeKb, List<Skill> skills, List<Experience> experience, List<Activity> history) {}

    /** What the list endpoint was asked. {@code updated} is 7d, 30d, 3m, 6m or all (null = all). */
    public record Query(String q, String skill, String status, String updated, String availability, String sort, int page, int size) {}
}
