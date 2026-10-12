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
import { capabilityChips, galleryTemplates, templateHref } from "./model";

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

describe("gallery model", () => {
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
