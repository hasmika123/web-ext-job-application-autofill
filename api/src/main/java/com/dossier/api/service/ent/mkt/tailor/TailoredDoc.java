package com.dossier.api.service.ent.mkt.tailor;

import com.dossier.api.service.resume.ResumeDocument;
import com.dossier.api.service.resume.ResumeDocument.Kind;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Writes a tailoring proposal into a builder document (docs/enterprise-v2/MKT-TAILOR-BUILD.md). The proposal names changes by the structured view's
 * refs ({@code summary}, {@code e<role>b<bullet>}), and this class walks the document in exactly the order {@code ResumeDocumentProjector.toStructured}
 * does, so a ref lands on the same text it was made from. A change is applied only where the document still holds its {@code before} text, so a
 * document that moved on is never overwritten blindly. Ticked additions are appended to the first visible skills list, if there is one.
 *
 * <p>Pure: it changes the given document in place and says what it did. Saving, validation and approval are the caller's.
 */
public final class TailoredDoc {

    private static final Pattern REF = Pattern.compile("^e(\\d+)b(\\d+)$");

    /** What was applied: the refs written, the refs skipped (the text had moved on), and the additions written or not (no skills list). */
    public record Outcome(List<String> applied, List<String> skipped, List<String> added, List<String> notAdded) {}

    /** One change to write: its ref, the text it replaces, and the new text. */
    public record Edit(String ref, String before, String after) {}

    private TailoredDoc() {}

    public static Outcome apply(ObjectNode doc, Collection<Edit> edits, Collection<String> additions) {
        List<String> applied = new ArrayList<>();
        List<String> skipped = new ArrayList<>();
        for (Edit e : edits) {
            if (e == null || e.ref() == null || e.after() == null || e.after().isBlank()) continue;
            boolean ok = "summary".equals(e.ref()) ? writeSummary(doc, e.before(), e.after()) : writeBullet(doc, e.ref(), e.before(), e.after());
            (ok ? applied : skipped).add(e.ref());
        }
        List<String> added = new ArrayList<>();
        List<String> notAdded = new ArrayList<>();
        ArrayNode skills = firstSkillsList(doc);
        for (String a : additions == null ? List.<String>of() : additions) {
            String term = a == null ? "" : a.trim();
            if (term.isEmpty()) continue;
            if (skills == null) {
                notAdded.add(term);
                continue;
            }
            if (!contains(skills, term)) skills.add(term);
            added.add(term);
        }
        return new Outcome(applied, skipped, added, notAdded);
    }

    /** The i-th experience entry (as the structured view counts them), its j-th non-empty bullet, if it still reads {@code before}. */
    private static boolean writeBullet(ObjectNode doc, String ref, String before, String after) {
        Matcher m = REF.matcher(ref);
        if (!m.matches()) return false;
        int want = Integer.parseInt(m.group(1));
        int bullet = Integer.parseInt(m.group(2));
        int i = 0;
        for (JsonNode s : ResumeDocument.visibleSections(doc, Kind.EXPERIENCE)) {
            for (JsonNode item : ResumeDocument.visibleItems(s)) {
                String title = ResumeDocument.str(item, "title");
                String org = ResumeDocument.str(item, "org");
                if (title.isEmpty() && org.isEmpty() && ResumeDocument.bulletTexts(item).isEmpty()) continue; // the structured view skips these too
                if (i++ != want) continue;
                int j = 0;
                for (JsonNode b : ResumeDocument.list(item, "bullets")) {
                    String text = b.isObject() ? ResumeDocument.str(b, "text") : "";
                    if (text.isEmpty()) continue;
                    if (j++ != bullet) continue;
                    if (!same(text, before)) return false;
                    ((ObjectNode) b).put("text", after.trim());
                    return true;
                }
                return false;
            }
        }
        return false;
    }

    /** The first visible summary text, if it still reads {@code before} (a summary kept as a list of lines is left alone). */
    private static boolean writeSummary(ObjectNode doc, String before, String after) {
        for (JsonNode s : ResumeDocument.visibleSections(doc, Kind.SUMMARY)) {
            for (JsonNode item : ResumeDocument.visibleItems(s)) {
                String text = ResumeDocument.str(item, "text");
                if (text.isEmpty()) continue;
                if (ResumeDocument.isListed(item, "list") || !same(text, before)) return false;
                ((ObjectNode) item).put("text", after.trim());
                return true;
            }
        }
        return false;
    }

    private static ArrayNode firstSkillsList(ObjectNode doc) {
        for (JsonNode s : ResumeDocument.visibleSections(doc, Kind.SKILLS)) {
            for (JsonNode item : ResumeDocument.visibleItems(s)) {
                JsonNode list = item.get("skills");
                if (list instanceof ArrayNode arr) return arr;
            }
        }
        return null;
    }

    private static boolean contains(ArrayNode skills, String term) {
        String t = term.toLowerCase(Locale.ROOT);
        for (JsonNode s : skills) if (s.isTextual() && s.textValue().trim().toLowerCase(Locale.ROOT).equals(t)) return true;
        return false;
    }

    private static boolean same(String a, String b) {
        return ResumeDocument.trimWs(a).equals(ResumeDocument.trimWs(b == null ? "" : b));
    }

    /** The edits of a stored proposal ({@code summary}, {@code bullets[{ref,text}]}) for the kept refs, with each one's original text from {@code originals}. */
    public static List<Edit> edits(JsonNode proposal, Collection<String> keep, Map<String, String> originals) {
        List<Edit> out = new ArrayList<>();
        if (proposal == null) return out;
        if (keep.contains("summary") && proposal.hasNonNull("summary")) out.add(new Edit("summary", originals.get("summary"), proposal.get("summary").asText()));
        for (JsonNode b : proposal.path("bullets")) {
            String ref = b.path("ref").asText("");
            if (keep.contains(ref)) out.add(new Edit(ref, originals.get(ref), b.path("text").asText("")));
        }
        return out;
    }
}
