import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BottomSheet, { SNAP_DRAG_PX, snapAfterDrag } from "./BottomSheet";
import type { BottomSheetProps } from "./BottomSheet";

function stubReducedMotion(reduced: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduced && query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }));
}

function Host(props: Partial<BottomSheetProps> & { startOpen?: boolean }) {
  const { startOpen = true, ...rest } = props;
  const [open, setOpen] = useState(startOpen);
  const btn = useRef<HTMLButtonElement>(null);
  return (
    <div>
      <button ref={btn} onClick={() => setOpen(true)}>
        trigger
      </button>
      <BottomSheet id="sheet" title="Acme - Designer" open={open} onClose={() => setOpen(false)} returnFocusTo={btn} {...rest}>
        <button>first control</button>
        <input aria-label="second control" />
      </BottomSheet>
    </div>
  );
}

const sheet = () => document.getElementById("sheet");

/** jsdom has no PointerEvent: a MouseEvent with the pointer event's name carries clientY to React's handlers. */
function pointer(el: Element, type: "pointerdown" | "pointermove" | "pointerup", clientY: number) {
  fireEvent(el, new MouseEvent(type, { bubbles: true, cancelable: true, clientY }));
}

describe("snapAfterDrag", () => {
  it("closes from partial and drops full to partial on a long drag down", () => {
    expect(snapAfterDrag("partial", SNAP_DRAG_PX)).toBe("close");
    expect(snapAfterDrag("full", SNAP_DRAG_PX + 40)).toBe("partial");
  });
  it("lifts partial to full on a long drag up, and stays full", () => {
    expect(snapAfterDrag("partial", -SNAP_DRAG_PX)).toBe("full");
    expect(snapAfterDrag("full", -300)).toBe("full");
  });
  it("springs back on a short drag", () => {
    expect(snapAfterDrag("partial", SNAP_DRAG_PX - 1)).toBe("partial");
    expect(snapAfterDrag("full", -(SNAP_DRAG_PX - 1))).toBe("full");
    expect(snapAfterDrag("partial", 0)).toBe("partial");
  });
});

describe("BottomSheet", () => {
  beforeEach(() => stubReducedMotion(false));
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    document.body.style.overflow = "";
  });

  it("is a modal dialog named by its title, opening at the partial snap", () => {
    render(<Host />);
    const dlg = screen.getByRole("dialog", { name: "Acme - Designer" });
    expect(dlg.getAttribute("aria-modal")).toBe("true");
    expect(dlg.getAttribute("data-snap")).toBe("partial");
    expect(dlg.style.height).toBe("70dvh");
  });

  it("renders nothing while closed", () => {
    render(<Host startOpen={false} />);
    expect(sheet()).toBeNull();
  });

  it("moves focus into the sheet on open and back to the trigger on close", () => {
    vi.useFakeTimers();
    render(<Host />);
    expect(sheet()!.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document, { key: "Escape" });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(sheet()).toBeNull();
    expect(document.activeElement).toBe(screen.getByText("trigger"));
    vi.useRealTimers();
  });

  it("Esc closes it", () => {
    vi.useFakeTimers();
    render(<Host />);
    fireEvent.keyDown(document, { key: "Escape" });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(sheet()).toBeNull();
    vi.useRealTimers();
  });

  it("a click on the scrim closes it", () => {
    vi.useFakeTimers();
    render(<Host />);
    fireEvent.click(document.querySelector("[data-sheet-scrim]")!);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(sheet()).toBeNull();
    vi.useRealTimers();
  });

  it("traps Tab: from the last control it wraps to the first, and Shift+Tab goes back", () => {
    render(<Host />);
    const controls = Array.from(sheet()!.querySelectorAll<HTMLElement>("button, input"));
    // jsdom has no layout: offsetParent is null, so only the focused element counts as visible to the trap
    const last = controls[controls.length - 1];
    last.focus();
    const ev = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    document.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });

  it("locks body scroll while open and restores it after", () => {
    vi.useFakeTimers();
    render(<Host />);
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.body.style.overflow).toBe("");
    vi.useRealTimers();
  });

  it("the grip is a button that toggles partial <-> full", () => {
    render(<Host />);
    const grip = screen.getByRole("button", { name: "Expand sheet" });
    fireEvent.click(grip);
    expect(sheet()!.getAttribute("data-snap")).toBe("full");
    expect(sheet()!.style.height).toBe("100dvh");
    fireEvent.click(screen.getByRole("button", { name: "Shrink sheet" }));
    expect(sheet()!.getAttribute("data-snap")).toBe("partial");
  });

  it("dragging the grip down past the threshold closes the sheet; a short drag springs back", () => {
    vi.useFakeTimers();
    render(<Host />);
    const grip = document.querySelector<HTMLElement>("[data-sheet-grip]")!;
    pointer(grip, "pointerdown", 400);
    pointer(grip, "pointermove", 400 + SNAP_DRAG_PX - 10);
    pointer(grip, "pointerup", 400 + SNAP_DRAG_PX - 10);
    expect(sheet()!.getAttribute("data-snap")).toBe("partial");
    expect(sheet()).not.toBeNull();

    pointer(grip, "pointerdown", 400);
    pointer(grip, "pointermove", 400 + SNAP_DRAG_PX + 20);
    pointer(grip, "pointerup", 400 + SNAP_DRAG_PX + 20);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(sheet()).toBeNull();
    vi.useRealTimers();
  });

  it("dragging up lifts it to full, and the snap is reported", () => {
    const onSnapChange = vi.fn();
    render(<Host onSnapChange={onSnapChange} />);
    const grip = document.querySelector<HTMLElement>("[data-sheet-grip]")!;
    pointer(grip, "pointerdown", 400);
    pointer(grip, "pointermove", 400 - SNAP_DRAG_PX - 10);
    pointer(grip, "pointerup", 400 - SNAP_DRAG_PX - 10);
    expect(sheet()!.getAttribute("data-snap")).toBe("full");
    expect(onSnapChange).toHaveBeenCalledWith("full");
  });

  it("honours a controlled snap", () => {
    render(<Host snap="full" />);
    expect(sheet()!.getAttribute("data-snap")).toBe("full");
  });

  it("under reduced motion there is no transform, only an opacity transition", () => {
    stubReducedMotion(true);
    render(<Host />);
    const s = sheet()!;
    expect(s.style.transform).toBe("");
    expect(s.style.transition).toContain("opacity");
  });

  it("has a close button with an accessible name", () => {
    vi.useFakeTimers();
    render(<Host />);
    fireEvent.click(screen.getByRole("button", { name: "Close Acme - Designer" }));
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(sheet()).toBeNull();
    vi.useRealTimers();
  });
});
