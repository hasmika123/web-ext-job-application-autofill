import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@kiwiply/ui";
import type { TemplateDefinition } from "@kiwiply/ui";
// Test-only templates are registered through the same module the `@kiwiply/ui` barrel re-exports.
import { registerTemplateForTests } from "../../../../../packages/ui/src/resume/registry";
import { designFree } from "../../../../../packages/ui/src/resume/templates/__test__/designFree";
import type { PatchResult, ResumeDocDTO } from "@/lib/resume-doc";
import { testDoc } from "./state/test-doc";

const putDoc = vi.fn();
const patchTemplate = vi.fn<(id: number, templateId: string, theme?: Record<string, unknown>) => Promise<PatchResult>>();
const patchTheme = vi.fn();
vi.mock("@/lib/resume-doc", async (orig) => ({
  ...(await orig<typeof import("@/lib/resume-doc")>()),
  putDoc: (...a: unknown[]) => putDoc(...a),
  patchTemplate: (id: number, t: string, th?: Record<string, unknown>) => patchTemplate(id, t, th),
  patchTheme: (...a: unknown[]) => patchTheme(...a),
  requestPdfNow: vi.fn(async () => true),
  getPdfStatus: vi.fn(async () => null),
}));
vi.mock("@/lib/api", () => ({ serverApiFetch: vi.fn() }));
vi.mock("next/link", () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/marketing/BrandLogo", () => ({ default: () => <span>Kiwiply logo</span> }));

import { DEFAULT_BUILDER_CONFIG, type ResumeBuilderConfig } from "@/lib/resume-builder-config";
import ResumeEditor from "./ResumeEditor";

/** A design template that declares its own theme defaults (no shipped template does yet). */
const DEFAULTED: TemplateDefinition = {
  ...designFree,
  meta: { ...designFree.meta, id: "rb-defaulted", name: "Defaulted", defaults: { fontPair: "source-serif", accent: "#7c3aed" } },
};

const config: ResumeBuilderConfig = {
  ...DEFAULT_BUILDER_CONFIG,
  templates: { ...DEFAULT_BUILDER_CONFIG.templates, enabled: ["modern", DEFAULTED.meta.id] },
};

const dto = (theme: ResumeDocDTO["theme"] = null): ResumeDocDTO => ({
  resumeId: 42,
  label: "Backend SWE",
  kind: "BUILT",
  doc: testDoc(),
  schemaVersion: 2,
  templateId: "modern",
  theme,
  docVersion: 3,
  contentHash: null,
  profileSyncedAt: null,
  exportedAt: null,
  exportedHash: null,
  updatedAt: null,
});

let unregister: () => void;
beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(window, "innerWidth", { value: 1440, configurable: true, writable: true });
  window.localStorage.clear();
  putDoc.mockReset();
  patchTemplate.mockReset();
  patchTheme.mockReset();
  unregister = registerTemplateForTests(DEFAULTED);
});
afterEach(() => {
  cleanup();
  unregister();
  vi.useRealTimers();
});

const flush = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const open = (theme: ResumeDocDTO["theme"] = null) => {
  render(
    <ToastProvider>
      <ResumeEditor initial={dto(theme)} plan="FREE" config={config} />
    </ToastProvider>,
  );
  fireEvent.click(within(screen.getByRole("group", { name: "Editor panels" })).getByRole("button", { name: "Pick Template" }));
};
const sheet = () => document.getElementById("rb-left-sheet")!;
const card = (id: string) => sheet().querySelector<HTMLButtonElement>(`[data-template="${id}"]`)!;
const canvas = () => document.querySelector<HTMLElement>("[data-canvas]")!;
const bodyFont = () => canvas().style.getPropertyValue("--rb-doc-font-body");
const undoKey = (shift = false) => fireEvent.keyDown(document, { key: "z", ctrlKey: true, shiftKey: shift });

describe("template switch safety net (R3.4)", () => {
  it("the switch applies the new template's defaults to untouched keys at once, PATCHes only the template, and says what changed", async () => {
    patchTemplate.mockResolvedValue({ kind: "ok", version: 4 });
    open();
    const before = bodyFont();
    fireEvent.click(card(DEFAULTED.meta.id));

    expect(bodyFont()).not.toBe(before); // source-serif, optimistic
    expect(card(DEFAULTED.meta.id).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Switched to Defaulted")).toBeTruthy();
    expect(screen.getByText(/Accent colour and font are now Defaulted's default/)).toBeTruthy();
    await flush(0);
    expect(patchTemplate).toHaveBeenCalledTimes(1);
    expect(patchTemplate).toHaveBeenCalledWith(42, DEFAULTED.meta.id, undefined); // the server applies the same defaults
    expect(patchTheme).not.toHaveBeenCalled();
  });

  it("keeps a key the user touched: only the untouched ones change", async () => {
    patchTemplate.mockResolvedValue({ kind: "ok", version: 4 });
    open({ accent: "#16a34a", fontPair: "inter", _touched: ["accent"] });
    fireEvent.click(card(DEFAULTED.meta.id));
    expect(screen.getByText(/^Font is now Defaulted's default/)).toBeTruthy(); // not the accent
    expect(canvas().style.getPropertyValue("--rb-doc-accent")).toBe("#16a34a");
  });

  it("Ctrl+Z restores template AND theme in one request that carries the exact theme; Shift+Ctrl+Z puts the switch back", async () => {
    patchTemplate.mockResolvedValue({ kind: "ok", version: 4 });
    open({ accent: "#16a34a", fontPair: "inter", _touched: ["accent"] });
    const before = bodyFont();
    fireEvent.click(card(DEFAULTED.meta.id));
    await flush(0);
    const switched = bodyFont();

    undoKey();
    expect(bodyFont()).toBe(before);
    expect(card("modern").getAttribute("aria-pressed")).toBe("true");
    await flush(0);
    expect(patchTemplate).toHaveBeenCalledTimes(2);
    expect(patchTemplate.mock.calls[1][1]).toBe("modern");
    expect(patchTemplate.mock.calls[1][2]).toMatchObject({ accent: "#16a34a", fontPair: "inter", _touched: ["accent"] });

    undoKey(true);
    expect(bodyFont()).toBe(switched);
    await flush(0);
    expect(patchTemplate).toHaveBeenCalledTimes(3);
    expect(patchTemplate.mock.calls[2][1]).toBe(DEFAULTED.meta.id);
    expect(patchTemplate.mock.calls[2][2]).toMatchObject({ fontPair: "source-serif" });
  });

  it("the toast's Undo takes the switch back the same way", async () => {
    patchTemplate.mockResolvedValue({ kind: "ok", version: 4 });
    open();
    const before = bodyFont();
    fireEvent.click(card(DEFAULTED.meta.id));
    await flush(0);
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(bodyFont()).toBe(before);
    await flush(0);
    expect(patchTemplate).toHaveBeenLastCalledWith(42, "modern", expect.any(Object));
  });

  it("adopts the theme the server stored when it differs from the editor's guess", async () => {
    patchTemplate.mockResolvedValue({ kind: "ok", version: 4, theme: { fontPair: "georgia-arial" } });
    open();
    fireEvent.click(card(DEFAULTED.meta.id));
    await flush(0);
    expect(bodyFont()).toContain("Arial");
  });

  it("a refused switch goes back and leaves nothing to undo", async () => {
    patchTemplate.mockResolvedValue({ kind: "invalid", message: "template is not enabled" });
    open();
    const before = bodyFont();
    fireEvent.click(card(DEFAULTED.meta.id));
    await flush(0);
    expect(card("modern").getAttribute("aria-pressed")).toBe("true");
    expect(bodyFont()).toBe(before);
    undoKey();
    expect(patchTemplate).toHaveBeenCalledTimes(1); // nothing more to undo, so no second request
  });

  it("the card's Hides line and the switch toast list the same content (one computation)", async () => {
    patchTemplate.mockResolvedValue({ kind: "ok", version: 4 });
    open();
    fireEvent.click(card(DEFAULTED.meta.id)); // to the design template
    await flush(0);
    const hidesOnCard = within(card("modern")).getByText(/^Hides:/).textContent!.replace(/^Hides:\s*/, "");
    fireEvent.click(card("modern"));
    expect(screen.getByText(`Hidden in this ATS template: ${hidesOnCard}.`)).toBeTruthy();
  });
});
