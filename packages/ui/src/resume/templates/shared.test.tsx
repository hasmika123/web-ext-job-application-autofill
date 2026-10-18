import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DESIGN_FREE } from "../capabilities";
import { DEFAULT_THEME } from "../theme";
import { sampleDoc } from "../test-fixtures";
import type { ResumeDocument } from "../types";
import { ContactLine, Header, Section, renderSections, type RenderOptions } from "./shared";

const theme = { dateStyle: DEFAULT_THEME.dateStyle };

const markup = (sections: ReturnType<typeof renderSections>): string =>
  renderToStaticMarkup(
    <>
      {sections.map((s) => (
        <Section key={s.id} section={s} />
      ))}
    </>,
  );

/** One section kind of the sample, rendered as markup. */
function render(kind: string, opts?: RenderOptions, doc: ResumeDocument = sampleDoc()): string {
  return markup(renderSections(doc, theme, DESIGN_FREE, { ...opts, only: (k) => k === kind }));
}

/** The sample with the first experience item replaced by `item`. */
function expDoc(item: Record<string, unknown>): ResumeDocument {
  const doc = sampleDoc();
  const exp = doc.sections.find((s) => s.kind === "EXPERIENCE")!;
  (exp as { items: unknown[] }).items = [{ id: "i_expsample1", ...item }];
  return doc;
}

describe("renderSections: head layouts", () => {
  it("inline head is the original markup: one row, title - org, location as a sub line", () => {
    const item = { title: "Engineer", org: "Acme", location: "Austin, TX", start: "2022-03", current: true };
    expect(render("EXPERIENCE", undefined, expDoc(item))).toBe(
      '<section class="rz-section rz-section-experience"><h2 class="rz-section-title">Experience</h2><div class="rz-section-body"><div class="rz-entry"><div class="rz-item">' +
        '<div class="rz-item-head"><div class="rz-item-main"><span><span class="rz-item-title">Engineer</span><span class="rz-sep"> — </span><span class="rz-item-org">Acme</span></span></div><div class="rz-item-dates">Mar 2022 – Present</div></div>' +
        '<div class="rz-item-sub">Austin, TX</div></div></div></div></section>',
    );
    expect(render("EXPERIENCE", { layout: { experience: "inline" } })).toBe(render("EXPERIENCE"));
  });

  it("a bare function as the 4th argument is still { only }", () => {
    const doc = sampleDoc();
    const fn = renderSections(doc, theme, DESIGN_FREE, (k) => k === "SKILLS");
    const obj = renderSections(doc, theme, DESIGN_FREE, { only: (k) => k === "SKILLS" });
    expect(fn.map((s) => s.kind)).toEqual(["SKILLS"]);
    expect(markup(fn)).toBe(markup(obj));
  });

  it("title-org puts the title and dates on row 1 and the org with the location on the right on row 2", () => {
    const out = render("EXPERIENCE", { layout: { experience: "title-org" } });
    expect(out).toContain(
      '<div class="rz-item-head"><div class="rz-item-main"><span class="rz-item-title">Senior Software Engineer</span></div><div class="rz-item-dates">Mar 2022 – Present</div></div>' +
        '<div class="rz-item-head rz-item-head-2"><div class="rz-item-main"><span class="rz-item-org">Harbor &amp; Vale Logistics</span></div><div class="rz-item-loc">Austin, TX</div></div>',
    );
    expect(out).not.toContain("rz-item-sub");
  });

  it("org-title puts the org and the location on row 1 and the title with the dates on row 2", () => {
    const out = render("EXPERIENCE", { layout: { experience: "org-title" } });
    expect(out).toContain(
      '<div class="rz-item-head"><div class="rz-item-main"><span class="rz-item-org">Harbor &amp; Vale Logistics</span></div><div class="rz-item-loc">Austin, TX</div></div>' +
        '<div class="rz-item-head rz-item-head-2"><div class="rz-item-main"><span class="rz-item-title">Senior Software Engineer</span></div><div class="rz-item-dates">Mar 2022 – Present</div></div>',
    );
  });

  it("CUSTOM entries follow the experience layout", () => {
    const out = render("CUSTOM", { layout: { experience: "org-title" } });
    expect(out).toContain(
      '<div class="rz-item-head"><div class="rz-item-main"><span class="rz-item-org">Code Bridge Austin</span></div><div class="rz-item-loc">Austin, TX</div></div><div class="rz-item-head rz-item-head-2">',
    );
  });

  it("education inline keeps GPA in the sub line", () => {
    expect(render("EDUCATION")).toContain("Westbrook, OR · GPA: 3.8</div>");
  });

  it("education org-title: school and location on row 1, degree, GPA and dates on row 2", () => {
    const out = render("EDUCATION", { layout: { education: "org-title" } });
    expect(out).toContain('<div class="rz-item-head"><div class="rz-item-main"><span class="rz-item-org">University of Westbrook</span></div><div class="rz-item-loc">Westbrook, OR</div></div>');
    expect(out).toContain(
      '<div class="rz-item-head rz-item-head-2"><div class="rz-item-main"><span><span class="rz-item-title">M.S. in Computer Science</span><span class="rz-sep"> · </span>GPA: 3.8</span></div><div class="rz-item-dates">Aug 2015 – May 2017</div></div>',
    );
  });

  it("education title-org: degree and dates, then the school with GPA appended and the location on the right", () => {
    const out = render("EDUCATION", { layout: { education: "title-org" } });
    expect(out).toContain('<div class="rz-item-head"><div class="rz-item-main"><span class="rz-item-title">M.S. in Computer Science</span></div><div class="rz-item-dates">Aug 2015 – May 2017</div></div>');
    expect(out).toContain(
      '<div class="rz-item-head rz-item-head-2"><div class="rz-item-main"><span><span class="rz-item-org">University of Westbrook</span><span class="rz-sep"> · </span>GPA: 3.8</span></div><div class="rz-item-loc">Westbrook, OR</div></div>',
    );
  });

  it("empty halves emit no element: a role without a location renders row 1 as the org alone; a row with nothing is dropped", () => {
    const noLoc = render("EXPERIENCE", { layout: { experience: "org-title" } }, expDoc({ title: "Engineer", org: "Acme", start: "2020-01", end: "2021-01" }));
    expect(noLoc).toContain('<div class="rz-item-head"><div class="rz-item-main"><span class="rz-item-org">Acme</span></div></div>');
    expect(noLoc).not.toContain("rz-item-loc");
    expect(noLoc).not.toContain("<div></div>");
    const titleOnly = render("EXPERIENCE", { layout: { experience: "org-title" } }, expDoc({ title: "Engineer" }));
    expect(titleOnly).not.toContain('<div class="rz-item-head">'); // row 1 (org + location) is empty
    expect(titleOnly).toContain('<div class="rz-item-head rz-item-head-2"><div class="rz-item-main"><span class="rz-item-title">Engineer</span></div></div>');
  });

  it("certifications stay one line under a two-line layout", () => {
    const a = render("CERTIFICATIONS");
    const b = render("CERTIFICATIONS", { layout: { experience: "org-title", education: "title-org" } });
    expect(b).toBe(a);
    expect(b).not.toContain("rz-item-head-2");
  });

  it("projects render start - end (and a lone start), on one line under every layout", () => {
    const out = render("PROJECTS");
    expect(out).toContain("Feb 2023 – Jan 2024");
    expect(out).toContain("2021 – 2021");
    const two = render("PROJECTS", { layout: { experience: "title-org" } });
    expect(two).toBe(out);
    expect(two).not.toContain("rz-item-head-2");
    const doc = sampleDoc();
    const prj = doc.sections.find((s) => s.kind === "PROJECTS")!;
    (prj as { items: unknown[] }).items = [{ id: "i_prjsample1", title: "Surge", start: "2023-02" }];
    expect(render("PROJECTS", undefined, doc)).toContain('<div class="rz-item-dates">Feb 2023</div>');
  });
});

describe("renderSections: skills as a tag list", () => {
  it("renders one li per skill and the group label row only when the group is named", () => {
    const out = render("SKILLS", { skills: "list" });
    expect(out).toContain('<p class="rz-skill-row"><span class="rz-skill-group">Languages</span></p><ul class="rz-skill-tags"><li>Go</li><li>TypeScript</li><li>Python</li><li>Java</li><li>SQL</li></ul>');
    expect((out.match(/<li>/g) ?? []).length).toBe(22);
    const doc = sampleDoc();
    const skl = doc.sections.find((s) => s.kind === "SKILLS")!;
    (skl as { items: unknown[] }).items = [{ id: "i_sklsample1", skills: ["Go", "SQL"] }];
    const bare = render("SKILLS", { skills: "list" }, doc);
    expect(bare).not.toContain("rz-skill-row");
    expect(bare).toContain('<ul class="rz-skill-tags"><li>Go</li><li>SQL</li></ul>');
  });

  it("the default stays the inline 'Group: a, b, c' rows", () => {
    const out = render("SKILLS");
    expect(out).toContain('<span class="rz-skill-group">Languages: </span><span class="rz-skill-list">Go, TypeScript, Python, Java, SQL</span>');
    expect(out).not.toContain("rz-skill-tags");
  });
});

describe("ContactLine and Header", () => {
  const basics = sampleDoc().basics;

  it("the default is the ' | ' line, byte-identical to before", () => {
    const out = renderToStaticMarkup(<ContactLine basics={basics} />);
    expect(out.startsWith('<span class="rz-contact"><a class="rz-link" href="mailto:jordan.avery@example.com">jordan.avery@example.com</a><span class="rz-sep"> | </span>+1 (555) 010-0123<span class="rz-sep"> | </span>Austin, TX')).toBe(true);
    expect(renderToStaticMarkup(<Header basics={basics} />)).toBe(renderToStaticMarkup(<Header basics={basics} sep=" | " />));
  });

  it("sep sets the visible separator, on the header too", () => {
    expect(renderToStaticMarkup(<ContactLine basics={basics} sep=" • " />)).toContain('<span class="rz-sep"> • </span>');
    const header = renderToStaticMarkup(<Header basics={basics} sep=" · " />);
    expect(header).toContain('<span class="rz-sep"> · </span>');
    expect(header).not.toContain(" | ");
  });

  it("stacked draws one list item per entry and no separators", () => {
    const out = renderToStaticMarkup(<ContactLine basics={basics} stacked />);
    expect(out.startsWith('<ul class="rz-contact-list"><li><a class="rz-link" href="mailto:jordan.avery@example.com">')).toBe(true);
    expect((out.match(/<li>/g) ?? []).length).toBe(6); // email, phone, location, three links
    expect(out).not.toContain("rz-sep");
    expect(renderToStaticMarkup(<Header basics={basics} stacked />)).toContain('<ul class="rz-contact-list">');
  });

  it("no contact data draws nothing", () => {
    expect(renderToStaticMarkup(<ContactLine basics={{ name: "x" }} stacked />)).toBe("");
  });
});
