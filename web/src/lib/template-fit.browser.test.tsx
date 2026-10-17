// @vitest-environment node
/**
 * Real-Chromium page-fit budgets for the ten resume templates (TEMPLATES-DESIGN sections 11 and 12.4). Skipped unless
 * `PDF_SMOKE=1`, because it needs a browser: the sidecar (`PDF_BROWSER_URL=ws://localhost:3000`) or a locally installed
 * Edge / Chrome (`PDF_LOCAL_CHANNEL=chrome|msedge`).
 *
 *   PDF_SMOKE=1 npm run test:unit -w web -- template-fit.browser
 *
 * Every template prints the shared sample at its own defaults (step 0) in at most two pages; the three dense ones also
 * fit the one-page sample through the export loop within their ladder budget. A miss means the template's rhythm is too
 * loose: fix the template's CSS block, never the ladder.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getTemplate, listTemplates } from "@kiwiply/ui";
import type { ResumeDocument, ResumeTheme } from "@kiwiply/ui";
import { countPdfPages, exportResumePdf, printPdf, renderResumeHtml } from "./pdf";

const fixturePath = path.resolve(__dirname, "../../../packages/ui/src/resume/__fixtures__/sample-resume.json");
const sample = (): ResumeDocument => JSON.parse(readFileSync(fixturePath, "utf8")) as ResumeDocument;

/** The sample trimmed to one page's worth (the third role, the second project and the custom section hidden): the twin of `onePageSample()` in packages/ui. */
function onePage(): ResumeDocument {
  const doc = sample();
  for (const s of doc.sections) {
    if (s.kind === "CUSTOM") s.hidden = true;
    if (s.kind === "EXPERIENCE") s.items[2].hidden = true;
    if (s.kind === "PROJECTS") s.items[1].hidden = true;
  }
  return doc;
}

/** The sample with `n` more two-line bullets on its last role (what a user adds before the next page break). */
function withExtraBullets(n: number): ResumeDocument {
  const doc = sample();
  const exp = doc.sections.find((s) => s.kind === "EXPERIENCE");
  if (exp && "items" in exp) {
    const last = (exp.items as Array<{ bullets: Array<{ id: string; text: string; src: string }> }>)[2];
    for (let i = 0; i < n; i++) {
      last.bullets.push({ id: `b_extra${i}xxxxx`, text: "Reduced cloud spend by 31% ($410k a year) by right-sizing 140 Kubernetes workloads and moving batch jobs to spot capacity.", src: "user" });
    }
  }
  return doc;
}

/**
 * Templates that must keep room for two extra bullets inside two pages at step 0 (headroom, so editing a little never
 * jumps to a third page).
 */
const EXTRA_BULLET_HEADROOM = ["modern", "classic", "compact", "simple", "engineer", "consultant", "scholar", "executive", "statement", "sidebar"];

/** A template's own starting theme (what a new resume in it, or a switch to it, applies). */
const defaultsOf = (id: string): Partial<ResumeTheme> => ({ ...(getTemplate(id).meta.defaults ?? {}) });

/** Highest ladder step (of the six) each dense template may need to bring the one-page sample onto one page. */
const ONE_PAGE_STEP_BUDGET: Record<string, number> = { compact: 4, engineer: 4, consultant: 3 };

describe.skipIf(!process.env.PDF_SMOKE)("template page fit in a real Chromium", () => {
  for (const { id } of listTemplates()) {
    it(`${id}: the sample prints in at most two pages at step 0`, async () => {
      const pdf = await printPdf(renderResumeHtml({ doc: sample(), theme: defaultsOf(id), templateId: id }, { step: 0 }));
      expect(countPdfPages(pdf)).toBeLessThanOrEqual(2);
    }, 60_000);
  }

  for (const id of EXTRA_BULLET_HEADROOM) {
    it(`${id}: the sample plus two extra bullets still prints in at most two pages at step 0`, async () => {
      const pdf = await printPdf(renderResumeHtml({ doc: withExtraBullets(2), theme: defaultsOf(id), templateId: id }, { step: 0 }));
      expect(countPdfPages(pdf)).toBeLessThanOrEqual(2);
    }, 60_000);
  }

  for (const [id, budget] of Object.entries(ONE_PAGE_STEP_BUDGET)) {
    it(`${id}: the one-page sample fits one page within ladder step ${budget}`, async () => {
      const r = await exportResumePdf({ doc: onePage(), theme: { ...defaultsOf(id), fit: { mode: "auto", target: 1, step: 0 } }, templateId: id }, { maxFitSteps: 6 });
      expect(r.fits, `${id} still ${r.pages} pages at step ${r.step}`).toBe(true);
      expect(r.step).toBeLessThanOrEqual(budget);
    }, 120_000);
  }
});
