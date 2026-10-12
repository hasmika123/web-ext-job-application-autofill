import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PatchResult } from "@/lib/resume-doc";
import { THEME_DELAY_MS, createPresentationSync, type PresentationOptions } from "./presentation";

const ok = (version: number): PatchResult => ({ kind: "ok", version });
const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms);

function setup(extra: Partial<PresentationOptions> = {}) {
  const calls: string[] = [];
  const patchTemplate = vi.fn(async (id: string): Promise<PatchResult> => {
    calls.push(`template:${id}`);
    return ok(10);
  });
  const patchTheme = vi.fn(async (): Promise<PatchResult> => {
    calls.push("theme");
    return ok(11);
  });
  const hold = vi.fn(async () => {
    calls.push("hold");
  });
  const release = vi.fn((v?: number) => {
    calls.push(`release:${v}`);
  });
  const events = { onVersion: vi.fn(), onTemplateFailed: vi.fn(), onThemeFailed: vi.fn() };
  const p = createPresentationSync({ patchTemplate, patchTheme, hold, release, templateId: "modern", theme: { accent: "#2563eb" }, ...events, ...extra });
  return { p, calls, patchTemplate, patchTheme, hold, release, events };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("presentation sync: theme", () => {
  it("sends the LAST theme once, 500 ms after the last change, with the autosave held around it", async () => {
    const { p, calls, patchTheme, events } = setup();
    p.setTheme({ accent: "#16a34a" });
    await tick(THEME_DELAY_MS - 1);
    p.setTheme({ accent: "#7c3aed" });
    await tick(THEME_DELAY_MS - 1);
    expect(patchTheme).not.toHaveBeenCalled();
    expect(p.busy).toBe(true);

    await tick(1);
    expect(patchTheme).toHaveBeenCalledTimes(1);
    expect(patchTheme).toHaveBeenCalledWith({ accent: "#7c3aed" });
    expect(calls).toEqual(["hold", "theme", "release:11"]);
    expect(events.onVersion).toHaveBeenCalledWith(11);
    expect(p.busy).toBe(false);
  });

  it("a refused theme rolls back to the last confirmed one and releases without a version", async () => {
    const { p, calls, events } = setup({ patchTheme: vi.fn(async (): Promise<PatchResult> => ({ kind: "invalid", message: "bad accent" })) });
    p.setTheme({ accent: "nope" });
    await tick(THEME_DELAY_MS);
    expect(events.onThemeFailed).toHaveBeenCalledWith({ accent: "#2563eb" }, "bad accent");
    expect(events.onVersion).not.toHaveBeenCalled();
    expect(calls).toEqual(["hold", "release:undefined"]);
  });

  it("after a success the next failure rolls back to THAT theme", async () => {
    const results: PatchResult[] = [ok(11), { kind: "error", message: "offline" }];
    const { p, events } = setup({ patchTheme: vi.fn(async () => results.shift() as PatchResult) });
    p.setTheme({ accent: "#16a34a" });
    await tick(THEME_DELAY_MS);
    p.setTheme({ accent: "#ec4899" });
    await tick(THEME_DELAY_MS);
    expect(events.onThemeFailed).toHaveBeenCalledWith({ accent: "#16a34a" }, "offline");
  });

  it("flush sends a pending theme now and resolves when the queue is empty", async () => {
    const { p, patchTheme } = setup();
    p.setTheme({ accent: "#f97316" });
    await p.flush();
    expect(patchTheme).toHaveBeenCalledWith({ accent: "#f97316" });
    expect(p.busy).toBe(false);
  });
});

describe("presentation sync: template", () => {
  it("saves at once (no debounce), serialised before a theme that follows it", async () => {
    const { p, calls } = setup();
    p.setTemplate("classic");
    p.setTheme({ accent: "#eab308" });
    await tick(THEME_DELAY_MS + 5);
    expect(calls).toEqual(["hold", "template:classic", "release:10", "hold", "theme", "release:11"]);
  });

  it("a refused switch reports the template to put back (the last confirmed one)", async () => {
    const results: PatchResult[] = [ok(10), { kind: "invalid", message: "template 'x' is not enabled" }];
    const { p, events } = setup({ patchTemplate: vi.fn(async () => results.shift() as PatchResult) });
    p.setTemplate("classic");
    p.setTemplate("x");
    await tick(0);
    await tick(0);
    expect(events.onTemplateFailed).toHaveBeenCalledWith("classic", "template 'x' is not enabled");
  });

  it("dispose drops what is waiting and never holds the autosave again", async () => {
    const { p, hold, patchTheme } = setup();
    p.setTheme({ accent: "#eab308" });
    p.dispose();
    await tick(THEME_DELAY_MS * 2);
    expect(patchTheme).not.toHaveBeenCalled();
    p.setTemplate("classic");
    await tick(0);
    expect(hold).not.toHaveBeenCalled();
  });
});
