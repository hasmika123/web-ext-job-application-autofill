package com.dossier.api.service.inbox;

import com.dossier.api.service.jobs.HtmlText;
import jakarta.mail.BodyPart;
import jakarta.mail.MessagingException;
import jakarta.mail.Multipart;
import jakarta.mail.Part;
import java.io.IOException;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * A message's readable text (Phase 14.3): the plain-text part if there is one, else the HTML part
 * turned into text; the quoted history of a reply cut off; capped. Parts that are attachments — a
 * {@code Content-Disposition: attachment}, or any part with a file name — are never opened, so their
 * bytes are never even downloaded (IMAP fetches a part only when it's read).
 */
public final class MailText {

    static final int MAX_CHARS = 20_000;
    private static final Pattern REPLY_HEADER = Pattern.compile("(?m)^\\s*(On .{5,200}wrote:|-{2,}\\s*Original Message\\s*-{2,}|From: .+\\R(Sent|Date): .+)\\s*$");

    private MailText() {}

    /** The text, or "" when the message has none worth keeping. */
    public static String of(Part message) {
        try {
            String plain = find(message, "text/plain", 0);
            String text = plain != null ? plain : htmlToText(find(message, "text/html", 0));
            return tidy(text == null ? "" : text);
        } catch (MessagingException | IOException | RuntimeException e) {
            return "";
        }
    }

    private static String find(Part p, String type, int depth) throws MessagingException, IOException {
        if (depth > 6 || isAttachment(p)) return null;
        if (p.isMimeType(type)) {
            Object c = p.getContent();
            return c instanceof String s ? s : null;
        }
        if (p.isMimeType("multipart/*")) {
            Object c = p.getContent();
            if (c instanceof Multipart mp) {
                for (int i = 0; i < mp.getCount(); i++) {
                    BodyPart bp = mp.getBodyPart(i);
                    String s = find(bp, type, depth + 1);
                    if (s != null && !s.isBlank()) return s;
                }
            }
        }
        return null;
    }

    static boolean isAttachment(Part p) throws MessagingException {
        String d = p.getDisposition();
        return (d != null && d.toLowerCase(Locale.ROOT).startsWith(Part.ATTACHMENT)) || p.getFileName() != null;
    }

    private static String htmlToText(String html) {
        return html == null ? null : HtmlText.toText(html, MAX_CHARS * 2);
    }

    /** Cut the quoted history, drop "&gt;" lines, collapse blank runs, cap. */
    static String tidy(String text) {
        String t = text.replace("\r\n", "\n");
        var m = REPLY_HEADER.matcher(t);
        if (m.find() && m.start() > 0) t = t.substring(0, m.start());
        StringBuilder sb = new StringBuilder();
        for (String line : t.split("\n", -1)) if (!line.startsWith(">")) sb.append(line).append('\n');
        String out = sb.toString().replaceAll("[ \\t]+\n", "\n").replaceAll("\n{3,}", "\n\n").trim();
        return out.length() > MAX_CHARS ? out.substring(0, MAX_CHARS) : out;
    }
}
