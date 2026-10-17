/**
 * Structural ATS compliance (TEMPLATES-DESIGN 12.2): what a parse-check would catch, checked on the markup and on the
 * template's own CSS block. Until the parse-check service (R3.6) exists, every `ats: true` template runs through this.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "vitest";
import { DEFAULT_SECTION_TITLES, SECTION_KINDS } from "../../types";

const cssPath = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "styles", "resume.css");

/** The text of `resume.css` between `/* == tpl:<id> == *\/` and `/* == /tpl:<id> == *\/`; throws if a marker is missing. */
export function templateCssBlock(id: string): string {
  const css = readFileSync(cssPath, "utf8").replace(/\r\n/g, "\n");
  const open = `/* == tpl:${id} == */`;
  const close = `/* == /tpl:${id} == */`;
  const a = css.indexOf(open);
  const b = css.indexOf(close);
  if (a < 0 || b < 0 || b < a) throw new Error(`resume.css has no "${open}" ... "${close}" block`);
  return css.slice(a + open.length, b);
}

/** Selector + body pairs of a CSS block (no nesting in this stylesheet). */
function rules(css: string): Array<{ selector: string; body: string }> {
  const out: Array<{ selector: string; body: string }> = [];
  for (const m of css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)) out.push({ selector: m[1].trim(), body: m[2] });
  return out;
}

/** Throws (vitest `expect`) when `html` / `css` break an ATS rule. `css` is the template's block from {@link templateCssBlock}. */
export function expectAtsCompliant(html: string, css: string): void {
  // markup: one column, real text, nothing a parser drops
  for (const bad of ["<table", "<img", "<svg", "<aside", "rz-side", "rz-photo", "rz-skill-tags", 'role="img"']) {
    expect(html, `markup contains ${bad}`).not.toContain(bad);
  }
  // user marks beyond bold are not drawn
  expect(html).not.toMatch(/<em>|<u>/);

  // standard headings, in document order (a title is exactly the default of a kind the document has)
  const titles = [...html.matchAll(/<h2 class="rz-section-title">([^<]*)<\/h2>/g)].map((m) => m[1].replace(/&amp;/g, "&").replace(/&#x27;/g, "'"));
  const standard = new Set<string>(SECTION_KINDS.map((k) => DEFAULT_SECTION_TITLES[k]));
  for (const t of titles) {
    // one custom section keeps its own plain title (custom: "limited"); everything else must be a standard heading
    if (!standard.has(t)) expect(t, `non-standard heading "${t}"`).toMatch(/^[A-Za-z][A-Za-z ]{1,29}$/);
  }
  expect(titles.filter((t) => standard.has(t)).length).toBeGreaterThan(0);

  // the template's CSS: no columns, floats, absolute positioning, url() or generated text
  for (const bad of ["grid-template-columns", "column-count", "columns:", "position: absolute", "float:", "url(", 'content: "']) {
    expect(css, `css block contains ${bad}`).not.toContain(bad);
  }
  // sizes on the page root scale with the theme: em / % only
  for (const r of rules(css)) {
    if (!/\.rz-page(\.rz-tpl-[a-z]+)?$/.test(r.selector) && !/^\.rz-page\.rz-tpl-[a-z]+$/.test(r.selector)) continue;
    const size = /(?:^|;)\s*font-size:\s*([^;]+)/.exec(r.body)?.[1] ?? "";
    expect(size, `${r.selector} font-size`).not.toMatch(/\b(pt|px)\b|\d(pt|px)/);
  }
}
