import { createRef } from "react";
import type { RefObject } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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

  it("Save is a disabled stub that mirrors autosave (Saved / Save)", () => {
    bar({ status: "saved" });
    const save = screen.getByRole("button", { name: "Saved" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    cleanup();
    bar({ status: "saving" });
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("the Download menu: items, disabled states and handlers", () => {
    const p = bar();
    const trigger = screen.getAllByRole("button", { name: "Download" }).find((b) => b.tagName === "BUTTON")!;
    fireEvent.click(trigger);
    const items = screen.getAllByRole("menuitem");
    const names = items.map((i) => i.textContent);
    expect(names).toEqual(["Print layoutComing soon", "PDF viewComing soon", "Download PDF", "Download plain text (.txt)", "Download DOCXComing soon"]);
    expect(items.map((i) => (i as HTMLButtonElement).disabled)).toEqual([true, true, false, false, true]);
    fireEvent.click(items[3]);
    expect(p.onDownloadText).toHaveBeenCalledTimes(1);
    expect(p.onDownloadPdf).not.toHaveBeenCalled();
  });

  it("disables the two downloads while exporting or in conflict", () => {
    bar({ exporting: true });
    const trigger = screen.getAllByRole("button", { name: "Download" }).find((b) => b.tagName === "BUTTON")!;
    expect(trigger.getAttribute("aria-busy")).toBe("true");
    fireEvent.click(trigger);
    expect((screen.getByRole("menuitem", { name: "Download PDF" }) as HTMLButtonElement).disabled).toBe(true);
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
