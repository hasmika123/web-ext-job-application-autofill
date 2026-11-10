import { describe, expect, it } from "vitest";
import { ATS_STRICT } from "../capabilities";
import { describeTemplate, renderTemplate } from "./__test__/suite";
import { templateCssBlock } from "./__test__/atsCompliance";

describeTemplate({ id: "engineer", capabilities: ATS_STRICT, category: "employer", ats: true });

/** The declarations of the rule in `css` whose selector is exactly `selector` ("" when there is none). */
function ruleBody(css: string, selector: string): string {
  for (const part of css.replace(/\/\*[\s\S]*?\*\//g, "").split("}")) {
    const [sel, body] = part.split("{");
    if (body !== undefined && sel.trim() === selector) return body;
  }
  return "";
}

/** The text of the `.rz-item-head` rows of the first entry of the `kind` section, one string per row ("|" between the halves). */
function firstEntryRows(html: string, kind: string): string[] {
  const start = html.indexOf(`<section class="rz-section rz-section-${kind}">`);
  const section = html.slice(start, html.indexOf("</section>", start));
  const entry = section.split('<div class="rz-item">')[1] ?? "";
  const rows: string[] = [];
  for (const m of entry.matchAll(/<div class="rz-item-head[^"]*">(.*?)<\/div><\/div>/g)) {
    rows.push(
      m[1]
        .replace(/<[^>]+>/g, "|")
        .replace(/\|+/g, "|")
        .replace(/^\||\|$/g, ""),
    );
    if (rows.length === 2) break;
  }
  return rows;
}

describe("engineer specifics (TEMPLATES-DESIGN 12.8 vector)", () => {
  const out = renderTemplate("engineer", "sample");

  it("experience heads are title-org: line 1 = title + dates, line 2 = org + location", () => {
    expect(out).toContain("rz-item-head-2");
    const rows = firstEntryRows(out, "experience");
    expect(rows[0]).toBe("Senior Software Engineer|Mar 2022 – Present");
    expect(rows[1]).toBe("Harbor &amp; Vale Logistics|Austin, TX");
  });

  it("education heads are org-title: line 1 = school + location, line 2 = degree + dates", () => {
    const rows = firstEntryRows(out, "education");
    expect(rows[0]).toBe("University of Westbrook|Westbrook, OR");
    expect(rows[1]).toMatch(/^M\.S\. in .+\|.+$/);
  });

  it("the contact line uses ' | ' and the page starts in IBM Plex Sans at compact spacing", () => {
    expect(out).toContain('<span class="rz-sep"> | </span>');
    expect(out).toContain('--rz-font-body:"IBM Plex Sans"');
    expect(out).toContain("--rz-size:10.5pt");
  });

  it("projects render the title, the link and the dates on one head row", () => {
    const rows = firstEntryRows(out, "projects");
    expect(rows[0]).toContain("Feb 2023 – Jan 2024");
    expect(rows[0]).toMatch(/^Surge\|/);
  });

  it("links are underlined by the block", () => {
    const css = templateCssBlock("engineer");
    const link = ruleBody(css, ".rz-tpl-engineer .rz-link");
    expect(link).toMatch(/text-decoration:\s*underline/);
    expect(link).toMatch(/border-bottom:\s*0\s*;/);
  });

  it("section titles are small caps, not upper case, with a full-width rule", () => {
    const title = ruleBody(templateCssBlock("engineer"), ".rz-tpl-engineer .rz-section-title");
    expect(title).toMatch(/font-variant-caps:\s*small-caps/);
    expect(title).toMatch(/text-transform:\s*none/);
    expect(title).toMatch(/border-bottom:\s*1px solid #111827/);
  });
});
