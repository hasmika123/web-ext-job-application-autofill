import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "styles", "resume.css"), "utf8");

/** The `letter-spacing` of the rule whose selector is exactly `selector`, in em. */
function tracking(selector: string): number {
  const open = css.indexOf(`${selector} {`);
  expect(open, `rule ${selector}`).toBeGreaterThanOrEqual(0);
  const body = css.slice(open, css.indexOf("}", open));
  const m = /letter-spacing:\s*(-?[\d.]+)em/.exec(body);
  expect(m, `${selector} sets letter-spacing in em`).not.toBeNull();
  return Number(m![1]);
}

/**
 * Template QA (real PDF export, pdfminer / pypdf / pdf.js extraction): wide tracking on uppercase headings makes Chromium emit
 * one text run per glyph with gaps that text extractors read as word breaks ("SU M M A RY"), so the parser never sees a
 * standard "SUMMARY" / "EXPERIENCE" heading and Classic's name came out as "J ORDAN". At 0.06em every heading and the
 * name extract intact in all three. Keep tracking on uppercase headings at or below 0.07em.
 */
describe("heading tracking stays extractable from the PDF text layer", () => {
  const MAX_EM = 0.07;
  for (const selector of [
    ".rz-tpl-classic .rz-name",
    ".rz-tpl-classic .rz-section-title",
    ".rz-tpl-executive .rz-section-title",
    ".rz-tpl-statement .rz-section-title",
    ".rz-tpl-sidebar .rz-main .rz-section-title",
    ".rz-tpl-sidebar .rz-side .rz-section-title",
  ]) {
    it(`${selector} is at most ${MAX_EM}em`, () => {
      expect(tracking(selector)).toBeLessThanOrEqual(MAX_EM);
    });
  }
});
