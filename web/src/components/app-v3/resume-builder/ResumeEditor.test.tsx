import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@kiwiply/ui";
import type { CheckpointResult, ExportPdfResult, ExportTextResult, PatchResult, PdfInfo, PdfWaitResult, ResumeDocDTO, SaveResult } from "@/lib/resume-doc";
import { testDoc } from "./state/test-doc";

const putDoc = vi.fn<(id: number, version: number, body: { doc: ReturnType<typeof testDoc> }) => Promise<SaveResult>>();
const patchTemplate = vi.fn<(id: number, templateId: string, theme?: Record<string, unknown>) => Promise<PatchResult>>();
const patchTheme = vi.fn<(id: number, theme: Record<string, unknown>) => Promise<PatchResult>>();
const exportPdf = vi.fn<(id: number) => Promise<ExportPdfResult>>();
const exportText = vi.fn<(id: number) => Promise<ExportTextResult>>();
const saveBlob = vi.fn();
const push = vi.fn();
const requestPdfNow = vi.fn<(id: number, opts?: { keepalive?: boolean }) => Promise<boolean>>();
const getPdfStatus = vi.fn<(id: number) => Promise<PdfInfo | null>>();
const checkpointDoc = vi.fn<(id: number, name?: string) => Promise<CheckpointResult>>();
const waitForStoredPdf = vi.fn<(id: number, opts: { waitMs: number; pollMs?: number | null }) => Promise<PdfWaitResult>>();
vi.mock("@/lib/resume-doc", async (orig) => ({
  ...(await orig<typeof import("@/lib/resume-doc")>()),
  putDoc: (...a: Parameters<typeof putDoc>) => putDoc(...a),
  patchTemplate: (id: number, t: string, th?: Record<string, unknown>) => patchTemplate(id, t, th),
  patchTheme: (id: number, t: Record<string, unknown>) => patchTheme(id, t),
  exportPdf: (id: number) => exportPdf(id),
  exportText: (id: number) => exportText(id),
  saveBlob: (...a: unknown[]) => saveBlob(...a),
  requestPdfNow: (id: number, opts?: { keepalive?: boolean }) => requestPdfNow(id, opts),
  getPdfStatus: (id: number) => getPdfStatus(id),
  checkpointDoc: (id: number, name?: string) => checkpointDoc(id, name),
  waitForStoredPdf: (id: number, opts: { waitMs: number; pollMs?: number | null }) => waitForStoredPdf(id, opts),
}));
const track = vi.fn<(event: string, params?: Record<string, unknown>) => void>();
vi.mock("@/lib/analytics", () => ({ track: (...a: Parameters<typeof track>) => track(...a) }));
const restoreVersion = vi.fn<(id: number, n: number) => Promise<unknown>>();
vi.mock("@/lib/resume-meta", async (orig) => {
  const { testLineage, testMeta, testVersions } = await import("./test-meta");
  return {
    ...(await orig<typeof import("@/lib/resume-meta")>()),
    getMeta: async () => ({ kind: "ok", value: testMeta({ name: "Backend SWE" }) }),
    getLineage: async () => ({ kind: "ok", value: testLineage() }),
    listVersions: async () => ({ kind: "ok", value: testVersions() }),
    restoreVersion: (id: number, n: number) => restoreVersion(id, n),
  };
});
vi.mock("@/lib/api", () => ({ serverApiFetch: vi.fn() })); // resume-builder-config imports it (server only)
vi.mock("next/link", () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/components/marketing/BrandLogo", () => ({ default: () => <span>Kiwiply logo</span> }));

import { DEFAULT_BUILDER_CONFIG, type ResumeBuilderConfig } from "@/lib/resume-builder-config";
import ResumeEditor from "./ResumeEditor";

const setWidth = (w: number) => {
  Object.defineProperty(window, "innerWidth", { value: w, configurable: true, writable: true });
};

const renderEditor = (config: ResumeBuilderConfig = DEFAULT_BUILDER_CONFIG, updatedAt: string | null = null, pdf?: PdfInfo) =>
  render(
    <ToastProvider>
      <ResumeEditor initial={{ ...dto(), updatedAt, pdf }} plan="FREE" config={config} />
    </ToastProvider>,
  );

/** The editor opened with the stored PDF in the given state (R3.7). */
const renderWithPdf = (pdf: PdfInfo) => renderEditor(DEFAULT_BUILDER_CONFIG, null, pdf);

const dto = (): ResumeDocDTO => ({
  resumeId: 42,
  label: "Backend SWE",
  kind: "BUILT",
  doc: testDoc(),
  schemaVersion: 2,
  templateId: "modern",
  theme: null,
  docVersion: 3,
  contentHash: null,
  profileSyncedAt: null,
  exportedAt: null,
  exportedHash: null,
  updatedAt: null,
});

const firstBullet = (doc: ReturnType<typeof testDoc>) => {
  const exp = doc.sections.find((s) => s.kind === "EXPERIENCE");
  return exp && exp.kind === "EXPERIENCE" ? exp.items[0].bullets?.[0].text : undefined;
};
const status = () => document.querySelector("[data-save-status]")!.getAttribute("data-save-status");
const statusText = () => document.querySelector("[data-save-status]")!.textContent;
const bullet = () => screen.getAllByLabelText("Bullet 1")[0] as HTMLTextAreaElement;
const flush = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const panelButton = (name: string) =>
  within(screen.getByRole("group", { name: "Editor panels" })).getByRole("button", { name }) as HTMLButtonElement;
const leftSheet = () => document.getElementById("rb-left-sheet")!;
const grid = () => document.querySelector("[data-rail]")!;
const pressed = () =>
  ["Add Section", "Pick Template", "Swap Section", "Tailor to Job"].filter((n) => panelButton(n).getAttribute("aria-pressed") === "true");

beforeEach(() => {
  vi.useFakeTimers();
  setWidth(1440);
  window.localStorage.clear();
  putDoc.mockReset();
  patchTemplate.mockReset();
  patchTheme.mockReset();
  exportPdf.mockReset();
  exportText.mockReset();
  saveBlob.mockReset();
  push.mockReset();
  requestPdfNow.mockReset().mockResolvedValue(true);
  getPdfStatus.mockReset().mockResolvedValue(null);
  track.mockReset();
  checkpointDoc.mockReset().mockResolvedValue({ kind: "ok", versionNo: 2, reason: "MANUAL", pdf: { status: "PENDING", pollMs: 5000, pollWindowMs: 20000 } });
  waitForStoredPdf.mockReset().mockResolvedValue("ready");
  URL.createObjectURL = vi.fn(() => "blob:test-pdf");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  setWidth(1024);
});

describe("ResumeEditor", () => {
  it("opens with every section as a block, starts as saved, and has no preview pane", () => {
    renderEditor();
    expect(status()).toBe("saved");
    expect(bullet().value).toBe("Led migration");
    expect(document.querySelectorAll(".rb-block").length).toBe(1 + testDoc().sections.length); // header + sections
    expect(document.querySelector(".rz-page")).toBeNull(); // the board has no preview pane (Print layout arrives in R3.8)
  });

  it("arriving with ?view=pdf (the list's View button) opens the real PDF view on the right (R2.6 x R3.3)", async () => {
    exportPdf.mockResolvedValue({ kind: "ok", blob: new Blob(["%PDF"]), fileName: "r.pdf", pages: 1, fits: true, stored: true, contentHash: null, cached: true });
    render(
      <ToastProvider>
        <ResumeEditor initial={dto()} plan="FREE" config={DEFAULT_BUILDER_CONFIG} entry={{ view: "pdf" }} />
      </ToastProvider>,
    );
    await flush(300);
    expect(screen.getByRole("tablist", { name: "PDF view" })).toBeTruthy();
    expect(screen.getByTitle("PDF preview")).toBeTruthy();
  });

  it("opens with no panel; the remembered panel and rail tab are restored", () => {
    renderEditor();
    expect(pressed()).toEqual([]);
    cleanup();
    window.localStorage.setItem("rb.ui.v1", JSON.stringify({ leftPanel: "swap", railTab: "match" }));
    renderEditor();
    expect(pressed()).toEqual(["Swap Section"]);
    expect(screen.getByRole("tab", { name: /Job Match/ }).getAttribute("aria-selected")).toBe("true");
  });

  it("types, then autosaves 800 ms later with the loaded version and shows Saved just now", async () => {
    putDoc.mockResolvedValue({ kind: "ok", version: 4, contentHash: null });
    renderEditor();

    fireEvent.change(bullet(), { target: { value: "Led the migration" } });
    expect(status()).toBe("saving");
    await flush(799);
    expect(putDoc).not.toHaveBeenCalled();
    await flush(1);
    expect(putDoc).toHaveBeenCalledTimes(1);
    expect(putDoc.mock.calls[0][0]).toBe(42);
    expect(putDoc.mock.calls[0][1]).toBe(3);
    expect(firstBullet(putDoc.mock.calls[0][2].doc)).toBe("Led the migration");

    expect(status()).toBe("saved");
    expect(statusText()).toContain("Saved just now");
  });

  it("opens as 'Saved N hours ago' from the server's last-saved time", () => {
    renderEditor(DEFAULT_BUILDER_CONFIG, new Date(Date.now() - 3 * 3_600_000).toISOString());
    expect(statusText()).toContain("Saved 3 hours ago");
  });

  describe("stored PDF status (R3.7)", () => {
    it("shows '· PDF updating…' after a save, then clears it when the server says READY", async () => {
      putDoc.mockResolvedValue({ kind: "ok", version: 4, contentHash: null });
      getPdfStatus.mockResolvedValue({ status: "READY", pollMs: 5000, pollWindowMs: 180000 });
      renderWithPdf({ status: "READY", pollMs: 5000, pollWindowMs: 180000 });
      expect(screen.queryByText("PDF updating…")).toBeNull();

      fireEvent.change(bullet(), { target: { value: "A new bullet" } });
      await flush(800);
      expect(screen.getByText("PDF updating…")).toBeTruthy();

      await flush(5000);
      expect(getPdfStatus).toHaveBeenCalledWith(42);
      expect(screen.queryByText("PDF updating…")).toBeNull();
    });

    it("a failed PDF shows 'couldn't be made · Retry', and Retry asks for the PDF now", async () => {
      renderWithPdf({ status: "FAILED", error: "boom", pollMs: 5000, pollWindowMs: 180000 });
      expect(screen.getByText("PDF couldn't be made")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
      await flush(0);
      expect(requestPdfNow).toHaveBeenCalledWith(42, undefined); // pdf-now, not keepalive: the user is staying
      expect(screen.getByText("PDF updating…")).toBeTruthy();
    });

    it("leaving the editor flushes the save, then asks for the PDF now (keepalive)", async () => {
      putDoc.mockResolvedValue({ kind: "ok", version: 4, contentHash: null });
      const { unmount } = renderWithPdf({ status: "READY", pollMs: 5000, pollWindowMs: 180000 });
      fireEvent.change(bullet(), { target: { value: "Last words" } });
      unmount();
      await flush(0);
      expect(putDoc).toHaveBeenCalledTimes(1);
      expect(requestPdfNow).toHaveBeenCalledWith(42, { keepalive: true });
      expect(putDoc.mock.invocationCallOrder[0]).toBeLessThan(requestPdfNow.mock.invocationCallOrder[0]);
    });

    it("pagehide (closing the tab) asks for the PDF now", () => {
      renderWithPdf({ status: "READY", pollMs: 5000, pollWindowMs: 180000 });
      window.dispatchEvent(new Event("pagehide"));
      expect(requestPdfNow).toHaveBeenCalledWith(42, { keepalive: true });
    });
  });

  it("a 422 toasts the reason and rings the field the server named, until the next edit", async () => {
    putDoc.mockResolvedValue({ kind: "invalid", path: "$.sections[1].items[0].bullets[0].text", message: "must be at most 600 characters" });
    renderEditor();
    fireEvent.change(bullet(), { target: { value: "x" } });
    await flush(800);
    expect(screen.getByText("Couldn't save: must be at most 600 characters")).toBeTruthy();
    expect(bullet().getAttribute("aria-invalid")).toBe("true");
    fireEvent.change(bullet(), { target: { value: "xy" } });
    expect(bullet().getAttribute("aria-invalid")).toBeNull();
  });

  it("limits and template capabilities come from the config: no photo slot under the ATS template", () => {
    renderEditor();
    expect(screen.queryByRole("button", { name: /Add photo/ })).toBeNull();
    expect(bullet().maxLength).toBe(DEFAULT_BUILDER_CONFIG.limits.bulletChars);
    cleanup();
    renderEditor({ ...DEFAULT_BUILDER_CONFIG, limits: { ...DEFAULT_BUILDER_CONFIG.limits, bulletChars: 55 } });
    expect(bullet().maxLength).toBe(55);
  });

  it("shows 'Not saved — retrying' on a network failure and recovers", async () => {
    putDoc.mockResolvedValueOnce({ kind: "network" }).mockResolvedValue({ kind: "ok", version: 4, contentHash: null });
    renderEditor();
    fireEvent.change(bullet(), { target: { value: "x" } });
    await flush(800);
    expect(status()).toBe("retrying");
    expect(statusText()).toContain("Not saved — retrying");
    await flush(1000);
    expect(status()).toBe("saved");
  });

  it("undo / redo live on Ctrl/⌘ Z only (the bar has no buttons for them)", async () => {
    putDoc.mockResolvedValue({ kind: "ok", version: 4, contentHash: null });
    renderEditor();
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Redo" })).toBeNull();

    fireEvent.change(bullet(), { target: { value: "Changed" } });
    fireEvent.keyDown(document, { key: "z", ctrlKey: true });
    expect(bullet().value).toBe("Led migration");
    fireEvent.keyDown(document, { key: "z", metaKey: true, shiftKey: true });
    expect(bullet().value).toBe("Changed");
    fireEvent.keyDown(document, { key: "y", ctrlKey: true });
    await flush(800);
  });

  describe("409 conflict", () => {
    const theirs = () => ({ ...testDoc(), meta: { title: "Their copy" } });

    async function conflicted() {
      putDoc.mockResolvedValueOnce({ kind: "conflict", serverVersion: 9, doc: theirs() });
      renderEditor();
      fireEvent.change(bullet(), { target: { value: "Mine" } });
      await flush(800);
    }

    it("opens the dialog, and 'Keep mine' re-saves my document against the server's version", async () => {
      await conflicted();
      expect(screen.getByRole("dialog", { name: "Edited elsewhere" })).toBeTruthy();
      expect(status()).toBe("conflict");

      putDoc.mockResolvedValue({ kind: "ok", version: 10, contentHash: null });
      fireEvent.click(screen.getByRole("button", { name: "Keep mine" }));
      await flush(0);
      expect(putDoc).toHaveBeenCalledTimes(2);
      expect(putDoc.mock.calls[1][1]).toBe(9);
      expect(firstBullet(putDoc.mock.calls[1][2].doc)).toBe("Mine");
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(status()).toBe("saved");
    });

    it("'Take theirs' replaces my document with the server's and does not save", async () => {
      await conflicted();
      fireEvent.click(screen.getByRole("button", { name: "Take theirs" }));
      await flush(5000);
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(bullet().value).toBe("Led migration"); // their bullets, not "Mine"
      expect(putDoc).toHaveBeenCalledTimes(1);
      expect(status()).toBe("saved");
    });
  });

  describe("left side-nav (the boards' dynamic pane)", () => {
    it("opens on a button, highlights it, switches panel, and a second press closes it (one active at a time)", () => {
      renderEditor();
      expect(leftSheet().getAttribute("data-state")).toBe("closed");
      fireEvent.click(panelButton("Add Section"));
      expect(leftSheet().getAttribute("data-state")).toBe("open");
      expect(leftSheet().getAttribute("aria-label")).toBe("Add Section");
      expect(pressed()).toEqual(["Add Section"]);
      expect(panelButton("Add Section").getAttribute("aria-expanded")).toBe("true");
      expect(panelButton("Add Section").getAttribute("aria-controls")).toBe("rb-left-sheet");
      expect(panelButton("Add Section").className).toContain("bg-accent"); // the board's green

      fireEvent.click(panelButton("Swap Section")); // switches, still one sheet
      expect(pressed()).toEqual(["Swap Section"]);
      expect(leftSheet().getAttribute("aria-label")).toBe("Swap Section");
      expect(leftSheet().getAttribute("data-state")).toBe("open");

      fireEvent.click(panelButton("Swap Section")); // the active one again closes
      expect(pressed()).toEqual([]);
      expect(leftSheet().getAttribute("data-state")).toBe("closed");
    });

    it("the panel's ✕ and Esc close it, and focus returns to the button that opened it", () => {
      renderEditor();
      const pick = panelButton("Pick Template");
      pick.focus();
      fireEvent.click(pick);
      expect(leftSheet().contains(document.activeElement)).toBe(true); // focus moved into the panel

      fireEvent.click(within(leftSheet()).getByRole("button", { name: "Close Pick Template" }));
      expect(leftSheet().getAttribute("data-state")).toBe("closed");
      expect(document.activeElement).toBe(pick);

      fireEvent.click(pick);
      fireEvent.keyDown(document, { key: "Escape" });
      expect(leftSheet().getAttribute("data-state")).toBe("closed");
      expect(pressed()).toEqual([]);
      expect(document.activeElement).toBe(pick);
    });

    it("shows each panel with its header (the ones still to come name the story they wait for)", () => {
      renderEditor();
      const cases: Array<[string, string]> = [
        ["Swap Section", "R2.2"],
        ["Tailor to Job", "R5.8"],
      ];
      for (const [name, story] of cases) {
        fireEvent.click(panelButton(name));
        expect(within(leftSheet()).getByRole("heading", { name })).toBeTruthy();
        // R2.2 filled the Swap Section body; the others still say which story they wait for.
        if (story === "R2.2") expect(leftSheet().querySelector('[data-panel="swap"]')).toBeTruthy();
        else expect(leftSheet().textContent).toContain(`Coming in ${story}`);
      }
    });

    it("Pick Template shows the live template grid and Customize Template (R2.4), not a placeholder", () => {
      renderEditor();
      fireEvent.click(panelButton("Pick Template"));
      const sheet = within(leftSheet());
      expect(sheet.getByRole("heading", { name: "Pick Template" })).toBeTruthy();
      expect(sheet.getByRole("heading", { name: "Customize Template" })).toBeTruthy();
      expect(leftSheet().textContent).not.toContain("Coming in");
      expect(leftSheet().querySelector('[data-template="modern"]')?.getAttribute("aria-pressed")).toBe("true");
    });

    it("the centre expands when the sheet closes (the push track is 0 wide)", () => {
      renderEditor();
      const width = () => (leftSheet() as HTMLElement).style.width;
      expect(width()).toBe("0px");
      fireEvent.click(panelButton("Add Section"));
      expect(width()).toBe("400px");
      fireEvent.click(panelButton("Add Section"));
      expect(width()).toBe("0px");
    });

    it("Alt+1..4 toggle the four panels", () => {
      renderEditor();
      fireEvent.keyDown(document, { key: "3", code: "Digit3", altKey: true });
      expect(pressed()).toEqual(["Swap Section"]);
      fireEvent.keyDown(document, { key: "1", code: "Digit1", altKey: true });
      expect(pressed()).toEqual(["Add Section"]);
      fireEvent.keyDown(document, { key: "4", code: "Digit4", altKey: true });
      expect(pressed()).toEqual(["Tailor to Job"]);
      fireEvent.keyDown(document, { key: "4", code: "Digit4", altKey: true });
      expect(pressed()).toEqual([]);
    });

    it("hides Tailor to Job (button, shortcut) when the admin switch is off", () => {
      renderEditor({ ...DEFAULT_BUILDER_CONFIG, features: { ...DEFAULT_BUILDER_CONFIG.features, tailor: false } });
      expect(screen.queryByRole("button", { name: "Tailor to Job" })).toBeNull();
      fireEvent.keyDown(document, { key: "4", code: "Digit4", altKey: true });
      expect(leftSheet().getAttribute("data-state")).toBe("closed");
    });

    it("a section tab for a kind the document lacks opens Add Section", () => {
      renderEditor();
      fireEvent.click(screen.getByRole("tab", { name: "Education" }));
      expect(pressed()).toEqual(["Add Section"]);
      expect(leftSheet().querySelector("[data-focus-kind]")?.getAttribute("data-focus-kind")).toBe("EDUCATION");
    });

    it("Add Section adds the section to the document and the row flips to Already added", () => {
      renderEditor();
      fireEvent.click(panelButton("Add Section"));
      const before = document.querySelectorAll(".rb-block").length;
      fireEvent.click(within(leftSheet()).getByRole("button", { name: "Add Languages to resume" }));
      expect(document.querySelectorAll(".rb-block").length).toBe(before + 1);
      expect(leftSheet().querySelector('[data-row="LANGUAGES"]')?.getAttribute("data-state")).toBe("added");
      expect(leftSheet().getAttribute("data-state")).toBe("open"); // a pushed sheet stays open for the next one
    });

    it("the rail's Job Match 'Tailor to Job' button opens the Tailor panel", () => {
      renderEditor();
      fireEvent.click(screen.getAllByRole("tab", { name: /Job Match/ })[0]);
      const rail = screen.getAllByRole("tabpanel")[0];
      fireEvent.click(within(rail).getByRole("button", { name: "Tailor to Job" }));
      expect(pressed()).toEqual(["Tailor to Job"]);
    });
  });

  describe("rail collapse (DECISIONS #28)", () => {
    it("at 1280 the open left sheet collapses the rail to the strip and pushes; closing re-expands", () => {
      setWidth(1280);
      renderEditor();
      expect(grid().getAttribute("data-rail")).toBe("full");
      expect(document.querySelector("[data-rail-strip]")).toBeNull();

      fireEvent.click(panelButton("Add Section"));
      expect(grid().getAttribute("data-rail")).toBe("collapsed");
      expect(document.querySelector("[data-rail-strip]")).not.toBeNull();
      expect(leftSheet().getAttribute("data-mode")).toBe("push");
      expect((grid() as HTMLElement).style.getPropertyValue("--rb-rail")).toBe("56px");

      fireEvent.click(panelButton("Add Section"));
      expect(grid().getAttribute("data-rail")).toBe("full");
      expect((grid() as HTMLElement).style.getPropertyValue("--rb-rail")).toBe("360px");
    });

    it("a strip icon closes the left sheet and opens the rail on that tab", () => {
      setWidth(1280);
      renderEditor();
      fireEvent.click(panelButton("Swap Section"));
      const strip = document.querySelector("[data-rail-strip]") as HTMLElement;
      fireEvent.click(within(strip).getByRole("button", { name: "AI Suggestions" }));
      expect(leftSheet().getAttribute("data-state")).toBe("closed");
      expect(grid().getAttribute("data-rail")).toBe("full");
      expect(screen.getByRole("tab", { name: /AI Suggestions/ }).getAttribute("aria-selected")).toBe("true");
    });

    it("at 1440 there is room: the full rail stays beside the pushed sheet", () => {
      renderEditor();
      fireEvent.click(panelButton("Add Section"));
      expect(grid().getAttribute("data-rail")).toBe("full");
      expect(leftSheet().getAttribute("data-mode")).toBe("push");
    });
  });

  describe("right rail", () => {
    it("Free: the Resume Score, a locked AI card, the Job Match empty state", () => {
      renderEditor();
      expect(screen.getAllByRole("meter", { name: "Resume score" }).length).toBeGreaterThan(0);
      fireEvent.click(screen.getAllByRole("tab", { name: /AI Suggestions/ })[0]);
      expect(screen.getByText("AI suggestions are part of Pro")).toBeTruthy();
      expect(screen.getByRole("link", { name: "See Pro" }).getAttribute("href")).toBe("/pricing");
      fireEvent.click(screen.getAllByRole("tab", { name: /Job Match/ })[0]);
      expect(screen.getByText("Pick the job this resume is for")).toBeTruthy();
    });

    it("Pro: 'Get suggestions' stub instead of the lock", () => {
      renderEditor({ ...DEFAULT_BUILDER_CONFIG, plan: "PRO", aiAllowed: true });
      fireEvent.click(screen.getAllByRole("tab", { name: /AI Suggestions/ })[0]);
      expect(screen.getByRole("button", { name: "Get suggestions" })).toBeTruthy();
      expect(screen.queryByText("AI suggestions are part of Pro")).toBeNull();
    });

    it("remembers the rail tab", () => {
      renderEditor();
      fireEvent.click(screen.getAllByRole("tab", { name: /Job Match/ })[0]);
      expect(JSON.parse(window.localStorage.getItem("rb.ui.v1") as string).railTab).toBe("match");
    });
  });

  describe("phone (< 768)", () => {
    beforeEach(() => setWidth(390));
    const tabBar = () => screen.getByRole("tablist", { name: "Editor views" });

    it("has the Edit · Layout · Insights · Preview bar and no top-bar panel buttons' labels crowding it", () => {
      renderEditor();
      const tabs = within(tabBar()).getAllByRole("tab");
      expect(tabs.map((t) => t.textContent)).toEqual(["Edit", "Layout", "Insights", "Preview"]);
      expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    });

    it("Layout opens a fullscreen sheet with the four panels as a segmented header; a history entry is pushed", () => {
      renderEditor();
      fireEvent.click(within(tabBar()).getByRole("tab", { name: "Layout" }));
      const dialog = screen.getByRole("dialog", { name: "Add Section" });
      expect(dialog.getAttribute("aria-modal")).toBe("true");
      const seg = within(dialog).getByRole("radiogroup", { name: "Layout panels" });
      expect(within(seg).getAllByRole("radio").map((r) => r.textContent)).toEqual(["Add Section", "Pick Template", "Swap Section", "Tailor to Job"]);
      expect((window.history.state as { rbSheet?: boolean } | null)?.rbSheet).toBe(true);

      fireEvent.click(within(seg).getByRole("radio", { name: "Swap Section" }));
      expect(screen.getByRole("dialog", { name: "Swap Section" })).toBeTruthy();
    });

    it("Back (popstate) closes the open sheet", async () => {
      renderEditor();
      fireEvent.click(within(tabBar()).getByRole("tab", { name: "Layout" }));
      expect(screen.getByRole("dialog", { name: "Add Section" })).toBeTruthy();
      act(() => {
        window.dispatchEvent(new PopStateEvent("popstate"));
      });
      await flush(300); // the exit animation
      expect(screen.queryByRole("dialog", { name: "Add Section" })).toBeNull();
      expect(within(tabBar()).getByRole("tab", { name: "Edit" }).getAttribute("aria-selected")).toBe("true");
    });

    it("the sheet's ✕ closes it; Insights opens the rail fullscreen; tapping the open tab closes it", async () => {
      renderEditor();
      fireEvent.click(within(tabBar()).getByRole("tab", { name: "Layout" }));
      fireEvent.click(screen.getByRole("button", { name: "Close Add Section" }));
      await flush(300);
      expect(screen.queryByRole("dialog")).toBeNull();

      fireEvent.click(within(tabBar()).getByRole("tab", { name: "Insights" }));
      const rail = screen.getByRole("dialog", { name: "Insights" });
      expect(within(rail).getAllByRole("tab").map((t) => t.textContent)).toEqual(["Insights", "AI Suggestions", "Job Match"]);
      fireEvent.click(within(tabBar()).getByRole("tab", { name: "Insights" }));
      await flush(300);
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("Preview is a fullscreen sheet hosting Print layout, segmented with PDF view", async () => {
      exportPdf.mockResolvedValue({ kind: "ok", blob: new Blob(["%PDF"]), fileName: "r.pdf", pages: 1, fits: true, stored: true, contentHash: null, cached: true });
      renderEditor();
      fireEvent.click(within(tabBar()).getByRole("tab", { name: "Preview" }));
      const dialog = screen.getByRole("dialog", { name: "Preview" });
      expect(within(dialog).getByRole("img", { name: "Page 1 of 1" })).toBeTruthy();
      expect(within(dialog).getByRole("button", { name: "Zoom in" })).toBeTruthy(); // phone: pinch + zoom buttons
      fireEvent.click(within(dialog).getByRole("radio", { name: "PDF view" }));
      await flush(300);
      expect(within(dialog).getByTitle("PDF preview")).toBeTruthy();
    });

    it("with Print layout switched off the Preview tab opens the PDF view (R3.8 gap)", async () => {
      exportPdf.mockResolvedValue({ kind: "ok", blob: new Blob(["%PDF"]), fileName: "r.pdf", pages: 1, fits: true, stored: true, contentHash: null, cached: true });
      renderEditor({ ...DEFAULT_BUILDER_CONFIG, features: { ...DEFAULT_BUILDER_CONFIG.features, printLayout: false } });
      fireEvent.click(within(tabBar()).getByRole("tab", { name: "Preview" }));
      const dialog = screen.getByRole("dialog", { name: "Preview" });
      expect(within(dialog).queryByRole("img", { name: /Page 1/ })).toBeNull();
      expect(within(dialog).queryByRole("radio", { name: "Print layout" })).toBeNull(); // a single view needs no switch
      await flush(300);
      expect(within(dialog).getByTitle("PDF preview")).toBeTruthy();
    });

    it("with both views switched off there is no Preview tab and nothing opens", () => {
      renderEditor({ ...DEFAULT_BUILDER_CONFIG, features: { ...DEFAULT_BUILDER_CONFIG.features, printLayout: false, pdfView: false } });
      expect(within(tabBar()).queryByRole("tab", { name: "Preview" })).toBeNull();
      expect(within(tabBar()).getAllByRole("tab").length).toBe(3);
    });
  });

  describe("Pick Template: Customize Template saves through PATCH /doc/theme (R2.4)", () => {
    const open = () => {
      renderEditor();
      fireEvent.click(panelButton("Pick Template"));
    };

    it("a change updates the editor at once, then PATCHes the theme 500 ms later and the next save adopts the new ETag", async () => {
      patchTheme.mockResolvedValue({ kind: "ok", version: 9 });
      putDoc.mockResolvedValue({ kind: "ok", version: 10, contentHash: null });
      open();
      fireEvent.click(within(leftSheet()).getByRole("radio", { name: "Spacious" }));
      expect(within(leftSheet()).getByRole("radio", { name: "Spacious" }).getAttribute("aria-checked")).toBe("true"); // optimistic
      await flush(499);
      expect(patchTheme).not.toHaveBeenCalled();
      await flush(1);
      expect(patchTheme).toHaveBeenCalledTimes(1);
      expect(patchTheme.mock.calls[0][0]).toBe(42);
      expect(patchTheme.mock.calls[0][1]).toMatchObject({ spacing: "spacious", _touched: ["spacing"] });
      expect(patchTheme.mock.calls[0][1]).not.toHaveProperty("size");

      // the editor adopted the ETag the PATCH returned: the next content save is sent against it
      fireEvent.change(bullet(), { target: { value: "Led the migration" } });
      await flush(800);
      expect(putDoc).toHaveBeenCalledTimes(1);
      expect(putDoc.mock.calls[0][1]).toBe(9);
    });

    it("a saved theme re-queues the PDF: the top bar shows 'PDF updating…' and then follows the server to READY (R3.7 x R2.4)", async () => {
      patchTheme.mockResolvedValue({ kind: "ok", version: 9 });
      getPdfStatus.mockResolvedValue({ status: "READY", pollMs: 5000, pollWindowMs: 180000 });
      renderWithPdf({ status: "READY", pollMs: 5000, pollWindowMs: 180000 });
      fireEvent.click(panelButton("Pick Template"));
      fireEvent.click(within(leftSheet()).getByRole("radio", { name: "Spacious" }));
      expect(screen.queryByText("PDF updating…")).toBeNull(); // nothing saved yet
      await flush(500);
      expect(patchTheme).toHaveBeenCalledTimes(1);
      expect(screen.getByText("PDF updating…")).toBeTruthy();
      await flush(5000);
      expect(getPdfStatus).toHaveBeenCalledWith(42);
      expect(screen.queryByText("PDF updating…")).toBeNull();
    });

    it("the document canvas follows Spacing and the font pair at once (R2.1 x R2.4)", () => {
      patchTheme.mockResolvedValue({ kind: "ok", version: 9 });
      open();
      const canvas = () => document.querySelector<HTMLElement>("[data-canvas]")!;
      const density = () => Number(canvas().style.getPropertyValue("--rb-doc-density"));
      const normal = density();
      fireEvent.click(within(leftSheet()).getByRole("radio", { name: "Spacious" }));
      expect(density()).toBeGreaterThan(normal);
      fireEvent.click(within(leftSheet()).getByRole("radio", { name: "Compact" }));
      expect(density()).toBeLessThan(normal);
      fireEvent.click(within(leftSheet()).getByRole("button", { name: "Font Family" }));
      fireEvent.click(screen.getByRole("option", { name: "Georgia / Arial" }));
      expect(canvas().style.getPropertyValue("--rb-doc-font-body")).toContain("Arial");
    });

    it("a burst of changes sends only the last theme", async () => {
      patchTheme.mockResolvedValue({ kind: "ok", version: 4 });
      open();
      fireEvent.click(within(leftSheet()).getByRole("radio", { name: "Compact" }));
      fireEvent.click(within(leftSheet()).getByRole("radio", { name: "Two Pages" }));
      fireEvent.click(within(leftSheet()).getByRole("radio", { name: "Spacious" }));
      await flush(500);
      expect(patchTheme).toHaveBeenCalledTimes(1);
      expect(patchTheme.mock.calls[0][1]).toMatchObject({ spacing: "spacious", fit: { target: 2, step: 0 } });
    });

    it("a refused theme goes back to the last saved one and says so", async () => {
      patchTheme.mockResolvedValue({ kind: "invalid", message: "fit.target must be 1 or 2" });
      open();
      fireEvent.click(within(leftSheet()).getByRole("radio", { name: "Spacious" }));
      await flush(500);
      expect(within(leftSheet()).getByRole("radio", { name: "Normal" }).getAttribute("aria-checked")).toBe("true");
      expect(screen.getByText("Couldn't save that change")).toBeTruthy();
    });

    it("typing during a theme change never sends a content save with a stale version", async () => {
      let finish: (r: PatchResult) => void = () => {};
      patchTheme.mockImplementation(() => new Promise<PatchResult>((r) => (finish = r)));
      putDoc.mockResolvedValue({ kind: "ok", version: 7, contentHash: null });
      open();
      fireEvent.click(within(leftSheet()).getByRole("radio", { name: "Compact" }));
      await flush(500); // PATCH in flight, autosave held
      fireEvent.change(bullet(), { target: { value: "typed meanwhile" } });
      await flush(2000);
      expect(putDoc).not.toHaveBeenCalled();
      finish({ kind: "ok", version: 5 });
      await flush(900);
      expect(putDoc).toHaveBeenCalledTimes(1);
      expect(putDoc.mock.calls[0][1]).toBe(5); // the PATCH's version, not the stale 3
    });

    it("Modern is an ATS template: no accent swatch can be picked and the document keeps the ink colour", () => {
      open();
      expect(within(leftSheet()).getAllByRole("radio", { name: "Green" })[0].getAttribute("aria-disabled")).toBe("true");
      const card = document.querySelector<HTMLElement>("main [style*='--rb-doc-accent']");
      expect(card?.style.getPropertyValue("--rb-doc-accent")).toBe("#111827");
    });
  });

  describe("close (✕)", () => {
    it("leaves for the list when everything is saved", async () => {
      renderEditor();
      fireEvent.click(screen.getByRole("button", { name: "Close editor" }));
      await flush(0);
      expect(push).toHaveBeenCalledWith("/resume-builder");
    });

    it("saves pending edits first; stays (after a confirm) when they cannot be saved", async () => {
      putDoc.mockResolvedValue({ kind: "invalid", path: "$", message: "nope" });
      const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
      renderEditor();
      fireEvent.change(bullet(), { target: { value: "Unsaveable" } });
      fireEvent.click(screen.getByRole("button", { name: "Close editor" }));
      await flush(0);
      expect(putDoc).toHaveBeenCalledTimes(1); // flushed by ✕, not by the timer
      expect(confirm).toHaveBeenCalled();
      expect(push).not.toHaveBeenCalled();

      confirm.mockReturnValue(true);
      fireEvent.click(screen.getByRole("button", { name: "Close editor" }));
      await flush(0);
      expect(push).toHaveBeenCalledWith("/resume-builder");
      confirm.mockRestore();
    });
  });

  describe("Download ▾", () => {
    const okPdf = (over: Partial<Extract<ExportPdfResult, { kind: "ok" }>> = {}): ExportPdfResult => ({
      kind: "ok",
      blob: new Blob(["%PDF"], { type: "application/pdf" }),
      fileName: "Backend-SWE.pdf",
      pages: 1,
      fits: true,
      stored: true,
      contentHash: "a".repeat(64),
      cached: false,
      ...over,
    });
    // The Menu primitive wraps its trigger in a role=button span: the real <button> is the inner one.
    const downloadBtn = () => screen.getAllByRole("button", { name: "Download" }).find((b) => b.tagName === "BUTTON") as HTMLButtonElement;
    const openMenu = () => fireEvent.click(downloadBtn());
    const item = (name: string | RegExp) => screen.getByRole("menuitem", { name }) as HTMLButtonElement;
    const downloadPdf = () => {
      openMenu();
      fireEvent.click(item("Save & Download PDF"));
    };

    it("lists Print layout, PDF view, Save & Download PDF, plain text and DOCX (soon)", () => {
      renderEditor();
      openMenu();
      const items = screen.getAllByRole("menuitem");
      expect(items.map((i) => i.textContent)).toEqual([
        "Print layout",
        "PDF view",
        "Save & Download PDF",
        "Save & Download plain text (.txt)",
        "Save & Download DOCXComing soon",
      ]);
      expect(items.map((i) => i.getAttribute("aria-disabled") === "true")).toEqual([false, false, false, false, true]);
    });

    it("Alt+D opens the menu", () => {
      renderEditor();
      fireEvent.keyDown(document, { key: "d", code: "KeyD", altKey: true });
      expect(screen.getByRole("menu")).toBeTruthy();
    });

    it("saves pending edits first, then exports and downloads the PDF", async () => {
      putDoc.mockResolvedValue({ kind: "ok", version: 4, contentHash: null });
      exportPdf.mockResolvedValue(okPdf());
      renderEditor();
      fireEvent.change(bullet(), { target: { value: "Edited right before export" } });
      expect(putDoc).not.toHaveBeenCalled(); // still inside the 800 ms debounce

      downloadPdf();
      await flush(0);

      expect(putDoc).toHaveBeenCalledTimes(1); // flushed by the export, not by the timer
      expect(firstBullet(putDoc.mock.calls[0][2].doc)).toBe("Edited right before export");
      expect(exportPdf).toHaveBeenCalledWith(42);
      expect(putDoc.mock.invocationCallOrder[0]).toBeLessThan(exportPdf.mock.invocationCallOrder[0]);
      expect(saveBlob).toHaveBeenCalledWith(expect.any(Blob), "Backend-SWE.pdf");
      expect(screen.getByText("PDF ready")).toBeTruthy();
      expect(downloadBtn().getAttribute("aria-busy")).toBe("false");
    });

    it("shows a busy state while the PDF is being made and ignores a second click", async () => {
      let done!: (r: ExportPdfResult) => void;
      exportPdf.mockReturnValue(new Promise<ExportPdfResult>((resolve) => (done = resolve)));
      renderEditor();
      downloadPdf();
      await flush(0);
      expect(downloadBtn().getAttribute("aria-busy")).toBe("true");
      expect(downloadBtn().textContent).toContain("Preparing");
      openMenu();
      expect(item("Save & Download PDF").getAttribute("aria-disabled")).toBe("true");
      fireEvent.click(item("Save & Download PDF"));
      expect(exportPdf).toHaveBeenCalledTimes(1);
      await act(async () => done(okPdf()));
      expect(downloadBtn().textContent).toContain("Download");
    });

    it("reports a service error and downloads nothing", async () => {
      exportPdf.mockResolvedValue({ kind: "error", status: 503, code: "PDF_BUSY", message: "The PDF service is busy - try again in a few seconds." });
      renderEditor();
      downloadPdf();
      await flush(0);
      expect(saveBlob).not.toHaveBeenCalled();
      expect(screen.getByText("Couldn't make the PDF")).toBeTruthy();
      expect(screen.getByText(/service is busy/)).toBeTruthy();
    });

    it("does not export a stale document when the latest edit could not be saved", async () => {
      putDoc.mockResolvedValue({ kind: "invalid", path: "$", message: "nope" });
      renderEditor();
      fireEvent.change(bullet(), { target: { value: "Unsaveable" } });
      downloadPdf();
      await flush(0);
      expect(exportPdf).not.toHaveBeenCalled();
      expect(screen.getByText("Couldn't save yet")).toBeTruthy();
      expect(checkpointDoc).not.toHaveBeenCalled();
    });

    it("says so when the PDF downloaded but could not be attached to the resume", async () => {
      exportPdf.mockResolvedValue(okPdf({ stored: false }));
      renderEditor();
      downloadPdf();
      await flush(0);
      expect(screen.getByText(/couldn't be attached/)).toBeTruthy();
    });

    it("is disabled while a conflict is unresolved", async () => {
      putDoc.mockResolvedValueOnce({ kind: "conflict", serverVersion: 9, doc: testDoc() });
      renderEditor();
      fireEvent.change(bullet(), { target: { value: "Mine" } });
      await flush(800);
      openMenu();
      expect(item("Save & Download PDF").getAttribute("aria-disabled")).toBe("true");
      expect(item(/plain text/).getAttribute("aria-disabled")).toBe("true");
    });

    it("downloads plain text after saving, through the txt export", async () => {
      putDoc.mockResolvedValue({ kind: "ok", version: 4, contentHash: null });
      exportText.mockResolvedValue({ kind: "ok", blob: new Blob(["PRIYA"], { type: "text/plain" }), fileName: "Backend-SWE.txt" });
      renderEditor();
      fireEvent.change(bullet(), { target: { value: "Edited" } });
      openMenu();
      fireEvent.click(item(/plain text/));
      await flush(0);
      expect(putDoc).toHaveBeenCalledTimes(1);
      expect(exportText).toHaveBeenCalledWith(42);
      expect(saveBlob).toHaveBeenCalledWith(expect.any(Blob), "Backend-SWE.txt");
      expect(screen.getByText("Text file ready")).toBeTruthy();
    });

    it("reports a txt failure and downloads nothing", async () => {
      exportText.mockResolvedValue({ kind: "error", status: 404, message: "That resume is no longer there." });
      renderEditor();
      openMenu();
      fireEvent.click(item(/plain text/));
      await flush(0);
      expect(saveBlob).not.toHaveBeenCalled();
      expect(screen.getByText("Couldn't make the text file")).toBeTruthy();
    });
  });

  describe("Save and Save & Download (R3.3, DESIGN 10.15)", () => {
    const okPdf = (over: Partial<Extract<ExportPdfResult, { kind: "ok" }>> = {}): ExportPdfResult => ({
      kind: "ok",
      blob: new Blob(["%PDF"], { type: "application/pdf" }),
      fileName: "Backend-SWE.pdf",
      pages: 1,
      fits: true,
      stored: true,
      contentHash: "a".repeat(64),
      cached: true,
      ...over,
    });
    const saveButton = () => document.querySelector<HTMLButtonElement>("[data-save-button]")!;
    const downloadBtn = () => screen.getAllByRole("button", { name: "Download" }).find((b) => b.tagName === "BUTTON") as HTMLButtonElement;
    const ctrlS = () => fireEvent.keyDown(document, { key: "s", code: "KeyS", ctrlKey: true });

    it("opens as Saved with Save disabled when nothing changed and the PDF is fine", () => {
      renderWithPdf({ status: "READY", hash: "h" });
      expect(saveButton().textContent).toBe("Saved");
      expect(saveButton().disabled).toBe(true);
    });

    it("Save is on offer while the stored PDF is missing or failed, even with no edits", () => {
      renderWithPdf({ status: "FAILED" });
      expect(saveButton().textContent).toBe("Save");
      expect(saveButton().disabled).toBe(false);
    });

    it("Ctrl+S flushes the pending edit, then posts the checkpoint", async () => {
      putDoc.mockResolvedValue({ kind: "ok", version: 4, contentHash: null });
      renderWithPdf({ status: "READY", hash: "h" });
      fireEvent.change(bullet(), { target: { value: "Edited, then Ctrl+S" } });
      expect(saveButton().textContent).toBe("Save");
      expect(putDoc).not.toHaveBeenCalled(); // still inside the 800 ms debounce
      ctrlS();
      await flush(0);
      expect(putDoc).toHaveBeenCalledTimes(1);
      expect(checkpointDoc).toHaveBeenCalledWith(42, undefined);
      expect(putDoc.mock.invocationCallOrder[0]).toBeLessThan(checkpointDoc.mock.invocationCallOrder[0]);
    });

    it("the button reads Saved for 2 s, then stays disabled until something changes; the status says the PDF is updating", async () => {
      putDoc.mockResolvedValue({ kind: "ok", version: 4, contentHash: null });
      renderWithPdf({ status: "READY", hash: "h", pollMs: 5000, pollWindowMs: 20000 });
      fireEvent.change(bullet(), { target: { value: "Changed" } });
      fireEvent.click(saveButton());
      await flush(0);
      expect(checkpointDoc).toHaveBeenCalledTimes(1);
      expect(saveButton().textContent).toBe("Saved");
      expect(document.querySelector('[data-pdf-status="updating"]')?.textContent).toContain("PDF updating…");
      await flush(2000);
      expect(saveButton().textContent).toBe("Saved");
      expect(saveButton().disabled).toBe(true);
      fireEvent.change(bullet(), { target: { value: "Changed again" } });
      expect(saveButton().textContent).toBe("Save");
      expect(saveButton().disabled).toBe(false);
    });

    it("does not post a checkpoint when the latest edit could not be saved", async () => {
      putDoc.mockResolvedValue({ kind: "invalid", path: "$", message: "nope" });
      renderEditor();
      fireEvent.change(bullet(), { target: { value: "Unsaveable" } });
      ctrlS();
      await flush(0);
      expect(checkpointDoc).not.toHaveBeenCalled();
      expect(screen.getByText("Couldn't save yet")).toBeTruthy();
    });

    it("Save ▾ → Save as version… names the checkpoint", async () => {
      renderEditor();
      const chevron = screen.getAllByRole("button", { name: "Save options" }).find((b) => b.tagName === "BUTTON")!;
      fireEvent.click(chevron);
      fireEvent.click(screen.getByRole("menuitem", { name: "Save as version…" }));
      const dialog = screen.getByRole("dialog", { name: "Save as version" });
      fireEvent.change(within(dialog).getByLabelText("Version name"), { target: { value: "Before the Acme call" } });
      fireEvent.submit(dialog.querySelector("form")!);
      await flush(0);
      expect(checkpointDoc).toHaveBeenCalledWith(42, "Before the Acme call");
      expect(screen.getByText("Version 'Before the Acme call' saved")).toBeTruthy();
    });

    it("Save & Download PDF waits for the stored PDF, then downloads it (no second render)", async () => {
      exportPdf.mockResolvedValue(okPdf());
      renderEditor();
      fireEvent.click(downloadBtn());
      fireEvent.click(screen.getByRole("menuitem", { name: "Save & Download PDF" }));
      await flush(0);
      expect(checkpointDoc).toHaveBeenCalledTimes(1);
      expect(waitForStoredPdf).toHaveBeenCalledWith(42, expect.objectContaining({ waitMs: DEFAULT_BUILDER_CONFIG.pdf.waitMs }));
      expect(exportPdf).toHaveBeenCalledTimes(1); // the cached GET: the stored file, not a render
      expect(checkpointDoc.mock.invocationCallOrder[0]).toBeLessThan(waitForStoredPdf.mock.invocationCallOrder[0]);
      expect(waitForStoredPdf.mock.invocationCallOrder[0]).toBeLessThan(exportPdf.mock.invocationCallOrder[0]);
      expect(saveBlob).toHaveBeenCalledWith(expect.any(Blob), "Backend-SWE.pdf");
    });

    it("skips the wait when the checkpoint answers with the PDF already READY", async () => {
      checkpointDoc.mockResolvedValue({ kind: "ok", versionNo: 3, reason: "MANUAL", pdf: { status: "READY" } });
      exportPdf.mockResolvedValue(okPdf());
      renderEditor();
      fireEvent.click(downloadBtn());
      fireEvent.click(screen.getByRole("menuitem", { name: "Save & Download PDF" }));
      await flush(0);
      expect(waitForStoredPdf).not.toHaveBeenCalled();
      expect(saveBlob).toHaveBeenCalled();
    });

    it("falls back to the synchronous export when the stored PDF is not ready in time", async () => {
      waitForStoredPdf.mockResolvedValue("timeout");
      exportPdf.mockResolvedValue(okPdf({ cached: false }));
      renderEditor();
      fireEvent.click(downloadBtn());
      fireEvent.click(screen.getByRole("menuitem", { name: "Save & Download PDF" }));
      await flush(0);
      expect(exportPdf).toHaveBeenCalledTimes(1);
      expect(saveBlob).toHaveBeenCalledWith(expect.any(Blob), "Backend-SWE.pdf");
      expect(screen.getByText("PDF ready")).toBeTruthy();
    });

    it("still downloads when only the checkpoint failed, and says the version was not saved", async () => {
      checkpointDoc.mockResolvedValue({ kind: "error", status: 403, message: "This account can't save versions." });
      exportPdf.mockResolvedValue(okPdf({ cached: false }));
      renderEditor();
      fireEvent.click(downloadBtn());
      fireEvent.click(screen.getByRole("menuitem", { name: "Save & Download PDF" }));
      await flush(0);
      expect(waitForStoredPdf).not.toHaveBeenCalled();
      expect(saveBlob).toHaveBeenCalled();
      expect(screen.getByText("Couldn't save a version")).toBeTruthy();
    });

    it("Save & Download plain text checkpoints, then downloads the txt", async () => {
      exportText.mockResolvedValue({ kind: "ok", blob: new Blob(["PRIYA"]), fileName: "Backend-SWE.txt" });
      renderEditor();
      fireEvent.click(downloadBtn());
      fireEvent.click(screen.getByRole("menuitem", { name: "Save & Download plain text (.txt)" }));
      await flush(0);
      expect(checkpointDoc).toHaveBeenCalledTimes(1);
      expect(exportText).toHaveBeenCalledWith(42);
      expect(saveBlob).toHaveBeenCalledWith(expect.any(Blob), "Backend-SWE.txt");
    });
  });

  describe("PDF view: the right side-nav (R3.3)", () => {
    const okPdf = (over: Partial<Extract<ExportPdfResult, { kind: "ok" }>> = {}): ExportPdfResult => ({
      kind: "ok",
      blob: new Blob(["%PDF"], { type: "application/pdf" }),
      fileName: "Backend-SWE.pdf",
      pages: 1,
      fits: true,
      stored: true,
      contentHash: "a".repeat(64),
      cached: true,
      ...over,
    });
    const downloadBtn = () => screen.getAllByRole("button", { name: "Download" }).find((b) => b.tagName === "BUTTON") as HTMLButtonElement;
    const rightSheet = () => document.getElementById("rb-right-sheet")!;

    it("Download ▾ → PDF view opens the sheet with the real PDF; Alt+V and choosing it again close it", async () => {
      exportPdf.mockResolvedValue(okPdf());
      renderEditor();
      fireEvent.click(downloadBtn());
      fireEvent.click(screen.getByRole("menuitem", { name: /PDF view/ }));
      await flush(300);
      expect(within(rightSheet()).getByTitle("PDF preview").getAttribute("src")).toContain("blob:test-pdf");
      expect(downloadBtn().getAttribute("aria-pressed")).toBe("true");
      fireEvent.keyDown(document, { key: "v", code: "KeyV", altKey: true });
      await flush(300);
      expect(document.getElementById("rb-right-sheet")?.querySelector("iframe")).toBeNull();
      fireEvent.keyDown(document, { key: "v", code: "KeyV", altKey: true });
      await flush(300);
      expect(within(rightSheet()).getByTitle("PDF preview")).toBeTruthy();
    });

    it("a switched-off PDF view is not in the menu and Alt+V does nothing", async () => {
      renderEditor({ ...DEFAULT_BUILDER_CONFIG, features: { ...DEFAULT_BUILDER_CONFIG.features, pdfView: false } });
      fireEvent.keyDown(document, { key: "v", code: "KeyV", altKey: true });
      await flush(0);
      expect(exportPdf).not.toHaveBeenCalled();
      fireEvent.click(downloadBtn());
      expect(screen.queryByRole("menuitem", { name: /PDF view/ })).toBeNull();
    });

    it("switches Print layout ↔ PDF view inside the open sheet", async () => {
      exportPdf.mockResolvedValue(okPdf());
      renderEditor();
      fireEvent.keyDown(document, { key: "p", code: "KeyP", altKey: true });
      expect(within(rightSheet()).getByRole("img", { name: "Page 1 of 1" })).toBeTruthy();
      fireEvent.click(within(rightSheet()).getByRole("radio", { name: "PDF view" }));
      await flush(300);
      expect(within(rightSheet()).getByTitle("PDF preview")).toBeTruthy();
      fireEvent.click(within(rightSheet()).getByRole("radio", { name: "Print layout" }));
      expect(within(rightSheet()).getByRole("img", { name: "Page 1 of 1" })).toBeTruthy();
    });

    it("an edit makes the shown PDF stale; Refresh makes a new one", async () => {
      putDoc.mockResolvedValue({ kind: "ok", version: 4, contentHash: null });
      exportPdf.mockResolvedValue(okPdf());
      renderEditor();
      fireEvent.keyDown(document, { key: "v", code: "KeyV", altKey: true });
      await flush(0);
      expect(exportPdf).toHaveBeenCalledTimes(1);
      fireEvent.change(bullet(), { target: { value: "Changed under the PDF" } });
      const banner = within(rightSheet()).getByText(/Document changed since this PDF/);
      expect(banner).toBeTruthy();
      fireEvent.click(within(rightSheet()).getByRole("button", { name: "Refresh" }));
      await flush(0);
      expect(exportPdf).toHaveBeenCalledTimes(2);
      expect(putDoc).toHaveBeenCalled(); // the refresh saved the edit first
      expect(within(rightSheet()).queryByText(/Document changed since this PDF/)).toBeNull();
    });
  });

  describe("Print layout: the right side-nav (R3.8)", () => {
    // jsdom has no layout: give `.rz-page` a height from the theme variables (see PrintLayoutView.test).
    let contentAtStep0 = 1500;
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
    const cssVar = (el: HTMLElement, name: string) =>
      Number.parseFloat(new RegExp(`--rz-${name}:([\\d.]+)`).exec(el.parentElement?.querySelector("style")?.textContent ?? "")?.[1] ?? "0");
    beforeEach(() => {
      Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
        configurable: true,
        get(this: HTMLElement) {
          if (!this.classList?.contains("rz-page")) return 0;
          return Math.max(1056, contentAtStep0 * (cssVar(this, "size") / 11) * cssVar(this, "density") + 2 * cssVar(this, "margin") * 96);
        },
      });
    });
    afterEach(() => {
      if (original) Object.defineProperty(HTMLElement.prototype, "offsetHeight", original);
    });

    const downloadBtn = () => screen.getAllByRole("button", { name: "Download" }).find((b) => b.tagName === "BUTTON") as HTMLButtonElement;
    const rightSheet = () => document.getElementById("rb-right-sheet")!;
    const openPrint = () => {
      fireEvent.click(downloadBtn());
      fireEvent.click(screen.getByRole("menuitem", { name: /Print layout/ }));
    };
    const banner = () => document.querySelector("[data-print-banner]");

    it("Download ▾ → Print layout slides the pages in beside the rail; choosing it again closes it", async () => {
      renderEditor();
      expect(rightSheet().getAttribute("data-state")).toBe("closed");
      openPrint();
      expect(rightSheet().getAttribute("data-state")).toBe("open");
      expect(rightSheet().getAttribute("data-mode")).toBe("push");
      expect(within(rightSheet()).getAllByRole("img", { name: /^Page \d of 2$/ })).toHaveLength(2);
      expect(downloadBtn().getAttribute("aria-pressed")).toBe("true");
      expect(grid().getAttribute("data-rail")).toBe("full"); // the rail stays

      openPrint(); // the same item again
      await flush(300);
      expect(rightSheet().getAttribute("data-state")).toBe("closed");
      expect(downloadBtn().getAttribute("aria-pressed")).toBe("false");
    });

    it("Alt+P toggles it", async () => {
      renderEditor();
      fireEvent.keyDown(document, { key: "p", code: "KeyP", altKey: true });
      expect(rightSheet().getAttribute("data-state")).toBe("open");
      fireEvent.keyDown(document, { key: "p", code: "KeyP", altKey: true });
      await flush(300);
      expect(rightSheet().getAttribute("data-state")).toBe("closed");
    });

    it("Esc and the sheet's ✕ close it and focus returns to the Download button", async () => {
      renderEditor();
      openPrint();
      await flush(50);
      expect(rightSheet().contains(document.activeElement)).toBe(true);
      fireEvent.keyDown(document, { key: "Escape" });
      await flush(300);
      expect(rightSheet().getAttribute("data-state")).toBe("closed");
      expect(document.activeElement).toBe(downloadBtn());

      openPrint();
      await flush(50);
      fireEvent.click(screen.getByRole("button", { name: "Close Print layout" }));
      await flush(300);
      expect(document.activeElement).toBe(downloadBtn());
    });

    it("opening it at 1100 px overlays the rail with a scrim instead of pushing", () => {
      setWidth(1100);
      renderEditor();
      openPrint();
      const dialog = screen.getByRole("dialog", { name: "Print layout" });
      expect(dialog.parentElement?.getAttribute("data-mode")).toBe("overlay");
      expect(document.querySelector("[data-sheet-scrim]")).not.toBeNull();
      fireEvent.click(document.querySelector("[data-sheet-scrim]")!);
    });

    it("the warning follows Page Length: One Page warns for a 2-page resume, Two Pages does not", () => {
      patchTheme.mockResolvedValue({ kind: "ok", version: 5 });
      renderEditor();
      fireEvent.click(panelButton("Pick Template"));
      openPrint();
      expect(banner()?.textContent).toContain("Over 1 page");
      fireEvent.click(within(leftSheet()).getByRole("radio", { name: "Two Pages" }));
      expect(banner()).toBeNull();
      expect(rightSheet().querySelector("[data-print-summary]")!.textContent).toContain("2 pages");
      fireEvent.click(within(leftSheet()).getByRole("radio", { name: "One Page" }));
      expect(banner()?.textContent).toContain("Over 1 page");
    });

    it("Fit to one page runs the ladder and saves the rung through PATCH /doc/theme", async () => {
      contentAtStep0 = 1300;
      patchTheme.mockResolvedValue({ kind: "ok", version: 7 });
      renderEditor();
      openPrint();
      fireEvent.click(within(rightSheet()).getByRole("button", { name: "Fit to one page" }));
      expect(banner()).toBeNull(); // optimistic: the page re-measures at the new rung at once
      expect(within(rightSheet()).getAllByRole("img", { name: /^Page \d of 1$/ })).toHaveLength(1);
      await flush(500);
      expect(patchTheme).toHaveBeenCalledTimes(1);
      expect(patchTheme.mock.calls[0][1]).toMatchObject({ fit: { mode: "auto", target: 1, step: 5 }, _touched: ["fit"] });
    });

    it("Download PDF in the footer uses the same save-then-export path as the menu", async () => {
      putDoc.mockResolvedValue({ kind: "ok", version: 4, contentHash: null });
      exportPdf.mockResolvedValue({ kind: "ok", blob: new Blob(["%PDF"]), fileName: "r.pdf", pages: 2, fits: true, stored: true, contentHash: null, cached: false });
      renderEditor();
      openPrint();
      fireEvent.click(within(rightSheet()).getByRole("button", { name: "Download PDF" }));
      await flush(0);
      expect(exportPdf).toHaveBeenCalledWith(42);
      expect(checkpointDoc).not.toHaveBeenCalled(); // a view footer downloads; Save & Download is the menu item
      expect(saveBlob).toHaveBeenCalled();
    });

    it("the Print layout item is gone when the feature is switched off", () => {
      renderEditor({ ...DEFAULT_BUILDER_CONFIG, features: { ...DEFAULT_BUILDER_CONFIG.features, printLayout: false } });
      fireEvent.click(downloadBtn());
      expect(screen.queryByRole("menuitem", { name: /Print layout/ })).toBeNull();
      fireEvent.keyDown(document, { key: "p", code: "KeyP", altKey: true });
      expect(rightSheet().getAttribute("data-state")).toBe("closed");
    });
  });

  describe("Resume Score (Insights)", () => {
    const ring = () => screen.getAllByRole("meter", { name: "Resume score" })[0]!;
    const score = () => Number(ring().getAttribute("aria-valuenow"));
    const line = (group: string) => document.querySelector(`[data-group="${group}"]`)!.getAttribute("data-pass");
    const summary = () => document.querySelector('[data-field="i_sum0001.text"]') as HTMLTextAreaElement;
    // >= 150 characters, no first person, starts with the headline (S1, S2, S4, S5 pass: 10 of 13)
    const GOOD_SUMMARY =
      "Software Engineer building reliable backend services for fintech teams. Shipped payment APIs, cut latency and mentored a team of five across two continents.";

    it("scores the opened document: the ring, a band, and the checklist (a sixth ATS line on Modern)", () => {
      renderEditor();
      expect(score()).toBeGreaterThan(0);
      expect(screen.getAllByText(/Needs work|Getting there|Good progress|Great match!/).length).toBeGreaterThan(0);
      expect(document.querySelectorAll("[data-group]")).toHaveLength(6);
      expect(line("G1")).toBe("false");
    });

    it("updates live, 150 ms after an edit, and the checklist line flips", async () => {
      renderEditor();
      const before = score();
      expect(line("G1")).toBe("false");

      fireEvent.change(summary(), { target: { value: GOOD_SUMMARY } });
      await flush(149);
      expect(score()).toBe(before); // not yet
      await flush(1);
      expect(score()).toBeGreaterThan(before);
      expect(line("G1")).toBe("true");
      expect(screen.getAllByText("Clear and compelling summary").length).toBeGreaterThan(0);

      fireEvent.change(summary(), { target: { value: "Engineer." } });
      await flush(150);
      expect(score()).toBe(before);
      expect(line("G1")).toBe("false");
    });

    it("View tips opens the tips sheet with the failing rules; Go to closes it and focuses the field", async () => {
      renderEditor();
      fireEvent.click(screen.getAllByRole("button", { name: /View tips/ })[0]!);
      const dialog = screen.getByRole("dialog", { name: "Tips to improve" });
      expect(within(dialog).getByText("Add a 2–3 sentence summary saying what you do and for whom.")).toBeTruthy();
      expect(track).toHaveBeenCalledWith("resume_tips_opened", expect.objectContaining({ scope: "all" }));

      const s1 = dialog.querySelector('[data-rule="S1"]') as HTMLElement;
      fireEvent.click(within(s1).getByRole("button", { name: /Go to/ }));
      await flush(300);
      expect(screen.queryByRole("dialog", { name: "Tips to improve" })).toBeNull();
      expect((document.activeElement as HTMLElement).getAttribute("data-field")).toBe("i_sum0001.text");
    });

    it("a missing-section tip's Go to opens Add Section", async () => {
      renderEditor();
      fireEvent.click(screen.getAllByRole("button", { name: /View tips/ })[0]!);
      const f3 = screen.getByRole("dialog", { name: "Tips to improve" }).querySelector('[data-rule="F3"]') as HTMLElement;
      expect(f3.textContent).toContain("Add the missing section: Education.");
      fireEvent.click(within(f3).getByRole("button", { name: /Go to/ }));
      await flush(300);
      expect(leftSheet().getAttribute("data-state")).toBe("open");
    });

    it("the ATS line (Modern is an ATS template; the intern's year-only dates break A5) opens the ATS tips only", () => {
      renderEditor();
      const ats = document.querySelector("[data-ats-line]") as HTMLElement;
      expect(ats.textContent).toContain("1 of 5");
      fireEvent.click(ats);
      const dialog = screen.getByRole("dialog", { name: "ATS checks" });
      expect(within(dialog).getByText("Use month and year on every date.")).toBeTruthy();
      expect(within(dialog).queryByText("Add your LinkedIn or portfolio link.")).toBeNull();
    });

    it("fires resume_score_viewed once, with the score and band (no document content)", async () => {
      renderEditor();
      expect(track).toHaveBeenCalledWith("resume_score_viewed", { score: score(), band: expect.any(String) });
      fireEvent.change(summary(), { target: { value: GOOD_SUMMARY } });
      await flush(300);
      expect(track.mock.calls.filter(([e]) => e === "resume_score_viewed")).toHaveLength(1);
    });

    it("the saved document carries no score from the browser (the BFF computes it)", async () => {
      putDoc.mockResolvedValue({ kind: "ok", version: 4, contentHash: null });
      renderEditor();
      fireEvent.change(summary(), { target: { value: GOOD_SUMMARY } });
      await flush(800);
      expect(putDoc).toHaveBeenCalledTimes(1);
      expect(Object.keys(putDoc.mock.calls[0][2])).toEqual(["doc"]);
    });

    it("on a phone the Insights tab shows the score in the fullscreen rail", async () => {
      setWidth(390);
      renderEditor();
      fireEvent.click(within(screen.getByRole("tablist", { name: "Editor views" })).getByRole("tab", { name: "Insights" }));
      const rail = screen.getByRole("dialog", { name: "Insights" });
      expect(within(rail).getByRole("meter", { name: "Resume score" })).toBeTruthy();
      fireEvent.click(within(rail).getByRole("button", { name: /View tips/ }));
      const tips = screen.getByRole("dialog", { name: "Tips to improve" });
      const s1 = tips.querySelector('[data-rule="S1"]') as HTMLElement;
      fireEvent.click(within(s1).getByRole("button", { name: /Go to/ }));
      await flush(400);
      expect(screen.queryByRole("dialog")).toBeNull(); // both sheets closed
      expect((document.activeElement as HTMLElement).getAttribute("data-field")).toBe("i_sum0001.text");
    });
  });

  describe("resume header bar (R3.10)", () => {
    it("replaces the interim name field: the resume's name comes from its metadata, above the section tabs", async () => {
      renderEditor();
      await flush(0);
      expect(screen.queryByLabelText("Resume name")).toBeNull();
      const header = screen.getByRole("region", { name: "Resume details" });
      expect(within(header).getByRole("heading", { name: "Backend SWE" })).toBeTruthy();
      const tabs = screen.getByRole("navigation", { name: "Resume sections" });
      expect(header.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("Restore adopts the server's document, shows it as saved, and the next save is sent against its version", async () => {
      const restored = testDoc();
      const exp = restored.sections.find((s) => s.kind === "EXPERIENCE");
      if (exp && exp.kind === "EXPERIENCE" && exp.items[0].bullets) exp.items[0].bullets[0].text = "Restored bullet";
      restoreVersion.mockResolvedValue({ kind: "ok", value: { ...dto(), doc: restored, docVersion: 20 } });
      putDoc.mockResolvedValue({ kind: "ok", version: 21, contentHash: null });
      renderEditor();
      await flush(0);

      fireEvent.click(screen.getByRole("button", { name: /^Version 3/ }));
      await flush(0);
      fireEvent.click(screen.getByRole("button", { name: "Restore v6" }));
      fireEvent.click(within(screen.getByRole("dialog", { name: "Restore v6?" })).getByRole("button", { name: "Restore" }));
      await flush(0);

      expect(restoreVersion).toHaveBeenCalledWith(42, 6);
      expect(bullet().value).toBe("Restored bullet");
      expect(status()).toBe("saved");
      expect(putDoc).not.toHaveBeenCalled(); // adopting the server's copy is not an edit

      fireEvent.change(bullet(), { target: { value: "Then edited" } });
      await flush(800);
      expect(putDoc).toHaveBeenCalledTimes(1);
      expect(putDoc.mock.calls[0][1]).toBe(20);
    });
  });
});
