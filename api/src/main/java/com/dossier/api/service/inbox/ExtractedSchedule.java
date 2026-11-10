package com.dossier.api.service.inbox;

import java.time.Instant;

/**
 * What {@link InterviewScheduleExtractor} read from one interview mail: an immutable value, nothing of the mail itself. {@code startUtc} is null when
 * the mail names no usable time (the person is asked to enter it; we never invent one).
 *
 * @param startUtc    the start as an instant, or null when no schedule was read
 * @param endUtc      the end, or null when the mail gives neither an end nor a duration
 * @param zoneId      the zone the time was read in (IANA id or a fixed offset such as {@code +01:00}), null with no start
 * @param kind        one of {@code Interview.KINDS}
 * @param link        the meeting link (http or https, at most 500 characters), or null
 * @param location    a physical place (at most 200 characters), or null
 * @param confidence  0..100: how sure the reading is (an ICS with a zone 95, a text with an explicit zone about 75, a guessed zone lower)
 * @param source      where the time came from
 * @param uid         the calendar UID when the mail carried one
 * @param sequence    the calendar SEQUENCE when the mail carried one
 * @param cancelled   the mail cancels the interview
 * @param rescheduled the mail moves an interview to a new time (text wording; a calendar update is told apart by UID and SEQUENCE)
 */
public record ExtractedSchedule(
    Instant startUtc,
    Instant endUtc,
    String zoneId,
    String kind,
    String link,
    String location,
    int confidence,
    Source source,
    String uid,
    Integer sequence,
    boolean cancelled,
    boolean rescheduled
) {
    public enum Source {
        ICS,
        TEXT,
        NONE,
    }

    /** True when a start time was read. */
    public boolean scheduled() {
        return startUtc != null;
    }

    static ExtractedSchedule none(String kind, boolean cancelled, boolean rescheduled, String uid, Integer sequence) {
        return new ExtractedSchedule(null, null, null, kind, null, null, 0, Source.NONE, uid, sequence, cancelled, rescheduled);
    }
}
