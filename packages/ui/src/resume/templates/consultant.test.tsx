import { describe, expect, it } from "vitest";
import { ATS_STRICT, controlStates, hiddenContent, isAtLeastAsStrictAs } from "../capabilities";
import { fixtureDoc } from "../test-fixtures";
import { applyCapabilities, sanitizeTheme } from "../theme";
import { CONSULTANT_CAPS } from "./consultant";
import { describeTemplate, renderTemplate } from "./__test__/suite";
import { templateCssBlock } from "./__test__/atsCompliance";

describeTemplate({ id: "consultant", capabilities: CONSULTANT_CAPS, category: "employer", ats: true });

describe("consultant specifics", () => {
  it("CONSULTANT_CAPS is at least as strict as ATS_STRICT, one page, Page Length fixed", () => {
    expect(isAtLeastAsStrictAs(CONSULTANT_CAPS, ATS_STRICT)).toBe(true);
    expect(isAtLeastAsStrictAs(ATS_STRICT, CONSULTANT_CAPS)).toBe(false);
    expect(CONSULTANT_CAPS.maxPages).toBe(1);
    expect(CONSULTANT_CAPS.theme.pageLength).toBe(false);
    expect(CONSULTANT_CAPS.ats).toBe(true);
    expect(Object.isFrozen(CONSULTANT_CAPS)).toBe(true);
    expect(Object.isFrozen(CONSULTANT_CAPS.theme)).toBe(true);
  });

  it("fit.target 2 renders as 1 and hiddenContent lists pages", () => {
    const theme = sanitizeTheme({ fit: { mode: "auto", target: 2, step: 0 } });
    expect(theme.fit.target).toBe(2);
    expect(applyCapabilities(theme, CONSULTANT_CAPS).fit.target).toBe(1);
    expect(applyCapabilities(theme, ATS_STRICT).fit.target).toBe(2);
    const kinds = hiddenContent(fixtureDoc("sample"), theme, CONSULTANT_CAPS).map((h) => h.kind);
    expect(kinds).toContain("pages");
    expect(hiddenContent(fixtureDoc("sample"), theme, ATS_STRICT).map((h) => h.kind)).not.toContain("pages");
  });

  it("controlStates: pageLength disabled, twoPages false", () => {
    const { pageLength } = controlStates(fixtureDoc("sample"), CONSULTANT_CAPS);
    expect(pageLength.enabled).toBe(false);
    expect(pageLength.twoPages).toBe(false);
    expect(pageLength.hint).toBe("(fixed by this template)");
  });

  it("the sample under the consultant profile hides photo, marks and Interests, as under ATS_STRICT", () => {
    const theme = sanitizeTheme({});
    expect(hiddenContent(fixtureDoc("sample"), theme, CONSULTANT_CAPS).map((h) => h.kind)).toEqual(["photo", "marks", "section"]);
  });

  it("experience and education heads are org-title: org + location on row 1, title + dates on row 2", () => {
    const out = renderTemplate("consultant", "sample");
    expect(out).toContain("rz-item-head-2");
    const exp = out.slice(out.indexOf("rz-section-experience"), out.indexOf("rz-section-education"));
    const rows = exp.split('<div class="rz-item-head').slice(1);
    expect(rows[0].startsWith('"><div class="rz-item-main">')).toBe(true); // row 1: org, then location
    expect(rows[0]).toContain('<span class="rz-item-org">Harbor &amp; Vale Logistics</span>');
    expect(rows[0].indexOf("rz-item-org")).toBeLessThan(rows[0].indexOf('<div class="rz-item-loc">Austin, TX</div>'));
    expect(rows[1].startsWith(" rz-item-head-2")).toBe(true); // row 2: title, then dates
    expect(rows[1]).toContain('<span class="rz-item-title">Senior Software Engineer</span>');
    expect(rows[1].indexOf("rz-item-title")).toBeLessThan(rows[1].indexOf('<div class="rz-item-dates">Mar 2022 – Present</div>'));
    const edu = out.slice(out.indexOf("rz-section-education"), out.indexOf("rz-section-skills"));
    expect(edu).toMatch(/<div class="rz-item-head"><div class="rz-item-main"><span class="rz-item-org">University of Westbrook<\/span>/);
  });

  it("starts in EB Garamond at compact spacing, Letter", () => {
    const out = renderTemplate("consultant", "sample");
    expect(out).toContain('--rz-font-body:"EB Garamond"');
    expect(out).toContain("--rz-size:10.5pt");
    expect(out).toContain("--rz-page-h:11in");
  });

  it("the block sets the page line-height and keeps location and dates in ink at the body size", () => {
    const css = templateCssBlock("consultant");
    expect(css).toMatch(/\.rz-page\.rz-tpl-consultant\s*\{[^}]*line-height:\s*1\.25/);
    expect(css).toMatch(/\.rz-tpl-consultant \.rz-item-dates[^{]*\{[^}]*font-size:\s*1em;[^}]*color:\s*var\(--rz-ink\)/);
  });
});
