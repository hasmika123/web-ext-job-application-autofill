import { describe, expect, it } from "vitest";
import { FIXTURES, fixtureDoc, fixtureText } from "./test-fixtures";
import { canonicalJson, contentHash, renderHash, writeJson } from "./json";

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

  it("sorts marks by (s, e, t), only under the marks key, and leaves malformed lists alone", () => {
    const shuffled = { marks: [{ t: "u", e: 9, s: 4 }, { s: 0, e: 5, t: "i" }, { s: 0, e: 5, t: "b" }, { s: 0, e: 2, t: "u" }], other: [3, 1, 2] };
    expect(canonicalJson(shuffled)).toBe(
      '{"marks":[{"e":2,"s":0,"t":"u"},{"e":5,"s":0,"t":"b"},{"e":5,"s":0,"t":"i"},{"e":9,"s":4,"t":"u"}],"other":[3,1,2]}',
    );
    expect(canonicalJson({ marks: [{ s: 2, e: 3 }, { s: 1, e: 2, t: "b" }] })).toBe('{"marks":[{"e":3,"s":2},{"e":2,"s":1,"t":"b"}]}');
    // the non-canonical writer never reorders
    expect(writeJson({ marks: [{ s: 5, e: 6, t: "b" }, { s: 0, e: 1, t: "b" }] })).toBe('{"marks":[{"s":5,"e":6,"t":"b"},{"s":0,"e":1,"t":"b"}]}');
  });

  it("the order marks were added in never moves the hash", async () => {
    const a = fixtureDoc("full-v2");
    const b = JSON.parse(JSON.stringify(a));
    b.sections[0].items[0].marks.reverse();
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
    expect(await contentHash(b)).toBe(await contentHash(a));
  });

  for (const name of FIXTURES) {
    it(`${name}: contentHash equals ${name}.hash.txt`, async () => {
      expect(await contentHash(fixtureDoc(name))).toBe(fixtureText(`${name}.hash.txt`).trim());
    });
  }
});

describe("render hash (DESIGN 8.5)", () => {
  const CONTENT = "0123456789abcdef".repeat(4);

  it("matches the golden vectors Java RenderHashTest pins", async () => {
    expect(await renderHash(CONTENT, "modern", { spacing: "normal", accent: " #16a34a " })).toBe(
      "7d7edf32bfb8ad518debac946f80b41bc9be5a960eeea991ef5be78a70657c93",
    );
    expect(await renderHash(CONTENT, "classic", {})).toBe("02ef0e88814b8be4dfdaeafa136e00b28de4bb395ad6748d28b61b5a24cf2d0e");
  });

  it("an absent or null theme is {}", async () => {
    const empty = await renderHash(CONTENT, "classic", {});
    expect(await renderHash(CONTENT, "classic", undefined)).toBe(empty);
    expect(await renderHash(CONTENT, "classic", null)).toBe(empty);
  });

  it("template, theme and content each move the hash; key order does not", async () => {
    const base = await renderHash(CONTENT, "modern", { accent: "#16a34a" });
    expect(await renderHash(CONTENT, "classic", { accent: "#16a34a" })).not.toBe(base);
    expect(await renderHash(CONTENT, "modern", { accent: "#2563eb" })).not.toBe(base);
    expect(await renderHash("f".repeat(64), "modern", { accent: "#16a34a" })).not.toBe(base);
    expect(await renderHash(CONTENT, "modern", { b: 1, a: "x" })).toBe(await renderHash(CONTENT, "modern", { a: " x ", b: 1 }));
  });
});
