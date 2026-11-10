import { describe, expect, it } from "vitest";
import { ATS_STRICT } from "../capabilities";
import { describeTemplate, renderTemplate } from "./__test__/suite";
import { templateCssBlock } from "./__test__/atsCompliance";

describeTemplate({ id: "executive", capabilities: ATS_STRICT, category: "employer", ats: true });

describe("executive specifics", () => {
  it("experience is title + dates, then org + location; education stays on one line", () => {
    const out = renderTemplate("executive", "sample");
    const exp = out.slice(out.indexOf("rz-section-experience"), out.indexOf("rz-section-education"));
    const rows = exp.split('<div class="rz-item-head').slice(1);
    expect(rows[0].startsWith('"><div class="rz-item-main">')).toBe(true);
    expect(rows[0].indexOf("Senior Software Engineer")).toBeGreaterThan(-1);
    expect(rows[0].indexOf("Senior Software Engineer")).toBeLessThan(rows[0].indexOf("Mar 2022 – Present"));
    expect(rows[0]).toContain('<div class="rz-item-dates">Mar 2022 – Present</div>');
    expect(rows[1].startsWith(" rz-item-head-2")).toBe(true);
    expect(rows[1].indexOf("Harbor &amp; Vale Logistics")).toBeLessThan(rows[1].indexOf("Austin, TX"));
    expect(rows[1]).toContain('<div class="rz-item-loc">Austin, TX</div>');

    const edu = out.slice(out.indexOf("rz-section-education"), out.indexOf("rz-section-skills"));
    expect(edu).not.toContain("rz-item-head-2");
    expect(edu).toContain('<span class="rz-sep"> — </span>'); // inline: degree — school
  });

  it("the header carries the heavy rule and an uppercase headline", () => {
    const css = templateCssBlock("executive");
    expect(css).toMatch(/\.rz-tpl-executive \.rz-header\s*\{[^}]*border-bottom:\s*2px solid #111827/);
    expect(css).toMatch(/\.rz-tpl-executive \.rz-headline\s*\{[^}]*text-transform:\s*uppercase/);
    expect(css).toMatch(/\.rz-tpl-executive \.rz-section-summary \.rz-text\s*\{[^}]*font-size:\s*1\.02em/);
  });

  it("the contact line keeps the pipe separator", () => {
    const out = renderTemplate("executive", "sample");
    expect(out).toContain('<span class="rz-sep"> | </span>');
  });

  it("starts in Georgia / Arial at spacious spacing", () => {
    const out = renderTemplate("executive", "sample");
    expect(out).toContain("--rz-font-body:Arial");
    expect(out).toContain("--rz-font-display:Georgia");
    expect(out).toContain("--rz-size:11pt");
    expect(out).toContain("--rz-density:1.1");
  });
});
