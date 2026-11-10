package com.dossier.api.service.inbox;

import com.dossier.api.domain.Interview;
import com.dossier.api.service.privacy.SensitivePatterns;
import java.net.URI;
import java.net.URISyntaxException;
import java.time.DateTimeException;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.time.zone.ZoneOffsetTransition;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Reads the interview schedule out of one mail (the inbox reads interview invitations, reschedules and cancellations).
 *
 * <p><b>Two sources.</b> The mail's calendar part, when it has one ({@link IcsEvent}, already reduced to a few fields at read time), is the better
 * source: a start with a zone or in UTC, an end or duration, a UID and SEQUENCE. Otherwise the text of the mail: a date with a time and, usually, a zone
 * ("Tuesday, October 21 at 2:00 PM PT", "10/21/2026 2pm", "between 2:00 and 3:00 PM Eastern", "Oct 21st, 14:00 UTC+1").
 *
 * <p><b>Never invent a time.</b> A date without a time, an "any time next week", a list of times to choose from, an availability request, a
 * reschedule that names no new time: all give {@code startUtc = null}. Mail text is untrusted: every string is capped, stripped of control
 * characters, a link must be http(s) without credentials, and a location that holds a never-collected value (see {@link SensitivePatterns}) is dropped.
 *
 * <p><b>Time zones.</b> An explicit zone in the calendar part or the text wins. With none, the zone of the mail's Date header, then the person's zone,
 * then UTC (each lowers the confidence). Abbreviations are read as the region and the date decides daylight saving: PST/PDT/PT mean America/Los_Angeles,
 * EST/EDT/ET America/New_York, CST/CDT/CT America/Chicago, MST/MDT/MT America/Denver, BST Europe/London, CET/CEST Europe/Paris, GMT/UTC offset 0, and
 * <b>IST is India Standard Time</b> (Asia/Kolkata), not Irish or Israel time. Writing "PST" for a date in July is read as "Pacific time", which is what
 * the sender means. A local time that does not exist (the spring-forward hour) or happens twice (the fall-back hour) lowers the confidence; in the
 * fall-back hour a standard abbreviation (PST) picks the second occurrence and a daylight one (PDT) the first.
 */
public final class InterviewScheduleExtractor {

    static final int MAX_LINK = 500;
    static final int MAX_LOCATION = 200;
    private static final int MAX_TEXT = 24_000;
    private static final int PAIR_GAP = 70;
    static final ZoneId UTC = ZoneId.of("UTC");

    private InterviewScheduleExtractor() {}

    // ---- patterns -----------------------------------------------------------------------------------------------------------------

    private static final String MONTH = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?";
    private static final String WEEKDAY = "(mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\\.?";

    private static final Pattern DATE_MDY = Pattern.compile(
        "(?i)(?<![\\p{L}\\d])(?:" + WEEKDAY + ",?\\s+)?(?:the\\s+)?" + MONTH + "\\s+(\\d{1,2})(?!\\d)(?:st|nd|rd|th)?(?:,?\\s+(\\d{4})(?![\\d:]))?"
    );
    private static final Pattern DATE_DMY = Pattern.compile(
        "(?i)(?<![\\p{L}\\d])(?:" + WEEKDAY + ",?\\s+)?(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?" + MONTH + "(?![\\p{L}])(?:,?\\s+(\\d{4})(?![\\d:]))?"
    );
    private static final Pattern DATE_SLASH = Pattern.compile("(?<![\\d/])(\\d{1,2})/(\\d{1,2})/(\\d{4}|\\d{2})(?![\\d/])");
    private static final Pattern DATE_DOT = Pattern.compile("(?<![\\d.])(\\d{1,2})\\.(\\d{1,2})\\.(\\d{4})(?![\\d.])");
    private static final Pattern DATE_ISO = Pattern.compile("(?<![\\d-])(\\d{4})-(\\d{2})-(\\d{2})(?![\\d])(?!T\\d)");

    private static final Pattern TIME = Pattern.compile(
        "(?<![\\d:/.\\-])(?<h1>\\d{1,2})(?!\\d)(?::(?<m1>[0-5]\\d)(?!\\d))?\\s*(?<ap1>[aApP]\\.?[mM]\\.?(?![a-zA-Z]))?" +
        "(?:\\s*(?:-|\\u2013|\\u2014|to|and|until|till)\\s*(?<h2>\\d{1,2})(?!\\d)(?::(?<m2>[0-5]\\d)(?!\\d))?\\s*(?<ap2>[aApP]\\.?[mM]\\.?(?![a-zA-Z]))?)?" +
        "|(?<noon>\\b[Nn]oon\\b)"
    );

    private static final String ZONE_ALT =
        "(?:UTC|GMT)\\s?[+\\-\\u2212]\\s?\\d{1,2}(?::?\\d{2})?|UTC|GMT|PST|PDT|PT|EST|EDT|ET|CST|CDT|CT|MST|MDT|MT|BST|CEST|CET|IST|JST|SGT|HKT|AEST|AEDT|" +
        "(?:Pacific|Eastern|Central|Mountain)(?:\\s+(?:Standard|Daylight))?(?:\\s+Time)?(?!\\s+(?:Park|Station|Avenue|Ave|Street|St|Plaza|Campus|Office|Square))|" +
        "[A-Z][a-z]+/[A-Z][A-Za-z_]+(?:/[A-Z][A-Za-z_]+)?";
    private static final Pattern ZONE = Pattern.compile("(?<![\\p{L}\\d])(" + ZONE_ALT + ")(?![\\p{L}\\d])");

    private static final Pattern LINK = Pattern.compile("https?://[^\\s<>\"')\\]\\\\]+");
    private static final Pattern LOCATION_LINE = Pattern.compile("(?im)^[ \\t>*-]*(?:location|where|address|venue|place)[ \\t]*[:\\-][ \\t]*(.{3,300})$");
    private static final String MEETING_WORD = "(?:interview|call|chat|conversation|screen|screening|session|meeting|discussion|round)";
    private static final String LENGTH_VERB = "(?:last|lasts|lasting|take|takes|taking|duration|allow|allot|reserve|block|stay|stays|run|runs|be|is|are)";
    private static final Pattern MINUTES = Pattern.compile(
        "(?i)(?:\\b" + LENGTH_VERB + "\\b(?:\\s+(?:of|is|about|around|approximately|roughly|up to|for|only|just)){0,3}[:\\s]+|\\bfor\\s+(?:about\\s+|around\\s+)?)(\\d{1,3})\\s*[- ]?\\s*(?:minutes?|mins?)\\b" +
        "|(?<![\\d:])(\\d{1,3})[- ]?(?:minutes?|mins?)[- ](?:long\\s+)?" + MEETING_WORD
    );
    private static final Pattern HOURS = Pattern.compile(
        "(?i)(?:\\b" + LENGTH_VERB + "\\b(?:\\s+(?:of|is|about|around|approximately|roughly|up to|for|only|just)){0,3}[:\\s]+)(\\d(?:\\.\\d)?|an?|one|two)\\s*[- ]?\\s*hours?\\b" +
        "|(?<![\\d:])(\\d(?:\\.\\d)?|an?|one|two)[- ]hours?[- ]" + MEETING_WORD
    );

    static final Pattern CANCEL = p(
        "(?:interview|call|meeting|chat|conversation|session|event|invitation)s?\\s+(?:has been|is|was|will be|have been|are|has had to be|needs to be|had to be)\\s+cancel+ed|" +
        "(?:we|i)\\s+(?:need|have|had|must|regret|are sorry|am sorry)\\s+(?:to\\s+)?cancel|(?:need|have|had|must|unable)\\s+to\\s+cancel\\s+(?:our|your|the|this)|" +
        "cancel+ing\\s+(?:our|your|the|this)\\s+(?:interview|call|meeting|chat)|cancel+ed\\s+(?:event|invitation|interview)\\s*:|" +
        "(?:event|interview|invitation)\\s+cancel+ed|has been cancel+ed|(?:is|has been)\\s+called off"
    );
    static final Pattern RESCHEDULE = p(
        "reschedul\\w*|(?:new|updated|different|alternate|alternative|revised)\\s+(?:interview\\s+)?(?:time|date|slot|invitation|invite)|" +
        "(?:moved|moving|changed|changing|postponed|pushed|shifted)\\s+(?:\\w+\\s+){0,4}?(?:to|until|back to)\\b|time\\s+(?:has\\s+)?changed|updated invitation"
    );
    private static final Pattern NEW_TIME_MARKER = p(
        "reschedul\\w*\\s+(?:\\w+\\s+){0,3}?(?:to|for)\\b|(?:moved|moving|changed|changing|postponed|pushed|shifted)\\s+(?:\\w+\\s+){0,4}?(?:to|until)\\b|" +
        "(?:new|updated|revised)\\s+(?:interview\\s+)?(?:time|date|slot)(?:\\s+is|\\s+will be)?\\s*[:\\-]?|now\\s+(?:scheduled\\s+)?(?:for|at|on)\\b|instead(?:\\s+on)?\\b"
    );
    private static final Pattern ORIGINAL = p("original(?:ly)?|previous(?:ly)?|formerly|old\\s+(?:time|date)|was\\s+(?:scheduled|set|booked)|earlier\\s+(?:time|date)|replac(?:es|ing)");
    private static final Pattern AVAILABILITY = p(
        "(?:share|send|provide|reply with|let us know|tell us|give us|let me know|send over)\\s+(?:me\\s+|us\\s+)?(?:your\\s+)?(?:availability|a few times|some times|times|dates|a time|when you)|" +
        "what\\s+(?:times|days|dates)\\s+(?:work|are|would)|(?:times|days|dates)\\s+that\\s+work|which\\s+of\\s+the\\s+following|(?:pick|choose|select|book|find)\\s+(?:a|any|your|the)\\s+(?:time|slot|day)|" +
        "(?:your|my)\\s+availability|are\\s+you\\s+available|would\\s+(?:you|any of these)\\s+work|schedule\\s+(?:a\\s+time|your\\s+(?:interview|call))\\s+(?:using|via|with|at|through)|self[- ]schedule"
    );
    private static final Pattern CONFIRMED = p(
        "confirm(?:ed|ing|ation)?|is\\s+scheduled|has\\s+been\\s+scheduled|(?:we|i)(?:'ve|\\s+have)\\s+scheduled|scheduled\\s+(?:for|on)|looking\\s+forward\\s+to\\s+(?:speaking|meeting|seeing|talking)|" +
        "see\\s+you\\s+(?:on|at)|your\\s+interview\\s+is|will\\s+take\\s+place|calendar\\s+invit|invit\\w*\\s+you\\s+to\\s+(?:an?\\s+|our\\s+)?[\\w\\s-]{0,30}(?:interview|call|chat)|joining\\s+(?:us|me)"
    );

    private static Pattern p(String regex) {
        return Pattern.compile("(?i)\\b(?:" + regex + ")");
    }

    // ---- entry points ---------------------------------------------------------------------------------------------------------------

    /**
     * @param subject     the mail's subject (may hold the date, as calendar invitations do)
     * @param body        the mail's text (already quote-stripped by {@link MailText})
     * @param ics         the calendar event read at sync time, or null
     * @param mailDate    when the mail was sent (decides the year of "Oct 21" and which "next" a date means)
     * @param mailZone    the zone of the mail's Date header, or null
     * @param profileZone the person's zone, or null
     */
    public static ExtractedSchedule extract(String subject, String body, IcsEvent ics, Instant mailDate, ZoneId mailZone, ZoneId profileZone) {
        String text = cap((subject == null ? "" : subject) + "\n" + (body == null ? "" : body));
        Zones zones = new Zones(mailZone, profileZone);
        LocalDate base = (mailDate == null ? Instant.now() : mailDate).atZone(zones.fallback()).toLocalDate();

        boolean cancelledText = CANCEL.matcher(text).find();
        boolean reschedText = RESCHEDULE.matcher(text).find();
        String kind = kindOf(text + " " + (ics == null || ics.summary() == null ? "" : ics.summary()));
        String link = ics != null && ics.link() != null ? ics.link() : linkIn(text);
        String location = ics != null && ics.location() != null ? safeLocation(ics.location()) : locationIn(text);
        if ("OTHER".equals(kind) && link != null && isMeetingHost(link)) kind = "VIDEO";

        if (ics != null) {
            ExtractedSchedule s = fromIcs(ics, zones, kind, link, location, cancelledText, reschedText);
            if (s != null) return s;
        }
        return fromText(text, base, zones, kind, link, location, cancelledText, reschedText);
    }

    // ---- the calendar part ------------------------------------------------------------------------------------------------------------

    private static ExtractedSchedule fromIcs(IcsEvent ics, Zones zones, String kind, String link, String location, boolean cancelledText, boolean reschedText) {
        boolean cancelled = ics.cancelled() || (cancelledText && !reschedText);
        Resolved start = resolveIcsTime(ics.start(), ics.tz(), zones);
        if (start == null) {
            // A cancellation or a bare calendar part with no time: nothing to schedule, but the UID still finds the interview to cancel.
            return cancelled || ics.uid() != null ? ExtractedSchedule.none(kind, cancelled, reschedText, ics.uid(), ics.sequence()) : null;
        }
        Resolved end = resolveIcsTime(ics.end(), ics.tz(), zones);
        Instant endUtc = end != null && end.instant().isAfter(start.instant()) ? end.instant() : null;
        if (endUtc == null && ics.durationMinutes() != null) endUtc = start.instant().plus(Duration.ofMinutes(ics.durationMinutes()));
        if (endUtc != null && Duration.between(start.instant(), endUtc).compareTo(Duration.ofHours(12)) > 0) endUtc = null;
        int confidence = start.explicit() ? 95 : Math.max(0, 85 - zones.penalty());
        if (start.dstTrouble()) confidence -= 25;
        return new ExtractedSchedule(
            start.instant(),
            endUtc,
            start.zone().getId(),
            kind,
            link,
            location,
            clamp(confidence),
            ExtractedSchedule.Source.ICS,
            ics.uid(),
            ics.sequence(),
            cancelled,
            reschedText
        );
    }

    private static Resolved resolveIcsTime(String iso, String tz, Zones zones) {
        if (iso == null) return null;
        try {
            if (iso.endsWith("Z")) return new Resolved(Instant.parse(iso), UTC, true, false);
            LocalDateTime local = LocalDateTime.parse(iso);
            ZoneId zone = tz == null ? null : ZoneId.of(tz);
            boolean explicit = zone != null;
            if (zone == null) zone = zones.fallback();
            return resolve(local, zone, explicit, null);
        } catch (DateTimeException e) {
            return null;
        }
    }

    // ---- the text ----------------------------------------------------------------------------------------------------------------------

    private record DateHit(int start, int end, LocalDate date, DayOfWeek weekday, boolean weekdayMismatch, boolean ambiguous) {}

    private record TimeHit(int start, int end, LocalTime from, LocalTime to, boolean clockGuess) {}

    private record Pair(DateHit date, TimeHit time, int start, int end) {
        String key() {
            return date.date() + "T" + time.from();
        }
    }

    private static ExtractedSchedule fromText(String text, LocalDate base, Zones zones, String kind, String link, String location, boolean cancelledText, boolean reschedText) {
        boolean confirmed = CONFIRMED.matcher(text).find();
        boolean availability = AVAILABILITY.matcher(text).find();

        List<Pair> pairs = pairs(text, dates(text, base), times(text));
        // The old time is not the new one: drop times introduced as "originally", "previously", "was scheduled for".
        pairs.removeIf(pr -> ORIGINAL.matcher(text.substring(Math.max(0, pr.start() - 45), pr.start())).find());

        boolean reschedWithTime = false;
        if (reschedText) {
            int firstMarker = firstMatch(RESCHEDULE, text);
            List<Pair> after = new ArrayList<>(pairs);
            after.removeIf(pr -> pr.start() < firstMarker);
            Matcher nm = NEW_TIME_MARKER.matcher(text);
            List<Pair> marked = new ArrayList<>();
            while (nm.find()) {
                final int markerEnd = nm.end();
                after.stream().filter(pr -> pr.start() >= markerEnd - 1 && pr.start() - markerEnd <= 90).min(Comparator.comparingInt(Pair::start)).ifPresent(marked::add);
            }
            pairs = !marked.isEmpty() ? List.of(marked.get(0)) : after;
            reschedWithTime = !pairs.isEmpty();
        }
        boolean cancelled = cancelledText && !reschedWithTime;

        if (pairs.isEmpty()) return ExtractedSchedule.none(kind, cancelled, reschedText && !cancelled, null, null);
        if (availability && !confirmed && !reschedWithTime && !cancelled) return ExtractedSchedule.none(kind, false, false, null, null);

        // Several different times in one mail are options to choose from, unless the mail confirms one of them or moves to one.
        List<Pair> distinct = new ArrayList<>();
        for (Pair pr : pairs) if (distinct.stream().noneMatch(d -> d.key().equals(pr.key()))) distinct.add(pr);
        Pair chosen;
        if (distinct.size() == 1) {
            chosen = distinct.get(0);
        } else if (reschedWithTime) {
            chosen = distinct.get(0);
        } else if (confirmed) {
            int anchor = firstMatch(CONFIRMED, text);
            chosen = distinct.stream().min(Comparator.comparingInt((Pair pr) -> Math.abs(pr.start() - anchor))).orElse(distinct.get(0));
        } else if (cancelled) {
            chosen = distinct.get(0); // only used to find the interview being cancelled
        } else {
            return ExtractedSchedule.none(kind, false, reschedText, null, null);
        }

        // The zone: an explicit token near the time, else the mail's, the person's, UTC.
        String windowText = text.substring(Math.max(0, chosen.start() - 20), Math.min(text.length(), chosen.end() + 40));
        ZoneToken token = zoneTokenIn(windowText, chosen.time().end() - Math.max(0, chosen.start() - 20));
        boolean explicit = token != null;
        ZoneId zone = explicit ? token.zone() : zones.fallback();
        Resolved start = resolve(LocalDateTime.of(chosen.date().date(), chosen.time().from()), zone, explicit, token == null ? null : token.hint());
        Instant endUtc = null;
        if (chosen.time().to() != null) {
            LocalDateTime endLocal = LocalDateTime.of(chosen.date().date(), chosen.time().to());
            if (!endLocal.isAfter(LocalDateTime.of(chosen.date().date(), chosen.time().from()))) endLocal = endLocal.plusDays(1);
            Resolved e = resolve(endLocal, zone, explicit, token == null ? null : token.hint());
            if (e.instant().isAfter(start.instant()) && Duration.between(start.instant(), e.instant()).compareTo(Duration.ofHours(12)) <= 0) endUtc = e.instant();
        }
        if (endUtc == null) {
            Integer minutes = durationMinutes(text);
            if (minutes != null) endUtc = start.instant().plus(Duration.ofMinutes(minutes));
        }

        int confidence = explicit ? 78 : 78 - zones.penalty();
        if (confirmed) confidence += 8;
        if (chosen.date().weekdayMismatch()) confidence -= 25;
        if (chosen.date().ambiguous()) confidence -= 30;
        if (chosen.time().clockGuess()) confidence -= 20;
        if (start.dstTrouble()) confidence -= 25;
        return new ExtractedSchedule(
            start.instant(),
            endUtc,
            start.zone().getId(),
            kind,
            link,
            location,
            clamp(confidence),
            ExtractedSchedule.Source.TEXT,
            null,
            null,
            cancelled,
            reschedText && !cancelled
        );
    }

    private static int firstMatch(Pattern pattern, String text) {
        Matcher m = pattern.matcher(text);
        return m.find() ? m.start() : 0;
    }

    // ---- dates ---------------------------------------------------------------------------------------------------------------------------

    private static List<DateHit> dates(String text, LocalDate base) {
        List<DateHit> out = new ArrayList<>();
        Matcher m = DATE_MDY.matcher(text);
        while (m.find()) {
            DateHit h = monthDay(m.start(), m.end(), m.group(1), m.group(2), m.group(3), m.group(4), base);
            if (h != null) out.add(h);
        }
        m = DATE_DMY.matcher(text);
        while (m.find()) {
            DateHit h = monthDay(m.start(), m.end(), m.group(1), m.group(3), m.group(2), m.group(4), base);
            if (h != null && out.stream().noneMatch(o -> o.start() < h.end() && h.start() < o.end())) out.add(h);
        }
        m = DATE_SLASH.matcher(text);
        while (m.find()) {
            int a = Integer.parseInt(m.group(1)), b = Integer.parseInt(m.group(2)), y = Integer.parseInt(m.group(3));
            if (y < 100) y += 2000;
            boolean dayFirst = a > 12;
            int month = dayFirst ? b : a, day = dayFirst ? a : b;
            boolean ambiguous = a <= 12 && b <= 12 && a != b;
            addNumeric(out, m.start(), m.end(), y, month, day, ambiguous);
        }
        m = DATE_DOT.matcher(text);
        while (m.find()) addNumeric(out, m.start(), m.end(), Integer.parseInt(m.group(3)), Integer.parseInt(m.group(2)), Integer.parseInt(m.group(1)), false);
        m = DATE_ISO.matcher(text);
        while (m.find()) addNumeric(out, m.start(), m.end(), Integer.parseInt(m.group(1)), Integer.parseInt(m.group(2)), Integer.parseInt(m.group(3)), false);
        out.sort(Comparator.comparingInt(DateHit::start));
        return out;
    }

    private static void addNumeric(List<DateHit> out, int start, int end, int year, int month, int day, boolean ambiguous) {
        try {
            out.add(new DateHit(start, end, LocalDate.of(year, month, day), null, false, ambiguous));
        } catch (DateTimeException e) {
            // not a date
        }
    }

    private static DateHit monthDay(int start, int end, String weekday, String month, String day, String year, LocalDate base) {
        try {
            int mo = monthNumber(month);
            int d = Integer.parseInt(day);
            DayOfWeek dow = weekday == null ? null : weekdayOf(weekday);
            LocalDate date;
            boolean mismatch = false;
            if (year != null) {
                date = LocalDate.of(Integer.parseInt(year), mo, d);
                mismatch = dow != null && date.getDayOfWeek() != dow;
            } else {
                date = LocalDate.of(base.getYear(), mo, d);
                if (date.isBefore(base.minusDays(45))) date = date.plusYears(1);
                if (dow != null && date.getDayOfWeek() != dow) {
                    // "Tuesday, October 21": the year in which it IS a Tuesday, near the mail's date, if there is one.
                    LocalDate fixed = null;
                    for (int dy : new int[] { 0, 1, -1, 2 }) {
                        try {
                            LocalDate c = LocalDate.of(date.getYear() + dy, mo, d);
                            if (c.getDayOfWeek() == dow && !c.isBefore(base.minusDays(45)) && c.isBefore(base.plusDays(500))) {
                                fixed = c;
                                break;
                            }
                        } catch (DateTimeException e) {
                            // 29 February in a common year
                        }
                    }
                    if (fixed != null) date = fixed;
                    else mismatch = true;
                }
            }
            return new DateHit(start, end, date, dow, mismatch, false);
        } catch (DateTimeException | NumberFormatException e) {
            return null;
        }
    }

    private static int monthNumber(String m) {
        return switch (m.toLowerCase(Locale.ROOT).substring(0, 3)) {
            case "jan" -> 1;
            case "feb" -> 2;
            case "mar" -> 3;
            case "apr" -> 4;
            case "may" -> 5;
            case "jun" -> 6;
            case "jul" -> 7;
            case "aug" -> 8;
            case "sep" -> 9;
            case "oct" -> 10;
            case "nov" -> 11;
            default -> 12;
        };
    }

    private static DayOfWeek weekdayOf(String w) {
        return switch (w.toLowerCase(Locale.ROOT).substring(0, 3)) {
            case "mon" -> DayOfWeek.MONDAY;
            case "tue" -> DayOfWeek.TUESDAY;
            case "wed" -> DayOfWeek.WEDNESDAY;
            case "thu" -> DayOfWeek.THURSDAY;
            case "fri" -> DayOfWeek.FRIDAY;
            case "sat" -> DayOfWeek.SATURDAY;
            default -> DayOfWeek.SUNDAY;
        };
    }

    // ---- times -----------------------------------------------------------------------------------------------------------------------------

    private static List<TimeHit> times(String text) {
        List<TimeHit> out = new ArrayList<>();
        Matcher m = TIME.matcher(text);
        while (m.find()) {
            if (m.group("noon") != null) {
                out.add(new TimeHit(m.start(), m.end(), LocalTime.NOON, null, false));
                continue;
            }
            Integer h1 = Integer.valueOf(m.group("h1"));
            String m1 = m.group("m1");
            String ap1 = ampm(m.group("ap1"));
            String h2s = m.group("h2");
            String ap2 = ampm(m.group("ap2"));
            boolean range = h2s != null;
            // A bare number is not a time: it needs minutes, an am/pm, or to be the start of a range that ends in an am/pm ("2-3pm").
            if (m1 == null && ap1 == null && !(range && ap2 != null)) continue;
            if (range && h2s != null && m.group("m2") == null && ap2 == null && m1 == null && ap1 == null) continue;
            int min1 = m1 == null ? 0 : Integer.parseInt(m1);
            String effectiveAp1 = ap1 != null ? ap1 : (range ? ap2 : null);
            LocalTime from = clock(h1, min1, effectiveAp1);
            if (from == null) continue;
            LocalTime to = null;
            if (range) {
                int h2 = Integer.parseInt(h2s);
                int min2 = m.group("m2") == null ? 0 : Integer.parseInt(m.group("m2"));
                String endAp = ap2 != null ? ap2 : ap1;
                to = clock(h2, min2, endAp);
                if (to == null) {
                    to = null;
                } else if (ap1 == null && ap2 != null && !to.isAfter(from)) {
                    // "11:00 - 12:00 PM": the start is in the morning.
                    LocalTime flipped = clock(h1, min1, "AM".equals(ap2) ? "PM" : "AM");
                    if (flipped != null && flipped.isBefore(to)) from = flipped;
                }
            }
            boolean guess = effectiveAp1 == null && h1 >= 1 && h1 <= 7 && !m.group("h1").startsWith("0");
            out.add(new TimeHit(m.start(), m.end(), from, to, guess));
        }
        return out;
    }

    private static String ampm(String s) {
        return s == null ? null : (s.toLowerCase(Locale.ROOT).startsWith("a") ? "AM" : "PM");
    }

    private static LocalTime clock(int hour, int minute, String ampm) {
        if (minute > 59) return null;
        if (ampm == null) return hour <= 23 ? LocalTime.of(hour, minute) : null;
        if (hour < 1 || hour > 12) return null;
        int h = hour % 12 + ("PM".equals(ampm) ? 12 : 0);
        return LocalTime.of(h, minute);
    }

    private static final int FAR_GAP = 30;

    private static int gap(int aStart, int aEnd, int bStart, int bEnd) {
        return bStart >= aEnd ? bStart - aEnd : aStart >= bEnd ? aStart - bEnd : 0;
    }

    private static List<Pair> pairs(String text, List<DateHit> dates, List<TimeHit> times) {
        List<Pair> out = new ArrayList<>();
        for (DateHit d : dates) {
            TimeHit best = null;
            int bestGap = Integer.MAX_VALUE;
            for (TimeHit t : times) {
                if (t.start() < d.end() && d.start() < t.end()) continue; // a time inside the date's own digits
                int gap = t.start() >= d.end() ? t.start() - d.end() : d.start() - t.end();
                if (gap > PAIR_GAP) continue;
                if (gap < bestGap || (gap == bestGap && t.start() > d.end())) {
                    best = t;
                    bestGap = gap;
                }
            }
            if (best == null) continue;
            // A time that sits much closer to another date belongs to that one ("applied on Oct 3 ... meet on Nov 4 at 9:00").
            if (bestGap > FAR_GAP) {
                final TimeHit chosenTime = best;
                int own = bestGap;
                boolean closerElsewhere = dates.stream().anyMatch(o -> o != d && gap(o.start(), o.end(), chosenTime.start(), chosenTime.end()) < own);
                if (closerElsewhere) continue;
            }
            out.add(new Pair(d, best, Math.min(d.start(), best.start()), Math.max(d.end(), best.end())));
        }
        out.sort(Comparator.comparingInt(Pair::start));
        return out;
    }

    // ---- zones ---------------------------------------------------------------------------------------------------------------------------------

    private record ZoneToken(ZoneId zone, String hint) {}

    private record Resolved(Instant instant, ZoneId zone, boolean explicit, boolean dstTrouble) {}

    /** The zone to fall back on, and how much that guess costs in confidence. */
    private record Zones(ZoneId mail, ZoneId profile) {
        ZoneId fallback() {
            return mail != null ? mail : profile != null ? profile : UTC;
        }

        int penalty() {
            return mail != null ? 10 : profile != null ? 15 : 25;
        }
    }

    private static ZoneToken zoneTokenIn(String window, int timeEndInWindow) {
        Matcher m = ZONE.matcher(window);
        ZoneToken before = null;
        while (m.find()) {
            ZoneToken t = zoneOf(m.group(1));
            if (t == null) continue;
            if (m.start() >= Math.max(0, timeEndInWindow - 2)) return t; // after the time: the usual place
            before = before == null ? t : before;
        }
        return before;
    }

    private static final Pattern OFFSET_TOKEN = Pattern.compile("^(?:UTC|GMT)\\s?([+\\-])\\s?(\\d{1,2})(?::?(\\d{2}))?$");

    private static final Map<String, String> REGIONS =Map.ofEntries(
        Map.entry("PST", "America/Los_Angeles"), Map.entry("PDT", "America/Los_Angeles"), Map.entry("PT", "America/Los_Angeles"), Map.entry("PACIFIC", "America/Los_Angeles"),
        Map.entry("EST", "America/New_York"), Map.entry("EDT", "America/New_York"), Map.entry("ET", "America/New_York"), Map.entry("EASTERN", "America/New_York"),
        Map.entry("CST", "America/Chicago"), Map.entry("CDT", "America/Chicago"), Map.entry("CT", "America/Chicago"), Map.entry("CENTRAL", "America/Chicago"),
        Map.entry("MST", "America/Denver"), Map.entry("MDT", "America/Denver"), Map.entry("MT", "America/Denver"), Map.entry("MOUNTAIN", "America/Denver"),
        Map.entry("BST", "Europe/London"), Map.entry("CET", "Europe/Paris"), Map.entry("CEST", "Europe/Paris"), Map.entry("IST", "Asia/Kolkata"),
        Map.entry("JST", "Asia/Tokyo"), Map.entry("SGT", "Asia/Singapore"), Map.entry("HKT", "Asia/Hong_Kong"), Map.entry("AEST", "Australia/Sydney"), Map.entry("AEDT", "Australia/Sydney")
    );

    /** The zone a token names, or null. {@code hint} is "STANDARD" or "DAYLIGHT" when the abbreviation says which. */
    private static ZoneToken zoneOf(String token) {
        String t = token.trim();
        if (t.contains("/")) {
            try {
                return new ZoneToken(ZoneId.of(t), null);
            } catch (DateTimeException e) {
                return null;
            }
        }
        String up = t.toUpperCase(Locale.ROOT).replace("−", "-");
        Matcher off = OFFSET_TOKEN.matcher(up);
        if (off.matches()) {
            try {
                int h = Integer.parseInt(off.group(2));
                int mi = off.group(3) == null ? 0 : Integer.parseInt(off.group(3));
                int sign = "-".equals(off.group(1)) ? -1 : 1;
                return new ZoneToken(ZoneOffset.ofHoursMinutes(sign * h, sign * mi), null);
            } catch (DateTimeException e) {
                return null;
            }
        }
        if ("UTC".equals(up) || "GMT".equals(up)) return new ZoneToken(UTC, null);
        String region = REGIONS.get(up.split("\\s+")[0]);
        if (region == null) return null;
        String hint = null;
        if (up.equals("PST") || up.equals("EST") || up.equals("CST") || up.equals("MST") || up.contains("STANDARD")) hint = "STANDARD";
        if (up.equals("PDT") || up.equals("EDT") || up.equals("CDT") || up.equals("MDT") || up.contains("DAYLIGHT")) hint = "DAYLIGHT";
        return new ZoneToken(ZoneId.of(region), hint);
    }

    /** A local date-time in a zone to an instant, noting a time that does not exist or happens twice. */
    private static Resolved resolve(LocalDateTime local, ZoneId zone, boolean explicit, String hint) {
        if (zone instanceof ZoneOffset off) return new Resolved(local.toInstant(off), zone, explicit, false);
        List<ZoneOffset> offsets = zone.getRules().getValidOffsets(local);
        if (offsets.isEmpty()) {
            ZoneOffsetTransition gap = zone.getRules().getTransition(local);
            ZonedDateTime z = ZonedDateTime.ofLocal(local, zone, gap == null ? null : gap.getOffsetAfter());
            return new Resolved(z.toInstant(), zone, explicit, true);
        }
        if (offsets.size() == 2) {
            ZoneOffset pick = "STANDARD".equals(hint) ? offsets.get(1) : offsets.get(0); // [0] is the daylight (earlier) occurrence
            boolean decided = hint != null;
            return new Resolved(local.toInstant(pick), zone, explicit, !decided);
        }
        return new Resolved(local.atZone(zone).toInstant(), zone, explicit, false);
    }

    // ---- kind, link, location, duration ---------------------------------------------------------------------------------------------------

    private static final Pattern K_PANEL = p("panel");
    private static final Pattern K_TECH = p("technical\\s+(?:interview|screen|round|assessment|discussion|call)|coding\\s+(?:interview|round|session|exercise)|system\\s+design|pair[- ]programming|live\\s+coding|whiteboard");
    private static final Pattern K_BEHAV = p("behaviou?ral\\s+(?:interview|round|screen)");
    private static final Pattern K_VIRTUAL_ONSITE = p("virtual\\s+on-?site");
    private static final Pattern K_ONSITE = p("on-?site|in[- ]person|at our (?:office|headquarters)|visit (?:our|the) office|come (?:in|to)");
    private static final Pattern K_PHONE = p("phone\\s+(?:screen|call|interview|conversation)|call you|by phone|over the phone|dial[- ]in|give you a call|telephone");
    private static final Pattern K_VIDEO = p("video\\s+(?:call|interview|chat|conference)|zoom|google\\s+meet|meet\\.google|microsoft\\s+teams|teams\\s+meeting|webex|virtual\\s+(?:interview|meeting|call)|videoconference");

    /** One of {@link Interview#KINDS}. */
    static String kindOf(String text) {
        if (K_PANEL.matcher(text).find()) return "PANEL";
        if (K_TECH.matcher(text).find()) return "TECHNICAL";
        if (K_BEHAV.matcher(text).find()) return "BEHAVIORAL";
        if (K_VIRTUAL_ONSITE.matcher(text).find()) return "VIDEO";
        if (K_ONSITE.matcher(text).find()) return "ONSITE";
        if (K_PHONE.matcher(text).find()) return "PHONE";
        if (K_VIDEO.matcher(text).find()) return "VIDEO";
        return "OTHER";
    }

    private static String linkIn(String text) {
        Matcher m = LINK.matcher(text);
        String calendly = null;
        while (m.find()) {
            String u = safeLink(m.group());
            if (u == null) continue;
            if (isMeetingHost(u)) {
                if (host(u).endsWith("calendly.com")) calendly = calendly == null ? u : calendly;
                else return u;
            }
        }
        return calendly;
    }

    private static final List<String> MEETING_HOSTS = List.of(
        "zoom.us", "zoomgov.com", "meet.google.com", "teams.microsoft.com", "teams.live.com", "webex.com", "calendly.com", "whereby.com", "gotomeeting.com", "goto.com", "bluejeans.com", "chime.aws", "meet.jit.si", "around.co", "hirevue.com", "goodtime.io"
    );

    static boolean isMeetingHost(String url) {
        String h = host(url);
        return MEETING_HOSTS.stream().anyMatch(m -> h.equals(m) || h.endsWith("." + m));
    }

    private static String host(String url) {
        try {
            String h = new URI(url).getHost();
            return h == null ? "" : h.toLowerCase(Locale.ROOT);
        } catch (URISyntaxException e) {
            return "";
        }
    }

    /** An http(s) URL with a host and no credentials, trimmed of trailing punctuation, at most 500 characters; else null. */
    static String safeLink(String raw) {
        if (raw == null) return null;
        String u = raw.trim().replaceAll("[.,;:!?)>\\]\"']+$", "");
        if (u.isEmpty() || u.length() > MAX_LINK || u.chars().anyMatch(c -> c < 0x21 || c == 0x7f)) return null;
        try {
            URI uri = new URI(u);
            String scheme = uri.getScheme();
            if (scheme == null || !(scheme.equalsIgnoreCase("http") || scheme.equalsIgnoreCase("https"))) return null;
            if (uri.getHost() == null || uri.getUserInfo() != null) return null;
            return u;
        } catch (URISyntaxException e) {
            return null;
        }
    }

    private static String locationIn(String text) {
        Matcher m = LOCATION_LINE.matcher(text);
        while (m.find()) {
            String loc = safeLocation(m.group(1));
            if (loc != null) return loc;
        }
        return null;
    }

    /** A place (not a link, not a label for a call), capped, control characters removed; null when empty or when it holds a never-collected value. */
    static String safeLocation(String raw) {
        String t = IcsReader.clean(raw, MAX_LOCATION);
        if (t == null || LINK.matcher(t).find()) return null;
        if (t.toLowerCase(Locale.ROOT).matches("(zoom|google meet|microsoft teams|teams|webex|phone|video|virtual|remote|online|tbd|n/a)( meeting| video call| call| interview)?\\.?")) return null;
        if (!SensitivePatterns.scanField("location", t).isEmpty()) return null;
        return t;
    }

    private static Integer durationMinutes(String text) {
        Matcher m = MINUTES.matcher(text);
        while (m.find()) {
            int n = Integer.parseInt(m.group(1) != null ? m.group(1) : m.group(2));
            if (n >= 10 && n <= 480) return n;
        }
        Matcher h = HOURS.matcher(text);
        if (h.find()) {
            String v = (h.group(1) != null ? h.group(1) : h.group(2)).toLowerCase(Locale.ROOT);
            double hours = switch (v) {
                case "a", "an", "one" -> 1;
                case "two" -> 2;
                default -> Double.parseDouble(v);
            };
            int n = (int) Math.round(hours * 60);
            if (n >= 10 && n <= 480) return n;
        }
        return null;
    }

    // ---- small helpers ---------------------------------------------------------------------------------------------------------------------

    private static String cap(String s) {
        String t = s.replaceAll("[\\p{Cntrl}&&[^\\n\\t]]+", " ");
        return t.length() > MAX_TEXT ? t.substring(0, MAX_TEXT) : t;
    }

    private static int clamp(int c) {
        return Math.max(0, Math.min(100, c));
    }
}
