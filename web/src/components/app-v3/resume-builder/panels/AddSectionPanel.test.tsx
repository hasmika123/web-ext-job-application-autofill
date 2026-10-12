import { readFileSync } from "node:fs";
import path from "node:path";
import { useReducer } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ATS_STRICT, DESIGN_FREE, ToastProvider } from "@kiwiply/ui";
import type { ResumeDocument, ResumeSectionKind, TemplateCapabilities } from "@kiwiply/ui";
import { DEFAULT_BUILDER_CONFIG } from "@/lib/resume-builder-config.shared";
import DocumentCanvas from "../DocumentCanvas";
import { currentDoc, editorReducer, initEditorState } from "../state/reducer";
import type { DocLimits } from "../state/types";
import AddSectionPanel, { type AddSectionPanelProps } from "./AddSectionPanel";

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** `full-v2`: summary, experience, education, skills, projects, achievements, interests, custom. No certifications, no languages. */
function fixture(drop: ResumeSectionKind[] = []): ResumeDocument {
  const doc = JSON.parse(
    readFileSync(path.resolve(__dirname, "../../../../../../packages/ui/src/resume/__fixtures__/full-v2.json"), "utf8"),
  ) as ResumeDocument;
  doc.basics.photo = null;
  doc.sections = doc.sections.filter((s) => !drop.includes(s.kind));
  return doc;
}

/** The panel and the canvas over the real reducer, the way `ResumeEditor` wires them. */
function Harness({
  doc,
  caps = DESIGN_FREE,
  limits = DEFAULT_BUILDER_CONFIG.limits,
  ...rest
}: { doc: ResumeDocument; caps?: TemplateCapabilities; limits?: DocLimits } & Partial<Pick<AddSectionPanelProps, "focusKind" | "open" | "onFocusHandled" | "onAdded">>) {
  const [state, dispatch] = useReducer(editorReducer, undefined, () => initEditorState({ doc, templateId: "modern", theme: null, docVersion: 1, limits }));
  const live = currentDoc(state);
  return (
    <ToastProvider>
      <AddSectionPanel doc={live} caps={caps} limits={state.limits} dispatch={dispatch} {...rest} />
      <DocumentCanvas doc={live} caps={caps} limits={state.limits} dispatch={dispatch} errorField={null} canUndo={false} canRedo={false} aiAllowed={false} onAddSection={() => {}} />
      <output data-testid="doc">{JSON.stringify(live)}</output>
    </ToastProvider>
  );
}

const liveDoc = (): ResumeDocument => JSON.parse(document.querySelector('[data-testid="doc"]')!.textContent ?? "{}") as ResumeDocument;
const row = (key: string) => document.querySelector<HTMLElement>(`[data-row="${key}"]`)!;
const states = () => Object.fromEntries(Array.from(document.querySelectorAll<HTMLElement>("[data-row]")).map((r) => [r.dataset.row!, r.dataset.state!]));
const tick = () => act(() => void vi.advanceTimersByTime(5));

describe("AddSectionPanel", () => {
  it("lists the board's eleven rows in order", () => {
    render(<Harness doc={fixture()} />);
    const names = Array.from(document.querySelectorAll("[data-row]")).map((r) => r.querySelector("span.truncate")?.textContent);
    expect(names).toEqual([
      "Personal Information",
      "Professional Summary",
      "Work Experience",
      "Education",
      "Skills",
      "Projects",
      "Certifications",
      "Achievements",
      "Languages",
      "Interests",
      "Custom Section",
    ]);
  });

  it("DESIGN_FREE on full-v2: present kinds are Already added, missing ones offer Add to resume", () => {
    render(<Harness doc={fixture()} />);
    expect(states()).toEqual({
      basics: "added",
      SUMMARY: "added",
      EXPERIENCE: "added",
      EDUCATION: "added",
      SKILLS: "added",
      PROJECTS: "added",
      CERTIFICATIONS: "available",
      ACHIEVEMENTS: "added",
      LANGUAGES: "available",
      INTERESTS: "added",
      CUSTOM: "available", // custom sections can always be added more of
    });
    expect(within(row("PROJECTS")).getByText("Already added")).toBeTruthy();
    expect(within(row("LANGUAGES")).getByRole("button", { name: "Add Languages to resume" }).textContent).toBe("Add to resume");
  });

  it("ATS_STRICT: Interests is disabled 'Not in this ATS template'; DESIGN_FREE offers it", () => {
    const doc = fixture(["INTERESTS"]);
    const { unmount } = render(<Harness doc={doc} caps={ATS_STRICT} />);
    expect(row("INTERESTS").dataset.state).toBe("disabled");
    expect(row("INTERESTS").textContent).toContain("Not in this ATS template");
    expect(within(row("INTERESTS")).queryByRole("button")).toBeNull();
    unmount();
    render(<Harness doc={doc} caps={DESIGN_FREE} />);
    expect(row("INTERESTS").dataset.state).toBe("available");
    expect(within(row("INTERESTS")).getByRole("button", { name: "Add Interests to resume" })).toBeTruthy();
  });

  it("ATS_STRICT: Custom Section is open until the limit, then 'Limit reached (ATS)'", () => {
    const { unmount } = render(<Harness doc={fixture(["CUSTOM"])} caps={ATS_STRICT} />);
    expect(row("CUSTOM").dataset.state).toBe("available");
    unmount();
    render(<Harness doc={fixture()} caps={ATS_STRICT} />); // full-v2 already has one custom section
    expect(row("CUSTOM").dataset.state).toBe("disabled");
    expect(row("CUSTOM").textContent).toContain("Limit reached (ATS)");
  });

  it("a template that allows no custom sections disables the row", () => {
    render(<Harness doc={fixture(["CUSTOM"])} caps={{ ...ATS_STRICT, custom: "none" }} />);
    expect(row("CUSTOM").dataset.state).toBe("disabled");
    expect(row("CUSTOM").textContent).toContain("Not in this ATS template");
  });

  it("adding appends the section, draws its block, flips the row to Already added, and focuses its first field", () => {
    vi.useFakeTimers();
    render(<Harness doc={fixture()} />);
    fireEvent.click(within(row("CERTIFICATIONS")).getByRole("button", { name: "Add Certifications to resume" }));
    const added = liveDoc().sections.at(-1)!;
    expect(added.kind).toBe("CERTIFICATIONS");
    expect(added.id).toMatch(/^s_[A-Za-z0-9]{8}$/);
    expect(row("CERTIFICATIONS").dataset.state).toBe("added");
    expect(document.getElementById(`rb-${added.id}`)).toBeTruthy();
    tick();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    expect(document.getElementById(`rb-${added.id}`)!.contains(document.activeElement)).toBe(true);
    expect(document.querySelector(".sr-only[role=status]")!.textContent).toBe("Certifications added to your resume");
  });

  it("adds every missing standard kind in turn, each landing on the canvas", () => {
    vi.useFakeTimers();
    render(<Harness doc={fixture(["PROJECTS", "ACHIEVEMENTS", "INTERESTS"])} />);
    for (const [key, label] of [["PROJECTS", "Projects"], ["CERTIFICATIONS", "Certifications"], ["LANGUAGES", "Languages"], ["INTERESTS", "Interests"]] as const) {
      fireEvent.click(within(row(key)).getByRole("button", { name: `Add ${label} to resume` }));
      tick();
      expect(row(key).dataset.state).toBe("added");
      expect(liveDoc().sections.some((s) => s.kind === key)).toBe(true);
    }
  });

  it("is one history entry per add (a single undo removes the section)", () => {
    const doc = fixture();
    const base = initEditorState({ doc, templateId: "modern", theme: null, docVersion: 1 });
    const added = editorReducer(base, { type: "section/add", kind: "LANGUAGES", sectionId: "s_langs001", at: 1 });
    expect(currentDoc(editorReducer(added, { type: "history/undo" })).sections.some((s) => s.kind === "LANGUAGES")).toBe(false);
  });

  it("Custom Section asks for a name first, then adds it with that title", () => {
    vi.useFakeTimers();
    render(<Harness doc={fixture(["CUSTOM"])} />);
    const toggle = within(row("CUSTOM")).getByRole("button", { name: "Add a custom section" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    const name = screen.getByLabelText("Section name") as HTMLInputElement;
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(name);

    fireEvent.submit(name.closest("form")!); // an empty name is refused
    expect(liveDoc().sections.some((s) => s.kind === "CUSTOM")).toBe(false);
    expect(screen.getByText("Give the section a name")).toBeTruthy();

    fireEvent.change(name, { target: { value: "Volunteer Work 2024!" } }); // anything goes when custom is "any"
    fireEvent.submit(name.closest("form")!);
    const custom = liveDoc().sections.find((s) => s.kind === "CUSTOM");
    expect(custom?.title).toBe("Volunteer Work 2024!");
    expect(screen.queryByLabelText("Section name")).toBeNull(); // the form closes
    // custom sections can be added again
    expect(row("CUSTOM").dataset.state).toBe("available");
  });

  it("limited custom sections enforce the plain-heading pattern", () => {
    render(<Harness doc={fixture(["CUSTOM"])} caps={ATS_STRICT} />);
    fireEvent.click(within(row("CUSTOM")).getByRole("button", { name: "Add a custom section" }));
    const name = screen.getByLabelText("Section name") as HTMLInputElement;
    expect(screen.getByText("Keep it a plain heading so ATS parsers recognise it")).toBeTruthy();

    for (const bad of ["Q4 Wins", "x", "Awards & Honours", "1st"]) {
      fireEvent.change(name, { target: { value: bad } });
      fireEvent.submit(name.closest("form")!);
      expect(liveDoc().sections.some((s) => s.kind === "CUSTOM")).toBe(false);
      expect(name.getAttribute("aria-invalid")).toBe("true");
    }
    expect(screen.getByText("Use letters and spaces only, 2 to 30 characters")).toBeTruthy();

    fireEvent.change(name, { target: { value: "Volunteer Work" } });
    fireEvent.submit(name.closest("form")!);
    expect(liveDoc().sections.find((s) => s.kind === "CUSTOM")?.title).toBe("Volunteer Work");
    // the template allows one: the row now reads Limit reached
    expect(row("CUSTOM").dataset.state).toBe("disabled");
    expect(row("CUSTOM").textContent).toContain("Limit reached (ATS)");
  });

  it("Esc in the name field cancels the title and does not reach the sheet", () => {
    const onKey = vi.fn();
    document.addEventListener("keydown", onKey);
    render(<Harness doc={fixture(["CUSTOM"])} />);
    fireEvent.click(within(row("CUSTOM")).getByRole("button", { name: "Add a custom section" }));
    fireEvent.keyDown(screen.getByLabelText("Section name"), { key: "Escape" });
    expect(screen.queryByLabelText("Section name")).toBeNull();
    expect(document.activeElement).toBe(within(row("CUSTOM")).getByRole("button", { name: "Add a custom section" }));
    expect(onKey).not.toHaveBeenCalled();
    document.removeEventListener("keydown", onKey);
  });

  it("every Add control is a native button, so Enter and Space add (keyboard path)", () => {
    render(<Harness doc={fixture()} />);
    const btn = within(row("LANGUAGES")).getByRole("button", { name: "Add Languages to resume" });
    expect(btn.tagName).toBe("BUTTON");
    expect(btn.getAttribute("type")).toBe("button");
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  it("stops offering rows at the section limit", () => {
    const doc = fixture(["CERTIFICATIONS", "LANGUAGES"]);
    render(<Harness doc={doc} limits={{ ...DEFAULT_BUILDER_CONFIG.limits, sections: doc.sections.length }} />);
    expect(row("LANGUAGES").dataset.state).toBe("disabled");
    expect(row("LANGUAGES").textContent).toContain("Section limit reached");
    expect(row("CUSTOM").dataset.state).toBe("disabled");
    expect(row("PROJECTS").dataset.state).toBe("added"); // existing ones still read as added
  });

  it("a section tab's kind puts focus on that row's button once the panel is open, then reports it handled", () => {
    vi.useFakeTimers();
    const handled = vi.fn();
    const { rerender } = render(<Harness doc={fixture()} focusKind="LANGUAGES" open={false} onFocusHandled={handled} />);
    tick();
    expect(handled).not.toHaveBeenCalled(); // closed: nothing to focus yet
    rerender(<Harness doc={fixture()} focusKind="LANGUAGES" open onFocusHandled={handled} />);
    tick();
    expect(document.activeElement).toBe(within(row("LANGUAGES")).getByRole("button", { name: "Add Languages to resume" }));
    expect(handled).toHaveBeenCalledTimes(1);
  });

  it("a kind already added is focused as its row", () => {
    vi.useFakeTimers();
    render(<Harness doc={fixture()} focusKind="EDUCATION" open />);
    tick();
    expect(document.activeElement).toBe(row("EDUCATION"));
  });

  it("asks the shell to close the sheet after an add when it covers the document", () => {
    const onAdded = vi.fn();
    render(<Harness doc={fixture()} onAdded={onAdded} />);
    fireEvent.click(within(row("LANGUAGES")).getByRole("button", { name: "Add Languages to resume" }));
    expect(onAdded).toHaveBeenCalledTimes(1);
  });

  it("ends with the mascot Pro tip", () => {
    render(<Harness doc={fixture()} />);
    expect(screen.getByText("Pro tip!")).toBeTruthy();
    expect(screen.getByText("Add relevant sections to showcase your unique strengths.")).toBeTruthy();
    expect(document.querySelector('img[src*="mascot-wave-laptop"]')).toBeTruthy();
  });
});
