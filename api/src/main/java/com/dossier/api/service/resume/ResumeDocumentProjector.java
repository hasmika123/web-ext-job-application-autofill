package com.dossier.api.service.resume;

import com.dossier.api.service.resume.ResumeDocument.Kind;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * Projects a {@code ResumeDocument} onto the {@code StructuredResume} the extension, the matcher,
 * the tailor and the ATS score already read from {@code resume.parsed_json}.
 *
 * <pre>
 * PORTING RULES (packages/ui/src/resume/project.ts must match byte for byte)
 *
 * Output shape and KEY ORDER (insertion order, never sorted):
 *   { "summary": string,
 *     "skills": [string],
 *     "experience": [ {company, title, location, startDate, endDate, current, bullets:[string]} ],
 *     "education":  [ {school, degree, field, location, startDate, endDate, gpa} ],
 *     "languages":  [ {name, proficiency} ],
 *     "projects":   [ {name, bullets:[string]} ] }
 * All six top-level keys are always present. Every string leaf is a string (never null): a missing,
 * null or non-string source field is "". "current" is a boolean.
 *
 * Strings: every emitted string is trimmed with ResumeDocument.trimWs (strip U+0009-U+000D and
 * U+0020 at both ends only; NOT String.trim()/JS trim()). Internal whitespace and newlines are kept.
 *
 * Visibility: a section with hidden=true is skipped whole; an item with hidden=true is skipped.
 * Sections are walked in document order, items in item order; bullets in bullet order. Bullets whose
 * trimmed text is empty are dropped.
 *
 * Mapping:
 *   summary    = trimmed text of the first visible SUMMARY item whose trimmed text is non-empty, else "".
 *   skills     = every visible SKILLS item's skills[], flattened in order, each trimmed, empties dropped,
 *                no de-duplication.
 *   experience = visible EXPERIENCE items: company=org, title, location, startDate=start,
 *                endDate = (current ? "" : end), current = (current === true), bullets = bullet texts.
 *                "current wins over end". Dates are emitted as stored (YYYY or YYYY-MM or "").
 *                An item is skipped when title and org are empty and it has no bullets.
 *   education  = visible EDUCATION items: school, degree, field, location, startDate=start,
 *                endDate=end, gpa. Skipped when school, degree and field are all empty.
 *   languages  = visible LANGUAGES items: name, proficiency=level. Skipped when name is empty.
 *   projects   = visible PROJECTS items: name=title, bullets. Skipped when title is empty and there are
 *                no bullets.
 * CERTIFICATIONS, ACHIEVEMENTS and CUSTOM sections have no slot in StructuredResume and are not projected.
 *
 * Serialisation: ResumeDocumentJson. parsed_json is the compact form (JSON.stringify(x)); golden
 * fixtures use the 2-space form plus ONE trailing "\n" (JSON.stringify(x, null, 2) + "\n").
 * </pre>
 */
public final class ResumeDocumentProjector {

    private ResumeDocumentProjector() {}

    public static ObjectNode toStructured(JsonNode doc) {
        JsonNodeFactory f = JsonNodeFactory.instance;
        ObjectNode out = f.objectNode();
        out.put("summary", summary(doc));
        ArrayNode skills = out.putArray("skills");
        ArrayNode experience = out.putArray("experience");
        ArrayNode education = out.putArray("education");
        ArrayNode languages = out.putArray("languages");
        ArrayNode projects = out.putArray("projects");

        for (JsonNode s : ResumeDocument.visibleSections(doc, Kind.SKILLS)) {
            for (JsonNode item : ResumeDocument.visibleItems(s)) {
                for (JsonNode sk : ResumeDocument.list(item, "skills")) {
                    String t = sk.isTextual() ? ResumeDocument.trimWs(sk.textValue()) : "";
                    if (!t.isEmpty()) skills.add(t);
                }
            }
        }

        for (JsonNode s : ResumeDocument.visibleSections(doc, Kind.EXPERIENCE)) {
            for (JsonNode item : ResumeDocument.visibleItems(s)) {
                String title = ResumeDocument.str(item, "title");
                String org = ResumeDocument.str(item, "org");
                var bullets = ResumeDocument.bulletTexts(item);
                if (title.isEmpty() && org.isEmpty() && bullets.isEmpty()) continue;
                boolean current = ResumeDocument.flag(item, "current");
                ObjectNode e = experience.addObject();
                e.put("company", org);
                e.put("title", title);
                e.put("location", ResumeDocument.str(item, "location"));
                e.put("startDate", ResumeDocument.str(item, "start"));
                e.put("endDate", current ? "" : ResumeDocument.str(item, "end"));
                e.put("current", current);
                ArrayNode b = e.putArray("bullets");
                bullets.forEach(b::add);
            }
        }

        for (JsonNode s : ResumeDocument.visibleSections(doc, Kind.EDUCATION)) {
            for (JsonNode item : ResumeDocument.visibleItems(s)) {
                String school = ResumeDocument.str(item, "school");
                String degree = ResumeDocument.str(item, "degree");
                String field = ResumeDocument.str(item, "field");
                if (school.isEmpty() && degree.isEmpty() && field.isEmpty()) continue;
                ObjectNode e = education.addObject();
                e.put("school", school);
                e.put("degree", degree);
                e.put("field", field);
                e.put("location", ResumeDocument.str(item, "location"));
                e.put("startDate", ResumeDocument.str(item, "start"));
                e.put("endDate", ResumeDocument.str(item, "end"));
                e.put("gpa", ResumeDocument.str(item, "gpa"));
            }
        }

        for (JsonNode s : ResumeDocument.visibleSections(doc, Kind.LANGUAGES)) {
            for (JsonNode item : ResumeDocument.visibleItems(s)) {
                String name = ResumeDocument.str(item, "name");
                if (name.isEmpty()) continue;
                ObjectNode e = languages.addObject();
                e.put("name", name);
                e.put("proficiency", ResumeDocument.str(item, "level"));
            }
        }

        for (JsonNode s : ResumeDocument.visibleSections(doc, Kind.PROJECTS)) {
            for (JsonNode item : ResumeDocument.visibleItems(s)) {
                String title = ResumeDocument.str(item, "title");
                var bullets = ResumeDocument.bulletTexts(item);
                if (title.isEmpty() && bullets.isEmpty()) continue;
                ObjectNode e = projects.addObject();
                e.put("name", title);
                ArrayNode b = e.putArray("bullets");
                bullets.forEach(b::add);
            }
        }
        return out;
    }

    /** Compact JSON: exactly what is stored in {@code resume.parsed_json}. */
    public static String toStructuredJson(JsonNode doc) {
        return ResumeDocumentJson.write(toStructured(doc), 0);
    }

    /** 2-space JSON plus one trailing newline: the golden-fixture form. */
    public static String toStructuredPretty(JsonNode doc) {
        return ResumeDocumentJson.write(toStructured(doc), 2) + "\n";
    }

    private static String summary(JsonNode doc) {
        for (JsonNode s : ResumeDocument.visibleSections(doc, Kind.SUMMARY)) {
            for (JsonNode item : ResumeDocument.visibleItems(s)) {
                String t = ResumeDocument.str(item, "text");
                if (!t.isEmpty()) return t;
            }
        }
        return "";
    }
}
