package com.dossier.api.service;

import com.dossier.api.domain.enumeration.NotificationKind;
import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneId;

/**
 * Who gets told how (E2E-U7.0): the pure rules, so they can be tested without a database. The inputs are the
 * user's switch for a kind, the kind's locks, and the clock; the answer is whether an in-app notice and an email
 * should be made now.
 *
 * <ul>
 *   <li>A <b>locked</b> kind (billing, security) is always in-app and always emailed, whatever the switches say,
 *       and quiet hours never hold it back.</li>
 *   <li>Otherwise email goes out only when the switch says {@code now} <i>and</i> it is not quiet hours in the
 *       user's own time zone. (v0 skips a held-back email; the engine, U7.1, will defer it to the end of the quiet
 *       window instead.) Email is also off everywhere when the admin kill switch is off.</li>
 *   <li>In-app follows the switch; a muted notice is still stored so it is never re-sent, just never shown.</li>
 * </ul>
 */
public final class NotificationPolicy {

    public static final String EMAIL_OFF = "off";
    public static final String EMAIL_NOW = "now";

    /** One kind's switches. */
    public record Entry(boolean inapp, String email) {
        public Entry {
            email = EMAIL_NOW.equals(email) ? EMAIL_NOW : EMAIL_OFF;
        }
    }

    /** What to make for one event. */
    public record Decision(boolean inapp, boolean email) {}

    private NotificationPolicy() {}

    /** The switches as they apply: a locked kind is forced on. */
    public static Entry effective(NotificationKind kind, Entry chosen) {
        return kind.locked() ? new Entry(true, EMAIL_NOW) : chosen;
    }

    public static Decision decide(
        NotificationKind kind,
        Entry chosen,
        boolean emailEnabled,
        Instant now,
        ZoneId tz,
        LocalTime quietStart,
        LocalTime quietEnd
    ) {
        Entry e = effective(kind, chosen);
        boolean wantsEmail = emailEnabled && EMAIL_NOW.equals(e.email());
        if (wantsEmail && !kind.urgent() && inQuietHours(now, tz, quietStart, quietEnd)) wantsEmail = false;
        return new Decision(e.inapp(), wantsEmail);
    }

    /**
     * Whether {@code now} falls in the user's quiet window. The window is read on the user's wall clock in
     * {@code tz}, so a daylight-saving jump moves it with the clock rather than by a fixed number of hours. A
     * window that crosses midnight (22:00 to 08:00) is one window; no start or end, or start equal to end, means
     * no quiet hours.
     */
    public static boolean inQuietHours(Instant now, ZoneId tz, LocalTime start, LocalTime end) {
        if (start == null || end == null || start.equals(end)) return false;
        LocalTime t = now.atZone(tz).toLocalTime();
        if (start.isBefore(end)) return !t.isBefore(start) && t.isBefore(end);
        return !t.isBefore(start) || t.isBefore(end);
    }
}
