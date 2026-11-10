import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { REDACTED, labelOf, redact, redactField, scan, scanField, validIban } from "./sensitive-patterns";

interface Case {
  name: string;
  key?: string;
  text: string;
  hits: { cls: string; text: string }[];
}

const here = dirname(fileURLToPath(import.meta.url));
// Byte-for-byte copy of api/src/test/resources/sensitive-patterns/corpus.json (the Java twin runs the original).
const corpus = JSON.parse(readFileSync(join(here, "__fixtures__", "sensitive-patterns-corpus.json"), "utf8")) as { cases: Case[] };

function scanCase(c: Case) {
  return c.key !== undefined ? scanField(c.key, c.text) : scan(c.text);
}

describe("sensitive-patterns: shared corpus (same file as SensitivePatternsTest.java)", () => {
  it("has a meaningful corpus", () => {
    expect(corpus.cases.length).toBeGreaterThan(60);
  });

  for (const c of corpus.cases) {
    it(`hits: ${c.name}`, () => {
      const got = scanCase(c).map((h) => `${h.cls}:${c.text.slice(h.start, h.end)}`);
      const want = c.hits.map((h) => `${h.cls}:${h.text}`);
      expect(got).toEqual(want);
    });

    it(`redaction: ${c.name}`, () => {
      // Expected output derived from the case's own hit list, not from scan().
      let want = "";
      let pos = 0;
      for (const h of c.hits) {
        const at = c.text.indexOf(h.text, pos);
        expect(at).toBeGreaterThanOrEqual(0);
        want += c.text.slice(pos, at) + REDACTED;
        pos = at + h.text.length;
      }
      want += c.text.slice(pos);
      const got = c.key !== undefined ? redactField(c.key, c.text) : redact(c.text);
      expect(got).toBe(want);
    });
  }
});

describe("sensitive-patterns: API", () => {
  it("null and blank are empty", () => {
    expect(scan(null)).toEqual([]);
    expect(scan("  ")).toEqual([]);
    expect(scanField(null, null)).toEqual([]);
    expect(scanField(null, "SSN 123-45-6789")).toHaveLength(1);
  });

  it("hits are ordered and never overlap", () => {
    const hits = scan("SSN: 123-45-6789 DOB: 1990-05-12 EIN: 12-3456789 Passport no. X1234567");
    expect(hits.map((h) => h.cls)).toEqual(["SSN_ITIN", "DOB", "TAX_ID", "PASSPORT"]);
    for (let i = 1; i < hits.length; i++) expect(hits[i].start).toBeGreaterThanOrEqual(hits[i - 1].end);
  });

  it("redacted text is clean", () => {
    for (const c of corpus.cases) {
      if (c.key !== undefined) continue;
      expect(scan(redact(c.text)), c.name).toEqual([]);
    }
  });

  it("iban checksum", () => {
    expect(validIban("GB82 WEST 1234 5698 7654 32")).toBe(true);
    expect(validIban("GB82 WEST 1234 5698 7654 33")).toBe(false);
    expect(validIban("GB82")).toBe(false);
  });

  it("keys read as labels", () => {
    expect(labelOf("bankRoutingNumber")).toBe("bank Routing Number");
    expect(labelOf("bank_routing_number")).toBe("bank routing number");
    expect(labelOf("taxID")).toBe("tax ID");
  });
});
