import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PatchResult } from "@/lib/resume-doc";
import { THEME_DELAY_MS, createPresentationSync, type PresentationOptions } from "./presentation";

const ok = (version: number): PatchResult => ({ kind: "ok", version });
const okWith = (version: number, theme: Record<string, unknown>): PatchResult => ({ kind: "ok", version, theme });
const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms);

function setup(extra: Partial<PresentationOptions> = {}) {
  const patchTemplate = vi.fn<PresentationOptions["patchTemplate"]>(async () => ok(10));
  const patchTheme = vi.fn(async (): Promise<PatchResult> => ok(11));
  const events = { onVersion: vi.fn(), onTemplateFailed: vi.fn(), onThemeFailed: vi.fn(), onThemeAdopted: vi.fn() };
  const p = createPresentationSync({
    patchTemplate,
    patchTheme,
    hold: async () => {},
    release: () => {},
    templateId: "modern",
    theme: { accent: "#2563eb" },
    ...events,
    ...extra,
  });
  return { p, patchTemplate, patchTheme, events };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("presentation sync: template switch theme (R3.4)", () => {
  it("a normal switch sends only the template and adopts the theme the server stored (its defaults on untouched keys)", async () => {
    const serverTheme = { accent: "#2563eb", fontPair: "source-serif" as const };
    const { p, patchTheme, events } = setup({ patchTemplate: vi.fn(async (): Promise<PatchResult> => okWith(10, serverTheme)) });
    p.setTemplate("classic");
    await tick(0);
    expect(patchTheme).not.toHaveBeenCalled(); // no second PATCH for the defaults: the server applied them
    expect(events.onThemeAdopted).toHaveBeenCalledWith(serverTheme);
  });

  it("asks for the template without a theme, so the server applies the defaults", async () => {
    const { p, patchTemplate } = setup();
    p.setTemplate("classic");
    await tick(0);
    expect(patchTemplate).toHaveBeenCalledWith("classic", undefined);
  });

  it("does not adopt a late answer over a newer choice: a theme edit pending, or another switch queued behind it", async () => {
    const patchTemplate = vi.fn(async (): Promise<PatchResult> => okWith(10, { accent: "#000000" }));
    const { p, events } = setup({ patchTemplate });
    p.setTemplate("classic");
    p.setTheme({ accent: "#16a34a" }); // the user clicked a swatch right after the switch
    await tick(0);
    expect(events.onThemeAdopted).not.toHaveBeenCalled();
    await tick(THEME_DELAY_MS);

    events.onThemeAdopted.mockClear();
    p.setTemplate("compact");
    p.setTemplate("classic");
    await tick(0);
    await tick(0);
    expect(events.onThemeAdopted).toHaveBeenCalledTimes(1); // only the last answer, when nothing is waiting behind it
  });

  it("an undo / redo sends the exact theme with the template and drops an older pending theme edit", async () => {
    const { p, patchTemplate, patchTheme } = setup();
    p.setTheme({ accent: "#eab308" });
    p.setTemplate("modern", { accent: "#2563eb", _touched: ["accent"] });
    await tick(THEME_DELAY_MS * 2);
    expect(patchTemplate).toHaveBeenCalledWith("modern", { accent: "#2563eb", _touched: ["accent"] });
    expect(patchTheme).not.toHaveBeenCalled();
  });

  it("after an exact restore a failing theme rolls back to the last confirmed one", async () => {
    const { p, events } = setup({ patchTheme: vi.fn(async (): Promise<PatchResult> => ({ kind: "error", message: "offline" })) });
    p.setTemplate("modern", { accent: "#ec4899" });
    await tick(0);
    p.setTheme({ accent: "#f97316" });
    await tick(THEME_DELAY_MS);
    expect(events.onThemeFailed).toHaveBeenCalledWith({ accent: "#ec4899" }, "offline");
  });
});
