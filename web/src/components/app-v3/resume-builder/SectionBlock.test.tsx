import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ATS_STRICT, DESIGN_FREE } from "@kiwiply/ui";
import type { ResumeDocument } from "@kiwiply/ui";
import { DEFAULT_BUILDER_CONFIG } from "@/lib/resume-builder-config.shared";
import { CanvasHarness, liveDoc } from "./test-canvas";
import { testDoc } from "./state/test-doc";

afterEach(cleanup);

/** The test doc (summary, experience, skills) plus education so there are four sections. */
const doc = (): ResumeDocument => {
  const d = testDoc();
  d.sections.splice(2, 0, { id: "s_edu", kind: "EDUCATION", title: "Education", items: [{ id: "i_edu00001", school: "MIT", degree: "BS", bullets: [] }] });
  return d;
};
const order = () => liveDoc().sections.map((s) => s.id);
const block = (id: string) => document.getElementById(`rb-${id}`)!;
const menuOf = (id: string) => {
  fireEvent.click(within(block(id)).getByRole("button", { name: /^More actions for .* section$/ }));
  return screen.getByRole("menu");
};
const item = (name: string) => screen.getByRole("menuitem", { name }) as HTMLButtonElement;

describe("SectionBlock", () => {
  it("moves a section up and down; the buttons are disabled at the ends", () => {
    render(<CanvasHarness doc={doc()} />);
    const up = (id: string) => within(block(id)).getByRole("button", { name: /^Move .* section up$/ }) as HTMLButtonElement;
    const down = (id: string) => within(block(id)).getByRole("button", { name: /^Move .* section down$/ }) as HTMLButtonElement;
    expect(up("s_sum").disabled).toBe(true);
    expect(down("s_skl").disabled).toBe(true);
    expect(up("s_exp").disabled).toBe(false);

    fireEvent.click(down("s_sum"));
    expect(order()).toEqual(["s_exp", "s_sum", "s_edu", "s_skl"]);
    expect(up("s_exp").disabled).toBe(true); // now first
    fireEvent.click(up("s_edu"));
    expect(order()).toEqual(["s_exp", "s_edu", "s_sum", "s_skl"]);
  });

  it("carries '+ Add <thing>' per kind and none on the Summary", () => {
    render(<CanvasHarness doc={doc()} />);
    expect(within(block("s_exp")).getByRole("button", { name: /Add Experience/ })).toBeTruthy();
    expect(within(block("s_edu")).getByRole("button", { name: /Add Education/ })).toBeTruthy();
    expect(within(block("s_skl")).getByRole("button", { name: /Add Group/ })).toBeTruthy();
    expect(within(block("s_sum")).queryByRole("button", { name: /^Add / })).toBeNull();
    fireEvent.click(within(block("s_edu")).getByRole("button", { name: /Add Education/ }));
    expect(liveDoc().sections[2].items).toHaveLength(2);
    expect(document.activeElement).toBe(within(block("s_edu")).getAllByLabelText("Degree")[0]);
  });

  it("disables '+ Add' at the item cap from the config", () => {
    render(<CanvasHarness doc={doc()} limits={{ ...DEFAULT_BUILDER_CONFIG.limits, items: 1 }} />);
    expect((within(block("s_edu")).getByRole("button", { name: /Add Education/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  describe("rename", () => {
    it("is disabled under an ATS template, with the reason as a tooltip", () => {
      render(<CanvasHarness doc={doc()} caps={ATS_STRICT} />);
      menuOf("s_exp");
      const rename = item("Rename section");
      expect(rename.disabled).toBe(true);
      expect(within(rename).getByText("Rename section").getAttribute("title")).toMatch(/Standard heading/);
      // the heading itself is plain text with the same hint
      expect(document.getElementById("rb-s_exp-h")!.querySelector("button")).toBeNull();
      expect(document.getElementById("rb-s_exp-h")!.firstElementChild!.getAttribute("title")).toMatch(/Standard heading/);
    });

    it("works by clicking the heading when the template shows free headings", () => {
      render(<CanvasHarness doc={doc()} caps={DESIGN_FREE} />);
      fireEvent.click(within(block("s_exp")).getByRole("button", { name: "Experience" }));
      const box = screen.getByLabelText("Section title") as HTMLInputElement;
      fireEvent.change(box, { target: { value: "Work History" } });
      fireEvent.keyDown(box, { key: "Enter" });
      expect(liveDoc().sections.find((s) => s.id === "s_exp")!.title).toBe("Work History");
      expect(document.getElementById("rb-s_exp-h")!.textContent).toBe("Work History");
    });

    it("Escape cancels; emptying a built-in title resets it", () => {
      render(<CanvasHarness doc={doc()} caps={DESIGN_FREE} />);
      fireEvent.click(within(block("s_exp")).getByRole("button", { name: "Experience" }));
      const box = screen.getByLabelText("Section title") as HTMLInputElement;
      fireEvent.change(box, { target: { value: "Nope" } });
      fireEvent.keyDown(box, { key: "Escape" });
      expect(liveDoc().sections.find((s) => s.id === "s_exp")!.title).toBe("Experience");

      menuOf("s_exp");
      fireEvent.click(item("Rename section"));
      const again = screen.getByLabelText("Section title") as HTMLInputElement;
      fireEvent.change(again, { target: { value: "  " } });
      fireEvent.keyDown(again, { key: "Enter" });
      expect("title" in liveDoc().sections.find((s) => s.id === "s_exp")!).toBe(false);
    });
  });

  it("the menu hides and shows a section", () => {
    render(<CanvasHarness doc={doc()} />);
    menuOf("s_edu");
    fireEvent.click(item("Hide from this resume"));
    expect(liveDoc().sections[2].hidden).toBe(true);
    expect(within(block("s_edu")).getByText("Hidden")).toBeTruthy();
    fireEvent.click(within(block("s_edu")).getByRole("button", { name: /^Show/ }));
    expect(liveDoc().sections[2].hidden).toBe(false);
  });

  it("the menu's Undo and Redo follow the history", () => {
    render(<CanvasHarness doc={doc()} />);
    menuOf("s_exp");
    expect(item("Undo").disabled).toBe(true);
    expect(item("Redo").disabled).toBe(true);
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });

    fireEvent.click(within(block("s_sum")).getByRole("button", { name: /^Move .* section down$/ }));
    menuOf("s_exp");
    expect(item("Undo").disabled).toBe(false);
    fireEvent.click(item("Undo"));
    expect(order()).toEqual(["s_sum", "s_exp", "s_edu", "s_skl"]);
    menuOf("s_exp");
    expect(item("Redo").disabled).toBe(false);
    fireEvent.click(item("Redo"));
    expect(order()).toEqual(["s_exp", "s_sum", "s_edu", "s_skl"]);
  });

  it("deleting a section shows 'Section removed' with an Undo that brings it back", () => {
    render(<CanvasHarness doc={doc()} />);
    fireEvent.click(within(block("s_edu")).getByRole("button", { name: /^Delete .* section$/ }));
    expect(order()).toEqual(["s_sum", "s_exp", "s_skl"]);
    expect(screen.getByText("Section removed")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(order()).toEqual(["s_sum", "s_exp", "s_edu", "s_skl"]);
  });

  it("the menu's Delete section does the same", () => {
    render(<CanvasHarness doc={doc()} />);
    menuOf("s_skl");
    fireEvent.click(item("Delete section"));
    expect(order()).toEqual(["s_sum", "s_exp", "s_edu"]);
  });

  describe("the Summary block", () => {
    it("hosts the mark toolbar slot (buttons from the template) and the Rewrite stub", () => {
      render(<CanvasHarness doc={doc()} caps={DESIGN_FREE} />);
      const slot = block("s_sum").querySelector("[data-slot='mark-toolbar']")!;
      expect(slot.getAttribute("data-buttons")).toBe("b,i,u,bullet,number,a");
      const rewrite = within(block("s_sum")).getByRole("button", { name: /Rewrite with AI/ }) as HTMLButtonElement;
      expect(rewrite.disabled).toBe(true);
    });

    it("an ATS template offers only bold; Free shows the lock, a plan with AI the plain stub", () => {
      const { unmount } = render(<CanvasHarness doc={doc()} caps={ATS_STRICT} aiAllowed={false} />);
      expect(block("s_sum").querySelector("[data-slot='mark-toolbar']")!.getAttribute("data-buttons")).toBe("b");
      expect(within(block("s_sum")).getByRole("button", { name: /Rewrite with AI/ }).getAttribute("title")).toMatch(/part of Pro/);
      unmount();
      render(<CanvasHarness doc={doc()} aiAllowed />);
      expect(within(block("s_sum")).getByRole("button", { name: /Rewrite with AI/ }).getAttribute("title")).toMatch(/coming soon/);
    });

    it("edits the summary and counts against the config's limit", () => {
      render(<CanvasHarness doc={doc()} limits={{ ...DEFAULT_BUILDER_CONFIG.limits, summaryChars: 12 }} />);
      const box = screen.getByRole("textbox", { name: "Summary" }) as HTMLTextAreaElement;
      expect(within(block("s_sum")).getByText("9 / 12")).toBeTruthy();
      fireEvent.change(box, { target: { value: "A longer summary than fits" } });
      expect(liveDoc().sections[0].items[0]).toMatchObject({ text: "A longer sum" });
    });
  });
});
