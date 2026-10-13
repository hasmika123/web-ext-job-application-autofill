package com.dossier.api.service.resume;

import com.dossier.api.service.resume.ResumeDocument.Kind;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

/**
 * Renders a {@code ResumeDocument} as ATS-friendly plain text (the TXT export and the text the
 * ATS score reads).
 *
 * <pre>
 * PORTING RULES (packages/ui/src/resume/text.ts must match byte for byte)
 *
 * Separators, each INCLUDING its surrounding spaces: EM = " U+2014 " (em dash), EN = " U+2013 "
 * (en dash), DOT = " U+00B7 " (middle dot). Newline is "\n" only.
 * Text cleaning: every value goes through oneLine() = trimWs, then each internal run of
 * U+0009-U+000D / U+0020 becomes ONE space. So no value ever contains a newline.
 * join(sep, parts...) drops empty parts, then joins with sep; an all-empty list gives "".
 *
 * Layout (lines are joined with "\n"):
 *   HEADER   name
 *            headline
 *            contacts          = join(" | ", email, phone, location, link1, link2, ...)
 *                                link = (label empty ? url : label + ": " + url); a link whose url is
 *                                empty is dropped. Empty header lines are omitted.
 *   SECTIONS for each section in document order that is not hidden and renders at least one body
 *            line: one blank line (only if something precedes it), then the TITLE line, then the body.
 *            TITLE = oneLine(section.title) or the kind's default title if that is empty
 *            (Summary, Experience, Education, Skills, Projects, Certifications, Languages,
 *             Achievements, Interests, "Additional Information" for CUSTOM), upper-cased with the locale-free
 *            Unicode toUpperCase (Java toUpperCase(Locale.ROOT), JS toUpperCase()).
 *   END      the text ends with exactly one "\n" when it is non-empty; an empty document renders "".
 *
 * Hidden items are skipped. Items that render no line are skipped. Per kind, one item renders:
 *   SUMMARY        the text line. With list = "bullet" / "number" (v2): the text is split on "\n" and
 *                  every non-empty line (oneLine'd) is its own line prefixed "- " / "1. ", "2. ", "3. " ...
 *                  (a numbered list counts per list block: here, this one summary item).
 *   INTERESTS      the whole section is ONE line: every visible item's text (oneLine'd, empties
 *                  dropped) joined with ", ". Items are not separated by blank lines.
 *   EXPERIENCE     join(DOT, join(EM, title, org), location, dates), then "- " + bullet per bullet.
 *   CUSTOM         same as EXPERIENCE.
 *   EDUCATION      join(DOT, join(EM, join(" in ", degree, field), school), location, dates,
 *                  gpa empty ? "" : "GPA: " + gpa), then "- " bullets.
 *   PROJECTS       join(DOT, title, url), then "- " bullets.
 *   SKILLS         group empty ? skills : group + ": " + skills, skills = non-empty skills joined ", ";
 *                  an item with no skills renders nothing.
 *   CERTIFICATIONS join(DOT, join(EM, title, org), date, url).
 *   LANGUAGES      join(EM, name, level).
 *   ACHIEVEMENTS   "- " + join(DOT, text, date).
 * dates = current ? (start empty ? "Present" : start + EN + "Present")
 *                 : (start and end both non-empty ? start + EN + end : start + end)
 * (dates are the stored YYYY / YYYY-MM strings, untouched. Only EXPERIENCE/CUSTOM/EDUCATION have
 *  dates; for the other kinds "current" is ignored.)
 * Bullets (EXPERIENCE / EDUCATION / PROJECTS / CUSTOM) are "- " prefixed, or "1. ", "2. ", "3. " ... when the
 * item has listStyle = "number" (the item's non-empty bullets are one list block: they count from 1 and the
 * next item's list restarts at 1). Inline marks are otherwise ignored (plain text), EXCEPT links: after the end
 * of every link mark (t = "a") whose covered text (trimWs'd) is not already its href, " (" + trimWs(href)
 * + ")" is inserted; this is done on the RAW text using the mark offsets, before oneLine() collapses
 * whitespace. Malformed / out-of-range marks are ignored. Applies to the summary, bullets and
 * ACHIEVEMENTS text.
 * Items of EXPERIENCE, EDUCATION, PROJECTS and CUSTOM are separated by one blank line; items of
 * every other kind follow each other directly.
 * </pre>
 */
public final class ResumeDocumentText {

    private static final String EM = " " + (char) 0x2014 + " ";
    private static final String EN = " " + (char) 0x2013 + " ";
    private static final String DOT = " " + (char) 0x00B7 + " ";

    private ResumeDocumentText() {}

    public static String render(JsonNode doc) {
        List<String> out = new ArrayList<>();

        JsonNode basics = doc == null ? null : doc.get("basics");
        add(out, one(basics, "name"));
        add(out, one(basics, "headline"));
        List<String> contact = new ArrayList<>();
        contact.add(one(basics, "email"));
        contact.add(one(basics, "phone"));
        contact.add(one(basics, "location"));
        for (JsonNode l : ResumeDocument.list(basics, "links")) {
            String url = one(l, "url");
            String label = one(l, "label");
            contact.add(url.isEmpty() ? "" : label.isEmpty() ? url : label + ": " + url);
        }
        add(out, join(" | ", contact));

        for (JsonNode s : ResumeDocument.visibleSections(doc, null)) {
            Kind kind = Kind.parse(s.path("kind").asText(null));
            if (kind == null) continue;
            List<String> body = body(s, kind);
            if (body.isEmpty()) continue;
            if (!out.isEmpty()) out.add("");
            String title = one(s, "title");
            out.add((title.isEmpty() ? kind.defaultTitle() : title).toUpperCase(Locale.ROOT));
            out.addAll(body);
        }
        return out.isEmpty() ? "" : String.join("\n", out) + "\n";
    }

    private static List<String> body(JsonNode section, Kind kind) {
        if (kind == Kind.INTERESTS) {
            List<String> interests = new ArrayList<>();
            for (JsonNode item : ResumeDocument.visibleItems(section)) interests.add(one(item, "text"));
            String line = join(", ", interests);
            return line.isEmpty() ? new ArrayList<>() : new ArrayList<>(List.of(line));
        }
        boolean block = kind == Kind.EXPERIENCE || kind == Kind.EDUCATION || kind == Kind.PROJECTS || kind == Kind.CUSTOM;
        List<String> body = new ArrayList<>();
        for (JsonNode item : ResumeDocument.visibleItems(section)) {
            List<String> lines = item(item, kind);
            if (lines.isEmpty()) continue;
            if (block && !body.isEmpty()) body.add("");
            body.addAll(lines);
        }
        return body;
    }

    private static List<String> item(JsonNode it, Kind kind) {
        List<String> lines = new ArrayList<>();
        switch (kind) {
            case SUMMARY -> summary(lines, it);
            case EXPERIENCE, CUSTOM -> {
                add(lines, join(DOT, join(EM, one(it, "title"), one(it, "org")), one(it, "location"), dates(it)));
                bullets(lines, it);
            }
            case EDUCATION -> {
                String degree = join(" in ", one(it, "degree"), one(it, "field"));
                String gpa = one(it, "gpa");
                add(
                    lines,
                    join(DOT, join(EM, degree, one(it, "school")), one(it, "location"), dates(it), gpa.isEmpty() ? "" : "GPA: " + gpa)
                );
                bullets(lines, it);
            }
            case PROJECTS -> {
                add(lines, join(DOT, one(it, "title"), one(it, "url")));
                bullets(lines, it);
            }
            case SKILLS -> {
                List<String> skills = new ArrayList<>();
                for (JsonNode sk : ResumeDocument.list(it, "skills")) {
                    skills.add(sk.isTextual() ? ResumeDocument.oneLine(sk.textValue()) : "");
                }
                String joined = join(", ", skills);
                String group = one(it, "group");
                if (!joined.isEmpty()) add(lines, group.isEmpty() ? joined : group + ": " + joined);
            }
            case CERTIFICATIONS -> add(lines, join(DOT, join(EM, one(it, "title"), one(it, "org")), one(it, "date"), one(it, "url")));
            case LANGUAGES -> add(lines, join(EM, one(it, "name"), one(it, "level")));
            case INTERESTS -> add(lines, one(it, "text")); // body() normally joins the whole section onto one line
            case ACHIEVEMENTS -> {
                String line = join(DOT, marked(it), one(it, "date"));
                if (!line.isEmpty()) lines.add("- " + line);
            }
        }
        return lines;
    }

    private static void bullets(List<String> lines, JsonNode item) {
        boolean numbered = ResumeDocument.str(item, "listStyle").equals("number");
        int n = 0;
        for (JsonNode b : ResumeDocument.list(item, "bullets")) {
            String t = marked(b);
            if (!t.isEmpty()) lines.add(marker(numbered, ++n) + t);
        }
    }

    /** SUMMARY: one line, or - when {@code list} is set - one marker-prefixed line per non-empty "\n" line. */
    private static void summary(List<String> lines, JsonNode it) {
        String text = withLinks(it);
        String list = ResumeDocument.str(it, "list");
        if (!ResumeDocument.isListed(it, "list")) {
            add(lines, ResumeDocument.oneLine(text));
            return;
        }
        boolean numbered = list.equals("number");
        int n = 0;
        for (String line : text.split("\n", -1)) {
            String t = ResumeDocument.oneLine(line);
            if (!t.isEmpty()) lines.add(marker(numbered, ++n) + t);
        }
    }

    /** A numbered list counts "1. ", "2. ", "3. " ... per list block (the n-th non-empty line of one bullets list / one list summary); otherwise "- ". */
    private static String marker(boolean numbered, int n) {
        return numbered ? n + ". " : "- ";
    }

    /** {@code node.text} with link suffixes, as a single cleaned line. */
    private static String marked(JsonNode node) {
        return ResumeDocument.oneLine(withLinks(node));
    }

    /**
     * {@code node.text} (raw, uncleaned) with {@code " (<href>)"} inserted right after the end of every
     * link mark ({@code t == "a"}) whose covered text (trimmed) is not already the URL. Offsets are UTF-16
     * units into the raw text, so this runs <em>before</em> whitespace is collapsed. Marks that are
     * malformed or out of range are ignored (this never throws); other mark types are plain text.
     */
    static String withLinks(JsonNode node) {
        JsonNode t = node == null ? null : node.get("text");
        String raw = t != null && t.isTextual() ? t.textValue() : "";
        List<JsonNode> links = new ArrayList<>();
        for (JsonNode m : ResumeDocument.list(node, "marks")) {
            if (!m.isObject()) continue;
            JsonNode s = m.get("s");
            JsonNode e = m.get("e");
            JsonNode type = m.get("t");
            JsonNode href = m.get("href");
            if (s == null || e == null || !s.isInt() || !e.isInt() || type == null || !type.isTextual()) continue;
            if (!type.textValue().equals("a") || href == null || !href.isTextual()) continue;
            if (s.intValue() < 0 || s.intValue() >= e.intValue() || e.intValue() > raw.length()) continue;
            String url = ResumeDocument.trimWs(href.textValue());
            if (url.isEmpty()) continue;
            if (ResumeDocument.trimWs(raw.substring(s.intValue(), e.intValue())).equals(url)) continue;
            links.add(m);
        }
        if (links.isEmpty()) return raw;
        links.sort(Comparator.comparingInt((JsonNode m) -> m.get("e").intValue()));
        StringBuilder sb = new StringBuilder(raw.length() + 32);
        int at = 0;
        for (JsonNode m : links) {
            int e = m.get("e").intValue();
            sb.append(raw, at, e).append(" (").append(ResumeDocument.trimWs(m.get("href").textValue())).append(')');
            at = e;
        }
        return sb.append(raw, at, raw.length()).toString();
    }

    private static String dates(JsonNode it) {
        String start = one(it, "start");
        String end = one(it, "end");
        if (ResumeDocument.flag(it, "current")) return start.isEmpty() ? "Present" : start + EN + "Present";
        return !start.isEmpty() && !end.isEmpty() ? start + EN + end : start + end;
    }

    /** {@code node.field} as a single cleaned line ({@code ""} when absent). */
    private static String one(JsonNode node, String field) {
        JsonNode v = node == null ? null : node.get(field);
        return v != null && v.isTextual() ? ResumeDocument.oneLine(v.textValue()) : "";
    }

    private static void add(List<String> lines, String s) {
        if (!s.isEmpty()) lines.add(s);
    }

    private static String join(String sep, String... parts) {
        return join(sep, List.of(parts));
    }

    private static String join(String sep, List<String> parts) {
        StringBuilder sb = new StringBuilder();
        for (String p : parts) {
            if (p == null || p.isEmpty()) continue;
            if (sb.length() > 0) sb.append(sep);
            sb.append(p);
        }
        return sb.toString();
    }
}
