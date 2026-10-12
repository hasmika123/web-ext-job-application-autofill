/** Test helper: loads the golden fixtures copied byte-for-byte from the Java resume-doc tests. */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ResumeDocument } from "./types";

const dir = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__");

export function fixtureText(name: string): string {
  return readFileSync(join(dir, name), "utf8");
}

export function fixtureDoc(name: "full" | "sparse"): ResumeDocument {
  return JSON.parse(fixtureText(`${name}.json`)) as ResumeDocument;
}

export const FIXTURES = ["full", "sparse"] as const;
