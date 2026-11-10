/**
 * Projects a `ResumeDocument` onto the `StructuredResume` the extension, matcher, tailor and ATS
 * score read from `resume.parsed_json`. Port of `ResumeDocumentProjector.java` - same rules, same
 * key order, byte-identical output on the shared fixtures. Rules (see the Java class comment):
 *
 * - Always six top-level keys: summary, skills, experience, education, languages, projects.
 * - Every string leaf is a string (never null) and trimmed with `trimWs`; `current` is a boolean.
 * - Hidden sections/items are skipped; empty bullets dropped; CERTIFICATIONS, ACHIEVEMENTS, INTERESTS
 *   and CUSTOM are not projected.
 * - v2: marks, photo and list styles are never read (a formatting-only edit leaves `parsed_json`, and
 *   so `ProfileVersion`, unchanged); a summary with `list` set projects as its trimmed non-empty
 *   lines joined by "\n".
 * - Experience: `current` wins over `end` (endDate is "" when current). Items with no title, org
 *   and bullets are skipped (education: no school/degree/field; languages: no name; projects: no
 *   title and no bullets).
 */
import { bulletTexts, flag, isListed, list, str, trimWs, visibleItems, visibleSections, type Json } from "./doc";
import { writeJson } from "./json";
import type { StructuredResume } from "../parser-core-types";

export function toStructured(doc: Json): StructuredResume {
  const out: StructuredResume = {
    summary: summary(doc),
    skills: [],
    experience: [],
    education: [],
    languages: [],
    projects: [],
  };

  for (const s of visibleSections(doc, "SKILLS")) {
    for (const item of visibleItems(s)) {
      for (const sk of list(item, "skills")) {
        const t = typeof sk === "string" ? trimWs(sk) : "";
        if (t) out.skills.push(t);
      }
    }
  }

  for (const s of visibleSections(doc, "EXPERIENCE")) {
    for (const item of visibleItems(s)) {
      const title = str(item, "title");
      const org = str(item, "org");
      const bullets = bulletTexts(item);
      if (!title && !org && bullets.length === 0) continue;
      const current = flag(item, "current");
      out.experience.push({
        company: org,
        title,
        location: str(item, "location"),
        startDate: str(item, "start"),
        endDate: current ? "" : str(item, "end"),
        current,
        bullets,
      });
    }
  }

  for (const s of visibleSections(doc, "EDUCATION")) {
    for (const item of visibleItems(s)) {
      const school = str(item, "school");
      const degree = str(item, "degree");
      const field = str(item, "field");
      if (!school && !degree && !field) continue;
      out.education.push({
        school,
        degree,
        field,
        location: str(item, "location"),
        startDate: str(item, "start"),
        endDate: str(item, "end"),
        gpa: str(item, "gpa"),
      });
    }
  }

  for (const s of visibleSections(doc, "LANGUAGES")) {
    for (const item of visibleItems(s)) {
      const name = str(item, "name");
      if (!name) continue;
      out.languages.push({ name, proficiency: str(item, "level") });
    }
  }

  for (const s of visibleSections(doc, "PROJECTS")) {
    for (const item of visibleItems(s)) {
      const title = str(item, "title");
      const bullets = bulletTexts(item);
      if (!title && bullets.length === 0) continue;
      out.projects.push({ name: title, bullets });
    }
  }
  return out;
}

/** Compact JSON: exactly what is stored in `resume.parsed_json`. */
export function toStructuredJson(doc: Json): string {
  return writeJson(toStructured(doc), { indent: 0 });
}

/** 2-space JSON plus one trailing newline: the golden-fixture form. */
export function toStructuredPretty(doc: Json): string {
  return writeJson(toStructured(doc), { indent: 2 }) + "\n";
}

function summary(doc: Json): string {
  for (const s of visibleSections(doc, "SUMMARY")) {
    for (const item of visibleItems(s)) {
      const t = str(item, "text");
      if (!t) continue;
      return isListed(item, "list") ? listLines(t) : t;
    }
  }
  return "";
}

/** A list summary projects as its trimmed, non-empty lines joined by "\n" (marks are never read). */
function listLines(text: string): string {
  return text
    .split("\n")
    .map((l) => trimWs(l))
    .filter((l) => l)
    .join("\n");
}
