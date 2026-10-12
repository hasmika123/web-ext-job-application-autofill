import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@kiwiply/ui";
import type { ExportPdfResult, ExportTextResult, ResumeDocDTO, SaveResult } from "@/lib/resume-doc";
import { testDoc } from "./state/test-doc";

const putDoc = vi.fn<(id: number, version: number, body: { doc: ReturnType<typeof testDoc> }) => Promise<SaveResult>>();
const exportPdf = vi.fn<(id: number) => Promise<ExportPdfResult>>();
const exportText = vi.fn<(id: number) => Promise<ExportTextResult>>();
const saveBlob = vi.fn();
const push = vi.fn();
vi.mock("@/lib/resume-doc", async (orig) => ({
  ...(await orig<typeof import("@/lib/resume-doc")>()),
  putDoc: (...a: Parameters<typeof putDoc>) => putDoc(...a),
  exportPdf: (id: number) => exportPdf(id),
  exportText: (id: number) => exportText(id),
  saveBlob: (...a: unknown[]) => saveBlob(...a),
}));
vi.mock("@/lib/api", () => ({ serverApiFetch: vi.fn() })); // resume-builder-config imports it (server only)
vi.mock("next/link", () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/components/marketing/BrandLogo", () => ({ default: () => <span>Kiwiply logo</span> }));

import { DEFAULT_BUILDER_CONFIG, type ResumeBuilderConfig } from "@/lib/resume-builder-config";
import ResumeEditor from "./ResumeEditor";

const setWidth = (w: number) => {
  Object.defineProperty(window, "innerWidth", { value: w, configurable: true, writable: true });
};

const renderEditor = (config: ResumeBuilderConfig = DEFAULT_BUILDER_CONFIG, updatedAt: string | null = null) =>
  render(
    <ToastProvider>
      <ResumeEditor initial={{ ...dto(), updatedAt }} plan="FREE" config={config} />
    </ToastProvider>,
  );

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
  exportPdf.mockReset();
  exportText.mockReset();
  saveBlob.mockReset();
  push.mockReset();
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
      expect((screen.getByLabelText("Resume name") as HTMLInputElement).value).toBe("Their copy");
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

    it("shows each panel's shell with its header and the story it waits for", () => {
      renderEditor();
      const cases: Array<[string, string]> = [
        ["Add Section", "R2.12"],
        ["Pick Template", "R2.4"],
        ["Swap Section", "R2.2"],
        ["Tailor to Job", "R5.8"],
      ];
      for (const [name, story] of cases) {
        fireEvent.click(panelButton(name));
        expect(within(leftSheet()).getByRole("heading", { name })).toBeTruthy();
        expect(leftSheet().textContent).toContain(`Coming in ${story}`);
      }
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
    it("Free: Insights placeholder, a locked AI card, the Job Match empty state", () => {
      renderEditor();
      expect(screen.getByText("Score arrives in R2.5.")).toBeTruthy();
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

    it("Preview is a placeholder sheet with Print layout | PDF view", () => {
      renderEditor();
      fireEvent.click(within(tabBar()).getByRole("tab", { name: "Preview" }));
      const dialog = screen.getByRole("dialog", { name: "Preview" });
      expect(within(dialog).getByRole("radio", { name: "PDF view" })).toBeTruthy();
      expect(dialog.textContent).toContain("Coming in R3.8");
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
      ...over,
    });
    // The Menu primitive wraps its trigger in a role=button span: the real <button> is the inner one.
    const downloadBtn = () => screen.getAllByRole("button", { name: "Download" }).find((b) => b.tagName === "BUTTON") as HTMLButtonElement;
    const openMenu = () => fireEvent.click(downloadBtn());
    const item = (name: string | RegExp) => screen.getByRole("menuitem", { name }) as HTMLButtonElement;
    const downloadPdf = () => {
      openMenu();
      fireEvent.click(item("Download PDF"));
    };

    it("lists Print layout / PDF view (soon), Download PDF, plain text and DOCX (soon)", () => {
      renderEditor();
      openMenu();
      const items = screen.getAllByRole("menuitem");
      expect(items.map((i) => i.textContent)).toEqual([
        "Print layoutComing soon",
        "PDF viewComing soon",
        "Download PDF",
        "Download plain text (.txt)",
        "Download DOCXComing soon",
      ]);
      expect(items.map((i) => i.getAttribute("aria-disabled") === "true")).toEqual([true, true, false, false, true]);
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
      expect(item("Download PDF").getAttribute("aria-disabled")).toBe("true");
      fireEvent.click(item("Download PDF"));
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
      expect(screen.getByText("Couldn't export yet")).toBeTruthy();
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
      expect(item("Download PDF").getAttribute("aria-disabled")).toBe("true");
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
});
