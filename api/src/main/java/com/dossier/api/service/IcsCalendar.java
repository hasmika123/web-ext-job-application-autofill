package com.dossier.api.service;

import com.dossier.api.domain.Interview;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.zone.ZoneOffsetTransition;
import java.time.zone.ZoneOffsetTransitionRule;
import java.time.zone.ZoneRules;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;

/**
 * An interview as an iCalendar file (RFC 5545), for "Add to calendar" (APP-E2E U6.4). Pure: no I/O, no
 * clock but the {@code now} it is handed, so the output is testable byte for byte.
 *
 * <p>The event is written in the interview's own zone ({@code DTSTART;TZID=America/New_York:...}) with a
 * {@code VTIMEZONE} built from the JDK's zone rules (yearly rules as {@code RRULE}), so every calendar app
 * shows the wall-clock time the user typed, daylight saving included. A missing zone, or a zone with a
 * zero offset, is written in UTC ({@code ...Z}); a missing zone also says so in the description. Lines are
 * CRLF terminated and folded at 75 octets without splitting a character; text is escaped.
 */
public final class IcsCalendar {

    private static final DateTimeFormatter LOCAL = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss", Locale.ROOT);
    private static final DateTimeFormatter UTC = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'", Locale.ROOT).withZone(ZoneOffset.UTC);
    private static final String[] DAYS = { "MO", "TU", "WE", "TH", "FR", "SA", "SU" };

    private IcsCalendar() {}

    /**
     * @param company, roleTitle     name the application (the summary reads "Interview: Role at Company")
     * @param defaultMinutes         length of the event when the interview has no end time
     * @param now                    the DTSTAMP
     */
    public static String interview(Interview i, String company, String roleTitle, int defaultMinutes, Instant now) {
        ZoneId zone = zoneOf(i.getTz());
        // A bare offset ("+05:30") has no zone name to put in a TZID, and UTC needs none: both are written in UTC.
        boolean zoned =
            zone != null &&
            !(zone instanceof ZoneOffset) &&
            !(zone.getRules().isFixedOffset() && zone.getRules().getOffset(i.getStartsAt()).getTotalSeconds() == 0);
        Instant end = i.getEndsAt() != null ? i.getEndsAt() : i.getStartsAt().plus(Duration.ofMinutes(defaultMinutes));

        List<String> lines = new ArrayList<>();
        lines.add("BEGIN:VCALENDAR");
        lines.add("VERSION:2.0");
        lines.add("PRODID:-//Kiwiply//Dossier Interviews//EN");
        lines.add("CALSCALE:GREGORIAN");
        lines.add("METHOD:PUBLISH");
        if (zoned) lines.addAll(vtimezone(zone, i.getStartsAt()));

        lines.add("BEGIN:VEVENT");
        lines.add("UID:interview-" + i.getId() + "@kiwiply.com");
        lines.add("DTSTAMP:" + UTC.format(now));
        if (zoned) {
            lines.add("DTSTART;TZID=" + zone.getId() + ":" + LOCAL.format(LocalDateTime.ofInstant(i.getStartsAt(), zone)));
            lines.add("DTEND;TZID=" + zone.getId() + ":" + LOCAL.format(LocalDateTime.ofInstant(end, zone)));
        } else {
            lines.add("DTSTART:" + UTC.format(i.getStartsAt()));
            lines.add("DTEND:" + UTC.format(end));
        }
        lines.add("SUMMARY:" + escape(summary(company, roleTitle)));
        if (notBlank(i.getLocation())) {
            lines.add("LOCATION:" + escape(i.getLocation()));
            String loc = i.getLocation().trim();
            if (loc.startsWith("http://") || loc.startsWith("https://")) lines.add("URL:" + loc.replace("\r", "").replace("\n", ""));
        }
        lines.add("DESCRIPTION:" + escape(description(i, zone == null)));
        lines.add("STATUS:CONFIRMED");
        lines.add("END:VEVENT");
        lines.add("END:VCALENDAR");

        StringBuilder out = new StringBuilder();
        for (String l : lines) fold(out, l);
        return out.toString();
    }

    static String summary(String company, String roleTitle) {
        boolean hasRole = notBlank(roleTitle);
        boolean hasCompany = notBlank(company);
        if (hasRole && hasCompany) return "Interview: " + roleTitle.trim() + " at " + company.trim();
        if (hasCompany) return "Interview at " + company.trim();
        if (hasRole) return "Interview: " + roleTitle.trim();
        return "Interview";
    }

    private static String description(Interview i, boolean noZone) {
        List<String> parts = new ArrayList<>();
        parts.add(ApplicationDerivations.interviewLabel(i.getKind()));
        if (notBlank(i.getInterviewer())) parts.add("Interviewer: " + i.getInterviewer().trim());
        if (notBlank(i.getNotes())) parts.add("Notes: " + i.getNotes().trim());
        if (noZone) parts.add("The time zone was not set, so this time is in UTC.");
        parts.add("From your Kiwiply tracker.");
        return String.join("\n", parts);
    }

    // ---- time zones -----------------------------------------------------------------------------

    /** The zone named, or null when none (or an unknown one) was set. */
    static ZoneId zoneOf(String tz) {
        if (tz == null || tz.isBlank()) return null;
        try {
            return ZoneId.of(tz.trim());
        } catch (RuntimeException e) {
            return null;
        }
    }

    /** A {@code VTIMEZONE} for {@code zone}: yearly rules as RRULEs, or one fixed component when it has none. */
    static List<String> vtimezone(ZoneId zone, Instant around) {
        ZoneRules rules = zone.getRules();
        List<String> out = new ArrayList<>();
        out.add("BEGIN:VTIMEZONE");
        out.add("TZID:" + zone.getId());
        List<ZoneOffsetTransitionRule> yearly = rules.getTransitionRules();
        if (yearly.isEmpty()) {
            ZoneOffset offset = rules.getOffset(around);
            out.add("BEGIN:STANDARD");
            out.add("DTSTART:19700101T000000");
            out.add("TZOFFSETFROM:" + offset(offset));
            out.add("TZOFFSETTO:" + offset(offset));
            out.add("TZNAME:" + shortName(zone, false));
            out.add("END:STANDARD");
        } else {
            for (ZoneOffsetTransitionRule r : yearly) {
                boolean daylight = r.getOffsetAfter().getTotalSeconds() > r.getOffsetBefore().getTotalSeconds();
                String kind = daylight ? "DAYLIGHT" : "STANDARD";
                ZoneOffsetTransition first = r.createTransition(1970);
                out.add("BEGIN:" + kind);
                out.add("DTSTART:" + LOCAL.format(first.getDateTimeBefore()));
                out.add("TZOFFSETFROM:" + offset(r.getOffsetBefore()));
                out.add("TZOFFSETTO:" + offset(r.getOffsetAfter()));
                out.add("TZNAME:" + shortName(zone, daylight));
                out.add("RRULE:" + rrule(r));
                out.add("END:" + kind);
            }
        }
        out.add("END:VTIMEZONE");
        return out;
    }

    /**
     * The yearly rule as an RRULE. "The first Sunday on or after the 8th" is the weekday plus the seven
     * month days from the 8th; "the last Sunday" (indicator -1) is the weekday plus month days -7..-1.
     */
    static String rrule(ZoneOffsetTransitionRule r) {
        StringBuilder sb = new StringBuilder("FREQ=YEARLY;BYMONTH=").append(r.getMonth().getValue());
        int dom = r.getDayOfMonthIndicator();
        if (r.getDayOfWeek() == null) {
            sb.append(";BYMONTHDAY=").append(dom);
        } else {
            sb.append(";BYDAY=").append(DAYS[r.getDayOfWeek().getValue() - 1]).append(";BYMONTHDAY=");
            List<String> days = new ArrayList<>();
            if (dom > 0) for (int d = dom; d < dom + 7; d++) days.add(String.valueOf(d));
            else for (int d = dom - 6; d <= dom; d++) days.add(String.valueOf(d));
            sb.append(String.join(",", days));
        }
        return sb.toString();
    }

    private static String shortName(ZoneId zone, boolean daylight) {
        return TimeZone.getTimeZone(zone).getDisplayName(daylight, TimeZone.SHORT, Locale.ENGLISH);
    }

    /** {@code +0530}, {@code -0400}. */
    static String offset(ZoneOffset o) {
        int total = o.getTotalSeconds();
        char sign = total < 0 ? '-' : '+';
        int abs = Math.abs(total);
        return String.format(Locale.ROOT, "%c%02d%02d", sign, abs / 3600, (abs % 3600) / 60);
    }

    // ---- text ------------------------------------------------------------------------------------

    /** TEXT escaping: backslash, semicolon, comma, and line breaks. */
    static String escape(String s) {
        return s.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\r\n", "\n").replace("\r", "\n").replace("\n", "\\n");
    }

    /** Append {@code line} folded at 75 octets (continuation lines start with one space), CRLF terminated. */
    static void fold(StringBuilder out, String line) {
        int bytes = 0;
        int limit = 75;
        int i = 0;
        while (i < line.length()) {
            int cp = line.codePointAt(i);
            int n = new String(Character.toChars(cp)).getBytes(StandardCharsets.UTF_8).length;
            if (bytes + n > limit) {
                out.append("\r\n ");
                bytes = 1; // the leading space of the continuation counts
                limit = 75;
            }
            out.appendCodePoint(cp);
            bytes += n;
            i += Character.charCount(cp);
        }
        out.append("\r\n");
    }

    private static boolean notBlank(String s) {
        return s != null && !s.isBlank();
    }
}
