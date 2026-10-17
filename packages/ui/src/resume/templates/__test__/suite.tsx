/**
 * The checks every production template runs (TEMPLATES-DESIGN 12.2). A template's own test file calls
 * `describeTemplate({ id, capabilities })` and adds its specific assertions next to it, so each template keeps its
 * own snapshot file (`__snapshots__/<id>.test.tsx.snap`).
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ResumePreview from "../../ResumePreview";
import { listTemplates, getTemplate } from "../../registry";
import { fixtureDoc, type FixtureName } from "../../test-fixtures";
import { DEFAULT_THEME } from "../../theme";
import type { TemplateCapabilities, TemplateCategory, Theme } from "../../types";
import { expectAtsCompliant, templateCssBlock } from "./atsCompliance";

const thumbs = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "thumbs");

export const SNAPSHOT_FIXTURES: FixtureName[] = ["full-v2", "sparse", "caps-doc", "sample"];

/** The template rendered through `ResumePreview` at its own defaults (what the gallery thumbnail and a fresh resume show). */
export function renderTemplate(id: string, name: FixtureName, theme?: Partial<Theme>): string {
  const defaults = getTemplate(id).meta.defaults ?? {};
  return renderToStaticMarkup(<ResumePreview doc={fixtureDoc(name)} theme={{ ...DEFAULT_THEME, ...defaults, ...theme }} templateId={id} />);
}

export function describeTemplate(opts: { id: string; capabilities: TemplateCapabilities; category: TemplateCategory; ats: boolean }): void {
  const { id } = opts;
  describe(`${id} template`, () => {
    for (const name of SNAPSHOT_FIXTURES) {
      it(`${id}: HTML snapshot (${name})`, () => {
        expect(renderTemplate(id, name)).toMatchSnapshot();
      });
    }

    it("is deterministic", () => {
      for (const name of SNAPSHOT_FIXTURES) expect(renderTemplate(id, name)).toBe(renderTemplate(id, name));
    });

    it("uses only .rz-* classes, no inline styles, no tables", () => {
      for (const name of SNAPSHOT_FIXTURES) {
        const out = renderTemplate(id, name);
        const classes = [...out.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/)).filter(Boolean);
        expect(classes.length).toBeGreaterThan(5);
        expect(classes.filter((c) => !c.startsWith("rz-"))).toEqual([]);
        expect(out).not.toMatch(/\sstyle="/);
        expect(out).not.toMatch(/<table|<svg/);
        expect(out).toContain(`rz-tpl-${id}`);
      }
    });

    it("declares its profile, category, an honest note and a thumbnail on disk", () => {
      const meta = listTemplates().find((m) => m.id === id)!;
      expect(meta, `${id} is registered`).toBeTruthy();
      expect(meta.capabilities).toEqual(opts.capabilities);
      expect(meta.capabilities.ats).toBe(opts.ats);
      expect(meta.category).toBe(opts.category);
      expect(meta.atsNote.trim()).not.toBe("");
      expect(meta.name.trim()).not.toBe("");
      expect(meta.description.trim()).not.toBe("");
      expect(meta.thumb).toBe(`${id}.png`);
      expect(existsSync(join(thumbs, meta.thumb))).toBe(true);
    });

    it("renders the project dates", () => {
      expect(renderTemplate(id, "sample")).toContain("Feb 2023 – Jan 2024");
    });

    if (opts.ats) {
      it("is structurally ATS compliant (no table / image / svg / columns / icons, standard headings, em-only page sizes)", () => {
        const css = templateCssBlock(id);
        if (id !== "modern") expect(css).toContain(`.rz-tpl-${id}`);
        for (const name of SNAPSHOT_FIXTURES) expectAtsCompliant(renderTemplate(id, name), css);
      });
    }
  });
}
