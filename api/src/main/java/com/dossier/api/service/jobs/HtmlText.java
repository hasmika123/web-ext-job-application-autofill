package com.dossier.api.service.jobs;

import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Job descriptions arrive as HTML (Greenhouse's is even HTML-escaped once more). This turns them
 * into readable plain text — each block (paragraph, heading, list item) on its own line, list
 * items with a bullet, entities decoded — without a parser dependency. Good enough for a model to
 * read and a person to skim; nothing here is ever rendered as HTML. Also used for HTML-only email
 * bodies (14.3).
 */
public final class HtmlText {

    private static final Pattern DROP = Pattern.compile("(?is)<(script|style)[^>]*>.*?</\\1>");
    private static final Pattern LI = Pattern.compile("(?i)<li[^>]*>");
    private static final Pattern BLOCK = Pattern.compile("(?i)</?(p|div|br|h[1-6]|ul|ol|li|tr|section|article|header|footer)\\b[^>]*>");
    private static final Pattern TAG = Pattern.compile("<[^>]+>");
    private static final Pattern ENTITY = Pattern.compile("&(#x[0-9a-fA-F]+|#\\d+|[a-zA-Z]+);");
    private static final Map<String, String> NAMED = Map.ofEntries(
        Map.entry("amp", "&"),
        Map.entry("lt", "<"),
        Map.entry("gt", ">"),
        Map.entry("quot", "\""),
        Map.entry("apos", "'"),
        Map.entry("nbsp", " "),
        Map.entry("ndash", "–"),
        Map.entry("mdash", "—"),
        Map.entry("rsquo", "’"),
        Map.entry("lsquo", "‘"),
        Map.entry("rdquo", "”"),
        Map.entry("ldquo", "“"),
        Map.entry("hellip", "…"),
        Map.entry("bull", "•"),
        Map.entry("middot", "·")
    );

    private HtmlText() {}

    /** HTML (or HTML-escaped HTML) → plain text, capped at {@code max} characters. */
    public static String toText(String html, int max) {
        if (html == null || html.isBlank()) return "";
        String s = html;
        // Greenhouse escapes its HTML: "&lt;p&gt;" — decode once first so the tags are real.
        if (!s.contains("<") && s.contains("&lt;")) s = decode(s);
        s = DROP.matcher(s).replaceAll(" ");
        s = LI.matcher(s).replaceAll("\n• ");
        s = BLOCK.matcher(s).replaceAll("\n");
        s = TAG.matcher(s).replaceAll("");
        s = decode(s).replace(' ', ' ');
        s = s.replaceAll("[ \\t\\x0B\\f\\r]+", " ").replaceAll(" *\n *", "\n").replaceAll("\n{2,}", "\n").trim();
        return s.length() > max ? s.substring(0, max) : s;
    }

    static String decode(String s) {
        Matcher m = ENTITY.matcher(s);
        StringBuilder out = new StringBuilder();
        while (m.find()) {
            String e = m.group(1);
            String r;
            try {
                if (e.startsWith("#x")) r = new String(Character.toChars(Integer.parseInt(e.substring(2), 16)));
                else if (e.startsWith("#")) r = new String(Character.toChars(Integer.parseInt(e.substring(1))));
                else r = NAMED.getOrDefault(e.toLowerCase(), m.group());
            } catch (IllegalArgumentException ex) {
                r = m.group();
            }
            m.appendReplacement(out, Matcher.quoteReplacement(r));
        }
        m.appendTail(out);
        return out.toString();
    }
}
