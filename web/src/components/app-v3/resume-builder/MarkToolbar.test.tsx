import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ATS_STRICT, DESIGN_FREE, TOOLTIP_DELAY_MS, controlStates } from "@kiwiply/ui";
import type { ResumeDocument, ResumeListStyle, ResumeMark, TemplateCapabilities, ToolbarButton } from "@kiwiply/ui";
import MarkToolbar from "./MarkToolbar";

afterEach(cleanup);

const doc = { schema: 2, meta: { title: "t" }, basics: { name: "n" }, sections: [] } as unknown as ResumeDocument;
const buttonsFor = (caps: TemplateCapabilities): ToolbarButton[] => controlStates(doc, caps).toolbar;
const SIX: ToolbarButton[] = ["b", "i", "u", "bullet", "number", "a"];

function setup(
  over: Partial<{
    buttons: ToolbarButton[];
    marks: ResumeMark[];
    selection: { s: number; e: number };
    list: ResumeListStyle | null;
    active: boolean;
    linkSignal: number;
  }> = {},
) {
  const onToggle = vi.fn();
  const onList = vi.fn();
  const onLink = vi.fn();
  const props = { buttons: SIX, marks: [] as ResumeMark[], selection: { s: 0, e: 4 }, list: null, onToggle, onList, onLink, ...over };
  const view = render(<MarkToolbar {...props} />);
  return { onToggle, onList, onLink, rerender: (next: typeof over) => view.rerender(<MarkToolbar {...props} {...next} />) };
}

const btn = (name: RegExp | string) => screen.getByRole("button", { name }) as HTMLButtonElement;
const names = () => within(screen.getByRole("toolbar")).getAllByRole("button").map((x) => x.getAttribute("aria-label"));

describe("MarkToolbar buttons follow the template's capabilities", () => {
  it("ATS_STRICT renders only Bold", () => {
    setup({ buttons: buttonsFor(ATS_STRICT) });
    expect(names()).toEqual(["Bold"]);
  });

  it("DESIGN_FREE renders the six, in the board's order", () => {
    setup({ buttons: buttonsFor(DESIGN_FREE) });
    expect(names()).toEqual(["Bold", "Italic", "Underline", "Bulleted list", "Numbered list", "Link"]);
  });

  it("a template that prints nothing gets no toolbar at all", () => {
    const none: TemplateCapabilities = { ...ATS_STRICT, marks: [], lists: false };
    const { container } = render(
      <MarkToolbar buttons={buttonsFor(none)} marks={[]} selection={{ s: 0, e: 0 }} list={null} onToggle={() => {}} onList={() => {}} onLink={() => {}} />,
    );
    expect(buttonsFor(none)).toEqual([]);
    expect(container.innerHTML).toBe("");
    expect(screen.queryByRole("toolbar")).toBeNull();
  });

  it("is a toolbar with an accessible name and every button labelled", () => {
    setup();
    const bar = screen.getByRole("toolbar");
    expect(bar.getAttribute("aria-label")).toBe("Text formatting");
    expect(bar.getAttribute("aria-orientation")).toBe("horizontal");
    // the tooltip carries the name and the shortcut (keyboard focus shows it)
    vi.useFakeTimers();
    for (const [name, words] of [["Bold", "Bold (Ctrl+B)"], ["Link", "Link (Ctrl+K)"]] as const) {
      fireEvent.focus(btn(name));
      act(() => void vi.advanceTimersByTime(TOOLTIP_DELAY_MS + 10));
      expect(document.querySelector("[data-tooltip]")?.textContent).toBe(words);
      fireEvent.blur(btn(name));
    }
    vi.useRealTimers();
  });
});

describe("MarkToolbar pressed state and actions", () => {
  it("a button is pressed when the selection is fully covered by that mark", () => {
    setup({ marks: [{ s: 0, e: 4, t: "b" }, { s: 2, e: 4, t: "i" }], selection: { s: 0, e: 4 } });
    expect(btn("Bold").getAttribute("aria-pressed")).toBe("true");
    expect(btn("Italic").getAttribute("aria-pressed")).toBe("false"); // only half of the selection
    expect(btn("Underline").getAttribute("aria-pressed")).toBe("false");
  });

  it("the list buttons show the current list style", () => {
    setup({ list: "number" });
    expect(btn("Numbered list").getAttribute("aria-pressed")).toBe("true");
    expect(btn("Bulleted list").getAttribute("aria-pressed")).toBe("false");
  });

  it("clicking B / I / U toggles that mark; the list buttons report their style", () => {
    const { onToggle, onList } = setup();
    fireEvent.click(btn("Bold"));
    fireEvent.click(btn("Italic"));
    fireEvent.click(btn("Underline"));
    expect(onToggle.mock.calls.map((c) => c[0])).toEqual(["b", "i", "u"]);
    fireEvent.click(btn("Bulleted list"));
    fireEvent.click(btn("Numbered list"));
    expect(onList.mock.calls.map((c) => c[0])).toEqual(["bullet", "number"]);
  });

  it("with no selection the mark buttons are inert (aria-disabled) but the lists still work", () => {
    const { onToggle, onList } = setup({ selection: { s: 3, e: 3 } });
    expect(btn("Bold").getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(btn("Bold"));
    fireEvent.click(btn("Link"));
    expect(onToggle).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(btn("Bulleted list"));
    expect(onList).toHaveBeenCalledWith("bullet");
  });

  it("with no field to act on every button is inert", () => {
    const { onToggle, onList } = setup({ active: false });
    for (const n of ["Bold", "Bulleted list", "Link"]) fireEvent.click(btn(n));
    expect(onToggle).not.toHaveBeenCalled();
    expect(onList).not.toHaveBeenCalled();
  });

  it("mouse down on a button does not steal the focus from the text", () => {
    setup();
    expect(fireEvent.mouseDown(btn("Bold"))).toBe(false); // preventDefault was called
  });
});

describe("MarkToolbar keyboard", () => {
  it("one tab stop; arrow keys, Home and End move the focus along the buttons (wrapping)", () => {
    setup();
    const all = within(screen.getByRole("toolbar")).getAllByRole("button");
    expect(all.map((b) => b.tabIndex)).toEqual([0, -1, -1, -1, -1, -1]);
    const bar = screen.getByRole("toolbar");
    all[0].focus();
    fireEvent.keyDown(bar, { key: "ArrowRight" });
    expect(document.activeElement).toBe(all[1]);
    fireEvent.keyDown(bar, { key: "ArrowRight" });
    expect(document.activeElement).toBe(all[2]);
    fireEvent.keyDown(bar, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(all[1]);
    fireEvent.keyDown(bar, { key: "End" });
    expect(document.activeElement).toBe(all[5]);
    fireEvent.keyDown(bar, { key: "ArrowRight" });
    expect(document.activeElement).toBe(all[0]);
    fireEvent.keyDown(bar, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(all[5]);
    fireEvent.keyDown(bar, { key: "Home" });
    expect(document.activeElement).toBe(all[0]);
    expect(all.map((b) => b.tabIndex)).toEqual([0, -1, -1, -1, -1, -1]);
  });

  it("the roving tab stop follows the focus", () => {
    setup();
    const all = within(screen.getByRole("toolbar")).getAllByRole("button");
    act(() => all[3].focus());
    expect(all.map((b) => b.tabIndex)).toEqual([-1, -1, -1, 0, -1, -1]);
  });
});

describe("MarkToolbar link popover", () => {
  it("opens from the link button and applies a valid https:// URL to the selection", () => {
    const { onLink } = setup({ selection: { s: 2, e: 7 } });
    fireEvent.click(btn("Link"));
    const dialog = screen.getByRole("dialog", { name: "Link" });
    fireEvent.change(within(dialog).getByLabelText("Link URL"), { target: { value: " https://example.com/me " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Apply" }));
    expect(onLink).toHaveBeenCalledWith({ s: 2, e: 7 }, "https://example.com/me");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("accepts mailto: and Enter applies", () => {
    const { onLink } = setup();
    fireEvent.click(btn("Link"));
    const input = screen.getByLabelText("Link URL");
    fireEvent.change(input, { target: { value: "mailto:me@example.com" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onLink).toHaveBeenCalledWith({ s: 0, e: 4 }, "mailto:me@example.com");
  });

  it("refuses anything that is not http(s):// or mailto: and says why", () => {
    const { onLink } = setup();
    fireEvent.click(btn("Link"));
    const input = screen.getByLabelText("Link URL");
    for (const bad of ["javascript:alert(1)", "example.com", "ftp://x.dev", ""]) {
      fireEvent.change(input, { target: { value: bad } });
      fireEvent.click(screen.getByRole("button", { name: "Apply" }));
      expect(screen.getByRole("alert").textContent).toMatch(/https:\/\/, http:\/\/ or mailto:/);
      expect(input.getAttribute("aria-invalid")).toBe("true");
    }
    expect(onLink).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "https://ok.dev" } }); // typing clears the error
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("on an existing link it shows its URL and offers Remove link", () => {
    const { onLink } = setup({ marks: [{ s: 0, e: 4, t: "a", href: "https://old.dev" }], selection: { s: 0, e: 4 } });
    expect(btn("Link").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(btn("Link"));
    expect((screen.getByLabelText("Link URL") as HTMLInputElement).value).toBe("https://old.dev");
    fireEvent.click(screen.getByRole("button", { name: "Remove link" }));
    expect(onLink).toHaveBeenCalledWith({ s: 0, e: 4 }, null);
  });

  it("a caret inside a link edits that whole link; a new link has no Remove", () => {
    const { onLink } = setup({ marks: [{ s: 2, e: 9, t: "a", href: "https://old.dev" }], selection: { s: 5, e: 5 } });
    fireEvent.click(btn("Link"));
    fireEvent.click(screen.getByRole("button", { name: "Remove link" }));
    expect(onLink).toHaveBeenCalledWith({ s: 2, e: 9 }, null);
    cleanup();
    setup();
    fireEvent.click(btn("Link"));
    expect(screen.queryByRole("button", { name: "Remove link" })).toBeNull();
  });

  it("Escape closes it without applying", () => {
    const { onLink } = setup();
    fireEvent.click(btn("Link"));
    fireEvent.keyDown(screen.getByLabelText("Link URL"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onLink).not.toHaveBeenCalled();
  });

  it("opens when the field asks for it (Ctrl/Cmd+K)", () => {
    const { rerender } = setup();
    expect(screen.queryByRole("dialog")).toBeNull();
    rerender({ linkSignal: 1 });
    expect(screen.getByRole("dialog", { name: "Link" })).toBeTruthy();
  });
});
