package com.dossier.api.service.inbox;

import java.time.DateTimeException;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * A small, safe reader for the one thing the inbox needs from an iCalendar (RFC 5545) part: the first meeting in it. No dependency, no recursion, no
 * network: it unfolds the lines, walks the {@code VEVENT} blocks and reads {@code METHOD}, {@code UID}, {@code SEQUENCE}, {@code DTSTART},
 * {@code DTEND}/{@code DURATION}, {@code STATUS}, {@code SUMMARY}, {@code LOCATION}, {@code URL} and the meeting links in the description. Anything it
 * does not understand is skipped; it never throws. Time zone definitions ({@code VTIMEZONE}) are ignored: the {@code TZID} name is resolved through
 * {@code java.time}, so DST follows the real rules.
 */
public final class IcsReader {

    static final int MAX_CHARS = 100_000;
    static final int MAX_LOCATION = 200;
    static final int MAX_SUMMARY = 200;

    private static final Pattern LINK = Pattern.compile("https?://[^\\s<>\"')\\]\\\\]+");
    private static final Pattern TZID = Pattern.compile("(?i)TZID=(\"[^\"]*\"|[^;]*)");
    private static final Pattern DURATION = Pattern.compile("(?i)^P(?:(\\d+)D)?(?:T(?:(\\d+)H)?(?:(\\d+)M)?(?:(\\d+)S)?)?$");
    private static final DateTimeFormatter LOCAL = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss");

    /** The Windows zone names Outlook writes as {@code TZID}. */
    private static final Map<String, String> WINDOWS = Map.ofEntries(
        Map.entry("pacific standard time", "America/Los_Angeles"),
        Map.entry("mountain standard time", "America/Denver"),
        Map.entry("us mountain standard time", "America/Phoenix"),
        Map.entry("central standard time", "America/Chicago"),
        Map.entry("eastern standard time", "America/New_York"),
        Map.entry("gmt standard time", "Europe/London"),
        Map.entry("greenwich standard time", "UTC"),
        Map.entry("w. europe standard time", "Europe/Berlin"),
        Map.entry("central europe standard time", "Europe/Budapest"),
        Map.entry("romance standard time", "Europe/Paris"),
        Map.entry("india standard time", "Asia/Kolkata"),
        Map.entry("singapore standard time", "Asia/Singapore"),
        Map.entry("tokyo standard time", "Asia/Tokyo"),
        Map.entry("aus eastern standard time", "Australia/Sydney"),
        Map.entry("utc", "UTC")
    );

    private IcsReader() {}

    /** The first non-cancelled meeting of the calendar text (else the first one), or empty when there is none. */
    public static Optional<IcsEvent> read(String ics) {
        if (ics == null || ics.isBlank()) return Optional.empty();
        try {
            String text = ics.length() > MAX_CHARS ? ics.substring(0, MAX_CHARS) : ics;
            String method = null;
            List<IcsEvent> events = new ArrayList<>();
            List<String[]> props = null; // {name, params, value} of the current VEVENT
            for (String line : unfold(text)) {
                int colon = colonOutsideQuotes(line);
                if (colon <= 0) continue;
                String head = line.substring(0, colon);
                String value = line.substring(colon + 1);
                int semi = head.indexOf(';');
                String name = (semi < 0 ? head : head.substring(0, semi)).trim().toUpperCase(Locale.ROOT);
                String params = semi < 0 ? "" : head.substring(semi + 1);
                if ("BEGIN".equals(name)) {
                    if ("VEVENT".equalsIgnoreCase(value.trim())) props = new ArrayList<>();
                } else if ("END".equals(name)) {
                    if ("VEVENT".equalsIgnoreCase(value.trim()) && props != null) {
                        if (events.size() < 20) events.add(event(props, method));
                        props = null;
                    }
                } else if (props != null) {
                    if (props.size() < 200) props.add(new String[] { name, params, value });
                } else if ("METHOD".equals(name)) {
                    method = clean(value, 20) == null ? null : clean(value, 20).toUpperCase(Locale.ROOT);
                }
            }
            if (events.isEmpty()) return Optional.empty();
            final String m = method;
            return events.stream().filter(e -> !e.cancelled()).findFirst().or(() -> events.stream().findFirst()).map(e -> e.method() == null && m != null ? withMethod(e, m) : e);
        } catch (RuntimeException e) {
            return Optional.empty();
        }
    }

    private static IcsEvent withMethod(IcsEvent e, String method) {
        return new IcsEvent(method, e.uid(), e.sequence(), e.start(), e.end(), e.tz(), e.durationMinutes(), e.cancelled() || "CANCEL".equals(method), e.summary(), e.location(), e.link());
    }

    private static IcsEvent event(List<String[]> props, String method) {
        String uid = null, summary = null, location = null, url = null, status = null, startRaw = null, endRaw = null, description = null, conference = null;
        String startParams = "", endParams = "";
        Integer sequence = null, duration = null;
        for (String[] p : props) {
            switch (p[0]) {
                case "UID" -> uid = clean(p[2], 255);
                case "SEQUENCE" -> sequence = integer(p[2]);
                case "SUMMARY" -> summary = clean(unescape(p[2]), MAX_SUMMARY);
                case "LOCATION" -> location = unescape(p[2]);
                case "URL" -> url = p[2].trim();
                case "STATUS" -> status = clean(p[2], 20) == null ? null : clean(p[2], 20).toUpperCase(Locale.ROOT);
                case "DTSTART" -> {
                    startRaw = p[2].trim();
                    startParams = p[1];
                }
                case "DTEND" -> {
                    endRaw = p[2].trim();
                    endParams = p[1];
                }
                case "DURATION" -> duration = minutes(p[2]);
                case "DESCRIPTION" -> description = unescape(p[2]);
                case "X-GOOGLE-CONFERENCE", "X-MICROSOFT-SKYPETEAMSMEETINGURL", "X-MICROSOFT-ONLINEMEETINGEXTERNALLINK" -> conference = p[2].trim();
                default -> {}
            }
        }
        boolean cancelled = "CANCELLED".equals(status) || "CANCEL".equals(method);
        String tz = zoneOf(startParams);
        String start = timeOf(startRaw, startParams);
        String end = timeOf(endRaw, endParams);
        if (tz == null) tz = zoneOf(endParams);
        // The meeting link: a conference property, then the URL, then the location, then the description.
        String link = firstLink(conference, url, location, description);
        // A location that is only a link (or a "Zoom Meeting" label) is not a place.
        String place = location == null ? null : clean(location, MAX_LOCATION);
        if (place != null && (LINK.matcher(place).find() || place.toLowerCase(Locale.ROOT).matches("(zoom|google meet|microsoft teams|teams|webex)( meeting| video call| call)?"))) place = null;
        return new IcsEvent(method, uid, sequence, start, end, tz, duration, cancelled, summary, place, link);
    }

    // ---- values -------------------------------------------------------------------------------------------------------------------

    /** A DTSTART/DTEND value to {@code yyyy-MM-ddTHH:mm:ssZ} (UTC), {@code yyyy-MM-ddTHH:mm:ss} (local) or null (a date only, or unreadable). */
    private static String timeOf(String raw, String params) {
        if (raw == null || raw.length() < 15) return null; // missing, or an all-day date (8 characters)
        try {
            boolean utc = raw.endsWith("Z") || raw.endsWith("z");
            LocalDateTime t = LocalDateTime.parse(utc ? raw.substring(0, raw.length() - 1) : raw, LOCAL);
            return t.withNano(0).format(DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss")) + (utc ? "Z" : "");
        } catch (RuntimeException e) {
            return null;
        }
    }

    private static String zoneOf(String params) {
        Matcher m = TZID.matcher(params == null ? "" : params);
        if (!m.find()) return null;
        String name = m.group(1).replace("\"", "").trim();
        if (name.isEmpty()) return null;
        String mapped = WINDOWS.get(name.toLowerCase(Locale.ROOT));
        try {
            return ZoneId.of(mapped != null ? mapped : name).getId();
        } catch (DateTimeException e) {
            return null; // an unknown zone name: read as floating, in the mail's own zone
        }
    }

    private static Integer minutes(String v) {
        Matcher m = DURATION.matcher(v.trim());
        if (!m.matches()) return null;
        int d = m.group(1) == null ? 0 : Integer.parseInt(m.group(1));
        int h = m.group(2) == null ? 0 : Integer.parseInt(m.group(2));
        int mi = m.group(3) == null ? 0 : Integer.parseInt(m.group(3));
        long total = d * 1440L + h * 60L + mi;
        return total > 0 && total <= 24 * 60 ? (int) total : null;
    }

    private static Integer integer(String v) {
        try {
            int n = Integer.parseInt(v.trim());
            return n >= 0 && n < 100_000 ? n : null;
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static String firstLink(String... sources) {
        String generic = null;
        for (String s : sources) {
            if (s == null) continue;
            Matcher m = LINK.matcher(s);
            while (m.find()) {
                String u = InterviewScheduleExtractor.safeLink(m.group());
                if (u == null) continue;
                if (InterviewScheduleExtractor.isMeetingHost(u)) return u;
                if (generic == null) generic = u;
            }
        }
        return generic;
    }

    // ---- lines ----------------------------------------------------------------------------------------------------------------------

    /** RFC 5545 unfolding: a line starting with a space or tab continues the one before it. */
    static List<String> unfold(String text) {
        List<String> out = new ArrayList<>();
        StringBuilder cur = null;
        for (String raw : text.split("\r\n|\n|\r", -1)) {
            if (!raw.isEmpty() && (raw.charAt(0) == ' ' || raw.charAt(0) == '\t')) {
                if (cur != null && cur.length() < 20_000) cur.append(raw, 1, raw.length());
            } else {
                if (cur != null) out.add(cur.toString());
                cur = new StringBuilder(raw);
            }
        }
        if (cur != null) out.add(cur.toString());
        return out;
    }

    private static int colonOutsideQuotes(String line) {
        boolean quoted = false;
        for (int i = 0; i < line.length(); i++) {
            char c = line.charAt(i);
            if (c == '"') quoted = !quoted;
            else if (c == ':' && !quoted) return i;
        }
        return -1;
    }

    static String unescape(String v) {
        return v.replace("\\n", "\n").replace("\\N", "\n").replace("\\,", ",").replace("\\;", ";").replace("\\\\", "\\");
    }

    /** No control characters, collapsed spaces, trimmed, capped; null when nothing is left. */
    static String clean(String v, int max) {
        if (v == null) return null;
        String t = v.replaceAll("[\\p{Cntrl}\\p{Cf}]+", " ").replaceAll("\\s+", " ").trim();
        if (t.isEmpty()) return null;
        return t.length() > max ? t.substring(0, max).trim() : t;
    }
}
