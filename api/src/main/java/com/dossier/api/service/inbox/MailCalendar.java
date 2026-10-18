package com.dossier.api.service.inbox;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.mail.BodyPart;
import jakarta.mail.MessagingException;
import jakarta.mail.Multipart;
import jakarta.mail.Part;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.DateTimeException;
import java.time.ZoneOffset;
import java.util.Locale;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The calendar side of a mail (interview invitations): finds the {@code text/calendar} part, reads it for parsing ONLY, and keeps nothing but the few
 * fields {@link IcsReader} extracts ({@link IcsEvent}, as a small JSON). The calendar file is never stored, in line with "never store attachments":
 * an {@code invite.ics} that arrives as an attachment is read the same way and dropped. A part larger than {@value #MAX_BYTES} bytes is not opened.
 * Also reads the zone of the Date header, which is where a time written without a zone is read.
 */
public final class MailCalendar {

    static final int MAX_BYTES = 200_000;
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Pattern OFFSET = Pattern.compile("([+-])(\\d{2}):?(\\d{2})\\s*(?:\\(.*\\))?\\s*$");

    private MailCalendar() {}

    /** The event of the mail's first calendar part as JSON, or null when there is none worth keeping. Never throws. */
    public static String eventJson(Part message) {
        try {
            String ics = find(message, 0);
            if (ics == null) return null;
            Optional<IcsEvent> e = IcsReader.read(ics);
            return e.isEmpty() ? null : JSON.writeValueAsString(e.get());
        } catch (MessagingException | IOException | RuntimeException e) {
            return null;
        }
    }

    /** The stored JSON back to an event; null when blank or unreadable. */
    public static IcsEvent parse(String json) {
        if (json == null || json.isBlank()) return null;
        try {
            return JSON.readValue(json, IcsEvent.class);
        } catch (IOException | RuntimeException e) {
            return null;
        }
    }

    private static String find(Part p, int depth) throws MessagingException, IOException {
        if (depth > 6) return null;
        if (isCalendar(p)) {
            if (p.getSize() > MAX_BYTES) return null;
            Object c = p.getContent();
            if (c instanceof String s) return s.length() > MAX_BYTES ? s.substring(0, MAX_BYTES) : s;
            if (c instanceof InputStream in) {
                try (in) {
                    return new String(in.readNBytes(MAX_BYTES), StandardCharsets.UTF_8);
                }
            }
            return null;
        }
        if (p.isMimeType("multipart/*")) {
            Object c = p.getContent();
            if (c instanceof Multipart mp) {
                for (int i = 0; i < mp.getCount(); i++) {
                    BodyPart bp = mp.getBodyPart(i);
                    String s = find(bp, depth + 1);
                    if (s != null) return s;
                }
            }
        }
        return null;
    }

    private static boolean isCalendar(Part p) throws MessagingException {
        if (p.isMimeType("text/calendar") || p.isMimeType("application/ics")) return true;
        String name = p.getFileName();
        return name != null && name.toLowerCase(Locale.ROOT).endsWith(".ics");
    }

    /** The offset of a Date header ("Mon, 12 Oct 2026 09:30:00 -0700 (PDT)") as {@code -07:00}, or null (GMT, UT and unreadable headers give null: no information). */
    public static String offsetOf(String dateHeader) {
        if (dateHeader == null) return null;
        Matcher m = OFFSET.matcher(dateHeader.trim());
        if (!m.find()) return null;
        try {
            int h = Integer.parseInt(m.group(2));
            int mi = Integer.parseInt(m.group(3));
            int sign = "-".equals(m.group(1)) ? -1 : 1;
            ZoneOffset off = ZoneOffset.ofHoursMinutes(sign * h, sign * mi);
            return off.getTotalSeconds() == 0 ? null : off.getId();
        } catch (DateTimeException | NumberFormatException e) {
            return null;
        }
    }
}
