import { useRef, useState } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResumeSection, ResumeSectionKind } from "@kiwiply/ui";
import SectionTabs from "./SectionTabs";

type IoCallback = (entries: Array<{ target: Element; isIntersecting: boolean }>) => void;
let ioCallback: IoCallback | null = null;
let observed: Element[] = [];

beforeEach(() => {
  ioCallback = null;
  observed = [];
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: IoCallback) {
        ioCallback = cb;
      }
      observe(el: Element) {
        observed.push(el);
      }
      disconnect() {}
    },
  );
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const sections: ResumeSection[] = [
  { id: "s_sum", kind: "SUMMARY", title: "Summary", items: [] },
  { id: "s_exp", kind: "EXPERIENCE", title: "Experience", items: [] },
  { id: "s_proj", kind: "PROJECTS", title: "Projects", items: [] },
  { id: "s_cus", kind: "CUSTOM", title: "Volunteering", items: [] },
];

function Harness({ list = sections, onAdd = () => {} }: { list?: ResumeSection[]; onAdd?: (k: ResumeSectionKind | null) => void }) {
  const root = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<string | null>(null);
  return (
    <div>
      <div ref={root}>
        <SectionTabs sections={list} activeId={active} onActiveChange={setActive} scrollRootRef={root} onAddSection={onAdd} />
        <section id="rb-basics" className="rb-block"><input aria-label="basics field" /></section>
        {list.map((s) => (
          <section key={s.id} id={`rb-${s.id}`} className="rb-block">
            <textarea aria-label={`${s.id} field`} />
          </section>
        ))}
      </div>
    </div>
  );
}

const nav = () => screen.getByRole("navigation", { name: "Resume sections" });
const tab = (name: string) => within(nav()).getByRole("tab", { name });
// The Menu primitive wraps its trigger in a role=button span: the real <button> is the inner one.
const more = () => within(nav()).getAllByRole("button", { name: "More" }).find((b) => b.tagName === "BUTTON") as HTMLButtonElement;
const selected = () => within(nav()).queryAllByRole("tab").filter((t) => t.getAttribute("aria-selected") === "true").map((t) => t.textContent);

describe("SectionTabs", () => {
  it("is a nav of the five fixed tabs plus More", () => {
    render(<Harness />);
    expect(within(nav()).getAllByRole("tab").map((t) => t.textContent)).toEqual(["Personal Info", "Summary", "Experience", "Education", "Skills"]);
    expect(more()).toBeTruthy();
  });

  it("scroll-spy: the first block in view becomes the active tab", () => {
    render(<Harness />);
    expect(observed.length).toBe(sections.length + 1);
    const el = (id: string) => document.getElementById(id)!;
    act(() => ioCallback?.([{ target: el("rb-s_exp"), isIntersecting: true }]));
    expect(selected()).toEqual(["Experience"]);
    // the summary scrolls into view above it: document order wins
    act(() => ioCallback?.([{ target: el("rb-s_sum"), isIntersecting: true }]));
    expect(selected()).toEqual(["Summary"]);
    act(() => ioCallback?.([{ target: el("rb-s_sum"), isIntersecting: false }]));
    expect(selected()).toEqual(["Experience"]);
    act(() => ioCallback?.([{ target: el("rb-basics"), isIntersecting: true }]));
    expect(selected()).toEqual(["Personal Info"]);
  });

  it("a tab click holds the underline against the spy until the user scrolls", () => {
    render(<Harness />);
    fireEvent.click(tab("Experience"));
    act(() => ioCallback?.([{ target: document.getElementById("rb-s_sum")!, isIntersecting: true }]));
    expect(selected()).toEqual(["Experience"]);
    fireEvent.wheel(document.getElementById("rb-s_sum")!);
    act(() => ioCallback?.([{ target: document.getElementById("rb-s_sum")!, isIntersecting: true }]));
    expect(selected()).toEqual(["Summary"]);
  });

  it("a block outside the five (Projects) highlights More", () => {
    render(<Harness />);
    act(() => ioCallback?.([{ target: document.getElementById("rb-s_proj")!, isIntersecting: true }]));
    expect(selected()).toEqual([]);
    expect(more().className).toContain("border-v2-green");
  });

  it("clicking a tab scrolls to its block and focuses its first field", () => {
    render(<Harness />);
    fireEvent.click(tab("Experience"));
    expect(document.getElementById("rb-s_exp")!.scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    expect(document.activeElement).toBe(screen.getByLabelText("s_exp field"));
    expect(selected()).toEqual(["Experience"]);
    fireEvent.click(tab("Personal Info"));
    expect(document.activeElement).toBe(screen.getByLabelText("basics field"));
  });

  it("respects reduced motion", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduce"), addEventListener() {}, removeEventListener() {} }));
    render(<Harness />);
    fireEvent.click(tab("Summary"));
    expect(document.getElementById("rb-s_sum")!.scrollIntoView).toHaveBeenCalledWith({ behavior: "auto", block: "start" });
  });

  it("a tab for a kind the document lacks asks to add it (Education, Skills)", () => {
    const onAdd = vi.fn();
    render(<Harness onAdd={onAdd} />);
    fireEvent.click(tab("Education"));
    expect(onAdd).toHaveBeenCalledWith("EDUCATION");
    fireEvent.click(tab("Skills"));
    expect(onAdd).toHaveBeenLastCalledWith("SKILLS");
  });

  it("the More menu lists the remaining sections and 'Add a section…'", () => {
    const onAdd = vi.fn();
    render(<Harness onAdd={onAdd} />);
    fireEvent.click(more());
    expect(screen.getAllByRole("menuitem").map((i) => i.textContent)).toEqual(["Projects", "Volunteering", "Add a section…"]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Volunteering" }));
    expect(document.getElementById("rb-s_cus")!.scrollIntoView).toHaveBeenCalled();
    fireEvent.click(more());
    fireEvent.click(screen.getByRole("menuitem", { name: "Add a section…" }));
    expect(onAdd).toHaveBeenCalledWith(null);
  });

  it("with no other sections the More menu is just 'Add a section…'", () => {
    render(<Harness list={sections.slice(0, 2)} />);
    fireEvent.click(more());
    expect(screen.getAllByRole("menuitem").map((i) => i.textContent)).toEqual(["Add a section…"]);
  });
});
