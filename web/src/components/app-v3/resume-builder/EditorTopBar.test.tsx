import { createRef } from "react";
import type { RefObject } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SAVED_TICK_MS, TOOLTIP_DELAY_MS, useSavedFlash } from "@kiwiply/ui";
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

const chipText = () => document.querySelector("[data-save-status]")?.textContent?.replace(/Retry$/, "").trim();

function barEl(over: Partial<Parameters<typeof EditorTopBar>[0]> = {}) {
  return <EditorTopBar {...barProps(over)} />;
}
function renderBar(over: Partial<Parameters<typeof EditorTopBar>[0]> = {}) {
  return render(barEl(over));
}
function barProps(over: Partial<Parameters<typeof EditorTopBar>[0]> = {}) {
  return {
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
}
function bar(over: Partial<Parameters<typeof EditorTopBar>[0]> = {}) {
  const props = barProps(over);
  render(<EditorTopBar {...props} />);
  return props;
}

describe("status copy (DESIGN 10.2)", () => {
  const at = 10_000_000;
  it("saved: just now, N minutes, N hours (singular and plural)", () => {
    expect(savedAgo(at, at + 10_000)).toBe("Saved");
    expect(savedAgo(at, at + 44_000)).toBe("Saved");
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
    expect(statusLabel("saved", at, at, null, false)).toBe("Offline — changes will save when you're back");
  });

  it("is a polite status region: green check when saved, spinner when saving", () => {
    bar({ status: "saved" });
    const s = screen.getByRole("status");
    expect(s.getAttribute("aria-live")).toBe("polite");
    expect(s.getAttribute("data-save-tone")).toBe("calm");
    expect(s.querySelector("svg")).not.toBeNull();
    cleanup();
    bar({ status: "saving" });
    expect(screen.getByRole("status").querySelector("svg.animate-spin")).not.toBeNull();
    expect(screen.getByRole("status").getAttribute("data-save-tone")).toBe("calm");
  });
});

describe("the save status chip (Notion-style autosave, DECISIONS #32)", () => {
  const at = 10_000_000;

  it("saving -> Saved -> relative time, all subtle", () => {
    const { rerender } = renderBar({ status: "saving" });
    expect(chipText()).toBe("Saving…");
    rerender(barEl({ status: "saved", savedAt: at, now: at + 5_000 }));
    expect(chipText()).toBe("Saved");
    expect(screen.getByRole("status").getAttribute("data-save-tone")).toBe("calm");
    rerender(barEl({ status: "saved", savedAt: at, now: at + 2 * 60_000 }));
    expect(chipText()).toBe("Saved 2 minutes ago");
  });

  it("a failing save is loud amber with a Retry that tries again", () => {
    const retry = vi.fn();
    bar({ status: "retrying", onRetrySave: retry });
    const chip = screen.getByRole("status");
    expect(chip.getAttribute("data-save-tone")).toBe("warn");
    expect(chip.className).toContain("bg-v2-amber-soft");
    expect(chipText()).toContain("Not saved — retrying");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("a refused save is red with Retry; an edit conflict has no Retry (the dialog asks)", () => {
    bar({ status: "error", error: "Too big", onRetrySave: vi.fn() });
    expect(screen.getByRole("status").getAttribute("data-save-tone")).toBe("error");
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    cleanup();
    bar({ status: "conflict", onRetrySave: vi.fn() });
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("offline is loud amber and says changes will save when you're back", () => {
    bar({ status: "saved", online: false, onRetrySave: vi.fn() });
    const chip = screen.getByRole("status");
    expect(chip.getAttribute("data-save-status")).toBe("offline");
    expect(chip.getAttribute("data-save-tone")).toBe("warn");
    expect(chipText()).toContain("Offline — changes will save when you're back");
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });

  it("is in the bar at every width: no responsive hide on the chip or on any ancestor up to the header", () => {
    bar({ status: "retrying" });
    for (let el: HTMLElement | null = screen.getByRole("status"); el && el.tagName !== "HEADER"; el = el.parentElement) {
      expect(el.className).not.toMatch(/(^|\s)(max-[a-z]+:)?hidden(\s|$)/);
      expect(el.className).not.toMatch(/(^|\s)(sm|md|lg):(hidden|sr-only)/);
    }
    expect(screen.getByRole("status").closest("header")).not.toBeNull();
  });

  it("on a phone the PDF text sits right after the save chip (same order class), not before the close button", () => {
    bar({ status: "saved", pdf: { status: "PENDING" } });
    const cls = document.querySelector('[data-pdf-status="updating"]')?.className ?? "";
    expect(cls).toContain("order-2");
    expect(cls).toContain("md:order-none");
  });

  it("the PDF state stays a separate secondary text beside it", () => {
    bar({ status: "saved", pdf: { status: "PENDING" } });
    expect(document.querySelector('[data-pdf-status="updating"]')?.textContent).toContain("PDF updating…");
    expect(chipText()).toBe("Saved");
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
    // the tooltips carry the name and the shortcut (keyboard focus shows it)
    vi.useFakeTimers();
    const words = ["Add Section (Alt+1)", "Pick Template (Alt+2)", "Swap Section (Alt+3)", "Tailor to Job (Alt+4)"];
    buttons.forEach((b, i) => {
      fireEvent.focus(b);
      act(() => void vi.advanceTimersByTime(TOOLTIP_DELAY_MS + 10));
      expect(document.querySelector("[data-tooltip]")?.textContent).toBe(words[i]);
      fireEvent.blur(b);
    });
    vi.useRealTimers();
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

  it("has no Save button and no Save options menu (autosave; versions live in the header's Version menu)", () => {
    bar();
    expect(screen.queryByRole("button", { name: /^save/i })).toBeNull();
    expect(screen.queryByRole("button", { name: "Save options" })).toBeNull();
    expect(document.querySelector("[data-save-button]")).toBeNull();
  });

  it("an Add Section / Pick Template change shows the inline saved tick on its button", () => {
    function Host() {
      const f = useSavedFlash<"section" | "template">();
      return (
        <>
          <button type="button" onClick={() => f.flash("section")}>
            flash
          </button>
          <EditorTopBar {...barProps({ savedFlash: f })} />
        </>
      );
    }
    vi.useFakeTimers();
    render(<Host />);
    expect(document.querySelector("[data-saved-tick]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "flash" }));
    const tick = document.querySelector('[data-saved-tick="section"]');
    expect(tick).not.toBeNull();
    expect(screen.getByRole("button", { name: "Add Section" }).parentElement?.parentElement?.contains(tick)).toBe(true);
    act(() => void vi.advanceTimersByTime(SAVED_TICK_MS + 10));
    expect(document.querySelector("[data-saved-tick]")).toBeNull();
    vi.useRealTimers();
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
