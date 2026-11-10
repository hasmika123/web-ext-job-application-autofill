import { describe, expect, it } from "vitest";
import { firstHeading, parseInline, parsePolicy, plainText, safeHref } from "./policy-markdown";
import { diffLines, diffStats } from "../policy-diff";

describe("safeHref", () => {
  it("allows https, mailto, same-host paths and anchors only", () => {
    for (const ok of ["https://a.example/x", "HTTPS://A.EXAMPLE", "mailto:a@b.example", "/support", "#top"]) expect(safeHref(ok), ok).toBe(true);
    for (const bad of ["javascript:alert(1)", "JavaScript:x", "data:text/html,x", "//evil.example", "http://a.example", "ftp://a.example", "vbscript:x", "", "  "]) expect(safeHref(bad), bad).toBe(false);
  });
});

describe("parseInline", () => {
  it("parses bold, italic and links; unbalanced markers stay text", () => {
    expect(parseInline("a **b** c")).toEqual([{ t: "text", v: "a " }, { t: "bold", c: [{ t: "text", v: "b" }] }, { t: "text", v: " c" }]);
    expect(parseInline("*x*")).toEqual([{ t: "italic", c: [{ t: "text", v: "x" }] }]);
    expect(parseInline("2 * 3")).toEqual([{ t: "text", v: "2 * 3" }]);
    expect(parseInline("[us](https://a.example)")).toEqual([{ t: "link", href: "https://a.example", c: [{ t: "text", v: "us" }] }]);
  });

  it("turns a link with an unsafe target into plain text and never emits it", () => {
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "//evil.example/x", "http://plain.example"]) {
      const out = parseInline(`[click](${bad})`);
      expect(out).toEqual([{ t: "text", v: "click" }]);
    }
  });

  it("keeps markup characters as text (React escapes them)", () => {
    expect(parseInline("<script>alert(1)</script>")).toEqual([{ t: "text", v: "<script>alert(1)</script>" }]);
  });
});

describe("parsePolicy", () => {
  const md = "# Privacy Policy\n\nWe keep **little** data.\nSecond line.\n\n## What we collect\n\n- name\n- e-mail\n\n1. one\n2. two\n\n### Small\ntext";

  it("builds headings, paragraphs and lists", () => {
    const blocks = parsePolicy(md);
    expect(blocks.map((b) => b.t)).toEqual(["heading", "p", "heading", "ul", "ol", "heading", "p"]);
    expect(blocks[0]).toMatchObject({ t: "heading", level: 1 });
    expect(blocks[3]).toMatchObject({ t: "ul" });
    expect((blocks[3] as { items: unknown[] }).items).toHaveLength(2);
    expect(firstHeading(blocks)).toBe("Privacy Policy");
    expect(plainText(blocks)).toContain("We keep little data. Second line.");
  });

  it("handles empty text and CRLF", () => {
    expect(parsePolicy("")).toEqual([]);
    expect(parsePolicy("a\r\n\r\nb")).toHaveLength(2);
  });
});

describe("diffLines", () => {
  it("marks added and removed lines against the live text", () => {
    const d = diffLines("a\nb\nc", "a\nB\nc\nd");
    expect(d.map((l) => `${l.kind[0]}:${l.text}`)).toEqual(["s:a", "r:b", "a:B", "s:c", "a:d"]);
    expect(diffStats(d)).toEqual({ added: 2, removed: 1 });
  });

  it("treats a first publication as all added and identical text as all same", () => {
    expect(diffLines(null, "x\ny").every((l) => l.kind === "added")).toBe(true);
    expect(diffLines("x\ny", "x\ny").every((l) => l.kind === "same")).toBe(true);
  });
});
