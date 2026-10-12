import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ATS_STRICT, DESIGN_FREE, getTemplate, resolveCapabilities } from "@kiwiply/ui";
import type { ResumeDocument, ResumeTheme, TemplateCapabilities } from "@kiwiply/ui";
import capsDoc from "../../../../../../packages/ui/src/resume/__fixtures__/caps-doc.json";
import { testDoc } from "../state/test-doc";
import PrintLayoutView from "./PrintLayoutView";

/**
 * jsdom has no layout, so the template's `.rz-page` gets a height from the CSS variables the theme
 * block sets: content = `contentAtStep0 * (size / 11) * density` (tighter spacing = shorter), on top of
 * the margins and never below one Letter page. The real thing is measured by the browser.
 */
let contentAtStep0 = 0;
const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");

function cssVar(el: HTMLElement, name: string): number {
  const css = el.parentElement?.querySelector("style")?.textContent ?? "";
  return Number.parseFloat(new RegExp(`--rz-${name}:([\\d.]+)`).exec(css)?.[1] ?? "0");
}

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get(this: HTMLElement) {
      if (!this.classList?.contains("rz-page")) return 0;
      const content = contentAtStep0 * (cssVar(this, "size") / 11) * cssVar(this, "density");
      return Math.max(1056, content + 2 * cssVar(this, "margin") * 96);
    },
  });
});

afterEach(() => {
  cleanup();
  if (original) Object.defineProperty(HTMLElement.prototype, "offsetHeight", original);
  document.body.removeAttribute("data-rb-printing");
});

const modern = resolveCapabilities("modern", {});

function view(over: Partial<{ doc: ResumeDocument; theme: Partial<ResumeTheme> | null; caps: TemplateCapabilities; zoomable: boolean }> = {}) {
  const props = {
    doc: testDoc(),
    theme: null as Partial<ResumeTheme> | null,
    templateId: "modern",
    caps: modern,
    controls: { changeTheme: vi.fn() },
    onDownloadPdf: vi.fn(),
    ...over,
  };
  const utils = render(<PrintLayoutView {...props} />);
  return { ...props, ...utils, rerenderWith: (next: Partial<typeof props>) => utils.rerender(<PrintLayoutView {...props} {...next} />) };
}

const boxes = () => screen.queryAllByRole("img", { name: /^Page \d+ of \d+$/ });
const banner = () => document.querySelector("[data-print-banner]");

describe("PrintLayoutView", () => {
  it("paginates a 2-page fixture into two page boxes with labels, a dashed break and the footer summary", () => {
    contentAtStep0 = 1500; // > 912 px of content: two pages
    view({ theme: { fit: { mode: "auto", target: 2, step: 0 } } });
    expect(boxes().map((b) => b.getAttribute("aria-label"))).toEqual(["Page 1 of 2", "Page 2 of 2"]);
    expect(screen.getByText("Page 1 of 2", { selector: "p" })).toBeTruthy();
    expect(document.querySelectorAll("[data-page-break]")).toHaveLength(1);
    expect(document.querySelectorAll("[data-page-margin]")).toHaveLength(2);
    expect(document.querySelector("[data-print-summary]")!.textContent).toBe(`2 pages · ${getTemplate("modern").meta.name}`);
    expect(banner()).toBeNull(); // 2 pages is within a Two Pages budget
    expect(screen.getByText("For an exact file use Download PDF.")).toBeTruthy();
  });

  it("a one-page resume is one box and no break", () => {
    contentAtStep0 = 500;
    view();
    expect(boxes()).toHaveLength(1);
    expect(document.querySelector("[data-page-break]")).toBeNull();
    expect(document.querySelector("[data-print-summary]")!.textContent).toContain("1 page ·");
    expect(banner()).toBeNull();
  });

  it("over the budget: the banner offers Fit to one page, which stores the ladder rung that fits", () => {
    contentAtStep0 = 1300; // 2 pages at step 0; rung 5 (size 9.5, density .78, margin .5) is the first to fit one
    const v = view();
    expect(boxes()).toHaveLength(2);
    expect(banner()!.getAttribute("data-print-banner")).toBe("over");
    expect(banner()!.textContent).toContain("Over 1 page — Compact spacing or shorter bullets will fit it");

    fireEvent.click(screen.getByRole("button", { name: "Fit to one page" }));
    expect(v.controls.changeTheme).toHaveBeenCalledWith({ control: "fit", step: 5 });

    // The editor stores the step; the view then re-measures at it and the warning goes.
    v.rerenderWith({ theme: { fit: { mode: "auto", target: 1, step: 5 } } });
    expect(boxes()).toHaveLength(1);
    expect(banner()).toBeNull();
  });

  it("when the ladder ends: 'Still 2 pages' with the three longest items, and no Fit button", () => {
    contentAtStep0 = 3000; // 2 pages even at the tightest rung
    const v = view();
    fireEvent.click(screen.getByRole("button", { name: "Fit to one page" }));
    expect(v.controls.changeTheme).toHaveBeenCalledWith({ control: "fit", step: 6 });

    v.rerenderWith({ theme: { fit: { mode: "auto", target: 1, step: 6 } } });
    expect(banner()!.getAttribute("data-print-banner")).toBe("still-over");
    expect(banner()!.textContent).toContain("Still 2 pages — hide a section or shorten bullets");
    expect(screen.queryByRole("button", { name: /Fit to/ })).toBeNull();
    const longest = [...document.querySelectorAll("[data-longest-item]")];
    expect(longest).toHaveLength(3);
    expect(longest[0].textContent).toContain("Software Engineer · Acme");
  });

  it("a Two Pages budget warns only past two pages, and says so", () => {
    contentAtStep0 = 2000; // 3 pages
    view({ theme: { fit: { mode: "auto", target: 2, step: 0 } } });
    expect(banner()!.textContent).toContain("Over 2 pages");
    expect(screen.getByRole("button", { name: "Fit to two pages" })).toBeTruthy();
  });

  it("the template's maxPages caps the budget even when Two Pages is stored", () => {
    contentAtStep0 = 1500;
    view({ theme: { fit: { mode: "auto", target: 2, step: 0 } }, caps: { ...ATS_STRICT, maxPages: 1 } });
    expect(banner()!.textContent).toContain("Over 1 page");
  });

  it("Print sets data-rb-printing, mounts #rb-print-root and calls window.print; afterprint clears both", () => {
    contentAtStep0 = 500;
    const print = vi.fn(() => {
      // while the dialog is open the page is marked and the unclipped copy is under <body>
      expect(document.body.getAttribute("data-rb-printing")).toBe("true");
      const root = document.getElementById("rb-print-root");
      expect(root?.parentElement).toBe(document.body);
      expect(root?.querySelector(".rz-page")).toBeTruthy();
    });
    window.print = print;
    view();
    expect(document.getElementById("rb-print-root")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Print" }));
    expect(print).toHaveBeenCalledTimes(1);
    expect(document.body.getAttribute("data-rb-printing")).toBe("true");

    act(() => {
      window.dispatchEvent(new Event("afterprint"));
    });
    expect(document.body.hasAttribute("data-rb-printing")).toBe(false);
    expect(document.getElementById("rb-print-root")).toBeNull();
  });

  it("Download PDF calls the editor's export", () => {
    contentAtStep0 = 500;
    const v = view();
    fireEvent.click(screen.getByRole("button", { name: "Download PDF" }));
    expect(v.onDownloadPdf).toHaveBeenCalledTimes(1);
  });

  it("repeats the hidden-content notice at the top", () => {
    contentAtStep0 = 500;
    view({ doc: capsDoc as unknown as ResumeDocument, caps: ATS_STRICT });
    expect(within(screen.getByRole("region", { name: "Hidden in this template" })).getAllByRole("listitem").length).toBeGreaterThan(0);
    cleanup();
    view({ doc: capsDoc as unknown as ResumeDocument, caps: DESIGN_FREE });
    expect(screen.queryByRole("region", { name: "Hidden in this template" })).toBeNull();
  });

  it("zoom buttons exist only where zoom is on (phone)", () => {
    contentAtStep0 = 500;
    view();
    expect(screen.queryByRole("button", { name: "Zoom in" })).toBeNull();
    cleanup();
    view({ zoomable: true });
    const zoomIn = screen.getByRole("button", { name: "Zoom in" });
    expect((screen.getByRole("button", { name: "Zoom out" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(zoomIn);
    expect(screen.getByText("125%")).toBeTruthy();
  });
});
