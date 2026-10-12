import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FIXTURES, fixtureDoc } from "../test-fixtures";
import ResumePreview from "../ResumePreview";
import { ATS_STRICT } from "../capabilities";
import { TEMPLATES, TEMPLATE_IDS, getTemplate, hasTemplate, listTemplates, registerTemplateForTests } from "../registry";
import { DEFAULT_THEME } from "../theme";
import type { Theme } from "../types";
import { designFree } from "./__test__/designFree";

const html = (name: (typeof FIXTURES)[number], theme?: Partial<Theme>, templateId = "modern") =>
  renderToStaticMarkup(<ResumePreview doc={fixtureDoc(name)} theme={{ ...DEFAULT_THEME, ...theme }} templateId={templateId} />);

describe("Modern template", () => {
  for (const name of FIXTURES) {
    it(`${name}: HTML snapshot`, () => {
      expect(html(name)).toMatchSnapshot();
    });
  }

  it("renderToStaticMarkup(ResumePreview) is deterministic", () => {
    for (const name of FIXTURES) {
      expect(html(name)).toBe(html(name));
    }
  });

  it("uses only .rz-* classes, no inline styles, no tables", () => {
    for (const name of FIXTURES) {
      const out = html(name);
      const classes = [...out.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/)).filter(Boolean);
      expect(classes.length).toBeGreaterThan(5);
      expect(classes.filter((c) => !c.startsWith("rz-"))).toEqual([]);
      expect(out).not.toMatch(/\sstyle="/);
      expect(out).not.toMatch(/<table|<img|<svg/);
    }
  });

  it("renders sections in document order, honours titles, hides hidden content", () => {
    const out = html("full");
    const order = ["Summary", "Experience", "Education", "Skills", "Projects", "Languages", "Achievements", "Volunteering"].map((t) =>
      out.indexOf(`>${t}</h2>`),
    );
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(out).not.toContain("Certifications"); // hidden section
    expect(out).not.toContain("Initech"); // hidden item
    expect(out).not.toContain("COBOL");
    expect(out).not.toContain("hidden alternative");
    expect(out).toContain("Jun 2022 – Present"); // current wins over end
    expect(out).not.toContain("Jan 2023");
  });

  it("sparse: drops empty and hidden sections, falls back to default titles", () => {
    const out = html("sparse");
    expect(out).toContain(">Experience</h2>");
    expect(out).not.toContain(">Summary</h2>");
    expect(out).not.toContain("Espresso");
    expect(out).toContain("Sam Lee");
  });

  it("is an ATS template: standard headings, 'range' dates only, ink instead of the accent, bold only", () => {
    expect(getTemplate("modern").meta.capabilities).toBe(ATS_STRICT);
    const out = html("full", { dateStyle: "year", accent: "#ec4899" });
    expect(out).toContain(">Experience</h2>"); // the stored "Work Experience" override is ignored
    expect(out).not.toContain("Work Experience");
    expect(out).toContain("Jun 2022 – Present"); // year style is not rendered by this template
    expect(out).toContain("--rz-accent:#111827");
    expect(out).not.toContain("#ec4899");
    expect(out).not.toMatch(/<em>|<u>/);
  });

  it("theme: variables are scoped and sanitised; hostile accent cannot reach the stylesheet", () => {
    const unregister = registerTemplateForTests(designFree);
    try {
      const out = html("sparse", { accent: "red;}</style><script>alert(1)</script>", pageSize: "a4" }, designFree.meta.id);
      expect(out).not.toContain("<script>");
      expect(out).toContain("--rz-accent:#2563eb");
      expect(out).toContain("--rz-page-w:210mm");
      expect(out).toContain("@page{size:210mm 297mm");
    } finally {
      unregister();
    }
  });

  it("applies the fit ladder step before rendering", () => {
    const out = html("sparse", { fit: { mode: "auto", target: 1, step: 6 } });
    expect(out).toContain("--rz-size:9.5pt");
    expect(out).toContain("--rz-margin:0.45in");
  });

  it("links: http(s) become anchors, other schemes stay plain text", () => {
    const doc = fixtureDoc("sparse");
    doc.basics.links = [
      { label: "Site", url: "https://example.com/x" },
      { label: "Bad", url: "javascript:alert(1)" },
    ];
    const out = renderToStaticMarkup(<ResumePreview doc={doc} theme={DEFAULT_THEME} />);
    expect(out).toContain('href="https://example.com/x"');
    expect(out).not.toContain("javascript:");
  });
});

describe("registry", () => {
  it("ships modern and falls back to it for unknown ids", () => {
    expect(TEMPLATE_IDS).toContain("modern");
    expect(hasTemplate("modern")).toBe(true);
    expect(hasTemplate("nope")).toBe(false);
    expect(hasTemplate("toString")).toBe(false);
    expect(getTemplate("nope").meta.id).toBe("modern");
    expect(getTemplate(null).meta.id).toBe("modern");
  });

  it("every template has consistent meta", () => {
    for (const meta of listTemplates()) {
      expect(TEMPLATES[meta.id].meta).toBe(meta);
      expect(meta.thumb).toMatch(/\.png$/);
      expect(meta.capabilities.dateStyles.length).toBeGreaterThan(0);
    }
  });
});
