import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AUTOFILL_FIELD_KEYS } from "./coverage";

/**
 * DESIGN 10 / DECISIONS #33f: the "~N fields" number is computed over the extension's canonical schema keys. This
 * reads `job-autofill/src/lib/schema.js` and fails when its `FIELDS` change, so an extension schema change breaks
 * THIS test, not the number a user is shown.
 */
const SCHEMA = path.join(__dirname, "..", "..", "..", "..", "job-autofill", "src", "lib", "schema.js");

function schemaKeys(): string[] {
  const src = readFileSync(SCHEMA, "utf8");
  const start = src.indexOf("const FIELDS = {");
  expect(start, "schema.js no longer declares `const FIELDS = {`").toBeGreaterThan(-1);
  const end = src.indexOf("};", start);
  const body = src.slice(start, end);
  // `key: "key",` lines (comments stripped first)
  return [...body.replace(/\/\/.*$/gm, "").matchAll(/^\s*(\w+)\s*:\s*"\w+"\s*,?\s*$/gm)].map((m) => m[1]);
}

describe("AUTOFILL_FIELD_KEYS vs the extension's schema", () => {
  it("is exactly the keys of schema.js FIELDS, in the same order", () => {
    expect([...AUTOFILL_FIELD_KEYS]).toEqual(schemaKeys());
  });
});
