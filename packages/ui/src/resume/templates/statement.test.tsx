import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ATS_STRICT, DESIGN_FREE, HYBRID, hiddenContent, isAtLeastAsStrictAs } from "../capabilities";
import ResumePreview from "../ResumePreview";
import { getTemplate } from "../registry";
import { fixtureDoc, type FixtureName } from "../test-fixtures";
import { DEFAULT_THEME } from "../theme";
import type { Theme } from "../types";
import { templateCssBlock } from "./__test__/atsCompliance";
import { describeTemplate, renderTemplate } from "./__test__/suite";

const ID = "statement";

describeTemplate({ id: ID, capabilities: HYBRID, category: "styled", ats: false });

/** The template at its own defaults over the default theme (what the gallery thumbnail and a fresh resume show). */
const theme = (over?: Partial<Theme>): Theme => ({ ...DEFAULT_THEME, ...(getTemplate(ID).meta.defaults ?? {}), ...over });
const html = (name: FixtureName, over?: Partial<Theme>, photoSrc?: string) =>
  renderToStaticMarkup(<ResumePreview doc={fixtureDoc(name)} theme={theme(over)} templateId={ID} photoSrc={photoSrc} />);
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

describe("statement specifics", () => {
  it("uses no images, asides or photo markup, even with a photo URL and showPhoto", () => {
    for (const name of ["full-v2", "sparse", "caps-doc", "sample"] as FixtureName[]) {
      const out = html(name, { showPhoto: true }, "data:image/jpeg;base64,AAAA");
      expect(out).not.toMatch(/<img|<aside|rz-photo|data:image/);
    }
  });

  it("defaults: Inter at normal spacing", () => {
    expect(getTemplate(ID).meta.defaults).toEqual({ fontPair: "inter", spacing: "normal" });
    expect(renderTemplate(ID, "sample")).toContain("--rz-size:11pt");
  });

  it("sits between the profiles: inside DESIGN_FREE, outside ATS_STRICT", () => {
    const caps = getTemplate(ID).meta.capabilities;
    expect(isAtLeastAsStrictAs(caps, DESIGN_FREE)).toBe(true);
    expect(isAtLeastAsStrictAs(caps, ATS_STRICT)).toBe(false);
  });

  it("renders the project dates (inline heads, one row)", () => {
    const out = html("sample");
    expect(out).toContain("Feb 2023 – Jan 2024");
    expect(out).not.toContain("rz-item-head-2");
  });

  it("renders <em>, <u>, a link mark and a summary <ul> from caps-doc", () => {
    const out = html("caps-doc");
    const summary = /<section class="rz-section rz-section-summary">[\s\S]*?<\/section>/.exec(out)?.[0] ?? "";
    expect(summary).toContain('<ul class="rz-bullets">');
    expect(summary).not.toContain('<p class="rz-text">');
    expect(summary).toMatch(/<em>[^<]+<\/em>/);
    expect(count(out, /<em>/g)).toBeGreaterThan(0);
    expect(out).toContain('<a class="rz-link" href="https://casey.example.com/case-study">');
    expect(out).toContain('<ol class="rz-bullets rz-numbered">');
    expect(out).toContain("Where I&#x27;ve worked</h2>"); // free headings: the user's title is kept
  });

  it("draws an underline mark (HYBRID allows u)", () => {
    const doc = fixtureDoc("caps-doc");
    const summary = doc.sections.find((sec) => sec.kind === "SUMMARY")!;
    const item = summary.items[0] as { text: string; marks?: unknown[] };
    item.marks = [...(item.marks ?? []), { s: item.text.length - 4, e: item.text.length, t: "u" }];
    const out = renderToStaticMarkup(<ResumePreview doc={doc} theme={theme()} templateId={ID} />);
    expect(count(out, /<u>/g)).toBeGreaterThan(0);
  });

  it("hiddenContent(sample) = [photo]; the sample keeps its italic, link and Interests", () => {
    const hidden = hiddenContent(fixtureDoc("sample"), theme(), HYBRID);
    expect(hidden.map((h) => h.kind)).toEqual(["photo"]);
    const out = html("sample");
    expect(count(out, /<em>/g)).toBe(1);
    expect(out).toContain(">Interests</h2>");
    expect(out).toContain(">Volunteering</h2>");
  });

  it("never draws a photo, even when the document has one and the theme wants it", () => {
    const out = html("sample", { showPhoto: true }, "data:image/jpeg;base64,AAAA");
    expect(out).not.toContain("<img");
    expect(out).not.toContain("data:image");
  });

  it("the header is one band: name, headline and ' · ' separated contact inside the header element", () => {
    const out = html("sample");
    const header = /<header class="rz-header">[\s\S]*?<\/header>/.exec(out)?.[0] ?? "";
    expect(header).toContain('<h1 class="rz-name">Jordan Avery</h1>');
    expect(header).toContain('<span class="rz-sep"> · </span>');
    expect(out.indexOf("</header>")).toBeLessThan(out.indexOf('<main class="rz-main">'));
  });

  describe("tpl:statement CSS block", () => {
    const css = templateCssBlock(ID);

    it("band is inside the page padding: no negative margin, no absolute positioning, no bleed", () => {
      expect(css).toContain(".rz-tpl-statement .rz-header");
      expect(css).toMatch(/background:\s*var\(--rz-accent\)/);
      expect(css).toMatch(/padding:\s*1\.1em 1\.2em/);
      expect(css).toMatch(/border-radius:\s*4px/);
      expect(css).not.toMatch(/margin[a-z-]*:[^;]*-\d/);
      expect(css).not.toContain("position:");
      expect(css).not.toContain("100vw");
    });

    it("section titles are accent, uppercase, with a 3px accent bar on the left and no underline", () => {
      expect(css).toMatch(/border-left:\s*3px solid var\(--rz-accent\)/);
      expect(css).toMatch(/border-bottom:\s*0/);
      expect(css).toMatch(/text-transform:\s*uppercase/);
      expect(css).toMatch(/letter-spacing:\s*0\.1em/);
    });

    it("has no columns, no url() and no generated text; vertical gaps scale with the density", () => {
      for (const bad of ["grid-template-columns", "column-count", "columns:", "float:", "url(", 'content: "']) expect(css).not.toContain(bad);
      for (const m of css.matchAll(/margin(?:-bottom)?:\s*([^;]+);/g)) {
        if (/em/.test(m[1]) && !/^0 /.test(m[1])) expect(m[0]).toContain("var(--rz-density)");
      }
    });
  });
});
