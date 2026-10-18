package com.dossier.api.service.inbox;

/**
 * The few fields kept from a mail's calendar part ({@code text/calendar}), as plain strings so it is stored as a small JSON value: the calendar
 * file itself is read for parsing only and never kept (CLAUDE.md: attachments are never stored). {@code start}/{@code end} are either an instant
 * ({@code 2026-10-27T21:00:00Z}) or a local date-time ({@code 2026-10-27T14:00:00}) with the zone in {@code tz}; a local time with no usable {@code tz}
 * is a "floating" time, read in the mail's own zone. All text is already capped and free of control characters.
 */
public record IcsEvent(
    String method,
    String uid,
    Integer sequence,
    String start,
    String end,
    String tz,
    Integer durationMinutes,
    boolean cancelled,
    String summary,
    String location,
    String link
) {}
