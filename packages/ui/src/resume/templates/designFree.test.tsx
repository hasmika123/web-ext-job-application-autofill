import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ATS_STRICT, DESIGN_FREE } from "../capabilities";
import ResumePreview from "../ResumePreview";
import { registerTemplateForTests } from "../registry";
import { fixtureDoc } from "../test-fixtures";
import { DEFAULT_THEME } from "../theme";
import type { ResumeDocument, TemplateCapabilities, Theme } from "../types";
import { designFree } from "./__test__/designFree";

/** The theme of the DESIGN 6.6 vectors: accent #ec4899, source-serif, two pages, photo on. */
const THEME: Partial<Theme> = { ...DEFAULT_THEME, accent: "#ec4899", fontPair: "source-serif", showPhoto: true, fit: { mode: "auto", target: 2, step: 0 } };
const PHOTO = "data:image/jpeg;base64,AAAA";

let unregister: () => void;
beforeAll(() => {
  unregister = registerTemplateForTests(designFree);
});
afterAll(() => unregister());

const render = (templateId: string, caps: TemplateCapabilities, over: { doc?: ResumeDocument; theme?: Partial<Theme>; photoSrc?: string | null } = {}) =>
  renderToStaticMarkup(
    <ResumePreview doc={over.doc ?? fixtureDoc("caps-doc")} theme={over.theme ?? THEME} templateId={templateId} caps={caps} photoSrc={over.photoSrc === undefined ? PHOTO : over.photoSrc} />,
  );

/** Only the section markup: the header's contact links are not "in the body". */
const body = (html: string) => (html.match(/<section[\s\S]*?<\/section>/g) ?? []).join("");
const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;
const summary = (html: string) => /<section class="rz-section rz-section-summary">[\s\S]*?<\/section>/.exec(html)?.[0] ?? "";

describe("DESIGN 6.6 render vectors: caps-doc x { ATS_STRICT, DESIGN_FREE }", () => {
  const ats = () => render("modern", ATS_STRICT);
  const atsViaFree = () => render(designFree.meta.id, ATS_STRICT);
  const free = () => render(designFree.meta.id, DESIGN_FREE);

  for (const [name, get] of [
    ["ATS_STRICT on modern", ats],
    ["ATS_STRICT on the two-column test template", atsViaFree],
  ] as const) {
    describe(name, () => {
      it("<strong> 1 / <em> 0 / <a> 0 in the body", () => {
        const b = body(get());
        expect(count(b, /<strong>/g)).toBe(1);
        expect(count(b, /<em>/g)).toBe(0);
        expect(count(b, /<u>/g)).toBe(0);
        expect(count(b, /<a /g)).toBe(0);
      });
      it("summary is a plain paragraph, no list", () => {
        const s = summary(get());
        expect(s).toContain('<p class="rz-text">');
        expect(s).not.toMatch(/<ul|<ol|<li/);
      });
      it("section titles are standard", () => {
        const out = get();
        expect(out).toContain(">Experience</h2>");
        expect(out).not.toContain("Where I");
      });
      it("six skill groups, the last absorbing the rest", () => {
        const out = get();
        expect(count(out, /class="rz-skill-row"/g)).toBe(6);
        expect(out).toContain("Practices:");
        expect(out).toContain("Methods:");
        expect(out).not.toContain("Leadership:");
        expect(out).not.toContain("Domains:");
        // the sixth row (Methods) keeps its label and takes the skills of the groups that follow it
        const row = /<span class="rz-skill-group">Methods: <\/span><span class="rz-skill-list">([^<]*)<\/span>/.exec(out);
        expect(row?.[1]).toBe("Methods one, Methods two, Leadership one, Leadership two, Domains one, Domains two");
      });
      it("no photo", () => {
        expect(get()).not.toContain("rz-photo");
        expect(get()).not.toContain(PHOTO);
      });
      it("accent variable is the ink colour; the stored font is kept (every bundled font is allowed)", () => {
        const out = get();
        expect(out).toContain("--rz-accent:#111827");
        expect(out).not.toContain("#ec4899");
        expect(out).toContain('--rz-font-body:"Source Serif 4"');
      });
      it("hidden content is not drawn: Interests, the second custom section; the first custom section stays", () => {
        const out = get();
        expect(out).not.toContain("Rock climbing");
        expect(out).not.toContain(">Awards</h2>");
        expect(out).toContain("Volunteering &amp; Impact!");
      });
      it("the numbered list setting is ignored: bullets stay a plain bulleted list", () => {
        const out = get();
        expect(out).not.toContain("<ol");
        expect(out).toContain('<ul class="rz-bullets">');
      });
    });
  }

  describe("DESIGN_FREE", () => {
    it("<strong> 1 / <em> 1 / <a> 1 in the body", () => {
      const b = body(free());
      expect(count(b, /<strong>/g)).toBe(1);
      expect(count(b, /<em>/g)).toBe(1);
      expect(count(b, /<a /g)).toBe(1);
      expect(b).toContain('<a class="rz-link" href="https://casey.example.com/case-study">');
    });
    it("summary is a list, one item per line, with each line's own marks", () => {
      const s = summary(free());
      expect(count(s, /<li /g)).toBe(2);
      expect(s).toContain('<ul class="rz-bullets">');
      expect(s).toContain("<strong>Product leader</strong>");
      expect(s).toMatch(/<em>[^<]+<\/em>/);
      expect(s).not.toContain('<p class="rz-text">');
    });
    it("the experience bullets are a numbered list", () => {
      expect(free()).toContain('<ol class="rz-bullets rz-numbered">');
    });
    it("keeps the user's heading", () => {
      expect(free()).toContain("Where I&#x27;ve worked</h2>");
    });
    it("eight skill groups", () => {
      const out = free();
      expect(count(out, /class="rz-skill-row"/g)).toBe(8);
      expect(out).toContain("Domains:");
    });
    it("draws the photo (showPhoto true, a photo in the document, a URL)", () => {
      const out = free();
      expect(count(out, /class="rz-photo"/g)).toBe(1);
      expect(out).toContain(`src="${PHOTO}"`);
    });
    it("no photo when showPhoto is not true, when there is no URL, or when the document has none", () => {
      expect(render(designFree.meta.id, DESIGN_FREE, { theme: { ...THEME, showPhoto: null } })).not.toContain("rz-photo"); // template default is off
      expect(render(designFree.meta.id, DESIGN_FREE, { theme: { ...THEME, showPhoto: false } })).not.toContain("rz-photo");
      expect(render(designFree.meta.id, DESIGN_FREE, { photoSrc: null })).not.toContain("rz-photo");
      const noPhoto = fixtureDoc("caps-doc");
      noPhoto.basics.photo = null;
      expect(render(designFree.meta.id, DESIGN_FREE, { doc: noPhoto })).not.toContain("rz-photo");
    });
    it("accent variable and font are the stored ones", () => {
      const out = free();
      expect(out).toContain("--rz-accent:#ec4899");
      expect(out).toContain("Source Serif 4");
    });
    it("draws both custom sections, Interests, and puts the sidebar sections after the main column", () => {
      const out = free();
      expect(out).toContain(">Awards</h2>");
      expect(out).toContain("Rock climbing, Specialty coffee");
      expect(out.indexOf('<aside class="rz-side">')).toBeGreaterThan(out.indexOf("</main>"));
      expect(out.indexOf("Rock climbing")).toBeGreaterThan(out.indexOf('<aside class="rz-side">'));
    });
    it("year dates are rendered here (the capability allows them)", () => {
      const out = render(designFree.meta.id, DESIGN_FREE, { theme: { ...THEME, dateStyle: "year" } });
      expect(out).toContain("2020 – Present");
      expect(out).not.toContain("Mar 2020");
    });
  });

  it("an admin override tightens the render without touching the template", () => {
    const tightened: TemplateCapabilities = { ...DESIGN_FREE, marks: ["b"], lists: false, photo: false };
    const out = render(designFree.meta.id, tightened);
    expect(count(body(out), /<em>/g)).toBe(0);
    expect(out).not.toContain("<ol");
    expect(out).not.toContain("rz-photo");
  });

  it("rendering never changes the document", () => {
    const doc = fixtureDoc("caps-doc");
    const before = JSON.stringify(doc);
    render("modern", ATS_STRICT, { doc });
    render(designFree.meta.id, DESIGN_FREE, { doc });
    expect(JSON.stringify(doc)).toBe(before);
  });

  it("the markup stays inside the template contract: only .rz-* classes, no inline styles, no tables", () => {
    for (const out of [ats(), free()]) {
      const classes = [...out.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/)).filter(Boolean);
      expect(classes.filter((c) => !c.startsWith("rz-"))).toEqual([]);
      expect(out).not.toMatch(/\sstyle="|<table/);
    }
  });
});
