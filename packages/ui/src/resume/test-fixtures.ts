/** Test helper: loads the golden fixtures copied byte-for-byte from the Java resume-doc tests. */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ResumeDocument } from "./types";

const dir = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__");

export function fixtureText(name: string): string {
  return readFileSync(join(dir, name), "utf8");
}

export type FixtureName = "full" | "sparse" | "full-v2" | "full-v1-upgraded" | "caps-doc" | "sample";

/** The parsed fixture as stored (`full` and `sparse` are schema 1; the rest are schema 2). */
export function fixtureDoc(name: FixtureName): ResumeDocument {
  return JSON.parse(fixtureText(name === "sample" ? "sample-resume.json" : `${name}.json`)) as ResumeDocument;
}

/**
 * The shared sample resume (`sample-resume.json`, fictional Jordan Avery): every section kind, used by the template
 * snapshots, the thumbnail generator and the page-fit smoke tests. `sample-resume.json` is not named `sample.json`, so
 * it is read by its own name.
 */
export function sampleDoc(): ResumeDocument {
  return JSON.parse(fixtureText("sample-resume.json")) as ResumeDocument;
}

/**
 * The sample trimmed to what a one-page template must hold: the third role, the second project and the Volunteering
 * section are hidden (`hidden: true`, kept in the document). The input of the one-page budgets (TEMPLATES-DESIGN 11).
 */
export function onePageSample(): ResumeDocument {
  const doc = sampleDoc();
  for (const section of doc.sections) {
    if (section.kind === "CUSTOM") section.hidden = true;
    if (section.kind === "EXPERIENCE") section.items[2].hidden = true;
    if (section.kind === "PROJECTS") section.items[1].hidden = true;
  }
  return doc;
}

/** The fixtures that have `.txt`, `.structured.json` and `.hash.txt` goldens (v1: full, sparse; v2: full-v2). */
export const FIXTURES = ["full", "sparse", "full-v2"] as const;
