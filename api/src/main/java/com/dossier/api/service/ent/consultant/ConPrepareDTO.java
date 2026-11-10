package com.dossier.api.service.ent.consultant;

import java.time.Instant;
import java.util.List;

/**
 * Prepare selected openings, as the CONSULTANT sees it (docs/enterprise-v2/63). Facts about the caller's own batch only: the job's link, title and
 * company, and where each opening is in the browser. No rate, no client contact, no other consultant, no page content and no field values.
 */
public final class ConPrepareDTO {

    private ConPrepareDTO() {}

    /** One opening to open in a tab. */
    public record Job(Long matchId, String url, String title, String company) {}

    /** An opening that was asked for but is not prepared, with the reason ({@code NOT_ELIGIBLE}, {@code JOB_NOT_OPEN}, {@code NO_URL}). */
    public record Skipped(Long matchId, String reason) {}

    /** {@code POST .../con/prepare}. {@code sessionId} and {@code expiresAt} are null when nothing was eligible (no session, nothing charged). */
    public record Created(Long sessionId, Instant expiresAt, List<Job> jobs, List<Skipped> skipped, int remainingToday, int remainingMonth) {}

    /** {@code GET .../con/prepare/status}. {@code reason} is null when enabled, else {@code PLATFORM_OFF}, {@code ORG_OFF} or {@code NO_LICENSE} (the page words it calmly; the first shows nothing). */
    public record Status(boolean enabled, int maxBatch, int remainingToday, int remainingMonth, int dailyCap, int monthlyCap, String reason) {}

    /** One opening of a session. {@code applied} is true once the existing linker has recorded the consultant's own application. */
    public record Item(Long matchId, String url, String title, String company, String state, String detail, boolean applied, Instant updatedAt) {}

    /** {@code GET .../con/prepare/{sessionId}}. */
    public record Session(Long sessionId, Instant expiresAt, List<Item> items) {}

    /** {@code POST .../con/prepare}. */
    public record Request(List<Long> matchIds) {}

    /** {@code POST .../con/prepare/{sessionId}/events}. */
    public record EventRequest(Long matchId, String event, String detail) {}
}
