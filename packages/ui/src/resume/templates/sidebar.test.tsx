import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DESIGN_FREE, hiddenContent, isAtLeastAsStrictAs, tightenCapabilities } from "../capabilities";
import ResumePreview from "../ResumePreview";
import { getTemplate } from "../registry";
import { fixtureDoc, type FixtureName } from "../test-fixtures";
import { DEFAULT_THEME } from "../theme";
import type { TemplateCapabilities, Theme } from "../types";
import { templateCssBlock } from "./__test__/atsCompliance";
import { describeTemplate } from "./__test__/suite";
import { SIDEBAR_CAPS } from "./sidebar";

const ID = "sidebar";
const PHOTO = "data:image/jpeg;base64,AAAA";

describeTemplate({ id: ID, capabilities: SIDEBAR_CAPS, category: "styled", ats: false });

const theme = (over?: Partial<Theme>): Theme => ({ ...DEFAULT_THEME, ...(getTemplate(ID).meta.defaults ?? {}), ...over });
const html = (name: FixtureName, over?: Partial<Theme>, photoSrc?: string | null, caps?: TemplateCapabilities) =>
  renderToStaticMarkup(<ResumePreview doc={fixtureDoc(name)} theme={theme(over)} templateId={ID} photoSrc={photoSrc} caps={caps} />);
const aside = (out: string) => /<aside class="rz-side">[\s\S]*?<\/aside>/.exec(out)?.[0] ?? "";
const mainCol = (out: string) => /<main class="rz-main">[\s\S]*?<\/main>/.exec(out)?.[0] ?? "";
const titles = (s: string) => [...s.matchAll(/<h2 class="rz-section-title">([^<]*)<\/h2>/g)].map((m) => m[1]);

describe("sidebar specifics", () => {
  it("declares DESIGN_FREE without graphics: two columns, photo slot, nothing else tightened", () => {
    const caps = getTemplate(ID).meta.capabilities;
    expect(caps).toEqual({ ...DESIGN_FREE, graphics: false });
    expect(caps.graphics).toBe(false);
    expect(caps.columns).toBe(2);
    expect(caps.photo).toBe(true);
    expect(caps.photoDefault).toBe(false);
    expect(isAtLeastAsStrictAs(caps, DESIGN_FREE)).toBe(true);
    expect(isAtLeastAsStrictAs(DESIGN_FREE, caps)).toBe(false);
  });

  it("sample under the sidebar profile hides nothing", () => {
    expect(hiddenContent(fixtureDoc("sample"), theme(), SIDEBAR_CAPS)).toEqual([]);
  });

  it("the aside holds Contact, Skills, Languages, Certifications and Interests, and no Experience", () => {
    const side = aside(html("sample"));
    expect(titles(side)).toEqual(["Contact", "Skills", "Certifications", "Languages", "Interests"]);
    expect(side).not.toContain("Experience");
    expect(side).toContain('<ul class="rz-contact-list">');
    expect(side).toContain("jordan.avery@example.com");
    expect(side).toContain('<ul class="rz-skill-tags">');
  });

  it("the main column holds the other sections, in document order, with no tag lists or contact list", () => {
    const main = mainCol(html("sample"));
    expect(titles(main)).toEqual(["Summary", "Experience", "Education", "Projects", "Achievements", "Volunteering"]);
    expect(main).not.toMatch(/rz-skill-tags|rz-contact-list/);
  });

  it("DOM order is header, main, aside (the grid places the aside on the left)", () => {
    const out = html("sample");
    const [h, m, a] = [out.indexOf("<header"), out.indexOf('<main class="rz-main">'), out.indexOf('<aside class="rz-side">')];
    expect(h).toBeGreaterThan(-1);
    expect(h).toBeLessThan(m);
    expect(m).toBeLessThan(a);
    expect(out.indexOf("</main>")).toBeLessThan(a);
  });

  it("contact is in the sidebar, not in the header", () => {
    const out = html("sample");
    const header = /<header class="rz-header">[\s\S]*?<\/header>/.exec(out)?.[0] ?? "";
    expect(header).toContain('<h1 class="rz-name">Jordan Avery</h1>');
    expect(header).not.toMatch(/rz-contact|@example\.com/);
  });

  it("a stacked contact has one entry per line and no separators", () => {
    const list = /<ul class="rz-contact-list">[\s\S]*?<\/ul>/.exec(html("sample"))?.[0] ?? "";
    expect((list.match(/<li>/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(list).not.toContain("rz-sep");
  });

  it("columns override 1: no aside, everything in main in document order, contact in the header", () => {
    const caps = tightenCapabilities(ID, SIDEBAR_CAPS, { columns: 1 });
    expect(caps.columns).toBe(1);
    const out = html("sample", undefined, undefined, caps);
    expect(out).not.toContain("<aside");
    expect(out).toContain("rz-no-side");
    const header = /<header class="rz-header">[\s\S]*?<\/header>/.exec(out)?.[0] ?? "";
    expect(header).toContain("rz-contact");
    expect(header).not.toContain("rz-contact-list");
    expect(titles(mainCol(out))).toEqual([
      "Summary",
      "Experience",
      "Education",
      "Skills",
      "Projects",
      "Certifications",
      "Languages",
      "Achievements",
      "Interests",
      "Volunteering",
    ]);
    expect(out).not.toContain("rz-skill-tags");
  });

  it("photo: drawn only with a URL, showPhoto on, and a photo in the document; it sits first in the aside", () => {
    const withPhoto = html("sample", { showPhoto: true }, PHOTO);
    expect((withPhoto.match(/class="rz-photo"/g) ?? []).length).toBe(1);
    expect(withPhoto).toContain(`src="${PHOTO}"`);
    expect(aside(withPhoto).indexOf("rz-photo")).toBeGreaterThan(-1);
    expect(aside(withPhoto).indexOf("rz-photo")).toBeLessThan(aside(withPhoto).indexOf("Contact"));
    expect(html("sample", { showPhoto: true }, null)).not.toContain("rz-photo"); // no URL
    expect(html("sample", { showPhoto: false }, PHOTO)).not.toContain("rz-photo");
    expect(html("sample", { showPhoto: null }, PHOTO)).not.toContain("rz-photo"); // photoDefault is false
    const noPhoto = fixtureDoc("sample");
    noPhoto.basics.photo = null;
    const out = renderToStaticMarkup(<ResumePreview doc={noPhoto} theme={theme({ showPhoto: true })} templateId={ID} photoSrc={PHOTO} />);
    expect(out).not.toContain("rz-photo");
  });

  it("without any photo the markup has no img at all; no svg, no table, no inline style", () => {
    for (const name of ["full-v2", "sparse", "caps-doc", "sample"] as FixtureName[]) {
      expect(html(name)).not.toMatch(/<img|<svg|<table|\sstyle="/);
    }
  });

  it("a document with nothing for the sidebar draws no aside and marks the page single-column", () => {
    const doc = fixtureDoc("sparse");
    doc.basics.email = "";
    doc.basics.phone = "";
    doc.basics.location = "";
    doc.basics.links = [];
    const out = renderToStaticMarkup(<ResumePreview doc={doc} theme={theme()} templateId={ID} />);
    expect(out).not.toContain("<aside");
    expect(out).toContain("rz-no-side");
  });

  it("renders the project dates and keeps inline heads", () => {
    const out = html("sample");
    expect(mainCol(out)).toContain("Feb 2023 – Jan 2024");
    expect(out).not.toContain("rz-item-head-2");
  });

  describe("tpl:sidebar CSS block", () => {
    const css = templateCssBlock(ID);
    it("grid: 32% sidebar on the left via named areas; header spans both columns", () => {
      expect(css).toMatch(/grid-template-columns:\s*32% minmax\(0, 1fr\)/);
      expect(css).toContain('grid-template-areas: "header header" "side main"');
      expect(css).toMatch(/\.rz-side\s*\{[^}]*grid-area:\s*side/);
      expect(css).toMatch(/\.rz-main\s*\{[^}]*grid-area:\s*main/);
      expect(css).toMatch(/\.rz-header\s*\{[^}]*grid-area:\s*header/);
      expect(css).toMatch(/column-gap:\s*1\.4em/);
    });
    it("tinted sidebar: 8% accent mix, 4px radius, starts at the top, may break across pages", () => {
      expect(css).toContain("color-mix(in srgb, var(--rz-accent) 8%, #fff)");
      expect(css).toMatch(/align-self:\s*start/);
      expect(css).toMatch(/break-inside:\s*auto/);
      expect(css).toMatch(/border-radius:\s*4px/);
    });
    it("main-column entries may split across pages, with the head kept with its first bullet", () => {
      expect(css).toMatch(/\.rz-main \.rz-entry\s*\{[^}]*break-inside:\s*auto/);
      expect(css).toMatch(/\.rz-main \.rz-item-head\s*\{[^}]*break-after:\s*avoid/);
      expect(css).toMatch(/\.rz-main \.rz-bullet\s*\{[^}]*break-inside:\s*avoid/);
    });
    it("no icons or generated content, no absolute positioning, no url()", () => {
      for (const bad of ["url(", "position:", "float:", "column-count"]) expect(css).not.toContain(bad);
      expect(css).not.toMatch(/(?:^|[\s;{])content:/); // generated text (align-content is layout, not content)
    });
  });
});
