import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtureDoc } from "../test-fixtures";
import ResumePreview from "../ResumePreview";
import { registerTemplateForTests } from "../registry";
import { designFree } from "./__test__/designFree";
import { DEFAULT_THEME } from "../theme";
import type { Mark, MarkType } from "../types";
import { DESIGN_FREE } from "../capabilities";
import { RichText, renderSections } from "./shared";

const html = (text: string, marks?: unknown, allowed?: readonly MarkType[], keepLines = false) =>
  renderToStaticMarkup(<RichText text={text} marks={marks} allowed={allowed} keepLines={keepLines} />);

describe("RichText", () => {
  it("without marks it is the plain trimmed, whitespace-collapsed text", () => {
    expect(html("  a   b\n c ")).toBe("a b c");
    expect(html("  a   b\n c ", [], undefined, true)).toBe("a   b\n c");
    expect(html("<b>&")).toBe("&lt;b&gt;&amp;");
    expect(html("")).toBe("");
  });

  it("emits strong, em, u and a for the four mark types", () => {
    expect(html("one two three four", [{ s: 0, e: 3, t: "b" }, { s: 4, e: 7, t: "i" }, { s: 8, e: 13, t: "u" }, { s: 14, e: 18, t: "a", href: "https://x.dev/a?b=1&c=2" }])).toBe(
      '<strong>one</strong> <em>two</em> <u>three</u> <a class="rz-link" href="https://x.dev/a?b=1&amp;c=2">four</a>',
    );
  });

  it("nests overlapping marks b > i > u > a, however they were stored", () => {
    const marks: Mark[] = [
      { s: 0, e: 6, t: "a", href: "mailto:a@b.dev" },
      { s: 0, e: 6, t: "u" },
      { s: 0, e: 6, t: "i" },
      { s: 0, e: 6, t: "b" },
    ];
    expect(html("abcdef", marks)).toBe('<strong><em><u><a class="rz-link" href="mailto:a@b.dev">abcdef</a></u></em></strong>');
  });

  it("verbatim (the editor's mirror layer) keeps every character where it was typed", () => {
    const text = "  a   b\n";
    expect(renderToStaticMarkup(<RichText text={text} verbatim />)).toBe("  a   b\n");
    expect(renderToStaticMarkup(<RichText text={text} marks={[{ s: 2, e: 3, t: "b" }]} verbatim />)).toBe("  <strong>a</strong>   b\n");
    // for text that needs no normalising it is the same markup as the template's renderer
    const marks: Mark[] = [{ s: 0, e: 3, t: "b" }, { s: 4, e: 8, t: "a", href: "https://x.dev" }];
    expect(renderToStaticMarkup(<RichText text="Cut page load" marks={marks} verbatim />)).toBe(html("Cut page load", marks));
  });

  it("splits at partial overlaps and keeps the nesting order in each piece", () => {
    expect(html("abcdef", [{ s: 0, e: 4, t: "b" }, { s: 2, e: 6, t: "i" }])).toBe("<strong>ab</strong><strong><em>cd</em></strong><em>ef</em>");
  });

  it("only draws the allowed types; the others render as plain text", () => {
    const marks: Mark[] = [{ s: 0, e: 3, t: "b" }, { s: 4, e: 7, t: "i" }, { s: 8, e: 11, t: "a", href: "https://x.dev" }];
    expect(html("one two six", marks, ["b"])).toBe("<strong>one</strong> two six");
    expect(html("one two six", marks, [])).toBe("one two six");
    expect(html("one two six", marks, ["i", "a"])).toBe('one <em>two</em> <a class="rz-link" href="https://x.dev">six</a>');
  });

  it("ignores malformed, out-of-range and unsafe marks instead of throwing", () => {
    const bad = [
      null,
      7,
      { s: -1, e: 2, t: "b" },
      { s: 2, e: 2, t: "b" },
      { s: 0, e: 99, t: "b" },
      { s: 0.5, e: 2, t: "b" },
      { s: 0, e: 2, t: "x" },
      { s: 0, e: 2, t: "a" },
      { s: 0, e: 2, t: "a", href: "javascript:alert(1)" },
    ];
    expect(html("abcd", bad)).toBe("abcd");
    expect(html("abcd", "not an array")).toBe("abcd");
    expect(html("abcd", { s: 0, e: 2, t: "b" })).toBe("abcd");
  });

  it("keeps marks attached to the right characters when whitespace is trimmed and collapsed", () => {
    // raw: "  Built an internal tool\nused by 300 engineers.  " - the link spans the newline
    const raw = "  Built an internal tool\nused by 300 engineers.  ";
    expect(html(raw, [{ s: 20, e: 29, t: "a", href: "https://x.dev" }])).toBe(
      'Built an internal <a class="rz-link" href="https://x.dev">tool used</a> by 300 engineers.',
    );
    // a mark on the collapsed run of spaces still covers one space
    expect(html("ab   cd", [{ s: 0, e: 6, t: "b" }])).toBe("<strong>ab c</strong>d");
    // a mark entirely inside the trimmed edge disappears
    expect(html("   ab", [{ s: 0, e: 3, t: "b" }])).toBe("ab");
  });

  it("keepLines trims only the edges and leaves inner newlines for pre-line", () => {
    expect(html("  one\ntwo  ", [{ s: 6, e: 9, t: "b" }], undefined, true)).toBe("one\n<strong>two</strong>");
  });

  it("marks count UTF-16 units, so an emoji is two", () => {
    expect(html("😀ab", [{ s: 2, e: 4, t: "b" }])).toBe("😀<strong>ab</strong>");
  });

  it("escapes the href", () => {
    const out = html("x", [{ s: 0, e: 1, t: "a", href: 'https://x.dev/"><script>' }]);
    expect(out).not.toContain("<script>");
  });

  it("merges neighbouring pieces with the same marks into one element", () => {
    expect(html("abcd", [{ s: 0, e: 2, t: "b" }, { s: 2, e: 4, t: "b" }])).toBe("<strong>abcd</strong>");
  });
});

describe("marks in a rendered resume", () => {
  // Modern is an ATS template (bold only); the marks vectors render through the DESIGN_FREE test template.
  let unregister: () => void;
  let out = "";
  beforeAll(() => {
    unregister = registerTemplateForTests(designFree);
    out = renderToStaticMarkup(<ResumePreview doc={fixtureDoc("full-v2")} theme={DEFAULT_THEME} templateId={designFree.meta.id} />);
  });
  afterAll(() => unregister());

  it("reach the summary, bullets and achievements", () => {
    expect(out).toContain("<strong>backend engineer</strong>");
    expect(out).toContain("<em>payment systems</em>");
    expect(out).toContain('<a class="rz-link" href="https://example.com/apis">APIs</a>');
    expect(out).toContain("<strong>p99 latency by 40%</strong>");
    expect(out).toContain("<strong>2023</strong>");
  });

  it("draws Interests as one comma line and never the photo", () => {
    expect(out).toContain('<p class="rz-line">Chess, Trail running, Open source</p>');
    expect(out).not.toContain("Hidden hobby");
    expect(out).not.toMatch(/<img|resume-photos/);
  });

  it("narrowing `allowed` is honoured by renderSections", () => {
    const sections = renderSections(fixtureDoc("full-v2"), { dateStyle: "range" }, { ...DESIGN_FREE, marks: [] });
    const markup = renderToStaticMarkup(
      <>
        {sections
          .flatMap((s) => s.items)
          .map((node, i) => (
            <div key={i}>{node}</div>
          ))}
      </>,
    );
    expect(markup).not.toMatch(/<strong>|<em>|<u>|example\.com/);
    expect(markup).toContain("backend engineer");
  });
});
