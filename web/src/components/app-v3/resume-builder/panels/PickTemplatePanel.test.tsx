import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResumeDocument, ResumeTheme } from "@kiwiply/ui";
// The test-only DESIGN_FREE template lives in packages/ui and is registered only by tests; the relative paths
// resolve to the same modules the `@kiwiply/ui` barrel re-exports, so the registration is seen by the panel.
import { registerTemplateForTests } from "../../../../../../packages/ui/src/resume/registry";
import { designFree } from "../../../../../../packages/ui/src/resume/templates/__test__/designFree";
import capsDoc from "../../../../../../packages/ui/src/resume/__fixtures__/caps-doc.json";
import { DEFAULT_BUILDER_CONFIG, type ResumeBuilderConfig } from "@/lib/resume-builder-config";
import type { PresentationControls } from "../usePresentation";
import PickTemplatePanel, { offeredTemplateIds } from "./PickTemplatePanel";

vi.mock("@/lib/api", () => ({ serverApiFetch: vi.fn() }));

const FREE = designFree.meta.id;
const doc = capsDoc as unknown as ResumeDocument;
let unregister: () => void;
beforeEach(() => {
  unregister = registerTemplateForTests(designFree);
});
afterEach(() => {
  cleanup();
  unregister();
});

const cfg = (over: Partial<ResumeBuilderConfig["templates"]> = {}, palette?: string[]): ResumeBuilderConfig => ({
  ...DEFAULT_BUILDER_CONFIG,
  templates: { ...DEFAULT_BUILDER_CONFIG.templates, enabled: ["modern", FREE], ...over },
  theme: { accentPalette: palette ?? DEFAULT_BUILDER_CONFIG.theme.accentPalette },
});

function setup(props: { templateId?: string; theme?: Partial<ResumeTheme> | null; config?: ResumeBuilderConfig; disabled?: boolean } = {}) {
  const controls = { switchTemplate: vi.fn(), changeTheme: vi.fn(), flush: vi.fn(async () => {}) } satisfies PresentationControls;
  render(
    <PickTemplatePanel
      doc={doc}
      templateId={props.templateId ?? "modern"}
      theme={props.theme ?? null}
      config={props.config ?? cfg()}
      controls={controls}
      disabled={props.disabled}
    />,
  );
  return controls;
}

const card = (id: string) => document.querySelector<HTMLButtonElement>(`[data-template="${id}"]`)!;

describe("PickTemplatePanel: cards", () => {
  it("draws one card per enabled template, the live document in each, with Selected / ATS Friendly chips", () => {
    setup();
    expect(card("modern")).toBeTruthy();
    expect(card(FREE)).toBeTruthy();
    expect(within(card("modern")).getByText("Selected")).toBeTruthy();
    expect(card("modern").getAttribute("aria-pressed")).toBe("true");
    expect(within(card(FREE)).queryByText("ATS Friendly")).toBeNull(); // not an ATS template: no chip
    // the user's own document is drawn through each template (the name from the fixture)
    expect(card("modern").querySelector(".rz-root")?.textContent).toContain("Casey");
    expect(card(FREE).querySelector(".rz-root")).toBeTruthy();
  });

  it("an ATS template that is not selected carries the ATS Friendly chip; a switch that hides things says so first", () => {
    setup({ templateId: FREE });
    expect(within(card("modern")).getByText("ATS Friendly")).toBeTruthy();
    const hides = within(card("modern")).getByText(/^Hides:/).textContent ?? "";
    expect(hides).toContain("photo");
    expect(hides).toMatch(/italic|underline|links/);
    // the selected card never offers a "Hides" line (the bar under the tabs says it)
    expect(within(card(FREE)).queryByText(/^Hides:/)).toBeNull();
  });

  it("clicking another card asks for the switch; the selected one and a disabled panel do nothing", () => {
    const c = setup({ templateId: FREE });
    fireEvent.click(card("modern"));
    expect(c.switchTemplate).toHaveBeenCalledWith("modern");
    fireEvent.click(card(FREE));
    expect(c.switchTemplate).toHaveBeenCalledTimes(1);
    cleanup();

    const d = setup({ templateId: FREE, disabled: true });
    fireEvent.click(card("modern"));
    expect(d.switchTemplate).not.toHaveBeenCalled();
  });

  it("works for any number of templates: the enabled list in order, unknown ids skipped, the active one always present", () => {
    expect(offeredTemplateIds(["modern", "nope", FREE, "modern"], "modern")).toEqual(["modern", FREE]);
    expect(offeredTemplateIds([FREE], "modern")).toEqual(["modern", FREE]);
    expect(offeredTemplateIds([], "modern")).toEqual(["modern"]);
    expect(offeredTemplateIds(["modern"], "ghost")).toEqual(["modern"]); // an unknown active id resolves to the default template
    setup({ config: cfg({ enabled: [FREE] }) });
    expect(card("modern")).toBeTruthy(); // the active template stays selectable-looking even if the admin disabled it
    expect(card(FREE)).toBeTruthy();
  });
});

describe("PickTemplatePanel: Customize Template under an ATS template (modern = ATS_STRICT)", () => {
  it("accent swatches are disabled with the hint; clicking one changes nothing", () => {
    const c = setup();
    const swatches = screen.getAllByRole("radio").filter((r) => ["Green", "Blue", "Purple", "Pink", "Orange", "Yellow"].includes(r.getAttribute("aria-label") ?? ""));
    expect(swatches).toHaveLength(6);
    expect(swatches.every((s) => s.getAttribute("aria-disabled") === "true")).toBe(true);
    expect(screen.getByText(/colours are not used by this template/i)).toBeTruthy();
    fireEvent.click(swatches[0]);
    expect(c.changeTheme).not.toHaveBeenCalled();
  });

  it("Font Family offers only the allowed pairs", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Font Family" }));
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Inter (Recommended)", "Source Serif 4", "Georgia / Arial", "IBM Plex Sans", "EB Garamond"]);
  });

  it("a stored font outside the list shows the first allowed one, marked as changed (an admin override narrowed the menu)", () => {
    setup({ theme: { fontPair: "plex" }, config: cfg({ overrides: { modern: { theme: { fontPairs: ["inter", "georgia-arial"] } } } }) });
    fireEvent.click(screen.getByRole("button", { name: "Font Family" }));
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toContain("Inter (Recommended) (changed for ATS)");
  });

  it("a stored bundled font stays as it is under the stock ATS profile (no 'changed' mark)", () => {
    setup({ theme: { fontPair: "garamond" } });
    fireEvent.click(screen.getByRole("button", { name: "Font Family" }));
    const labels = screen.getAllByRole("option").map((o) => o.textContent ?? "");
    expect(labels).toContain("EB Garamond");
    expect(labels.some((l) => l.includes("changed for"))).toBe(false);
  });

  it("Spacing and Page Length work; a font choice is reported", () => {
    const c = setup();
    fireEvent.click(screen.getByRole("radio", { name: "Spacious" }));
    expect(c.changeTheme).toHaveBeenLastCalledWith({ control: "spacing", value: "spacious" });
    fireEvent.click(screen.getByRole("radio", { name: "Two Pages" }));
    expect(c.changeTheme).toHaveBeenLastCalledWith({ control: "pages", value: 2 });
    fireEvent.click(screen.getByRole("button", { name: "Font Family" }));
    fireEvent.click(screen.getByRole("option", { name: "Georgia / Arial" }));
    expect(c.changeTheme).toHaveBeenLastCalledWith({ control: "font", value: "georgia-arial" });
  });

  it("the selected Spacing / Page Length reflect the stored theme", () => {
    setup({ theme: { spacing: "compact", fit: { mode: "auto", target: 2, step: 0 } } });
    expect(screen.getByRole("radio", { name: "Compact" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: "Two Pages" }).getAttribute("aria-checked")).toBe("true");
  });

  it("Two Pages is offered only when the template allows two (an admin override can tighten it to one)", () => {
    setup({ config: cfg({ overrides: { modern: { maxPages: 1 } } }), theme: { fit: { mode: "auto", target: 2, step: 0 } } });
    expect(screen.queryByRole("radio", { name: "Two Pages" })).toBeNull();
    expect(screen.getByRole("radio", { name: "One Page" }).getAttribute("aria-checked")).toBe("true");
  });

  it("an override that fixes the spacing and page length disables those controls with the hints", () => {
    setup({ config: cfg({ overrides: { modern: { theme: { spacing: false, pageLength: false } } } }) });
    expect(screen.getByRole("radio", { name: "Normal" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getAllByText("(fixed by this template)")).toHaveLength(2);
    expect(screen.getByRole("radio", { name: "One Page" }).hasAttribute("disabled")).toBe(true);
  });

  it("no Date style control while the template renders one style", () => {
    setup();
    expect(screen.queryByText("Date style")).toBeNull();
  });

  it("everything is disabled while the editor cannot save", () => {
    const c = setup({ disabled: true });
    expect(screen.getByRole("radio", { name: "Spacious" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: "Spacious" }));
    expect(c.changeTheme).not.toHaveBeenCalled();
  });
});

describe("PickTemplatePanel: Customize Template under a design template (DESIGN_FREE)", () => {
  it("accent swatches come from the config palette and are enabled; the stored accent is checked", () => {
    const c = setup({ templateId: FREE, config: cfg({}, ["#111111", "#16a34a"]), theme: { accent: "#16a34a" } });
    const green = screen.getByRole("radio", { name: "Green" });
    const other = screen.getByRole("radio", { name: "#111111" });
    expect(screen.getAllByRole("radio").filter((r) => r.getAttribute("aria-label") === "Green" || r.getAttribute("aria-label") === "#111111")).toHaveLength(2);
    expect(green.getAttribute("aria-checked")).toBe("true");
    expect(other.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(other);
    expect(c.changeTheme).toHaveBeenCalledWith({ control: "accent", value: "#111111" });
    expect(screen.queryByText(/colours are not used/i)).toBeNull();
  });

  it("every font pair is offered, and the Date style control appears (both styles allowed)", () => {
    const c = setup({ templateId: FREE });
    fireEvent.click(screen.getByRole("button", { name: "Font Family" }));
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Inter (Recommended)", "Source Serif 4", "Georgia / Arial", "IBM Plex Sans", "EB Garamond"]);
    fireEvent.click(screen.getByRole("option", { name: "Source Serif 4" }));
    expect(c.changeTheme).toHaveBeenLastCalledWith({ control: "font", value: "source-serif" });

    fireEvent.click(screen.getByRole("radio", { name: "Year" }));
    expect(c.changeTheme).toHaveBeenLastCalledWith({ control: "dateStyle", value: "year" });
    expect(screen.getByRole("radio", { name: "Month Year" })).toBeTruthy();
  });
});
