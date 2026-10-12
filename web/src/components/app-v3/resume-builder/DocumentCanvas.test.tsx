import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DESIGN_FREE, RESUME_DEFAULT_SECTION_TITLES } from "@kiwiply/ui";
import type { ResumeDocument } from "@kiwiply/ui";
import { CanvasHarness, liveDoc } from "./test-canvas";
import { fieldIdForPath } from "./state/paths";

afterEach(cleanup);

/** `full-v2` (summary, experience, education, skills, projects, achievements, interests, custom) plus the two kinds it lacks. */
function everyKind(): ResumeDocument {
  const doc = JSON.parse(
    readFileSync(path.resolve(__dirname, "../../../../../packages/ui/src/resume/__fixtures__/full-v2.json"), "utf8"),
  ) as ResumeDocument;
  doc.basics.photo = null;
  doc.sections.push(
    { id: "s_certs", kind: "CERTIFICATIONS", items: [{ id: "i_cert0001", title: "AWS SA", org: "Amazon", date: "2022-05", url: "" }] },
    { id: "s_langs", kind: "LANGUAGES", items: [{ id: "i_lang0001", name: "Hindi", level: "Native" }] },
  );
  return doc;
}

const blocks = () => Array.from(document.querySelectorAll<HTMLElement>(".rb-block"));
const input = (label: string | RegExp) => screen.getAllByLabelText(label)[0] as HTMLInputElement;

describe("DocumentCanvas", () => {
  it("renders the header and every section kind from full-v2 as a block, in document order", () => {
    const doc = everyKind();
    render(<CanvasHarness doc={doc} />);
    expect(blocks().map((b) => b.id)).toEqual(["rb-basics", ...doc.sections.map((s) => `rb-${s.id}`)]);
    const kinds = new Set(doc.sections.map((s) => s.kind));
    for (const k of ["SUMMARY", "EXPERIENCE", "EDUCATION", "SKILLS", "PROJECTS", "CERTIFICATIONS", "LANGUAGES", "ACHIEVEMENTS", "INTERESTS", "CUSTOM"]) expect(kinds.has(k as never)).toBe(true);
    // a heading per section (CSS draws it in capitals): ATS headings are the standard ones, a custom section keeps its own
    for (const s of doc.sections) {
      const h = document.getElementById(`rb-${s.id}-h`)!;
      expect(h.textContent).toBe(s.kind === "CUSTOM" ? s.title : RESUME_DEFAULT_SECTION_TITLES[s.kind]);
    }
  });

  it("shows the header: name, headline, contact fields and links", () => {
    render(<CanvasHarness doc={everyKind()} />);
    expect(input("Name").value).toBe("  Priya Sharma ");
    expect(input("Headline").value).toBe("Software Engineer");
    expect(input("Email").value).toBe("priya@example.com");
    expect(input("Phone").value).toBe("+1 415 555 0100");
    expect(input("Location").value).toBe("San Francisco, CA");
    expect(input("Link 1").value).toBe("https://linkedin.com/in/priya");
    expect(input("Link 2").value).toBe("https://github.com/priya");
  });

  it("edits the header and the doc follows", () => {
    render(<CanvasHarness doc={everyKind()} />);
    fireEvent.change(input("Name"), { target: { value: "Priya S." } });
    fireEvent.change(input("Headline"), { target: { value: "Staff Engineer" } });
    fireEvent.change(input("Phone"), { target: { value: "555" } });
    expect(liveDoc().basics).toMatchObject({ name: "Priya S.", headline: "Staff Engineer", phone: "555" });
  });

  it("adds links up to eight, then disables '+ Add link'; removes one", () => {
    render(<CanvasHarness doc={everyKind()} />);
    const add = () => screen.getByRole("button", { name: /Add link/ }) as HTMLButtonElement;
    for (let i = 0; i < 6; i++) fireEvent.click(add());
    expect(liveDoc().basics.links).toHaveLength(8);
    expect(add().disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("Remove link 1"));
    expect(liveDoc().basics.links).toHaveLength(7);
    expect(add().disabled).toBe(false);
  });

  it("draws the photo slot only when the template allows a photo; the upload is 'Coming soon'", () => {
    const { unmount } = render(<CanvasHarness doc={everyKind()} />);
    expect(screen.queryByRole("button", { name: /Add photo/ })).toBeNull(); // ATS_STRICT: no photo
    unmount();
    render(<CanvasHarness doc={everyKind()} caps={DESIGN_FREE} />);
    const slot = screen.getByRole("button", { name: /Add photo/ }) as HTMLButtonElement;
    expect(slot.disabled).toBe(true);
    expect(slot.title).toBe("Coming soon");
  });

  it("an empty section shows a placeholder that adds an item on focus, not on render", () => {
    const doc = everyKind();
    doc.sections = [{ id: "s_exp", kind: "EXPERIENCE", title: "Experience", items: [] }];
    render(<CanvasHarness doc={doc} />);
    expect(liveDoc().sections[0].items).toHaveLength(0); // render added nothing
    const placeholder = screen.getByPlaceholderText(/Add your first experience/);
    fireEvent.focus(placeholder);
    expect(liveDoc().sections[0].items).toHaveLength(1);
    expect(screen.queryByPlaceholderText(/Add your first experience/)).toBeNull();
    expect(document.activeElement).toBe(screen.getByLabelText("Job title")); // the new row's first field has focus
  });

  it("every other empty kind has its own placeholder", () => {
    const doc = everyKind();
    doc.sections = ["EDUCATION", "SKILLS", "PROJECTS", "CERTIFICATIONS", "LANGUAGES", "ACHIEVEMENTS", "INTERESTS", "CUSTOM"].map((kind, i) => ({ id: `s_k${i}`, kind, title: kind === "CUSTOM" ? "Extra" : undefined, items: [] }) as never);
    render(<CanvasHarness doc={doc} />);
    expect(document.querySelectorAll("input[readonly]")).toHaveLength(8);
    const skills = screen.getByPlaceholderText(/skill group/);
    fireEvent.focus(skills);
    expect(document.activeElement).toBe(screen.getByLabelText("Skill group"));
  });

  it("a Summary with no item still has a text box; typing creates the item", () => {
    const doc = everyKind();
    doc.sections = [{ id: "s_sum", kind: "SUMMARY", title: "Summary", items: [] }];
    render(<CanvasHarness doc={doc} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Summary" }), { target: { value: "Hello" } });
    expect(liveDoc().sections[0].items).toHaveLength(1);
    expect(liveDoc().sections[0].items[0]).toMatchObject({ text: "Hello", src: "user" });
  });

  it("a 422 path rings the field it names, with aria-invalid", () => {
    const doc = everyKind();
    const cases: Array<[string, () => HTMLElement]> = [
      ["$.basics.name", () => input("Name")],
      ["$.sections[1].items[0].start", () => input("Start")],
      ["$.sections[1].items[0].bullets[1].text", () => input("Bullet 2")],
      ["$.sections[3].items[0].group", () => input("Skill group")],
    ];
    for (const [p, find] of cases) {
      const field = fieldIdForPath(doc, p);
      expect(field, p).not.toBeNull();
      const { unmount } = render(<CanvasHarness doc={doc} errorField={field} />);
      expect(find().getAttribute("aria-invalid"), p).toBe("true");
      unmount();
    }
    render(<CanvasHarness doc={doc} errorField={null} />);
    expect(input("Name").getAttribute("aria-invalid")).toBeNull();
  });

  it("an empty resume shows the start-with-a-summary prompt", () => {
    const doc = everyKind();
    doc.sections = [];
    const onAdd = vi.fn();
    render(<CanvasHarness doc={doc} onAddSection={onAdd} />);
    fireEvent.click(screen.getByRole("button", { name: "Start with a summary" }));
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(blocks().map((b) => b.id)).toEqual(["rb-basics"]);
  });

  it("hidden sections collapse to their heading with Show; Show brings them back", () => {
    const doc = everyKind();
    doc.sections[1].hidden = true;
    render(<CanvasHarness doc={doc} />);
    const hidden = document.getElementById(`rb-${doc.sections[1].id}`)!;
    expect(within(hidden).getByText("Hidden")).toBeTruthy();
    expect(within(hidden).queryByLabelText("Job title")).toBeNull();
    fireEvent.click(within(hidden).getByRole("button", { name: /^Show/ }));
    expect(liveDoc().sections[1].hidden).toBe(false);
    expect(screen.getAllByLabelText("Job title").length).toBeGreaterThan(0);
  });
});
