/** Test helper: loads the golden fixtures copied byte-for-byte from the Java resume-doc tests. */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ResumeDocument } from "./types";

const dir = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__");

export function fixtureText(name: string): string {
  return readFileSync(join(dir, name), "utf8");
}

export type FixtureName = "full" | "sparse" | "full-v2" | "full-v1-upgraded" | "caps-doc";

/** The parsed fixture as stored (`full` and `sparse` are schema 1; the rest are schema 2). */
export function fixtureDoc(name: FixtureName): ResumeDocument {
  return JSON.parse(fixtureText(`${name}.json`)) as ResumeDocument;
}

/** The fixtures that have `.txt`, `.structured.json` and `.hash.txt` goldens (v1: full, sparse; v2: full-v2). */
export const FIXTURES = ["full", "sparse", "full-v2"] as const;
