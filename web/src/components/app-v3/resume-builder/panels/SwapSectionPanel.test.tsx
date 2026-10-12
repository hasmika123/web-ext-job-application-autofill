import { useReducer } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ATS_STRICT, DESIGN_FREE, TOOLTIP_DELAY_MS, ToastProvider } from "@kiwiply/ui";
import type { ResumeDocument, TemplateCapabilities } from "@kiwiply/ui";
import { track } from "@/lib/analytics";
import { DEFAULT_BUILDER_CONFIG } from "@/lib/resume-builder-config.shared";
import DocumentCanvas from "../DocumentCanvas";
import { FLASH_MS, moveLink } from "../moveLink";
import { CanvasHarness, liveDoc } from "../test-canvas";
import { canRedoEdit, canUndoEdit, currentDoc, editorReducer, initEditorState } from "../state/reducer";
import { testDoc } from "../state/test-doc";
import SwapSectionPanel from "./SwapSectionPanel";

vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));

/** Summary, Experience (two items), Education, Skills. */
const doc = (): ResumeDocument => {
  const d = testDoc();
  d.sections.splice(2, 0, { id: "s_edu", kind: "EDUCATION", title: "Education", items: [{ id: "i_edu00001", school: "MIT", degree: "BS", bullets: [] }] });
  return d;
};

function Harness({ initial = doc(), caps = DESIGN_FREE }: { initial?: ResumeDocument; caps?: TemplateCapabilities }) {
  const [state, dispatch] = useReducer(editorReducer, undefined, () =>
    initEditorState({ doc: initial, templateId: "modern", theme: null, docVersion: 1, limits: DEFAULT_BUILDER_CONFIG.limits }),
  );
  return (
    <ToastProvider>
      <SwapSectionPanel doc={currentDoc(state)} caps={caps} dispatch={dispatch} />
      <button onClick={() => dispatch({ type: "history/undo" })}>undo</button>
      <output data-testid="doc">{JSON.stringify(currentDoc(state))}</output>
    </ToastProvider>
  );
}

const sections = () => liveDoc().sections.map((s) => s.id);
const itemsOf = (sectionId: string) => liveDoc().sections.find((s) => s.id === sectionId)!.items.map((i) => (i as { id: string }).id);

/** jsdom has no layout: give every sortable node a rect that grows down the page in DOM order. */
beforeEach(() => {
  vi.mocked(track).mockClear();
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const nodes = Array.from(document.querySelectorAll("[data-sortable-id]"));
    const i = nodes.indexOf(this);
    const top = i < 0 ? 0 : i * 100; // config-literal-ok: fake layout in a test
    const height = i < 0 ? 0 : 80; // config-literal-ok: fake layout in a test
    const width = i < 0 ? 0 : 300; // config-literal-ok: fake layout in a test
    return { x: 0, y: top, top, left: 0, width, height, right: width, bottom: top + height, toJSON: () => ({}) } as DOMRect;
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  moveLink.reset();
});

const tick = () => act(async () => void (await new Promise((r) => setTimeout(r, 20))));
const press = (target: Element | Document, code: string) => fireEvent.keyDown(target, { code, key: code === "Space" ? " " : code });
const status = () => document.querySelector('[role="status"][aria-live="assertive"]')?.textContent ?? "";

/** Space picks up, arrows move, Space drops: the keyboard path of the sensor. */
async function keyboardMove(handle: HTMLElement, arrows: string[]) {
  handle.focus();
  press(handle, "Space");
  await tick();
  for (const a of arrows) {
    press(document, a);
    await tick();
  }
  press(document, "Space");
  await tick();
}

describe("SwapSectionPanel", () => {
  it("lists Personal Information first with a disabled handle, then every section in order, and the tip", () => {
    render(<Harness />);
    const rows = screen.getByRole("list", { name: "Sections" });
    expect(screen.getByText("Rearrange your resume structure. Changes update in the resume inline.")).toBeTruthy();
    const pinned = rows.querySelector("[data-pinned]")!;
    expect(rows.firstElementChild).toBe(pinned);
    expect(within(pinned as HTMLElement).getByText("Personal Information")).toBeTruthy();
    expect((within(pinned as HTMLElement).getByRole("button") as HTMLButtonElement).disabled).toBe(true);
    // the locked grip says why in its tooltip (hover; a disabled button takes no focus)
    vi.useFakeTimers();
    fireEvent.pointerEnter(pinned.querySelector("[data-tooltip-trigger]")!);
    act(() => void vi.advanceTimersByTime(TOOLTIP_DELAY_MS + 10));
    expect(document.querySelector("[data-tooltip]")?.textContent).toBe("Your header always comes first");
    vi.useRealTimers();
    expect(Array.from(rows.querySelectorAll("[data-section]")).map((e) => e.getAttribute("data-section"))).toEqual(["s_sum", "s_exp", "s_edu", "s_skl"]);
    expect(screen.getByText(/Drag any section or subsection to reorder your resume/)).toBeTruthy();
  });

  it("opens Experience and Education at first; the chevron toggles a section's items", () => {
    render(<Harness />);
    expect(screen.getByRole("list", { name: "Experience entries" })).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Skills entries" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show Skills entries" }));
    expect(screen.getByRole("list", { name: "Skills entries" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Hide Skills entries" }));
    expect(screen.queryByRole("list", { name: "Skills entries" })).toBeNull();
  });

  it("keyboard: Space, arrow, Space moves a section and announces it in plain English", async () => {
    render(<Harness />);
    const handle = screen.getByRole("button", { name: "Drag Summary to reorder" });
    handle.focus();
    press(handle, "Space");
    await tick();
    expect(status()).toBe("Picked up Summary, position 1 of 4.");
    press(document, "ArrowDown");
    await tick();
    expect(status()).toBe("Summary moved to position 2 of 4.");
    press(document, "Space");
    await tick();
    expect(status()).toBe("Moved Summary to position 2 of 4.");
    expect(sections()).toEqual(["s_exp", "s_sum", "s_edu", "s_skl"]);
    expect(track).toHaveBeenCalledWith("resume_section_reordered", { via: "drag" });
  });

  it("keyboard: Escape cancels and nothing moves", async () => {
    render(<Harness />);
    const handle = screen.getByRole("button", { name: "Drag Summary to reorder" });
    handle.focus();
    press(handle, "Space");
    await tick();
    press(document, "ArrowDown");
    await tick();
    press(document, "Escape");
    await tick();
    expect(status()).toBe("Cancelled. Summary is back at position 1 of 4.");
    expect(sections()).toEqual(["s_sum", "s_exp", "s_edu", "s_skl"]);
  });

  it("keyboard: an item moves within its section and records the kind", async () => {
    render(<Harness />);
    await keyboardMove(screen.getByRole("button", { name: "Drag Software Engineer · Acme to reorder" }), ["ArrowDown"]);
    expect(itemsOf("s_exp")).toEqual(["i_exp00002", "i_exp00001"]);
    expect(track).toHaveBeenCalledWith("resume_item_reordered", { kind: "experience", via: "drag" });
  });

  it("keyboard: an item never leaves its section", async () => {
    render(<Harness />);
    // the last Experience item, with an Education item right below it
    await keyboardMove(screen.getByRole("button", { name: "Drag Intern · Beta to reorder" }), ["ArrowDown", "ArrowDown"]);
    expect(itemsOf("s_exp")).toEqual(["i_exp00001", "i_exp00002"]);
    expect(itemsOf("s_edu")).toEqual(["i_edu00001"]);
    expect(track).not.toHaveBeenCalled();
  });

  it("the pinned header cannot be picked up", async () => {
    render(<Harness />);
    const pinned = screen.getByRole("button", { name: "Personal Information always comes first" }) as HTMLButtonElement;
    expect(pinned.disabled).toBe(true);
    press(pinned, "Space");
    await tick();
    expect(status()).toBe("");
  });

  it("the menu has Move up and Move down (the no-drag path), disabled at the ends, and says what moved", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "More actions for Summary" }));
    const first = screen.getByRole("menuitem", { name: "Move up" });
    expect(first.getAttribute("aria-disabled") === "true" || (first as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("menuitem", { name: "Move down" }));
    expect(sections()).toEqual(["s_exp", "s_sum", "s_edu", "s_skl"]);
    expect(screen.getByText("Moved Summary to position 2 of 4.")).toBeTruthy();
    expect(track).toHaveBeenCalledWith("resume_section_reordered", { via: "buttons" });

    fireEvent.click(screen.getByRole("button", { name: "More actions for Intern · Beta" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Move up" }));
    expect(itemsOf("s_exp")).toEqual(["i_exp00002", "i_exp00001"]);
    expect(track).toHaveBeenCalledWith("resume_item_reordered", { kind: "experience", via: "buttons" });
  });

  it("a move is one history entry: one undo puts it back", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "More actions for Summary" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Move down" }));
    expect(sections()[0]).toBe("s_exp");
    fireEvent.click(screen.getByRole("button", { name: "undo" }));
    expect(sections()).toEqual(["s_sum", "s_exp", "s_edu", "s_skl"]);
  });

  it("a section the template does not draw is greyed with its handle disabled, but still listed", () => {
    const d = doc();
    d.sections.push({ id: "s_int", kind: "INTERESTS", title: "Interests", items: [{ id: "i_int00001", text: "Chess" }] });
    render(<Harness initial={d} caps={ATS_STRICT} />);
    const row = document.querySelector('[data-section="s_int"]')!;
    expect(row.getAttribute("data-greyed")).toBe("true");
    expect(within(row as HTMLElement).getByText("Hidden in this template")).toBeTruthy();
    expect((within(row as HTMLElement).getByRole("button", { name: "Drag Interests to reorder" }) as HTMLButtonElement).disabled).toBe(true);
    // an ordinary section stays draggable
    expect((screen.getByRole("button", { name: "Drag Summary to reorder" }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("canvas grips", () => {
  it("item rows show a grip only while the panel is open, and the keyboard moves an item through item/move", async () => {
    const { rerender } = render(<CanvasHarness doc={doc()} caps={DESIGN_FREE} />);
    expect(screen.queryByRole("button", { name: /^Drag .* to reorder$/ })).toBeNull();
    rerender(<CanvasHarness doc={doc()} caps={DESIGN_FREE} reorder />);
    const grip = screen.getByRole("button", { name: "Drag Software Engineer · Acme to reorder" });
    await keyboardMove(grip, ["ArrowDown"]);
    expect(itemsOf("s_exp")).toEqual(["i_exp00002", "i_exp00001"]);
  });
});

/* ── R2.2 UX (DECISIONS #31): rows say what the item is, and the canvas follows ───────────────────── */

/** jsdom has no scrollIntoView: record which element it was called on. */
const scrolls = vi.fn();
beforeEach(() => {
  scrolls.mockClear();
  Element.prototype.scrollIntoView = function (this: Element, arg?: boolean | ScrollIntoViewOptions) {
    scrolls(this, arg);
  };
});
afterEach(() => {
  delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
});
const scrolledTo = (): Element[] => scrolls.mock.calls.map((c) => c[0] as Element);

/** Three filled Experience items and one empty one. */
const labelled = (): ResumeDocument => {
  const d = doc();
  const exp = d.sections.find((s) => s.id === "s_exp")!;
  exp.items = [
    { id: "i_exp00001", title: "Software Engineer", org: "Acme Inc.", start: "2022-03", end: "2024-03", bullets: [] },
    { id: "i_exp00002", title: "Product Manager", org: "Beta", start: "2020", end: "2022-02", bullets: [] },
    { id: "i_exp00003", title: "Intern", org: "", start: "2019", end: "2019", bullets: [] },
    { id: "i_exp00004", title: "", org: "", bullets: [] },
  ];
  return d;
};

/** The panel and the canvas on one reducer, as the editor wires them. */
function Both({ initial = labelled() }: { initial?: ResumeDocument }) {
  const [state, dispatch] = useReducer(editorReducer, undefined, () =>
    initEditorState({ doc: initial, templateId: "modern", theme: null, docVersion: 1, limits: DEFAULT_BUILDER_CONFIG.limits }),
  );
  return (
    <ToastProvider>
      <div data-testid="panel">
        <SwapSectionPanel doc={currentDoc(state)} caps={DESIGN_FREE} dispatch={dispatch} />
      </div>
      <div data-testid="canvas">
        <DocumentCanvas
          doc={currentDoc(state)}
          caps={DESIGN_FREE}
          limits={state.limits}
          dispatch={dispatch}
          errorField={null}
          canUndo={canUndoEdit(state)}
          canRedo={canRedoEdit(state)}
          aiAllowed={false}
          onAddSection={() => {}}
          reorder
        />
      </div>
      <output data-testid="doc">{JSON.stringify(currentDoc(state))}</output>
    </ToastProvider>
  );
}

const panelRow = (id: string) => document.querySelector(`[data-testid="panel"] [data-link-id="${id}"]`) as HTMLElement;
const canvasBox = (id: string) => document.querySelector(`[data-testid="canvas"] [data-link-id="${id}"]`) as HTMLElement;

describe("rows show what the item is", () => {
  it("names each item by its own content, never 'Experience 1'", () => {
    render(<Both />);
    const list = screen.getByRole("list", { name: "Experience entries" });
    expect(list.textContent).not.toMatch(/Experience \d/);
    const first = panelRow("i_exp00001");
    expect(within(first).getByText("Software Engineer")).toBeTruthy();
    expect(within(first).getByText("Acme Inc. · Mar 2022 – Mar 2024")).toBeTruthy();
    expect(first.getAttribute("aria-label")).toBe("Software Engineer · Acme Inc. · Mar 2022 – Mar 2024");
    expect(first.querySelector("[title]")?.getAttribute("title")).toBe("Software Engineer · Acme Inc. · Mar 2022 – Mar 2024");
    expect(within(panelRow("i_exp00003")).getByText("Intern")).toBeTruthy();
    expect(within(panelRow("i_exp00003")).getByText("2019 – 2019")).toBeTruthy();
  });

  it("an item with nothing in it is 'Untitled role n' in muted italic", () => {
    render(<Both />);
    const empty = within(panelRow("i_exp00004")).getByText("Untitled role 4");
    expect(empty.className).toContain("italic");
    expect(empty.className).toContain("text-muted");
  });

  it("the label follows the canvas as the user types", () => {
    render(<Both />);
    const inputs = within(screen.getByTestId("canvas")).getAllByRole("textbox", { name: "Job title" });
    fireEvent.change(inputs[3], { target: { value: "Data Analyst" } });
    expect(within(panelRow("i_exp00004")).getByText("Data Analyst")).toBeTruthy();
    expect(screen.queryByText("Untitled role 4")).toBeNull();
    fireEvent.change(inputs[0], { target: { value: "Staff Engineer" } });
    expect(within(panelRow("i_exp00001")).getByText("Staff Engineer")).toBeTruthy();
  });

  it("handles and menus are named with the label, so the canvas wording matches", () => {
    render(<Both />);
    expect(within(panelRow("i_exp00001")).getByRole("button", { name: "Drag Software Engineer · Acme Inc. to reorder" })).toBeTruthy();
    expect(within(screen.getByTestId("canvas")).getByRole("button", { name: "Drag Software Engineer · Acme Inc. to reorder" })).toBeTruthy();
    expect(within(screen.getByTestId("canvas")).getByRole("button", { name: "More actions for Software Engineer · Acme Inc." })).toBeTruthy();
    expect(within(panelRow("i_exp00004")).getByRole("button", { name: "More actions for Untitled role 4" })).toBeTruthy();
  });
});

describe("the panel row and the canvas item are linked", () => {
  it("hovering a row rings the matching canvas item without scrolling", () => {
    render(<Both />);
    expect(canvasBox("i_exp00002").getAttribute("data-link")).toBeNull();
    fireEvent.pointerOver(panelRow("i_exp00002"));
    expect(canvasBox("i_exp00002").getAttribute("data-link")).toBe("true");
    expect(canvasBox("i_exp00001").getAttribute("data-link")).toBeNull();
    fireEvent.pointerLeave(panelRow("i_exp00002"));
    expect(canvasBox("i_exp00002").getAttribute("data-link")).toBeNull();
    expect(scrolls).not.toHaveBeenCalled();
  });

  it("focusing a row rings the item and scrolls it into view", async () => {
    render(<Both />);
    const handle = within(panelRow("i_exp00003")).getByRole("button", { name: "Drag Intern to reorder" });
    act(() => handle.focus());
    expect(canvasBox("i_exp00003").getAttribute("data-link")).toBe("true");
    await tick();
    expect(scrolledTo()).toContain(canvasBox("i_exp00003"));
    act(() => handle.blur());
    expect(canvasBox("i_exp00003").getAttribute("data-link")).toBeNull();
  });

  it("clicking a row scrolls the item into view; a section row scrolls to its block", async () => {
    render(<Both />);
    fireEvent.click(within(panelRow("i_exp00002")).getByText("Product Manager"));
    await tick();
    expect(scrolledTo()).toContain(canvasBox("i_exp00002"));
    fireEvent.click(within(panelRow("s_skl")).getByText("Skills"));
    await tick();
    expect(scrolledTo()).toContain(canvasBox("s_skl"));
  });

  it("opening a row's menu does not scroll the document (the menu closes on any scroll)", async () => {
    render(<Both />);
    fireEvent.click(within(panelRow("i_exp00002")).getByRole("button", { name: "More actions for Product Manager · Beta" }));
    await tick();
    expect(scrolls).not.toHaveBeenCalled();
    expect(screen.getByRole("menuitem", { name: "Move up" })).toBeTruthy();
  });

  it("an item row does not ring its section", () => {
    render(<Both />);
    fireEvent.pointerOver(within(panelRow("i_exp00002")).getByText("Product Manager"));
    expect(canvasBox("i_exp00002").getAttribute("data-link")).toBe("true");
    expect(canvasBox("s_exp").getAttribute("data-link")).toBeNull();
  });

  it("a drag keeps its item ringed for as long as it lasts, and Escape still cancels", async () => {
    render(<Both />);
    const handle = within(panelRow("i_exp00001")).getByRole("button", { name: "Drag Software Engineer · Acme Inc. to reorder" });
    handle.focus();
    press(handle, "Space");
    await tick();
    expect(canvasBox("i_exp00001").getAttribute("data-link")).toBe("true");
    fireEvent.pointerLeave(panelRow("i_exp00001"));
    expect(canvasBox("i_exp00001").getAttribute("data-link")).toBe("true");
    press(document, "Escape");
    await tick();
    expect(canvasBox("i_exp00001").getAttribute("data-link")).toBeNull();
    expect(itemsOf("s_exp")[0]).toBe("i_exp00001");
  });
});

describe("after a move the canvas follows", () => {
  it("the menu's Move down scrolls the item into view, flashes it in both places and announces it by label", async () => {
    render(<Both />);
    fireEvent.click(within(panelRow("i_exp00001")).getByRole("button", { name: "More actions for Software Engineer · Acme Inc." }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Move down" }));
    expect(itemsOf("s_exp").slice(0, 2)).toEqual(["i_exp00002", "i_exp00001"]);
    expect(canvasBox("i_exp00001").getAttribute("data-flash")).toBe("true");
    expect(panelRow("i_exp00001").getAttribute("data-flash")).toBe("true");
    expect(panelRow("i_exp00002").getAttribute("data-flash")).toBeNull();
    await tick();
    expect(scrolledTo()).toContain(canvasBox("i_exp00001"));
    expect(screen.getByText("Moved Software Engineer · Acme Inc. to position 2 of 4 in Experience.")).toBeTruthy();
  });

  it("the flash ends after the flash time", async () => {
    render(<Both />);
    fireEvent.click(within(panelRow("i_exp00001")).getByRole("button", { name: "More actions for Software Engineer · Acme Inc." }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Move down" }));
    expect(canvasBox("i_exp00001").getAttribute("data-flash")).toBe("true");
    await act(async () => void (await new Promise((r) => setTimeout(r, FLASH_MS + 150))));
    expect(canvasBox("i_exp00001").getAttribute("data-flash")).toBeNull();
    expect(panelRow("i_exp00001").getAttribute("data-flash")).toBeNull();
  });

  it("a keyboard drag flashes and scrolls the item and the drop is announced with the label and the section", async () => {
    render(<Both />);
    await keyboardMove(within(panelRow("i_exp00001")).getByRole("button", { name: "Drag Software Engineer · Acme Inc. to reorder" }), ["ArrowDown"]);
    expect(itemsOf("s_exp").slice(0, 2)).toEqual(["i_exp00002", "i_exp00001"]);
    expect(status()).toBe("Moved Software Engineer · Acme Inc. to position 2 of 4 in Experience.");
    expect(canvasBox("i_exp00001").getAttribute("data-flash")).toBe("true");
    expect(panelRow("i_exp00001").getAttribute("data-flash")).toBe("true");
    expect(scrolledTo()).toContain(canvasBox("i_exp00001"));
  });

  it("a section moved from the panel flashes its block", async () => {
    render(<Both />);
    fireEvent.click(within(panelRow("s_sum")).getByRole("button", { name: "More actions for Summary" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Move down" }));
    expect(canvasBox("s_sum").getAttribute("data-flash")).toBe("true");
    expect(panelRow("s_sum").getAttribute("data-flash")).toBe("true");
    await tick();
    expect(scrolledTo()).toContain(canvasBox("s_sum"));
    expect(screen.getByText("Moved Summary to position 2 of 4.")).toBeTruthy();
  });

  it("a move with the canvas's own arrow flashes the item on the canvas and its row in the panel, and the panel announces it", async () => {
    render(<Both />);
    fireEvent.click(within(screen.getByTestId("canvas")).getByRole("button", { name: "Move Product Manager · Beta down" }));
    expect(itemsOf("s_exp").slice(0, 3)).toEqual(["i_exp00001", "i_exp00003", "i_exp00002"]);
    expect(panelRow("i_exp00002").getAttribute("data-flash")).toBe("true");
    expect(canvasBox("i_exp00002").getAttribute("data-flash")).toBe("true");
    await tick();
    expect(scrolledTo()).toContain(canvasBox("i_exp00002"));
    expect(screen.getByText("Moved Product Manager · Beta to position 3 of 4 in Experience.")).toBeTruthy();
  });

  it("a section moved with the canvas's arrows flashes its panel row", async () => {
    render(<Both />);
    fireEvent.click(within(screen.getByTestId("canvas")).getByRole("button", { name: "Move Skills section up" }));
    expect(sections()).toEqual(["s_sum", "s_exp", "s_skl", "s_edu"]);
    expect(panelRow("s_skl").getAttribute("data-flash")).toBe("true");
    expect(canvasBox("s_skl").getAttribute("data-flash")).toBe("true");
    await tick();
    expect(scrolledTo()).toContain(canvasBox("s_skl"));
  });

  it("scrolls smoothly, and instantly under prefers-reduced-motion", async () => {
    const reduced = (on: boolean) =>
      (window.matchMedia = ((q: string) => ({ matches: on && q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia);
    const behaviours = () => scrolls.mock.calls.map((c) => (c[1] as ScrollIntoViewOptions).behavior);
    render(<Both />);
    reduced(false);
    act(() => moveLink.moved("i_exp00001"));
    await tick();
    expect(behaviours()).toContain("smooth");
    scrolls.mockClear();
    reduced(true);
    act(() => moveLink.moved("i_exp00002"));
    await tick();
    expect(behaviours()).toEqual(["auto", "auto"]); // the canvas item and its panel row
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  it("nothing flashes before a move", () => {
    render(<Both />);
    expect(document.querySelectorAll("[data-flash]").length).toBe(0);
  });
});

describe("the canvas announces its own moves when the panel is closed", () => {
  it("has a polite status line that says what moved", () => {
    render(<CanvasHarness doc={doc()} caps={DESIGN_FREE} />);
    const line = () => document.querySelector("[data-move-status]")!.textContent;
    expect(line()).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Move Software Engineer · Acme down" }));
    expect(line()).toBe("Moved Software Engineer · Acme to position 2 of 2 in Experience.");
  });
});
