import { describe, expect, it } from "vitest";
import { ATS_STRICT } from "../capabilities";
import { describeTemplate, renderTemplate } from "./__test__/suite";
import { templateCssBlock } from "./__test__/atsCompliance";

describeTemplate({ id: "simple", capabilities: ATS_STRICT, category: "ats", ats: true });

/** The declarations of the rule in `css` whose selector is exactly `selector` ("" when there is none). */
function ruleBody(css: string, selector: string): string {
  for (const part of css.replace(/\/\*[\s\S]*?\*\//g, "").split("}")) {
    const [sel, body] = part.split("{");
    if (body !== undefined && sel.trim() === selector) return body;
  }
  return "";
}

describe("simple specifics", () => {
  it("section titles have no border and no text-transform in the block", () => {
    const css = templateCssBlock("simple");
    const title = ruleBody(css, ".rz-tpl-simple .rz-section-title");
    expect(title).not.toBe("");
    expect(title).toMatch(/text-transform:\s*none/);
    expect(title).toMatch(/border-bottom:\s*0\s*;/);
    expect(title).toMatch(/letter-spacing:\s*0\s*;/);
    expect(css).not.toMatch(/uppercase|small-caps|capitalize/);
    expect(css).not.toMatch(/border(-bottom|-top)?:\s*[\d.]+(px|em)/);
  });

  it("the DOM keeps sentence-case headings and the head is inline", () => {
    const out = renderTemplate("simple", "sample");
    expect(out).toContain('<h2 class="rz-section-title">Experience</h2>');
    expect(out).not.toContain("rz-item-head-2");
  });

  it("starts in Georgia / Arial at normal spacing, with the default ' | ' contact separator", () => {
    const out = renderTemplate("simple", "sample");
    expect(out).toContain("--rz-size:11pt");
    expect(out).toContain('<span class="rz-sep"> | </span>');
    expect(out).toContain("Georgia");
  });
});
