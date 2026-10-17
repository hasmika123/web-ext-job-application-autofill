import { describe, expect, it } from "vitest";
import { ATS_STRICT } from "../capabilities";
import { SPACING_PRESETS } from "../fit";
import { describeTemplate, renderTemplate } from "./__test__/suite";
import { templateCssBlock } from "./__test__/atsCompliance";

describeTemplate({ id: "compact", capabilities: ATS_STRICT, category: "ats", ats: true });

describe("compact specifics", () => {
  it("the page line-height rule is in the template block", () => {
    expect(templateCssBlock("compact")).toMatch(/\.rz-page\.rz-tpl-compact\s*\{[^}]*line-height:\s*1\.3;/);
  });

  it("starts in Inter at the compact preset (10.5 pt, density .88, 0.6 in)", () => {
    const out = renderTemplate("compact", "sample");
    expect(SPACING_PRESETS.compact).toMatchObject({ size: 10.5 });
    expect(out).toContain("--rz-size:10.5pt");
    expect(out).toContain("--rz-density:0.88");
    expect(out).toContain("--rz-margin:0.6in");
    expect(out).toContain('--rz-font-body:"Inter"');
  });

  it("every vertical gap in the block scales with the density", () => {
    const block = templateCssBlock("compact");
    for (const m of block.matchAll(/(?:margin(?:-top|-bottom)?|--rz-entry-gap):\s*([^;]+);/g)) {
      if (/^0(\s|$)/.test(m[1])) continue;
      expect(m[1], m[0]).toContain("var(--rz-density)");
    }
  });
});
