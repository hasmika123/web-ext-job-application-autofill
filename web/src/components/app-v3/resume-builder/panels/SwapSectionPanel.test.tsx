import { useReducer } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ATS_STRICT, DESIGN_FREE, ToastProvider } from "@kiwiply/ui";
import type { ResumeDocument, TemplateCapabilities } from "@kiwiply/ui";
import { track } from "@/lib/analytics";
import { DEFAULT_BUILDER_CONFIG } from "@/lib/resume-builder-config.shared";
import { CanvasHarness, liveDoc } from "../test-canvas";
import { currentDoc, editorReducer, initEditorState } from "../state/reducer";
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
    expect(screen.getByText("Your header always comes first")).toBeTruthy();
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
    expect(status()).toBe("Dropped Summary at position 2 of 4.");
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
    expect(screen.getByText("Moved Summary down, position 2 of 4.")).toBeTruthy();
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
