import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BOTTOM_INSET_VAR, resolveCapabilities } from "@kiwiply/ui";
import type { ResumeDocument } from "@kiwiply/ui";
import type { ExportPdfResult, PdfInfo } from "@/lib/resume-doc";
import { testDoc } from "../state/test-doc";

const exportPdf = vi.fn<(id: number) => Promise<ExportPdfResult>>();
const saveBlob = vi.fn();
vi.mock("@/lib/resume-doc", async (orig) => ({
  ...(await orig<typeof import("@/lib/resume-doc")>()),
  exportPdf: (id: number) => exportPdf(id),
  saveBlob: (...a: unknown[]) => saveBlob(...a),
}));

import PdfView from "./PdfView";

const caps = resolveCapabilities("modern", {});
const okPdf = (over: Partial<Extract<ExportPdfResult, { kind: "ok" }>> = {}): ExportPdfResult => ({
  kind: "ok",
  blob: new Blob(["%PDF"], { type: "application/pdf" }),
  fileName: "Backend-SWE.pdf",
  pages: 2,
  fits: true,
  stored: true,
  contentHash: null,
  cached: true,
  ...over,
});

const flush = (ms = 300) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

interface Props {
  doc: ResumeDocument;
  theme: null;
  prepare: () => Promise<boolean>;
  autoRefresh: boolean;
  pdfInfo: PdfInfo | null;
  onStored: () => void;
  disabled: boolean;
}

function view(over: Partial<Props> = {}) {
  const props: Props = {
    doc: testDoc(),
    theme: null,
    prepare: vi.fn(async () => true),
    autoRefresh: false,
    pdfInfo: { status: "READY", hash: "h" },
    onStored: vi.fn(),
    disabled: false,
    ...over,
  };
  const el = (p: Props) => <PdfView resumeId={42} templateId="modern" caps={caps} {...p} />;
  const utils = render(el(props));
  return { props, ...utils, rerenderWith: (next: Partial<Props>) => utils.rerender(el({ ...props, ...next })) };
}

/** jsdom has no layout: make `.sticky` compute as sticky and give the bar a rect 100 px tall at the window's bottom edge. */
function stickyBarAtBottom() {
  const style = document.createElement("style");
  style.textContent = ".sticky{position:sticky}";
  document.head.appendChild(style);
  vi.spyOn(window, "innerHeight", "get").mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const bar = this.classList.contains("sticky") && this.classList.contains("bottom-0");
    return { top: bar ? 700 : 0, bottom: bar ? 800 : 0, height: bar ? 100 : 0, left: 0, right: 0, width: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  });
  return () => {
    style.remove();
    vi.restoreAllMocks();
  };
}

const frame = () => screen.queryByTitle("PDF preview");
const state = () => document.querySelector("[data-pdf-view]")!.getAttribute("data-pdf-state");

beforeEach(() => {
  vi.useFakeTimers();
  exportPdf.mockReset();
  saveBlob.mockReset();
  URL.createObjectURL = vi.fn(() => "blob:the-pdf");
  URL.revokeObjectURL = vi.fn();
  Object.defineProperty(navigator, "pdfViewerEnabled", { value: undefined, configurable: true });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("PdfView (R3.3, DESIGN 10.8)", () => {
  it("saves first, then shows the stored PDF in the native viewer (no render when it was cached)", async () => {
    exportPdf.mockResolvedValue(okPdf());
    const { props } = view();
    expect(state()).toBe("loading"); // READY behind it: it only has to be fetched
    await flush();
    expect(props.prepare).toHaveBeenCalledTimes(1);
    expect(exportPdf).toHaveBeenCalledTimes(1);
    expect(exportPdf).toHaveBeenCalledWith(42);
    expect(frame()?.getAttribute("src")).toBe("blob:the-pdf#toolbar=0&view=FitH");
    expect(state()).toBe("ready");
    expect(screen.getByText("PDF · your saved copy")).toBeTruthy(); // the server gave no time: never "just now"
    expect(props.onStored).not.toHaveBeenCalled(); // nothing new was stored
  });

  it("dates a stored copy by the server's generatedAt, and a fresh render as just now", async () => {
    exportPdf.mockResolvedValue(okPdf());
    view({ pdfInfo: { status: "READY", hash: "h", generatedAt: new Date(Date.now() - 3 * 60_000).toISOString() } });
    await flush();
    expect(screen.getByText("PDF · generated 3 minutes ago")).toBeTruthy();
    cleanup();
    exportPdf.mockResolvedValue(okPdf({ cached: false }));
    view({ pdfInfo: { status: "NONE" } });
    await flush();
    expect(screen.getByText("PDF · generated just now")).toBeTruthy();
  });

  it("says it is making the PDF when none is stored yet, and tells the editor a render stored one", async () => {
    exportPdf.mockResolvedValue(okPdf({ cached: false }));
    const { props } = view({ pdfInfo: { status: "NONE" } });
    expect(state()).toBe("generating");
    expect(screen.getByText("Making your PDF…")).toBeTruthy();
    await flush();
    expect(frame()).toBeTruthy();
    expect(props.onStored).toHaveBeenCalledTimes(1);
  });

  it("shows the busy copy with Retry on a 503 PDF_BUSY, and Retry tries again", async () => {
    exportPdf.mockResolvedValueOnce({ kind: "error", status: 503, code: "PDF_BUSY", message: "busy" });
    view();
    await flush();
    const alert = screen.getByRole("alert");
    expect(alert.getAttribute("data-pdf-error")).toBe("busy");
    expect(alert.textContent).toContain("The PDF service is busy — try again in a moment.");
    exportPdf.mockResolvedValueOnce(okPdf());
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    await flush();
    expect(exportPdf).toHaveBeenCalledTimes(2);
    expect(frame()).toBeTruthy();
  });

  it("shows the server's message on any other failure", async () => {
    exportPdf.mockResolvedValue({ kind: "error", status: 500, code: "PDF_FAILED", message: "Couldn't make the PDF. Please try again." });
    view();
    await flush();
    expect(screen.getByRole("alert").getAttribute("data-pdf-error")).toBe("failed");
    expect(screen.getByRole("alert").textContent).toContain("Couldn't make the PDF. Please try again.");
    expect(frame()).toBeNull();
  });

  it("does not export when the latest edit could not be saved", async () => {
    view({ prepare: vi.fn(async () => false) });
    await flush();
    expect(exportPdf).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("aren't saved yet");
  });

  it("a changed document flips the header to stale with Refresh; Refresh makes the PDF again", async () => {
    exportPdf.mockResolvedValue(okPdf());
    const { rerenderWith, props } = view();
    await flush();
    expect(state()).toBe("ready");
    rerenderWith({ doc: { ...props.doc, meta: { title: "Changed" } } });
    expect(state()).toBe("stale");
    expect(screen.getByText(/Document changed since this PDF/)).toBeTruthy();
    expect(exportPdf).toHaveBeenCalledTimes(1); // never re-renders by itself (Chromium is shared)
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await flush();
    expect(exportPdf).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/Document changed since this PDF/)).toBeNull();
  });

  it("with resume.pdf.viewAutoRefresh on, a stale PDF is re-made once typing pauses", async () => {
    exportPdf.mockResolvedValue(okPdf());
    const { rerenderWith, props } = view({ autoRefresh: true });
    await flush();
    rerenderWith({ doc: { ...props.doc, meta: { title: "Changed" } } });
    expect(state()).toBe("stale");
    await flush(5000);
    expect(exportPdf).toHaveBeenCalledTimes(2);
    expect(state()).toBe("ready");
  });

  it("an edit made while the PDF is being made makes it stale on arrival", async () => {
    let done!: (r: ExportPdfResult) => void;
    exportPdf.mockReturnValue(new Promise<ExportPdfResult>((resolve) => (done = resolve)));
    const { rerenderWith, props } = view();
    await flush();
    rerenderWith({ doc: { ...props.doc, meta: { title: "Typed meanwhile" } } });
    await act(async () => done(okPdf()));
    expect(state()).toBe("stale");
  });

  it("Download saves the shown file without rendering again", async () => {
    exportPdf.mockResolvedValue(okPdf());
    view();
    expect((screen.getByRole("button", { name: "Download PDF" }) as HTMLButtonElement).disabled).toBe(true); // nothing to save yet
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Download PDF" }));
    expect(saveBlob).toHaveBeenCalledWith(expect.any(Blob), "Backend-SWE.pdf");
    expect(exportPdf).toHaveBeenCalledTimes(1);
    expect(screen.getByText("2 pages", { exact: false })).toBeTruthy();
  });

  it("a browser with no inline PDF viewer gets Open PDF and Download instead of the iframe", async () => {
    Object.defineProperty(navigator, "pdfViewerEnabled", { value: false, configurable: true });
    exportPdf.mockResolvedValue(okPdf());
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    view();
    await flush();
    expect(frame()).toBeNull();
    const fallback = document.querySelector("[data-pdf-fallback]") as HTMLElement;
    fireEvent.click(within(fallback).getByRole("button", { name: "Open PDF" }));
    expect(open).toHaveBeenCalledWith("blob:the-pdf", "_blank", "noopener");
    fireEvent.click(within(fallback).getByRole("button", { name: "Download" }));
    expect(saveBlob).toHaveBeenCalled();
    open.mockRestore();
  });

  it("has the 'How an ATS sees it' tab as a placeholder", async () => {
    exportPdf.mockResolvedValue(okPdf());
    view();
    await flush();
    fireEvent.click(screen.getByRole("tab", { name: "How an ATS sees it" }));
    expect(document.querySelector("[data-ats-placeholder]")).toBeTruthy();
    expect(frame()).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "PDF" }));
    expect(frame()).toBeTruthy(); // the file is still there
  });

  it("revokes its blob URL on close", async () => {
    exportPdf.mockResolvedValue(okPdf());
    const { unmount } = view();
    await flush();
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:the-pdf");
  });

  it("registers its sticky bottom bar with useBottomBar so the bug-report button lifts above it", async () => {
    exportPdf.mockResolvedValue(okPdf());
    const undo = stickyBarAtBottom();
    const { unmount } = view();
    await flush();
    expect(document.documentElement.style.getPropertyValue(BOTTOM_INSET_VAR)).toBe("100px");
    expect(document.documentElement.hasAttribute("data-bottom-bar")).toBe(true);
    unmount();
    expect(document.documentElement.style.getPropertyValue(BOTTOM_INSET_VAR)).toBe("");
    undo();
  });
});
