// @vitest-environment node
/**
 * The Georgia / Arial pair (Simple and Executive default to it) prints with the same metrics on every platform. Skipped unless
 * `PDF_SMOKE=1`, because it needs a browser: the sidecar (`PDF_BROWSER_URL=ws://localhost:3000`) or a local Edge / Chrome.
 *
 *   PDF_SMOKE=1 PDF_BROWSER_URL=ws://127.0.0.1:13399 npm run test:unit -w web -- pdf-fonts.browser
 *
 * Georgia and Arial are system fonts. Windows and macOS have them; the Linux Chromium that prints production PDFs has neither:
 * Arial is answered by Liberation Sans (same advance widths), but Georgia fell back to Liberation Serif, which is Times-width, about
 * 9% narrower and a different face. The stack now names the bundled metric-compatible twins right after the system fonts
 * (`Georgia, Gelasio` and `Arial, Arimo`), so what a PDF embeds is always one of the known-good families below and never a stray
 * system fallback (DejaVu, Liberation Serif, Noto).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getTemplate } from "@kiwiply/ui";
import type { ResumeDocument, ResumeTheme } from "@kiwiply/ui";
import { countPdfPages, printPdf, renderResumeHtml } from "./pdf";

const sample = (): ResumeDocument => JSON.parse(readFileSync(path.resolve(__dirname, "../../../packages/ui/src/resume/__fixtures__/sample-resume.json"), "utf8")) as ResumeDocument;
const defaultsOf = (id: string): Partial<ResumeTheme> => ({ ...(getTemplate(id).meta.defaults ?? {}) });

/** The families a PDF embeds (`/BaseFont /ABCDEF+Name`), subset tag removed. */
const embedded = (pdf: Buffer): string[] => [...new Set([...pdf.toString("latin1").matchAll(/\/BaseFont\s*\/([A-Za-z0-9+_-]+)/g)].map((m) => m[1]!.replace(/^[A-Z]{6}\+/, "")))].sort();

/** What each role may be set in: the real system font, or the bundled / system metric twin. */
const DISPLAY_OK = /^(Georgia|Gelasio)/;
const BODY_OK = /^(Arial|LiberationSans|Arimo)/;

describe.skipIf(!process.env.PDF_SMOKE)("the Georgia / Arial pair in a real Chromium", () => {
  for (const id of ["simple", "executive"]) {
    it(`${id}: display text is Georgia or its twin Gelasio, body text is Arial or a metric twin, and nothing else is embedded`, async () => {
      const pdf = await printPdf(renderResumeHtml({ doc: sample(), theme: defaultsOf(id), templateId: id }, { step: 0 }));
      const fonts = embedded(pdf);
      expect(fonts.length, fonts.join(",")).toBeGreaterThan(0);
      expect(fonts.some((f) => DISPLAY_OK.test(f)), `a Georgia / Gelasio face in ${fonts.join(", ")}`).toBe(true);
      expect(fonts.some((f) => BODY_OK.test(f)), `an Arial-width face in ${fonts.join(", ")}`).toBe(true);
      for (const f of fonts) expect(DISPLAY_OK.test(f) || BODY_OK.test(f), `unexpected embedded font ${f} (a system fallback?)`).toBe(true);
      expect(fonts.join(",")).not.toMatch(/DejaVu|LiberationSerif|Noto|Times/i);
      expect(countPdfPages(pdf)).toBeLessThanOrEqual(2);
    }, 60_000);
  }
});
