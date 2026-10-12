package com.dossier.api.service.resume;

import com.dossier.api.domain.enumeration.ResumeKind;
import java.time.Instant;

/**
 * A resume's lifecycle - derived, never stored (R3.9, DESIGN 8.10, DECISIONS #27):
 * <ul>
 *   <li>{@code ARCHIVED} when the resume is archived;</li>
 *   <li>{@code DRAFT} when it is a built resume that was never "finished": no checkpoint version
 *       (MANUAL or NAMED) <em>and</em> no PDF has ever been stored ({@code exported_at} null);</li>
 *   <li>{@code ACTIVE} otherwise. An uploaded file has no document to finish, so it is always active.</li>
 * </ul>
 * Primary is a flag, not a status: the primary resume is {@code ACTIVE} with {@code primary = true}.
 */
public final class ResumeLifecycle {

    public static final String ARCHIVED = "ARCHIVED";
    public static final String DRAFT = "DRAFT";
    public static final String ACTIVE = "ACTIVE";

    private ResumeLifecycle() {}

    public static String of(Boolean archived, ResumeKind kind, boolean hasCheckpoint, Instant exportedAt) {
        if (Boolean.TRUE.equals(archived)) return ARCHIVED;
        if (kind == ResumeKind.BUILT && !hasCheckpoint && exportedAt == null) return DRAFT;
        return ACTIVE;
    }
}
