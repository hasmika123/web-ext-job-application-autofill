// @vitest-environment node
/**
 * Template thumbnail generator (TEMPLATES-DESIGN 8). Not a test of behaviour: it renders `sample-resume.json` through every
 * registered template at the template's own defaults and writes a 240x340 PNG per template. Skipped unless `THUMBS_GEN=1`
 * (it needs a browser), so `npm test` never runs it. Run it through the script:
 *
 *   npm run thumbs:templates -w web                  # all, local Edge/Chrome
 *   npm run thumbs:templates -w web -- --only engineer,sidebar --out /some/dir
 *   PDF_BROWSER_URL=ws://localhost:3000 npm run thumbs:templates -w web   # the chromium sidecar
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, getTemplate, listTemplates } from "@kiwiply/ui";
import type { ResumeDocument } from "@kiwiply/ui";
import { renderResumeHtml, renderThumbPng } from "./pdf";

const root = path.resolve(__dirname, "../../..");
const sample = (): ResumeDocument =>
  JSON.parse(readFileSync(path.join(root, "packages/ui/src/resume/__fixtures__/sample-resume.json"), "utf8")) as ResumeDocument;

const only = (process.env.THUMBS_ONLY ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const outDir = process.env.THUMBS_OUT ? path.resolve(process.env.THUMBS_OUT) : path.join(root, "packages/ui/src/resume/thumbs");

describe.skipIf(!process.env.THUMBS_GEN)("template thumbnails", () => {
  const metas = listTemplates().filter((m) => only.length === 0 || only.includes(m.id));

  it("selects at least one template", () => {
    expect(metas.length).toBeGreaterThan(0);
  });

  for (const meta of metas) {
    it(`${meta.id}: renders ${meta.thumb} (240x340)`, async () => {
      const theme = { ...DEFAULT_THEME, ...(getTemplate(meta.id).meta.defaults ?? {}) };
      const html = renderResumeHtml({ doc: sample(), theme, templateId: meta.id });
      const png = await renderThumbPng(html, { pageSize: "letter", width: 240, height: 340 });
      expect(png.readUInt32BE(16)).toBe(240);
      expect(png.readUInt32BE(20)).toBe(340);
      mkdirSync(outDir, { recursive: true });
      writeFileSync(path.join(outDir, meta.thumb), png);
    }, 60_000);
  }
});
