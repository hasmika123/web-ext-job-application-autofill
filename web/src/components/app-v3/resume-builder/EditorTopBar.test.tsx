import { createRef } from "react";
import type { RefObject } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PdfInfo } from "@/lib/resume-doc";
import type { LeftPanel } from "./state/ui";
import type { SaveStatus } from "./state/types";

vi.mock("next/link", () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));
vi.mock("@/components/marketing/BrandLogo", () => ({ default: () => <span>Kiwiply logo</span> }));

import EditorTopBar, { savedAgo, statusLabel } from "./EditorTopBar";

afterEach(cleanup);

const refs = (): Record<LeftPanel, RefObject<HTMLButtonElement | null>> => ({
  add: createRef(),
  template: createRef(),
  swap: createRef(),
  tailor: createRef(),
});

function bar(over: Partial<Parameters<typeof EditorTopBar>[0]> = {}) {
  const props = {
    status: "saved" as SaveStatus,
    savedAt: 1_000_000,
    now: 1_000_000,
    error: null,
    leftPanel: null as LeftPanel | null,
    onTogglePanel: vi.fn(),
    panelRefs: refs(),
    onDownloadPdf: vi.fn(),
    onDownloadText: vi.fn(),
    onClose: vi.fn(),
    ...over,
  };
  render(<EditorTopBar {...props} />);
  return props;
}

describe("status copy (DESIGN 10.2)", () => {
  const at = 10_000_000;
  it("saved: just now, N minutes, N hours (singular and plural)", () => {
    expect(savedAgo(at, at + 10_000)).toBe("Saved just now");
    expect(savedAgo(at, at + 44_000)).toBe("Saved just now");
    expect(savedAgo(at, at + 60_000)).toBe("Saved 1 minute ago");
    expect(savedAgo(at, at + 2 * 60_000)).toBe("Saved 2 minutes ago");
    expect(savedAgo(at, at + 59 * 60_000)).toBe("Saved 59 minutes ago");
    expect(savedAgo(at, at + 60 * 60_000)).toBe("Saved 1 hour ago");
    expect(savedAgo(at, at + 5 * 3_600_000)).toBe("Saved 5 hours ago");
    expect(savedAgo(null, at)).toBe("All changes saved");
  });

  it("every status has its words", () => {
    expect(statusLabel("saving", at, at, null)).toBe("Saving…");
    expect(statusLabel("retrying", at, at, null)).toBe("Not saved — retrying");
    expect(statusLabel("conflict", at, at, null)).toBe("Not saved — edited elsewhere");
    expect(statusLabel("error", at, at, "Too big")).toBe("Not saved — Too big");
    expect(statusLabel("error", at, at, null)).toBe("Not saved — something went wrong");
  });

  it("is a polite status region: green check when saved, spinner when saving, red when not saved", () => {
    bar({ status: "saved" });
    const s = screen.getByRole("status");
    expect(s.getAttribute("aria-live")).toBe("polite");
    expect(s.className).not.toContain("text-danger");
    expect(s.querySelector("svg")).not.toBeNull();
    cleanup();
    bar({ status: "retrying" });
    expect(screen.getByRole("status").className).toContain("text-danger");
    expect(screen.getByRole("status").textContent).toContain("Not saved — retrying");
    cleanup();
    bar({ status: "saving" });
    expect(screen.getByRole("status").querySelector("svg.animate-spin")).not.toBeNull();
  });
});

describe("EditorTopBar", () => {
  it("shows the kiwiply mark, 'Resume Builder' and no resume title", () => {
    bar();
    expect(screen.getByRole("heading", { name: "Resume Builder" })).toBeTruthy();
    expect(screen.getByText("Kiwiply logo")).toBeTruthy();
    expect(screen.queryByLabelText("Resume name")).toBeNull();
  });

  it("has the four panel toggles in board order with aria-pressed / aria-expanded / aria-controls", () => {
    bar();
    const group = screen.getByRole("group", { name: "Editor panels" });
    const buttons = Array.from(group.querySelectorAll("button"));
    expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual(["Add Section", "Pick Template", "Swap Section", "Tailor to Job"]);
    for (const b of buttons) {
      expect(b.getAttribute("aria-pressed")).toBe("false");
      expect(b.getAttribute("aria-expanded")).toBe("false");
      expect(b.getAttribute("aria-controls")).toBe("rb-left-sheet");
    }
    expect(buttons.map((b) => b.title)).toEqual([
      "Add Section (Alt+1)",
      "Pick Template (Alt+2)",
      "Swap Section (Alt+3)",
      "Tailor to Job (Alt+4)",
    ]);
  });

  it("the open panel's button is the only pressed one, with the green fill", () => {
    bar({ leftPanel: "swap" });
    const group = screen.getByRole("group", { name: "Editor panels" });
    const on = Array.from(group.querySelectorAll("button")).filter((b) => b.getAttribute("aria-pressed") === "true");
    expect(on.map((b) => b.getAttribute("aria-label"))).toEqual(["Swap Section"]);
    expect(on[0].getAttribute("aria-expanded")).toBe("true");
    expect(on[0].className).toContain("bg-accent");
    const off = group.querySelector('[aria-label="Add Section"]') as HTMLElement;
    expect(off.className).not.toContain("bg-accent");
  });

  it("pressing a toggle reports that panel", () => {
    const p = bar();
    fireEvent.click(screen.getByRole("button", { name: "Pick Template" }));
    expect(p.onTogglePanel).toHaveBeenCalledWith("template");
  });

  it("hides Tailor to Job when the feature is off", () => {
    bar({ showTailor: false });
    expect(screen.queryByRole("button", { name: "Tailor to Job" })).toBeNull();
  });

  it("Save reads Saved and is disabled when nothing changed since the last checkpoint", () => {
    bar({ onSave: vi.fn(), canSave: false });
    const save = screen.getByRole("button", { name: "Saved" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
  });

  it("Save is enabled when something changed and calls back", () => {
    const p = bar({ onSave: vi.fn(), canSave: true });
    const save = screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;
    expect(save.disabled).toBe(false);
    expect(save.title).toContain("Ctrl+S");
    fireEvent.click(save);
    expect(p.onSave).toHaveBeenCalledTimes(1);
  });

  it("Save shows Saving… while the checkpoint is written, and Saved for the 2 s after", () => {
    bar({ onSave: vi.fn(), canSave: true, saving: true });
    const busy = screen.getByRole("button", { name: "Saving…" }) as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
    expect(busy.getAttribute("aria-busy")).toBe("true");
    cleanup();
    bar({ onSave: vi.fn(), canSave: true, justSaved: true });
    expect(screen.getByRole("button", { name: "Saved" })).toBeTruthy();
  });

  it("Save ▾ → Save as version… asks for a name (at most 80 characters) and reports it", () => {
    const p = bar({ onSave: vi.fn(), onSaveAsVersion: vi.fn() });
    const chevron = screen.getAllByRole("button", { name: "Save options" }).find((b) => b.tagName === "BUTTON")!;
    fireEvent.click(chevron);
    fireEvent.click(screen.getByRole("menuitem", { name: "Save as version…" }));
    const dialog = screen.getByRole("dialog", { name: "Save as version" });
    const input = within(dialog).getByLabelText("Version name") as HTMLInputElement;
    expect(input.maxLength).toBe(80);
    expect((within(dialog).getByRole("button", { name: "Save version" }) as HTMLButtonElement).disabled).toBe(true); // a name is needed
    fireEvent.change(input, { target: { value: "  Before the Acme call " } });
    fireEvent.submit(dialog.querySelector("form")!);
    expect(p.onSaveAsVersion).toHaveBeenCalledWith("Before the Acme call");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("the Download menu: items, disabled states and handlers", () => {
    const p = bar({ onToggleView: vi.fn() });
    const trigger = screen.getAllByRole("button", { name: "Download" }).find((b) => b.tagName === "BUTTON")!;
    fireEvent.click(trigger);
    const items = screen.getAllByRole("menuitem");
    const names = items.map((i) => i.textContent);
    expect(names).toEqual(["Print layout", "PDF view", "Save & Download PDF", "Save & Download plain text (.txt)", "Save & Download DOCXComing soon"]);
    expect(items.map((i) => (i as HTMLButtonElement).disabled)).toEqual([false, false, false, false, true]);
    fireEvent.click(items[3]);
    expect(p.onDownloadText).toHaveBeenCalledTimes(1);
    expect(p.onDownloadPdf).not.toHaveBeenCalled();
  });

  it("PDF view toggles the right view and shows Open while it is the open one", () => {
    const p = bar({ onToggleView: vi.fn(), rightView: "pdf" });
    fireEvent.click(screen.getAllByRole("button", { name: "Download" }).find((b) => b.tagName === "BUTTON")!);
    const pdfItem = screen.getByRole("menuitem", { name: /PDF view/ });
    expect(pdfItem.textContent).toContain("Open");
    fireEvent.click(pdfItem);
    expect(p.onToggleView).toHaveBeenCalledWith("pdf");
  });

  it("the PDF view item is left out when the feature is off", () => {
    bar({ pdfView: false });
    fireEvent.click(screen.getAllByRole("button", { name: "Download" }).find((b) => b.tagName === "BUTTON")!);
    expect(screen.queryByRole("menuitem", { name: /PDF view/ })).toBeNull();
    expect(screen.getByRole("menuitem", { name: /Print layout/ })).toBeTruthy();
  });

  it("Print layout toggles the right view; the Download button is pressed while a view is open", () => {
    const p = bar({ onToggleView: vi.fn(), rightView: "print" });
    const trigger = screen.getAllByRole("button", { name: "Download" }).find((b) => b.tagName === "BUTTON")!;
    expect(trigger.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(trigger);
    const print = screen.getByRole("menuitem", { name: /Print layout/ });
    expect(print.textContent).toContain("Open");
    fireEvent.click(print);
    expect(p.onToggleView).toHaveBeenCalledWith("print");
    cleanup();
    bar({ onToggleView: vi.fn() });
    expect(screen.getAllByRole("button", { name: "Download" }).find((b) => b.tagName === "BUTTON")!.getAttribute("aria-pressed")).toBe("false");
  });

  it("the Print layout item is left out when the feature is off", () => {
    bar({ printLayout: false });
    fireEvent.click(screen.getAllByRole("button", { name: "Download" }).find((b) => b.tagName === "BUTTON")!);
    expect(screen.queryByRole("menuitem", { name: /Print layout/ })).toBeNull();
  });

  it("disables the two downloads while exporting or in conflict", () => {
    bar({ exporting: true });
    const trigger = screen.getAllByRole("button", { name: "Download" }).find((b) => b.tagName === "BUTTON")!;
    expect(trigger.getAttribute("aria-busy")).toBe("true");
    fireEvent.click(trigger);
    expect((screen.getByRole("menuitem", { name: "Save & Download PDF" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("✕ reports a close", () => {
    const p = bar();
    fireEvent.click(screen.getByRole("button", { name: "Close editor" }));
    expect(p.onClose).toHaveBeenCalled();
  });

  it("has no undo / redo buttons (they live on the keys and the section menu)", () => {
    bar();
    expect(screen.queryByRole("button", { name: /undo|redo/i })).toBeNull();
  });
});

describe("EditorTopBar PDF status suffix (R3.7)", () => {
  it.each(["PENDING", "RUNNING", "STALE"] as const)("%s shows '· PDF updating…' after the save status", (status) => {
    bar({ pdf: { status } });
    const suffix = document.querySelector('[data-pdf-status="updating"]');
    expect(suffix?.textContent).toContain("PDF updating…");
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    // the save status keeps its own message
    expect(document.querySelector("[data-save-status]")?.textContent).toContain("Saved");
  });

  it.each([undefined, null, { status: "NONE" }, { status: "READY" }] as Array<PdfInfo | null | undefined>)("shows nothing for %j", (pdf) => {
    bar({ pdf });
    expect(document.querySelector("[data-pdf-status]")).toBeNull();
    expect(screen.queryByText(/PDF updating|PDF couldn't/)).toBeNull();
  });

  it("FAILED shows \"PDF couldn't be made · Retry\" and Retry calls back", () => {
    const retry = vi.fn();
    bar({ pdf: { status: "FAILED", error: "boom" }, onPdfRetry: retry });
    const suffix = document.querySelector('[data-pdf-status="failed"]');
    expect(suffix?.textContent).toContain("PDF couldn't be made");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
