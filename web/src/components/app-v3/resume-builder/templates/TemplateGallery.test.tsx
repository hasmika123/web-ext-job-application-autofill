import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ATS_STRICT, DESIGN_FREE } from "@kiwiply/ui";
import { DEFAULT_BUILDER_CONFIG, type ResumeBuilderConfig } from "@/lib/resume-builder-config.shared";
import { registerTemplateForTests } from "../../../../../../packages/ui/src/resume/registry";
import { designFree } from "../../../../../../packages/ui/src/resume/templates/__test__/designFree";

const push = vi.fn();
const track = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));
vi.mock("@/lib/analytics", () => ({ track: (...a: unknown[]) => track(...a) }));

import TemplateGallery from "./TemplateGallery";
import { ATS_RATING_LABEL, atsRating, capabilityChips, galleryTemplates, groupByCategory, templateHref } from "./model";
import { listTemplates } from "@kiwiply/ui";

const FREE = designFree.meta.id;
let unregister: () => void;
beforeEach(() => {
  push.mockReset();
  track.mockReset();
  unregister = registerTemplateForTests(designFree);
});
afterEach(() => {
  cleanup();
  unregister();
});

const cfg = (templates: Partial<ResumeBuilderConfig["templates"]> = {}): ResumeBuilderConfig => ({
  ...DEFAULT_BUILDER_CONFIG,
  templates: { ...DEFAULT_BUILDER_CONFIG.templates, ...templates },
});
const card = (id: string) => document.querySelector(`[data-template-id="${id}"]`) as HTMLElement;

describe("TemplateGallery (R3.13)", () => {
  it("lists only the ENABLED templates", () => {
    render(<TemplateGallery config={cfg({ enabled: ["modern"] })} />);
    expect(card("modern")).toBeTruthy();
    expect(card(FREE)).toBeNull(); // registered, but the admin has not enabled it
    cleanup();
    render(<TemplateGallery config={cfg({ enabled: ["modern", FREE] })} />);
    expect(card("modern")).toBeTruthy();
    expect(card(FREE)).toBeTruthy();
  });

  it("shows picture, name, description and the chips of the template's capabilities", () => {
    render(<TemplateGallery config={cfg({ enabled: ["modern", FREE] })} />);
    const modern = within(card("modern"));
    expect(modern.getByRole("heading", { name: "Modern" })).toBeTruthy();
    expect(modern.getByRole("img", { name: "Modern template" })).toBeTruthy();
    expect(Array.from(card("modern").querySelectorAll("[data-chip]")).map((c) => c.textContent)).toEqual(["ATS Friendly", "Bold only"]);
    expect(Array.from(card(FREE).querySelectorAll("[data-chip]")).map((c) => c.textContent)).toEqual(["Photo", "2 columns", "Rich text"]);
  });

  it("chips read the admin's overrides: a tightened template loses the capability it was denied", () => {
    render(<TemplateGallery config={cfg({ enabled: [FREE], overrides: { [FREE]: { photo: false, columns: 1, marks: ["b"] } } })} />);
    expect(Array.from(card(FREE).querySelectorAll("[data-chip]")).map((c) => c.textContent)).toEqual(["Bold only"]);
  });

  it("Use this template goes to My Resumes with the template in the address, and counts the pick", () => {
    render(<TemplateGallery config={cfg({ enabled: ["modern", FREE] })} />);
    fireEvent.click(within(card(FREE)).getByRole("button", { name: /Use this template|Use the/ }));
    expect(push).toHaveBeenCalledWith(`/resume-builder?template=${FREE}`);
    expect(track).toHaveBeenCalledWith("resume_template_picked", { id: FREE });
  });

  it("counts a view and links back to My Resumes", () => {
    render(<TemplateGallery config={cfg()} />);
    expect(track).toHaveBeenCalledWith("resume_template_gallery_viewed");
    expect(screen.getByRole("link", { name: "My Resumes" }).getAttribute("href")).toBe("/resume-builder");
  });
});

const TEN = ["modern", "classic", "compact", "simple", "engineer", "consultant", "scholar", "executive", "statement", "sidebar"];
const ratingOf = (id: string) => card(id).querySelector("[data-rating]")?.textContent;

describe("TemplateGallery: categories, filter chips and the rating line", () => {
  it("groups enabled templates by category in ATS, Employer, Styled order (admin order inside a group)", () => {
    render(<TemplateGallery config={cfg({ enabled: [...TEN].reverse() })} />);
    const groups = Array.from(document.querySelectorAll("[data-category]")).map((g) => ({
      cat: g.getAttribute("data-category"),
      ids: Array.from(g.querySelectorAll("[data-template-id]")).map((c) => c.getAttribute("data-template-id")),
    }));
    expect(groups.map((g) => g.cat)).toEqual(["ats", "employer", "styled"]);
    expect(groups[0].ids).toEqual(["simple", "compact", "classic", "modern"]);
    expect(groups[1].ids).toEqual(["executive", "scholar", "consultant", "engineer"]);
    expect(groups[2].ids).toEqual(["sidebar", "statement"]);
    expect(screen.getByRole("heading", { name: "Employer formats" })).toBeTruthy();
    expect(screen.getByText("The layouts recruiters in tech, consulting, finance and academia expect.")).toBeTruthy();
  });

  it("filter chips narrow the grid and keep their counts; All restores it; each pick is counted", () => {
    render(<TemplateGallery config={cfg({ enabled: TEN })} />);
    const chip = (k: string) => document.querySelector<HTMLButtonElement>(`[data-filter="${k}"]`)!;
    expect(["all", "ats", "employer", "styled"].map((k) => chip(k).textContent)).toEqual(["All (10)", "ATS-safe (4)", "Employer formats (4)", "Styled (2)"]);
    expect(chip("all").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(chip("styled"));
    expect(track).toHaveBeenCalledWith("resume_template_gallery_filter", { category: "styled" });
    expect(chip("styled").getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelectorAll("[data-template-id]")).toHaveLength(2);
    expect(card("sidebar")).toBeTruthy();
    expect(card("modern")).toBeNull();
    expect(chip("ats").textContent).toBe("ATS-safe (4)"); // counts stay
    fireEvent.click(chip("all"));
    expect(document.querySelectorAll("[data-template-id]")).toHaveLength(10);
  });

  it("a category with no enabled template has no chip and no group", () => {
    render(<TemplateGallery config={cfg({ enabled: ["modern", "classic"] })} />);
    expect(document.querySelector('[data-filter="styled"]')).toBeNull();
    expect(document.querySelector('[data-category="styled"]')).toBeNull();
    expect(document.querySelector('[data-filter="all"]')?.textContent).toBe("All (2)");
  });

  it("each card shows its rating line and its own ATS note", () => {
    render(<TemplateGallery config={cfg({ enabled: TEN })} />);
    expect(ratingOf("modern")).toBe("ATS-safe");
    expect(ratingOf("statement")).toBe("Mostly ATS-safe");
    expect(ratingOf("sidebar")).toBe("Design first — less ATS-safe");
    for (const t of listTemplates().filter((m) => TEN.includes(m.id))) {
      expect(card(t.id).querySelector("[data-ats-note]")?.textContent).toBe(t.atsNote);
    }
  });

  it("the rating follows the RESOLVED capabilities (admin overrides)", () => {
    render(<TemplateGallery config={cfg({ enabled: TEN, overrides: { sidebar: { photo: false, columns: 1 }, modern: { ats: false } } })} />);
    expect(ratingOf("sidebar")).toBe("Mostly ATS-safe");
    expect(ratingOf("modern")).toBe("Mostly ATS-safe");
  });
});

describe("gallery model", () => {
  it("atsRating: strict when ats, mostly when one plain column, else design", () => {
    expect(atsRating(ATS_STRICT)).toBe("strict");
    expect(atsRating({ ...ATS_STRICT, ats: false })).toBe("mostly");
    expect(atsRating({ ...DESIGN_FREE, photo: false, graphics: false, columns: 1 })).toBe("mostly");
    expect(atsRating(DESIGN_FREE)).toBe("design");
    expect(ATS_RATING_LABEL.design).toBe("Design first — less ATS-safe");
  });

  it("groupByCategory orders the groups and omits an empty one", () => {
    const metas = listTemplates().filter((m) => ["sidebar", "modern", "scholar"].includes(m.id));
    expect(groupByCategory(metas).map((g) => [g.category, g.templates.map((t) => t.id)])).toEqual([
      ["ats", ["modern"]],
      ["employer", ["scholar"]],
      ["styled", ["sidebar"]],
    ]);
    expect(groupByCategory(metas.filter((m) => m.category !== "employer")).map((g) => g.category)).toEqual(["ats", "styled"]);
    expect(groupByCategory([])).toEqual([]);
  });

  it("keeps the admin's enabled order, drops unknown ids and never shows an empty gallery", () => {
    expect(galleryTemplates([FREE, "modern", "nope", FREE], "modern").map((t) => t.id)).toEqual([FREE, "modern"]);
    expect(galleryTemplates(["nope"], "modern").map((t) => t.id)).toEqual(["modern"]);
    expect(galleryTemplates([], "modern").map((t) => t.id)).toEqual(["modern"]);
  });

  it("words the chips from capabilities alone", () => {
    expect(capabilityChips(ATS_STRICT).map((c) => c.label)).toEqual(["ATS Friendly", "Bold only"]);
    expect(capabilityChips(DESIGN_FREE).map((c) => c.label)).toEqual(["Photo", "2 columns", "Rich text"]);
    expect(capabilityChips({ ...ATS_STRICT, marks: [] }).map((c) => c.label)).toEqual(["ATS Friendly", "Plain text"]);
    expect(capabilityChips({ ...ATS_STRICT, marks: ["b", "i"] }).at(-1)?.label).toBe("Rich text");
  });

  it("builds the chooser address", () => {
    expect(templateHref("modern")).toBe("/resume-builder?template=modern");
    expect(templateHref("a b")).toBe("/resume-builder?template=a%20b");
  });
});
