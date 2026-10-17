import { describe, expect, it } from "vitest";
import { ATS_STRICT } from "../capabilities";
import { describeTemplate, renderTemplate } from "./__test__/suite";
import { templateCssBlock } from "./__test__/atsCompliance";

describeTemplate({ id: "scholar", capabilities: ATS_STRICT, category: "employer", ats: true });

describe("scholar specifics", () => {
  it("vector: experience is org + location, then title + dates", () => {
    const out = renderTemplate("scholar", "sample");
    const exp = out.slice(out.indexOf("rz-section-experience"), out.indexOf("rz-section-education"));
    const rows = exp.split('<div class="rz-item-head').slice(1);
    expect(rows[0].startsWith('"><div class="rz-item-main">')).toBe(true);
    expect(rows[0].indexOf("Harbor &amp; Vale Logistics")).toBeGreaterThan(-1);
    expect(rows[0].indexOf("Harbor &amp; Vale Logistics")).toBeLessThan(rows[0].indexOf("Austin, TX"));
    expect(rows[0]).toContain('<div class="rz-item-loc">Austin, TX</div>');
    expect(rows[1].startsWith(" rz-item-head-2")).toBe(true);
    expect(rows[1].indexOf("Senior Software Engineer")).toBeGreaterThan(-1);
    expect(rows[1].indexOf("Senior Software Engineer")).toBeLessThan(rows[1].indexOf("Mar 2022 – Present"));
    expect(rows[1]).toContain('<div class="rz-item-dates">Mar 2022 – Present</div>');
  });

  it("education is org-title too (school + location, then degree + dates)", () => {
    const out = renderTemplate("scholar", "sample");
    const edu = out.slice(out.indexOf("rz-section-education"), out.indexOf("rz-section-skills"));
    expect(edu).toMatch(/<div class="rz-item-head"><div class="rz-item-main"><span class="rz-item-org">University of Westbrook<\/span><\/div><div class="rz-item-loc">Westbrook, OR<\/div>/);
    expect(edu).toContain("rz-item-head-2");
  });

  it("the contact line uses the bullet separator", () => {
    const out = renderTemplate("scholar", "sample");
    expect(out).toContain('<span class="rz-sep"> • </span>');
    expect(out).not.toContain('<span class="rz-sep"> | </span>');
  });

  it("section titles are centred by the block, with no rule and no transform", () => {
    const css = templateCssBlock("scholar");
    const rule = /\.rz-tpl-scholar \.rz-section-title\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(rule).toMatch(/text-align:\s*center/);
    expect(rule).toMatch(/text-transform:\s*none/);
    expect(rule).toMatch(/border-bottom:\s*0/);
    expect(css).toMatch(/\.rz-page\.rz-tpl-scholar\s*\{[^}]*line-height:\s*1\.35/);
  });

  it("organisation and title are both bold", () => {
    const css = templateCssBlock("scholar");
    expect(css).toMatch(/\.rz-tpl-scholar \.rz-item-org,\s*\.rz-tpl-scholar \.rz-item-title\s*\{[^}]*font-weight:\s*700/);
  });

  it("starts in Source Serif 4 at normal spacing", () => {
    const out = renderTemplate("scholar", "sample");
    expect(out).toContain('--rz-font-body:"Source Serif 4"');
    expect(out).toContain("--rz-size:11pt");
  });
});
