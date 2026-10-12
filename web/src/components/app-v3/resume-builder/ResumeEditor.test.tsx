import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@kiwiply/ui";
import type { ExportPdfResult, ResumeDocDTO, SaveResult } from "@/lib/resume-doc";
import { testDoc } from "./state/test-doc";

const putDoc = vi.fn<(id: number, version: number, body: { doc: ReturnType<typeof testDoc> }) => Promise<SaveResult>>();
const exportPdf = vi.fn<(id: number) => Promise<ExportPdfResult>>();
const saveBlob = vi.fn();
vi.mock("@/lib/resume-doc", async (orig) => ({
  ...(await orig<typeof import("@/lib/resume-doc")>()),
  putDoc: (...a: Parameters<typeof putDoc>) => putDoc(...a),
  exportPdf: (id: number) => exportPdf(id),
  saveBlob: (...a: unknown[]) => saveBlob(...a),
}));
vi.mock("next/link", () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));

import ResumeEditor from "./ResumeEditor";

const renderEditor = () =>
  render(
    <ToastProvider>
      <ResumeEditor initial={dto()} plan="FREE" />
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

beforeEach(() => {
  vi.useFakeTimers();
  putDoc.mockReset();
  exportPdf.mockReset();
  saveBlob.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ResumeEditor", () => {
  it("opens on the experience section, previews the document and starts as saved", () => {
    renderEditor();
    expect(status()).toBe("saved");
    expect(bullet().value).toBe("Led migration");
    // The live preview renders the real template.
    expect(document.querySelector(".rz-page")?.textContent).toContain("Priya Sharma");
  });

  it("types, then autosaves 800 ms later with the loaded version and shows Saved · just now", async () => {
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
    expect(statusText()).toContain("Saved · just now");
    expect(document.querySelector(".rz-page")?.textContent).toContain("Led the migration");
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

  it("undo / redo buttons and Ctrl/⌘ Z shortcuts", async () => {
    putDoc.mockResolvedValue({ kind: "ok", version: 4, contentHash: null });
    renderEditor();
    const undo = screen.getByRole("button", { name: "Undo" }) as HTMLButtonElement;
    const redo = screen.getByRole("button", { name: "Redo" }) as HTMLButtonElement;
    expect(undo.disabled).toBe(true);

    fireEvent.change(bullet(), { target: { value: "Changed" } });
    expect(undo.disabled).toBe(false);

    fireEvent.keyDown(document, { key: "z", ctrlKey: true });
    expect(bullet().value).toBe("Led migration");
    expect(redo.disabled).toBe(false);

    fireEvent.keyDown(document, { key: "z", metaKey: true, shiftKey: true });
    expect(bullet().value).toBe("Changed");

    fireEvent.click(undo);
    expect(bullet().value).toBe("Led migration");
    fireEvent.click(redo);
    expect(bullet().value).toBe("Changed");
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
      expect((screen.getByRole("button", { name: "Undo" }) as HTMLButtonElement).disabled).toBe(true);
    });
  });

  it("phone tabs switch between the editor and the preview", () => {
    renderEditor();
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["edit", "preview"]);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    fireEvent.click(tabs[1]);
    expect(tabs[1].getAttribute("aria-selected")).toBe("true");
    expect(screen.getByLabelText("Editor").className).toContain("max-md:hidden");
    expect(screen.getByLabelText("Live preview").className).not.toContain("max-md:hidden");
  });

  describe("Export PDF", () => {
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
    const exportBtn = () => screen.getByRole("button", { name: /Export PDF|Making PDF/ }) as HTMLButtonElement;

    it("saves pending edits first, then exports and downloads the PDF", async () => {
      putDoc.mockResolvedValue({ kind: "ok", version: 4, contentHash: null });
      exportPdf.mockResolvedValue(okPdf());
      renderEditor();
      fireEvent.change(bullet(), { target: { value: "Edited right before export" } });
      expect(putDoc).not.toHaveBeenCalled(); // still inside the 800 ms debounce

      fireEvent.click(exportBtn());
      await flush(0);

      expect(putDoc).toHaveBeenCalledTimes(1); // flushed by the export, not by the timer
      expect(firstBullet(putDoc.mock.calls[0][2].doc)).toBe("Edited right before export");
      expect(exportPdf).toHaveBeenCalledWith(42);
      expect(putDoc.mock.invocationCallOrder[0]).toBeLessThan(exportPdf.mock.invocationCallOrder[0]);
      expect(saveBlob).toHaveBeenCalledWith(expect.any(Blob), "Backend-SWE.pdf");
      expect(screen.getByText("PDF ready")).toBeTruthy();
      expect(exportBtn().disabled).toBe(false);
    });

    it("shows a busy state while the PDF is being made and ignores a second click", async () => {
      let done!: (r: ExportPdfResult) => void;
      exportPdf.mockReturnValue(new Promise<ExportPdfResult>((resolve) => (done = resolve)));
      renderEditor();
      fireEvent.click(exportBtn());
      await flush(0);
      expect(exportBtn().disabled).toBe(true);
      expect(exportBtn().textContent).toContain("Making PDF");
      fireEvent.click(exportBtn());
      expect(exportPdf).toHaveBeenCalledTimes(1);
      await act(async () => done(okPdf()));
      expect(exportBtn().textContent).toContain("Export PDF");
    });

    it("reports a service error and downloads nothing", async () => {
      exportPdf.mockResolvedValue({ kind: "error", status: 503, code: "PDF_BUSY", message: "The PDF service is busy - try again in a few seconds." });
      renderEditor();
      fireEvent.click(exportBtn());
      await flush(0);
      expect(saveBlob).not.toHaveBeenCalled();
      expect(screen.getByText("Couldn't make the PDF")).toBeTruthy();
      expect(screen.getByText(/service is busy/)).toBeTruthy();
    });

    it("does not export a stale document when the latest edit could not be saved", async () => {
      putDoc.mockResolvedValue({ kind: "invalid", path: "$", message: "nope" });
      renderEditor();
      fireEvent.change(bullet(), { target: { value: "Unsaveable" } });
      fireEvent.click(exportBtn());
      await flush(0);
      expect(exportPdf).not.toHaveBeenCalled();
      expect(screen.getByText("Couldn't export yet")).toBeTruthy();
    });

    it("says so when the PDF downloaded but could not be attached to the resume", async () => {
      exportPdf.mockResolvedValue(okPdf({ stored: false }));
      renderEditor();
      fireEvent.click(exportBtn());
      await flush(0);
      expect(screen.getByText(/couldn't be attached/)).toBeTruthy();
    });

    it("is disabled while a conflict is unresolved", async () => {
      putDoc.mockResolvedValueOnce({ kind: "conflict", serverVersion: 9, doc: testDoc() });
      renderEditor();
      fireEvent.change(bullet(), { target: { value: "Mine" } });
      await flush(800);
      expect(exportBtn().disabled).toBe(true);
    });
  });
});
