import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const ours = join(here, "__fixtures__");
const apiDir = join(here, "..", "..", "..", "..", "api", "src", "test", "resources", "resume-doc");

/** Contract fixtures shared with the Java tests: the two copies must be byte-identical (git normalises line endings). */
const SHARED = ["capabilities.json", "template-defaults.json"];

const norm = (s: string) => s.replace(/\r\n/g, "\n");

describe.skipIf(!existsSync(apiDir))("fixtures shared with the API", () => {
  it.each(SHARED)("%s is byte-identical to the api copy", (name) => {
    expect(norm(readFileSync(join(ours, name), "utf8"))).toBe(norm(readFileSync(join(apiDir, name), "utf8")));
  });
});
