// @vitest-environment node
/**
 * Real-Chromium smoke test for PDF export (DESIGN section 8: "one Chromium PDF smoke ... pages === 1
 * for the one-page fixture"). Skipped unless `PDF_SMOKE=1`, because it needs a browser: either the
 * sidecar (`PDF_BROWSER_URL=ws://localhost:3000`) or a locally installed Edge/Chrome.
 *
 *   PDF_SMOKE=1 npm run test:unit -w web -- pdf.browser
 *   PDF_SMOKE=1 PDF_BROWSER_URL=ws://localhost:3000 npm run test:unit -w web -- pdf.browser
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ResumeDocument } from "@kiwiply/ui";
import { countPdfPages, exportResumePdf, printPdf, renderResumeHtml } from "./pdf";

const fixture = (name: string): ResumeDocument =>
  JSON.parse(readFileSync(path.resolve(__dirname, "../../../packages/ui/src/resume/__fixtures__", `${name}.json`), "utf8")) as ResumeDocument;

/** The fixture's single experience entry repeated until the resume needs two pages at step 0. */
function longDoc(): ResumeDocument {
  const doc = fixture("full");
  const exp = doc.sections.find((s) => s.kind === "EXPERIENCE");
  if (exp && "items" in exp) {
    const items = exp.items as Array<Record<string, unknown> & { id: string }>;
    const copies = Array.from({ length: 3 }, (_, n) => items.map((it, i) => ({ ...it, id: `i_pad${n}${i}xxxx` }))).flat();
    (exp as { items: unknown[] }).items = [...items, ...copies];
  }
  return doc;
}

describe.skipIf(!process.env.PDF_SMOKE)("PDF export in a real Chromium", () => {
  it("the one-page fixture prints as exactly 1 page", async () => {
    const pdf = await printPdf(renderResumeHtml({ doc: fixture("sparse") }));
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(countPdfPages(pdf)).toBe(1);
    // PDF_SMOKE_OUT=<dir> keeps the file for a look.
    if (process.env.PDF_SMOKE_OUT) {
      mkdirSync(process.env.PDF_SMOKE_OUT, { recursive: true });
      writeFileSync(path.join(process.env.PDF_SMOKE_OUT, "one-page-fixture.pdf"), pdf);
    }
  }, 60_000);

  it("the full fixture fits one page through the export loop", async () => {
    const r = await exportResumePdf({ doc: fixture("full") });
    expect(r.pages).toBe(1);
    expect(r.fits).toBe(true);
    if (process.env.PDF_SMOKE_OUT) writeFileSync(path.join(process.env.PDF_SMOKE_OUT, "full-fixture.pdf"), r.pdf);
  }, 60_000);

  it("a long resume steps the ladder down in Chromium and gets shorter", async () => {
    const doc = longDoc();
    const roomy = countPdfPages(await printPdf(renderResumeHtml({ doc }, { step: 0 })));
    const tight = countPdfPages(await printPdf(renderResumeHtml({ doc }, { step: 6 })));
    expect(roomy).toBeGreaterThan(1);
    expect(tight).toBeLessThanOrEqual(roomy);
    const r = await exportResumePdf({ doc, theme: { fit: { mode: "auto", target: 2, step: 0 } } });
    expect(r.pages).toBeLessThanOrEqual(roomy);
  }, 120_000);
});
