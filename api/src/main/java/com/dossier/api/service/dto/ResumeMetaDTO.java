package com.dossier.api.service.dto;

import com.dossier.api.domain.enumeration.ResumeKind;
import com.dossier.api.domain.enumeration.ResumeRole;
import java.time.Instant;
import java.util.List;

/**
 * Everything the header bar, the list card and Resume settings need to know about one resume - built
 * or uploaded - in one object (Resume Builder R3.9, DESIGN 8.6, 8.9, 9.7, 9.11).
 *
 * <p>One source of truth per field: {@code name} is {@code resume.label}, {@code target} is
 * {@code resume.target}, {@code primary} is {@code resume.is_default} (the extension's default
 * resume). {@code visibility} and {@code recruiterSharing} carry their off/private values until
 * access control (R3.11) fills them; {@code pdf} is the async PDF pipeline's live status (R3.7).
 */
public record ResumeMetaDTO(
    Long id,
    String name,
    ResumeKind kind,
    Source source,
    String target,
    List<String> tags,
    boolean primary,
    boolean starred,
    boolean archived,
    /** ARCHIVED | DRAFT | ACTIVE (derived, DESIGN 8.10). */
    String lifecycle,
    ResumeRole role,
    String templateId,
    Instant createdAt,
    ResumeActorDTO createdBy,
    Instant updatedAt,
    ResumeActorDTO updatedBy,
    Instant lastExportedAt,
    Integer score,
    Pdf pdf,
    boolean shareWithOrg,
    Lineage lineage,
    Visibility visibility,
    RecruiterSharing recruiterSharing,
    VersionInfo version
) {
    /** {@code kind} UPLOADED|BUILT; {@code origin} how a built document began (PROFILE|UPLOAD|COPY|TAILOR|IMPORT), null for uploads. */
    public record Source(String kind, String origin, TailoredFrom tailoredFrom, String madeBy, boolean approvalRequired, Instant approvedAt) {}

    public record TailoredFrom(Long resumeId, String label, Job job) {}

    public record Job(String title, String company) {}

    /** {@code masterId} is the resume itself for a master; {@code masterChanged} is true when the master moved on since the copy. */
    public record Lineage(Long masterId, String masterName, boolean masterChanged, int children) {}

    /** {@code mode}: PRIVATE | ORG | PEOPLE (derived: people with a grant, else org when shared and paired at FULL, else private). */
    public record Visibility(String mode, String orgPaired, String orgScope, boolean shareWithOrg, int people) {}

    public record RecruiterSharing(boolean on, int links, int views) {}

    public record VersionInfo(int current, LatestVersion latest) {}

    public record LatestVersion(String name, Instant createdAt, String kind) {}

    /** {@code status}: NONE | PENDING | RUNNING | READY | FAILED | STALE (the same object the async PDF pipeline reports). */
    public record Pdf(String status, String hash, Instant generatedAt, int attempts, String error) {}
}
