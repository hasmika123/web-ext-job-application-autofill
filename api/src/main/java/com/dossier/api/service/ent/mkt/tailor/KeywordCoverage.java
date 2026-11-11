package com.dossier.api.service.ent.mkt.tailor;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * The tailoring score without AI (docs/enterprise-v2/MKT-TAILOR-BUILD.md, user decision 2026-11-11): the share of the job's key terms a resume covers.
 * The terms are the job's listed skills plus the keywords the tailoring engine found missing. A term is covered when it appears as a whole word or
 * phrase, case-insensitive, anywhere in the resume's text. The same rule scores the resume before, each change, and the result, so the number the
 * marketer watches moving is the number saved.
 */
public final class KeywordCoverage {

    /** At most this many terms count (a job's first skills come first). */
    public static final int MAX_TERMS = 25;

    private KeywordCoverage() {}

    /** The job's terms: listed skills first, then the engine's missing keywords; trimmed, de-duplicated without case, capped. */
    public static List<String> terms(Collection<String> jobSkills, Collection<String> missingKeywords) {
        Map<String, String> out = new LinkedHashMap<>();
        for (Collection<String> c : List.of(jobSkills == null ? List.<String>of() : jobSkills, missingKeywords == null ? List.<String>of() : missingKeywords)) {
            for (String s : c) {
                String t = s == null ? "" : s.trim().replaceAll("\\s+", " ");
                if (t.isEmpty() || t.length() > 60) continue;
                out.putIfAbsent(t.toLowerCase(Locale.ROOT), t);
                if (out.size() >= MAX_TERMS) return new ArrayList<>(out.values());
            }
        }
        return new ArrayList<>(out.values());
    }

    /** The searchable text of a structured resume (summary, skills, roles and their bullets, projects), lower-cased. */
    public static String text(JsonNode structured) {
        StringBuilder sb = new StringBuilder();
        if (structured == null) return "";
        add(sb, structured.path("summary").asText(""));
        structured.path("skills").forEach(s -> add(sb, s.asText("")));
        for (JsonNode e : structured.path("experience")) {
            add(sb, e.path("title").asText(""));
            add(sb, e.path("company").asText(""));
            e.path("bullets").forEach(b -> add(sb, b.asText("")));
        }
        for (JsonNode p : structured.path("projects")) {
            add(sb, p.path("name").asText(""));
            p.path("bullets").forEach(b -> add(sb, b.asText("")));
        }
        return sb.toString().toLowerCase(Locale.ROOT);
    }

    /** Whether {@code term} appears in {@code lowerText} as a whole word or phrase ("Go" does not match "good"; "C++" and "Node.js" match as written). */
    public static boolean covers(String lowerText, String term) {
        if (lowerText == null || term == null || term.isBlank()) return false;
        String t = term.trim().toLowerCase(Locale.ROOT);
        return Pattern.compile("(?<![a-z0-9])" + Pattern.quote(t) + "(?![a-z0-9+#])").matcher(lowerText).find();
    }

    /** The terms {@code lowerText} covers, in term order. */
    public static Set<String> covered(String lowerText, List<String> terms) {
        Set<String> out = new LinkedHashSet<>();
        for (String t : terms) if (covers(lowerText, t)) out.add(t);
        return out;
    }

    /** The terms a rewrite newly covers: in {@code after}, and in neither the resume as it was nor {@code before}. */
    public static List<String> adds(String lowerResumeText, String before, String after, List<String> terms) {
        String b = before == null ? "" : before.toLowerCase(Locale.ROOT);
        String a = after == null ? "" : after.toLowerCase(Locale.ROOT);
        List<String> out = new ArrayList<>();
        for (String t : terms) if (covers(a, t) && !covers(b, t) && !covers(lowerResumeText, t)) out.add(t);
        return out;
    }

    /** Whole percent of {@code terms} covered by {@code covered}; null when the job names no terms (there is nothing to score). */
    public static Integer percent(Collection<String> covered, List<String> terms) {
        if (terms == null || terms.isEmpty()) return null;
        int n = 0;
        Set<String> lower = new LinkedHashSet<>();
        for (String c : covered) lower.add(c.toLowerCase(Locale.ROOT));
        for (String t : terms) if (lower.contains(t.toLowerCase(Locale.ROOT))) n++;
        return (int) Math.round(n * 100.0 / terms.size());
    }

    private static void add(StringBuilder sb, String s) {
        if (s != null && !s.isBlank()) sb.append(' ').append(s);
    }
}
