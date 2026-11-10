package com.dossier.api.service;

import com.dossier.api.service.privacy.SensitivePatterns;
import com.dossier.api.service.resume.ResumeDocument;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.text.Normalizer;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Bounded AI inputs shared by the resume-vs-job features (13.2 resume match, 13.3 job fit): the
 * cleaned, capped job description, and a resume as a compact digest built from its parsed JSON.
 * Per the 13.1 cost rules nothing unbounded ever reaches a model — the limits live here, once.
 */
public final class AiInputs {

    /** Shorter than this and it's a page summary, not a job description — scoring it would be noise. */
    public static final int MIN_JD_CHARS = 200;
    public static final int MAX_JD_CHARS = 8000;

    /** How much of a resume goes in. {@link #BRIEF} for ranking several; {@link #DETAILED} for one. */
    public record Limits(int summary, int skills, int roles, int bulletsPerRole, int bulletChars, int degrees) {}

    public static final Limits BRIEF = new Limits(500, 40, 6, 1, 160, 3);
    public static final Limits DETAILED = new Limits(800, 60, 8, 3, 220, 4);

    private static final ObjectMapper OM = new ObjectMapper();

    private AiInputs() {}

    public static String cleanJobDescription(String jd) {
        String t = jd == null ? "" : jd.replaceAll("\\s+", " ").trim();
        return t.length() > MAX_JD_CHARS ? t.substring(0, MAX_JD_CHARS) : t;
    }

    /** A resume as the model sees it — what decides fit, bounded by {@code lim}. */
    public static String resumeDigest(String parsedJson, Limits lim) {
        StringBuilder sb = new StringBuilder();
        JsonNode p;
        try {
            p = parsedJson == null || parsedJson.isBlank() ? OM.createObjectNode() : OM.readTree(parsedJson);
        } catch (Exception e) {
            p = OM.createObjectNode();
        }
        String summary = p.path("summary").asText("");
        if (!summary.isBlank()) sb.append("Summary: ").append(cap(summary, lim.summary())).append('\n');
        List<String> skills = new ArrayList<>();
        p.path("skills").forEach(s -> {
            if (skills.size() < lim.skills() && !s.asText("").isBlank()) skills.add(s.asText().trim());
        });
        if (!skills.isEmpty()) sb.append("Skills: ").append(String.join(", ", skills)).append('\n');
        int n = 0;
        for (JsonNode e : p.path("experience")) {
            if (n++ >= lim.roles()) break;
            String title = e.path("title").asText(""), company = e.path("company").asText("");
            String dates = (e.path("startDate").asText("") + "–" + (e.path("current").asBoolean(false) ? "present" : e.path("endDate").asText(""))).replaceAll("^–$", "");
            sb.append("Role: ").append(title).append(company.isBlank() ? "" : " at " + company).append(dates.isBlank() ? "" : " (" + dates + ")");
            int b = 0;
            for (JsonNode bullet : e.path("bullets")) {
                if (b++ >= lim.bulletsPerRole()) break;
                if (!bullet.asText("").isBlank()) sb.append(b == 1 ? " — " : "; ").append(cap(bullet.asText(), lim.bulletChars()));
            }
            sb.append('\n');
        }
        n = 0;
        for (JsonNode e : p.path("education")) {
            if (n++ >= lim.degrees()) break;
            String line = String.join(" ", e.path("degree").asText(""), e.path("field").asText(""), e.path("school").asText("").isBlank() ? "" : "— " + e.path("school").asText("")).trim();
            if (!line.isBlank()) sb.append("Education: ").append(line.replaceAll("\\s+", " ")).append('\n');
        }
        return sb.length() == 0 ? "(no details parsed)\n" : sb.toString();
    }

    // ---- digest v2: a Resume Builder document with stable refs (DESIGN 13.1) ----------------------------

    /**
     * One text the model may be asked to rewrite and may answer by: a bullet, the summary item or an
     * achievement. {@code id} is the document id ({@code b_x1Y2z3}); {@code text} is the stored plain text.
     */
    public record Ref(String id, String sectionKind, String section, String text, boolean formatted) {}

    /**
     * What the model is shown ({@code text}, refs in square brackets), every rewritable text by id
     * ({@code refs}, uncapped so a request can name any visible line) and the plain text the truth checks
     * compare against ({@code sourceText}: visible content only, headline and target included).
     */
    public record ResumeDigest(String text, Map<String, Ref> refs, String sourceText, String headline) {}

    /**
     * The document as the model sees it (digest v2): {@code basics} reduced to the headline (name, e-mail, phone,
     * links and photo never leave), hidden sections and items skipped, inline marks stripped, and every value
     * passed through {@link #forModel} (so a never-collected value or a delimiter cannot ride along). Bounded by
     * {@code lim}; the refs map is not.
     */
    public static ResumeDigest resumeDigestV2(JsonNode doc, Limits lim) {
        StringBuilder out = new StringBuilder();
        StringBuilder source = new StringBuilder();
        Map<String, Ref> refs = new LinkedHashMap<>();
        String headline = ResumeDocument.str(doc == null ? null : doc.get("basics"), "headline");
        if (!headline.isEmpty()) {
            out.append("Headline: ").append(forModel(headline)).append('\n');
            source.append(headline).append('\n');
        }
        String target = ResumeDocument.str(doc == null ? null : doc.get("meta"), "target");
        if (!target.isEmpty()) source.append(target).append('\n');
        int skillBudget = lim.skills();
        int roles = 0;
        int education = 0;
        for (JsonNode section : ResumeDocument.visibleSections(doc, null)) {
            ResumeDocument.Kind kind = ResumeDocument.Kind.parse(section.path("kind").asText(null));
            if (kind == null) continue;
            String title = ResumeDocument.str(section, "title");
            for (JsonNode item : ResumeDocument.visibleItems(section)) {
                switch (kind) {
                    case SUMMARY -> {
                        String text = ResumeDocument.str(item, "text");
                        if (text.isEmpty()) break;
                        Ref r = addRef(refs, item, kind, "Summary", text);
                        out.append("Summary [").append(r.id()).append("]: ").append(cap(forModel(text), lim.summary())).append('\n');
                        source.append(text).append('\n');
                    }
                    case ACHIEVEMENTS -> {
                        String text = ResumeDocument.str(item, "text");
                        if (text.isEmpty()) break;
                        Ref r = addRef(refs, item, kind, title.isEmpty() ? "Achievements" : title, text);
                        out.append("Achievement [").append(r.id()).append("]: ").append(cap(forModel(text), lim.bulletChars())).append('\n');
                        source.append(text).append(' ').append(ResumeDocument.str(item, "date")).append('\n');
                    }
                    case EXPERIENCE, CUSTOM -> {
                        String header = join(" at ", ResumeDocument.str(item, "title"), ResumeDocument.str(item, "org"));
                        String dates = dates(item);
                        source.append(header).append(' ').append(ResumeDocument.str(item, "location")).append(' ').append(dates).append('\n');
                        boolean shown = roles++ < lim.roles();
                        if (shown) out.append(kind == ResumeDocument.Kind.CUSTOM && !title.isEmpty() ? title + ": " : "Role: ").append(forModel(header)).append(dates.isEmpty() ? "" : " (" + forModel(dates) + ")").append('\n');
                        bullets(out, source, refs, item, kind, join(" · ", ResumeDocument.str(item, "title"), ResumeDocument.str(item, "org")), shown ? lim : null);
                    }
                    case EDUCATION -> {
                        String degree = join(" in ", ResumeDocument.str(item, "degree"), ResumeDocument.str(item, "field"));
                        String header = join(" — ", degree, ResumeDocument.str(item, "school"));
                        String dates = dates(item);
                        source.append(header).append(' ').append(dates).append(' ').append(ResumeDocument.str(item, "gpa")).append('\n');
                        boolean shown = education++ < lim.degrees();
                        if (shown && !header.isEmpty()) out.append("Education: ").append(forModel(header)).append('\n');
                        bullets(out, source, refs, item, kind, join(" · ", degree, ResumeDocument.str(item, "school")), shown ? lim : null);
                    }
                    case PROJECTS -> {
                        String header = ResumeDocument.str(item, "title");
                        source.append(header).append(' ').append(dates(item)).append('\n');
                        if (!header.isEmpty()) out.append("Project: ").append(forModel(header)).append('\n');
                        bullets(out, source, refs, item, kind, header, lim);
                    }
                    case SKILLS -> {
                        List<String> skills = new ArrayList<>();
                        for (JsonNode s : ResumeDocument.list(item, "skills")) {
                            String t = s.isTextual() ? ResumeDocument.oneLine(s.textValue()) : "";
                            if (!t.isEmpty()) skills.add(t);
                        }
                        if (skills.isEmpty()) break;
                        source.append(String.join(", ", skills)).append('\n');
                        String group = ResumeDocument.str(item, "group");
                        List<String> shown = new ArrayList<>();
                        for (String s : skills) {
                            if (skillBudget-- <= 0) break;
                            shown.add(forModel(s));
                        }
                        if (!shown.isEmpty()) out.append(group.isEmpty() ? "Skills: " : forModel(group) + ": ").append(String.join(", ", shown)).append('\n');
                    }
                    case CERTIFICATIONS -> {
                        String line = join(" — ", ResumeDocument.str(item, "title"), ResumeDocument.str(item, "org"));
                        source.append(line).append(' ').append(ResumeDocument.str(item, "date")).append('\n');
                        if (!line.isEmpty()) out.append("Certification: ").append(forModel(line)).append('\n');
                    }
                    case LANGUAGES, INTERESTS -> source.append(ResumeDocument.str(item, "name")).append(' ').append(ResumeDocument.str(item, "text")).append('\n');
                }
            }
        }
        String digest = out.length() == 0 ? "(no details)\n" : out.toString();
        return new ResumeDigest(digest, refs, source.toString(), headline);
    }

    private static void bullets(StringBuilder out, StringBuilder source, Map<String, Ref> refs, JsonNode item, ResumeDocument.Kind kind, String sectionLabel, Limits shown) {
        int n = 0;
        for (JsonNode b : ResumeDocument.list(item, "bullets")) {
            String text = ResumeDocument.str(b, "text");
            if (text.isEmpty()) continue;
            Ref r = addRef(refs, b, kind, sectionLabel, text);
            source.append(text).append('\n');
            if (shown != null && n++ < shown.bulletsPerRole()) {
                out.append("  [").append(r.id()).append("] ").append(cap(forModel(text), shown.bulletChars())).append('\n');
            }
        }
    }

    private static Ref addRef(Map<String, Ref> refs, JsonNode node, ResumeDocument.Kind kind, String section, String text) {
        String id = ResumeDocument.str(node, "id");
        boolean formatted = node.path("marks").isArray() && node.path("marks").size() > 0;
        Ref r = new Ref(id, kind.name(), section, text, formatted);
        refs.put(id, r);
        return r;
    }

    private static String dates(JsonNode item) {
        String start = ResumeDocument.str(item, "start");
        String end = ResumeDocument.str(item, "end");
        if (ResumeDocument.flag(item, "current")) return start.isEmpty() ? "Present" : start + "–Present";
        return !start.isEmpty() && !end.isEmpty() ? start + "–" + end : start + end;
    }

    private static String join(String sep, String... parts) {
        StringBuilder sb = new StringBuilder();
        for (String p : parts) {
            if (p == null || p.isEmpty()) continue;
            if (sb.length() > 0) sb.append(sep);
            sb.append(p);
        }
        return sb.toString();
    }

    /**
     * A user-owned text on its way into a prompt: a never-collected value ({@link SensitivePatterns}) replaced by
     * {@code [removed]}, the {@code <<<} / {@code >>>} data delimiters removed (so the text cannot close its own
     * block), whitespace collapsed.
     */
    public static String forModel(String text) {
        String t = SensitivePatterns.redact(text == null ? "" : text);
        return t.replace("<<<", "").replace(">>>", "").replaceAll("\\s+", " ").trim();
    }

    // ---- untrusted third-party text (the I3.3 shape, local until I3.3 lands) ----------------------------

    private static final Pattern INSTRUCTION_LINE = Pattern.compile(
        "^\\s*(?:(?:ignore|disregard)\\s+(?:all|any|the|previous|above|prior)\\b.*|you\\s+are\\s+(?:now\\s+)?(?:a|an|the|no longer)\\b.*|system\\s*:.*|assistant\\s*:.*|(?:new|updated)\\s+instructions?\\b.*|\\[?(?:inst|sys)\\]?.*|act\\s+as\\b.*|respond\\s+(?:only\\s+)?with\\b.*|.*\\b(?:print|reveal|repeat)\\s+(?:your|the)\\s+(?:system\\s+)?prompt\\b.*|</?(?:system|instruction|prompt)\\b.*)$",
        Pattern.CASE_INSENSITIVE
    );
    private static final Pattern INVISIBLE = Pattern.compile("[\\u200B-\\u200F\\u202A-\\u202E\\u2060-\\u2064\\uFEFF]");

    /**
     * Third-party text (a job description) as a delimited block the system prompt calls data: NFKC-normalised,
     * invisible and bidi controls removed, instruction-shaped lines dropped, delimiters inside it removed,
     * capped at {@code maxChars} ({@link #MAX_JD_CHARS} for a JD). Blank in, empty string out.
     */
    public static String untrusted(String raw, int maxChars, String kind) {
        if (raw == null || raw.isBlank()) return "";
        String t = INVISIBLE.matcher(Normalizer.normalize(raw, Normalizer.Form.NFKC)).replaceAll("").replace("<<<", "").replace(">>>", "");
        StringBuilder sb = new StringBuilder();
        for (String line : t.split("\\R")) {
            String l = line.replaceAll("[ \\t]+", " ").trim();
            if (l.isEmpty() || INSTRUCTION_LINE.matcher(l).matches()) continue;
            if (sb.length() > 0) sb.append('\n');
            sb.append(l);
        }
        String body = sb.length() > maxChars ? sb.substring(0, maxChars) : sb.toString();
        return body.isEmpty() ? "" : "<<<" + kind + "\n" + body + "\n>>>";
    }

    public static String cap(String s, int max) {
        String t = s == null ? "" : s.replaceAll("\\s+", " ").trim();
        return t.length() > max ? t.substring(0, max - 1) + "…" : t;
    }

    public static String sha256(String s) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is mandatory in every JVM", e);
        }
    }
}
