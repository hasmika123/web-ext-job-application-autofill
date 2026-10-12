import { describe, expect, it } from "vitest";
import { ATS_STRICT, DESIGN_FREE, listTemplates, sanitizeTheme } from "@kiwiply/ui";
import type { TemplateMeta } from "@kiwiply/ui";
import { canvasThemeStyle, colorName, editTheme, storedTheme, themeAfterSwitch } from "./themeEdit";

describe("editTheme", () => {
  it("accent: sets it and marks it touched; unrelated keys survive", () => {
    const t = editTheme({ fontPair: "georgia-arial" }, { control: "accent", value: "#16a34a" });
    expect(t).toMatchObject({ accent: "#16a34a", fontPair: "georgia-arial", _touched: ["accent"] });
  });

  it("font and date style set their key; touched keys accumulate without duplicates", () => {
    let t = editTheme(null, { control: "font", value: "source-serif" });
    t = editTheme(t, { control: "dateStyle", value: "year" });
    t = editTheme(t, { control: "font", value: "inter" });
    expect(t).toMatchObject({ fontPair: "inter", dateStyle: "year" });
    expect(t._touched).toEqual(["fontPair", "dateStyle"]);
  });

  it("spacing resets the fit ladder to the preset (step 0) and keeps the page target", () => {
    const t = editTheme({ fit: { mode: "auto", target: 2, step: 4 } }, { control: "spacing", value: "compact" });
    expect(t.spacing).toBe("compact");
    expect(t.fit).toEqual({ mode: "auto", target: 2, step: 0 });
  });

  it("page length sets fit.target and keeps the step", () => {
    const t = editTheme({ fit: { mode: "auto", target: 1, step: 2 } }, { control: "pages", value: 2 });
    expect(t.fit).toEqual({ mode: "auto", target: 2, step: 2 });
    expect(t._touched).toContain("fit");
  });

  it("never sends the derived size / density / margin", () => {
    const t = editTheme({ size: 10.5, density: 0.88, margin: 0.6, accent: "#2563eb" }, { control: "spacing", value: "spacious" });
    expect(t).not.toHaveProperty("size");
    expect(t).not.toHaveProperty("density");
    expect(t).not.toHaveProperty("margin");
    expect(storedTheme({ size: 1, density: 1, margin: 1, accent: "#fff" })).toEqual({ accent: "#fff" });
  });

  it("the result reads back through the TypeScript sanitizer with the chosen preset", () => {
    const t = sanitizeTheme(editTheme(null, { control: "spacing", value: "spacious" }));
    expect(t.spacing).toBe("spacious");
    expect(t.density).toBeGreaterThan(1); // the preset, derived on read
  });
});

describe("themeAfterSwitch", () => {
  const meta = (defaults?: TemplateMeta["defaults"]): TemplateMeta => ({ ...listTemplates()[0], defaults });

  it("applies the new template's defaults to keys the user has not touched, and only those", () => {
    const next = themeAfterSwitch({ accent: "#16a34a", _touched: ["accent"], fontPair: "inter" }, meta({ accent: "#000000", fontPair: "source-serif" }));
    expect(next).toMatchObject({ accent: "#16a34a", fontPair: "source-serif" });
  });

  it("is null when there are no defaults or they change nothing (so no PATCH is sent)", () => {
    expect(themeAfterSwitch({ accent: "#2563eb" }, meta())).toBeNull();
    expect(themeAfterSwitch({ accent: "#2563eb" }, meta({ accent: "#2563eb" }))).toBeNull();
    expect(themeAfterSwitch({ accent: "#2563eb", _touched: ["accent"] }, meta({ accent: "#000000" }))).toBeNull();
  });

  it("Modern declares no theme defaults today", () => {
    expect(listTemplates().find((t) => t.id === "modern")?.defaults).toBeUndefined();
  });
});

describe("canvasThemeStyle", () => {
  it("follows the accent and font a design template allows", () => {
    const s = canvasThemeStyle({ accent: "#16a34a", fontPair: "source-serif" }, DESIGN_FREE) as Record<string, string>;
    expect(s["--rb-doc-accent"]).toBe("#16a34a");
    expect(s["--rb-doc-font-body"]).toContain("Source Serif");
  });

  it("scales the canvas rhythm with Spacing, unless the template fixes it", () => {
    const get = (spacing: "compact" | "spacious", caps = DESIGN_FREE) => Number((canvasThemeStyle({ spacing }, caps) as Record<string, string>)["--rb-doc-density"]);
    expect(get("compact")).toBeLessThan(1);
    expect(get("spacious")).toBeGreaterThan(1);
    expect(get("spacious", { ...DESIGN_FREE, theme: { ...DESIGN_FREE.theme, spacing: false } })).toBe(1);
  });

  it("uses the ink colour and the first allowed font under an ATS template", () => {
    const s = canvasThemeStyle({ accent: "#16a34a", fontPair: "source-serif" }, ATS_STRICT) as Record<string, string>;
    expect(s["--rb-doc-accent"]).toBe("#111827");
    expect(s["--rb-doc-font-body"]).toContain("Inter");
  });
});

describe("colorName", () => {
  it("names the default palette and falls back to the hex", () => {
    expect(colorName("#16A34A")).toBe("Green");
    expect(colorName("#123456")).toBe("#123456");
  });
});
