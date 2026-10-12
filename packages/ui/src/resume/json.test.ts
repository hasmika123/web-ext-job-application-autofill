import { describe, expect, it } from "vitest";
import { FIXTURES, fixtureDoc, fixtureText } from "./test-fixtures";
import { canonicalJson, contentHash, writeJson } from "./json";

describe("writeJson", () => {
  it("matches JSON.stringify for ordinary values (compact and indented)", () => {
    const v = { a: [1, 2, { b: "x\ty\n\"z\"\\" }], c: null, d: true, e: [], f: {}, g: "Zürich – ok" };
    expect(writeJson(v)).toBe(JSON.stringify(v));
    expect(writeJson(v, { indent: 2 })).toBe(JSON.stringify(v, null, 2));
  });

  it("escapes control chars and lone surrogates in lowercase hex, writes the rest raw", () => {
    expect(writeJson("\u0001\u001f")).toBe('"\\u0001\\u001f"');
    expect(writeJson("\ud83d")).toBe('"\\ud83d"');
    expect(writeJson("\udc00")).toBe('"\\udc00"');
    expect(writeJson("😀")).toBe('"😀"');
    expect(writeJson("\u007f  ")).toBe('"\u007f  "');
  });
});

describe("canonical form and content hash", () => {
  it("sorts keys and trims string values, but never keys", () => {
    expect(canonicalJson({ b: "  x ", a: { d: 1, c: [" y"] }, " k": 2 })).toBe('{" k":2,"a":{"c":["y"],"d":1},"b":"x"}');
  });

  it("is stable across key order and edge whitespace", () => {
    const a = canonicalJson({ x: 1, y: "  hi" });
    const b = canonicalJson({ y: "hi\n", x: 1 });
    expect(a).toBe(b);
  });

  for (const name of FIXTURES) {
    it(`${name}: contentHash equals ${name}.hash.txt`, async () => {
      expect(await contentHash(fixtureDoc(name))).toBe(fixtureText(`${name}.hash.txt`).trim());
    });
  }
});
