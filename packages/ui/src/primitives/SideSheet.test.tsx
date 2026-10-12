import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SideSheet from "./SideSheet";
import type { SideSheetProps } from "./SideSheet";

function stubReducedMotion(reduced: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduced && query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }));
}

function Host(props: Partial<SideSheetProps> & { startOpen?: boolean }) {
  const { startOpen = true, ...rest } = props;
  const [open, setOpen] = useState(startOpen);
  const btn = useRef<HTMLButtonElement>(null);
  return (
    <div>
      <button ref={btn} onClick={() => setOpen((o) => !o)} aria-controls="sheet" aria-expanded={open}>
        toggle
      </button>
      <SideSheet
        id="sheet"
        side="left"
        mode="push"
        title="Add Section"
        description="Choose a section"
        open={open}
        onClose={() => setOpen(false)}
        returnFocusTo={btn}
        {...rest}
      >
        <button>first control</button>
        <input aria-label="second control" />
      </SideSheet>
    </div>
  );
}

const expanded = () => screen.getByText("toggle").getAttribute("aria-expanded");

describe("SideSheet", () => {
  beforeEach(() => {
    stubReducedMotion(false);
    // jsdom has no layout: give every element an offsetParent so the Tab trap sees it.
    Object.defineProperty(HTMLElement.prototype, "offsetParent", {
      configurable: true,
      get() {
        return this.parentNode;
      },
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetParent;
    document.body.style.overflow = "";
  });

  it("a modal sheet is absolutely positioned against its side (never `relative`, which would leave a right sheet at the left edge)", () => {
    for (const [side, edge] of [["left", "left-0"], ["right", "right-0"]] as const) {
      const { unmount } = render(<Host mode="overlay" side={side} />);
      const panel = screen.getByRole("dialog");
      const classes = panel.className.split(/\s+/);
      expect(classes).toContain("absolute");
      expect(classes).toContain(edge);
      expect(classes).not.toContain("relative");
      unmount();
    }
    const { unmount } = render(<Host mode="push" />);
    expect(screen.getByRole("region").firstElementChild!.className.split(/\s+/)).toContain("relative"); // the close button anchors to it
    unmount();
  });

  it("opens with focus on the first control (the close button is last in DOM order)", () => {
    for (const mode of ["push", "overlay", "fullscreen"] as const) {
      const { unmount } = render(<Host mode={mode} />);
      expect(document.activeElement).toBe(screen.getByText("first control"));
      const close = screen.getByRole("button", { name: "Close Add Section" });
      const all = Array.from(document.querySelectorAll("button,input"));
      expect(all[all.length - 1]).toBe(close);
      unmount();
    }
  });

  it("moves focus in when it opens after mount", () => {
    render(<Host startOpen={false} mode="overlay" />);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByText("toggle"));
    expect(document.activeElement).toBe(screen.getByText("first control"));
  });

  it("Esc closes and returns focus to returnFocusTo", () => {
    for (const mode of ["push", "overlay"] as const) {
      const { unmount } = render(<Host mode={mode} />);
      expect(expanded()).toBe("true");
      fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
      expect(expanded()).toBe("false");
      expect(document.activeElement).toBe(screen.getByText("toggle"));
      unmount();
    }
  });

  it("the close button closes and returns focus", () => {
    render(<Host mode="push" />);
    fireEvent.click(screen.getByRole("button", { name: "Close Add Section" }));
    expect(expanded()).toBe("false");
    expect(document.activeElement).toBe(screen.getByText("toggle"));
  });

  it("scrim click closes (overlay only)", () => {
    const { container, unmount } = render(<Host mode="overlay" />);
    const scrim = container.querySelector("[data-sheet-scrim]") as HTMLElement;
    expect(scrim).not.toBeNull();
    fireEvent.click(scrim);
    expect(expanded()).toBe("false");
    unmount();

    const fs = render(<Host mode="fullscreen" />);
    expect(fs.container.querySelector("[data-sheet-scrim]")).toBeNull();
    fs.unmount();
    const pu = render(<Host mode="push" />);
    expect(pu.container.querySelector("[data-sheet-scrim]")).toBeNull();
  });

  it("push reserves width while open and none when closed; side picks the default width", () => {
    const { container, unmount } = render(<Host mode="push" side="left" />);
    const aside = container.querySelector("aside") as HTMLElement;
    expect(aside.style.width).toBe("400px");
    expect(aside.id).toBe("sheet");
    fireEvent.click(screen.getByText("toggle"));
    expect(aside.style.width).toBe("0px");
    expect(aside.hasAttribute("inert")).toBe(true);
    unmount();

    const right = render(<Host mode="push" side="right" />);
    expect((right.container.querySelector("aside") as HTMLElement).style.width).toBe("520px");
    right.unmount();

    const custom = render(<Host mode="push" side="right" width={300} />);
    expect((custom.container.querySelector("aside") as HTMLElement).style.width).toBe("300px");
  });

  it("reduced motion renders without transform (opacity only, 80 ms)", () => {
    stubReducedMotion(true);
    const overlay = render(<Host mode="overlay" />);
    const dialog = screen.getByRole("dialog");
    expect(dialog.style.transform).toBe("");
    expect(dialog.style.transition).toContain("opacity 80ms");
    expect(dialog.style.transition).not.toContain("transform");
    overlay.unmount();

    const push = render(<Host mode="push" />);
    const inner = push.container.querySelector("aside > div") as HTMLElement;
    expect(inner.style.transform).toBe("");
    expect((push.container.querySelector("aside") as HTMLElement).style.transition).toBe("none");
  });

  it("normal motion slides with a 200 ms translateX transition", async () => {
    render(<Host startOpen={false} mode="overlay" side="right" />);
    fireEvent.click(screen.getByText("toggle"));
    const dialog = screen.getByRole("dialog");
    expect(dialog.style.transition).toContain("transform 200ms");
    expect(dialog.style.transform).toBe("translateX(100%)"); // entrance start state
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });
    expect(screen.getByRole("dialog").style.transform).toBe("translateX(0)");
  });

  it("aria roles per mode", () => {
    const push = render(<Host mode="push" />);
    const region = screen.getByRole("region", { name: "Add Section" });
    expect(region.tagName).toBe("ASIDE");
    expect(screen.queryByRole("dialog")).toBeNull();
    push.unmount();

    for (const mode of ["overlay", "fullscreen"] as const) {
      const { unmount } = render(<Host mode={mode} />);
      const dialog = screen.getByRole("dialog", { name: "Add Section" });
      expect(dialog.getAttribute("aria-modal")).toBe("true");
      expect(dialog.id).toBe("sheet");
      expect(screen.queryByRole("region")).toBeNull();
      unmount();
    }
  });

  it("labelledBy replaces the aria-label", () => {
    render(
      <div>
        <h1 id="my-title">Custom name</h1>
        <Host mode="overlay" labelledBy="my-title" />
      </div>,
    );
    const dialog = screen.getByRole("dialog", { name: "Custom name" });
    expect(dialog.hasAttribute("aria-label")).toBe(false);
  });

  it("fullscreen locks body scroll; overlay and push do not; unlock on close", () => {
    const o = render(<Host mode="overlay" />);
    expect(document.body.style.overflow).toBe("");
    o.unmount();
    const p = render(<Host mode="push" />);
    expect(document.body.style.overflow).toBe("");
    p.unmount();

    render(<Host mode="fullscreen" />);
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.click(screen.getByText("toggle"));
    expect(document.body.style.overflow).toBe("");
  });

  it("a modal sheet traps Tab inside itself", () => {
    render(<Host mode="overlay" />);
    const close = screen.getByRole("button", { name: "Close Add Section" });
    close.focus();
    fireEvent.keyDown(close, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByText("first control"));
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(close);
  });

  it("unmounts the dialog after the exit transition", async () => {
    render(<Host mode="overlay" />);
    fireEvent.click(screen.getByText("toggle"));
    expect(screen.getByRole("dialog")).toBeTruthy(); // still playing the exit
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300));
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
