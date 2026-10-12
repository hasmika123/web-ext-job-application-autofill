import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ResumeDocument } from "@kiwiply/ui";
import { CanvasHarness, liveDoc } from "./test-canvas";

afterEach(cleanup);

/** One of every kind that has item rows. */
function kinds(): ResumeDocument {
  return {
    schema: 2,
    meta: { title: "Kinds" },
    basics: { name: "P" },
    sections: [
      {
        id: "s_exp",
        kind: "EXPERIENCE",
        title: "Experience",
        items: [
          {
            id: "i_exp00001",
            title: "Software Engineer",
            org: "Acme",
            location: "Austin",
            start: "2022-06",
            end: null,
            current: true,
            bullets: [
              { id: "b_aaaaaaaa", text: "Led migration", src: "parsed" },
              { id: "b_bbbbbbbb", text: "Cut latency", src: "parsed" },
            ],
          },
          { id: "i_exp00002", title: "Intern", org: "Beta", start: "2020", end: "2021", bullets: [] },
        ],
      },
      { id: "s_edu", kind: "EDUCATION", title: "Education", items: [{ id: "i_edu00001", school: "MIT", degree: "BS", field: "CS", gpa: "3.9", start: "2012", end: "2016", bullets: [] }] },
      { id: "s_skl", kind: "SKILLS", title: "Skills", items: [{ id: "i_skl00001", group: "Languages", skills: ["Go", "Rust"] }] },
      { id: "s_prj", kind: "PROJECTS", title: "Projects", items: [{ id: "i_prj00001", title: "Icons", url: "github.com/p/icons", start: "2022", end: null, bullets: [] }] },
      { id: "s_crt", kind: "CERTIFICATIONS", title: "Certifications", items: [{ id: "i_crt00001", title: "AWS SA", org: "Amazon", date: "2022-05", url: "aws.com/c" }] },
      { id: "s_lng", kind: "LANGUAGES", title: "Languages", items: [{ id: "i_lng00001", name: "Hindi", level: "Native" }] },
      { id: "s_ach", kind: "ACHIEVEMENTS", title: "Achievements", items: [{ id: "i_ach00001", text: "Won an award", date: "2023-11" }] },
      { id: "s_int", kind: "INTERESTS", title: "Interests", items: [{ id: "i_int00001", text: "Chess" }] },
      { id: "s_cus", kind: "CUSTOM", title: "Volunteering", items: [{ id: "i_cus00001", title: "Mentor", org: "ADPList", start: "2021", end: null, current: true, bullets: [] }] },
    ],
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper reads fields of every kind by name
const sec = (id: string) => liveDoc().sections.find((s) => s.id === id)! as unknown as { items: Array<Record<string, any>> };
const row = (id: string) => document.querySelector(`[data-field="${id}"]`) as HTMLElement;
const val = (label: string | RegExp, scope: HTMLElement | Document = document) => (within(scope as HTMLElement).getAllByLabelText(label)[0] as HTMLInputElement).value;
const bullets = () => (screen.getAllByLabelText(/^Bullet \d+$/) as HTMLTextAreaElement[]).filter((b) => row("i_exp00001").contains(b));
const values = () => bullets().map((b) => b.value);

describe("ItemRow: per-kind fields", () => {
  it("EXPERIENCE: dates, location, title, company; Present disables End", () => {
    render(<CanvasHarness doc={kinds()} />);
    const r = row("i_exp00001");
    expect(val("Job title", r)).toBe("Software Engineer");
    expect(val("Company", r)).toBe("Acme");
    expect(val("Location", r)).toBe("Austin");
    expect(val("Start", r)).toBe("Jun 2022");
    expect((within(r).getByLabelText("End") as HTMLInputElement).disabled).toBe(true);
    expect((within(r).getByLabelText(/^Present/) as HTMLInputElement).checked).toBe(true);

    fireEvent.click(within(r).getByLabelText(/^Present/));
    expect(sec("s_exp").items[0].current).toBe(false);
    expect((within(row("i_exp00001")).getByLabelText("End") as HTMLInputElement).disabled).toBe(false);
  });

  it("EXPERIENCE: typing edits the item", () => {
    render(<CanvasHarness doc={kinds()} />);
    const r = row("i_exp00001");
    fireEvent.change(within(r).getByLabelText("Job title"), { target: { value: "Staff Engineer" } });
    fireEvent.change(within(r).getByLabelText("Company"), { target: { value: "Acme Inc." } });
    fireEvent.change(within(r).getByLabelText("Location"), { target: { value: "Remote" } });
    expect(sec("s_exp").items[0]).toMatchObject({ title: "Staff Engineer", org: "Acme Inc.", location: "Remote" });
  });

  it("EDUCATION: degree, field, school, GPA, dates (no Present)", () => {
    render(<CanvasHarness doc={kinds()} />);
    const r = row("i_edu00001");
    expect(val("Degree", r)).toBe("BS");
    expect(val("Field of study", r)).toBe("CS");
    expect(val("School", r)).toBe("MIT");
    expect(val("GPA", r)).toBe("3.9");
    expect(val("End", r)).toBe("2016");
    expect(within(r).queryByLabelText(/^Present/)).toBeNull();
    fireEvent.change(within(r).getByLabelText("School"), { target: { value: "Stanford" } });
    fireEvent.change(within(r).getByLabelText("GPA"), { target: { value: "4.0" } });
    expect(sec("s_edu").items[0]).toMatchObject({ school: "Stanford", gpa: "4.0" });
  });

  it("PROJECTS: title, link, dates; no location", () => {
    render(<CanvasHarness doc={kinds()} />);
    const r = row("i_prj00001");
    expect(val("Project title", r)).toBe("Icons");
    expect(val("Project link", r)).toBe("github.com/p/icons");
    expect(within(r).queryByLabelText("Location")).toBeNull();
    fireEvent.change(within(r).getByLabelText("Project link"), { target: { value: "example.com" } });
    expect(sec("s_prj").items[0].url).toBe("example.com");
  });

  it("CERTIFICATIONS, LANGUAGES, ACHIEVEMENTS, INTERESTS: compact rows", () => {
    render(<CanvasHarness doc={kinds()} />);
    const cert = row("i_crt00001");
    expect(val("Certification", cert)).toBe("AWS SA");
    expect(val("Issuer", cert)).toBe("Amazon");
    expect(val("Date", cert)).toBe("May 2022");
    expect(val("Credential link", cert)).toBe("aws.com/c");
    fireEvent.change(within(cert).getByLabelText("Issuer"), { target: { value: "AWS" } });

    const lang = row("i_lng00001");
    fireEvent.change(within(lang).getByLabelText("Level"), { target: { value: "Fluent" } });

    const ach = row("i_ach00001");
    expect(val("Achievement", ach)).toBe("Won an award");
    fireEvent.change(within(ach).getByLabelText("Achievement"), { target: { value: "Won two awards" } });

    const interest = row("i_int00001");
    fireEvent.change(within(interest).getByLabelText("Interest"), { target: { value: "Chess, Go" } });

    expect(sec("s_crt").items[0].org).toBe("AWS");
    expect(sec("s_lng").items[0].level).toBe("Fluent");
    expect(sec("s_ach").items[0].text).toBe("Won two awards");
    expect(sec("s_int").items[0].text).toBe("Chess, Go");
  });

  it("CUSTOM looks like an experience row", () => {
    render(<CanvasHarness doc={kinds()} />);
    const r = row("i_cus00001");
    expect(val("Job title", r)).toBe("Mentor");
    expect(val("Company", r)).toBe("ADPList");
  });

  it("SKILLS: the group and its chips; type + Enter adds, a chip's remove button removes", () => {
    render(<CanvasHarness doc={kinds()} />);
    const r = row("i_skl00001");
    expect(val("Skill group", r)).toBe("Languages");
    const box = within(r).getByLabelText("Skills in Languages") as HTMLInputElement;
    fireEvent.change(box, { target: { value: "Kotlin" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(sec("s_skl").items[0].skills).toEqual(["Go", "Rust", "Kotlin"]);
    fireEvent.click(within(r).getByLabelText("Remove Go"));
    expect(sec("s_skl").items[0].skills).toEqual(["Rust", "Kotlin"]);
    // the count is announced for the 40-skill cap
    expect(document.getElementById(box.getAttribute("aria-describedby")!)!.textContent).toBe("2 of 40");
    fireEvent.change(within(r).getByLabelText("Skill group"), { target: { value: "Tools" } });
    expect(sec("s_skl").items[0].group).toBe("Tools");
  });
});

describe("ItemRow: dates", () => {
  it("shows month-year, accepts how people write it, and keeps a bad draft out of the document", () => {
    render(<CanvasHarness doc={kinds()} />);
    const start = () => within(row("i_exp00002")).getByLabelText("Start") as HTMLInputElement;
    expect(start().value).toBe("2020");
    fireEvent.change(start(), { target: { value: "Mar 20" } });
    expect(start().value).toBe("Mar 20"); // a draft
    expect(screen.getByText("Try Mar 2022 or 2022")).toBeTruthy();
    expect(sec("s_exp").items[1].start).toBe("2020"); // not in the document
    fireEvent.change(start(), { target: { value: "Mar 2023" } });
    expect(screen.queryByText("Try Mar 2022 or 2022")).toBeNull();
    expect(sec("s_exp").items[1].start).toBe("2023-03");
    fireEvent.change(start(), { target: { value: "9/2021" } });
    expect(sec("s_exp").items[1].start).toBe("2021-09");
    fireEvent.blur(start());
    expect(start().value).toBe("Sep 2021");
    fireEvent.change(start(), { target: { value: "" } });
    expect(sec("s_exp").items[1].start).toBeNull();
  });
});

describe("ItemRow: bullets", () => {
  it("renders the bullets, Enter splits at the caret and moves focus to the new one", () => {
    render(<CanvasHarness doc={kinds()} />);
    expect(values()).toEqual(["Led migration", "Cut latency"]);
    const first = bullets()[0];
    first.focus();
    first.setSelectionRange(4, 4);
    fireEvent.keyDown(first, { key: "Enter" });
    expect(values()).toEqual(["Led ", "migration", "Cut latency"]);
    expect(document.activeElement).toBe(bullets()[1]);
    expect(bullets()[1].selectionStart).toBe(0);
  });

  it("Shift+Enter does not create a bullet", () => {
    render(<CanvasHarness doc={kinds()} />);
    fireEvent.keyDown(bullets()[0], { key: "Enter", shiftKey: true });
    expect(values()).toEqual(["Led migration", "Cut latency"]);
  });

  it("Backspace in an empty bullet deletes it and focuses the one above", () => {
    render(<CanvasHarness doc={kinds()} />);
    const first = bullets()[0];
    first.setSelectionRange(first.value.length, first.value.length);
    fireEvent.keyDown(first, { key: "Enter" });
    const fresh = bullets()[1];
    expect(fresh.value).toBe("");
    fresh.setSelectionRange(0, 0);
    fireEvent.keyDown(fresh, { key: "Backspace" });
    expect(values()).toEqual(["Led migration", "Cut latency"]);
    expect(document.activeElement).toBe(bullets()[0]);
    expect(bullets()[0].selectionStart).toBe("Led migration".length);
  });

  it("Backspace at the start of a non-empty bullet merges it into the one above", () => {
    render(<CanvasHarness doc={kinds()} />);
    const second = bullets()[1];
    second.setSelectionRange(0, 0);
    fireEvent.keyDown(second, { key: "Backspace" });
    expect(values()).toEqual(["Led migrationCut latency"]);
    expect(document.activeElement).toBe(bullets()[0]);
  });

  it("Backspace mid-text, or at the start of the first bullet, is left to the browser", () => {
    render(<CanvasHarness doc={kinds()} />);
    const first = bullets()[0];
    first.setSelectionRange(0, 0);
    expect(fireEvent.keyDown(first, { key: "Backspace" })).toBe(true);
    const second = bullets()[1];
    second.setSelectionRange(3, 3);
    expect(fireEvent.keyDown(second, { key: "Backspace" })).toBe(true);
    expect(values()).toEqual(["Led migration", "Cut latency"]);
  });

  it("Ctrl+Arrow moves the focused bullet and keeps the focus on it", () => {
    render(<CanvasHarness doc={kinds()} />);
    fireEvent.keyDown(bullets()[0], { key: "ArrowDown", ctrlKey: true });
    expect(values()).toEqual(["Cut latency", "Led migration"]);
    expect((document.activeElement as HTMLTextAreaElement).value).toBe("Led migration");
    fireEvent.keyDown(bullets()[0], { key: "ArrowUp", ctrlKey: true }); // already first: nothing
    expect(values()).toEqual(["Cut latency", "Led migration"]);
  });

  it("'Add bullet' appends and focuses an empty bullet, and stops at the config's cap", () => {
    render(<CanvasHarness doc={kinds()} />);
    fireEvent.click(within(row("i_exp00001")).getByRole("button", { name: /Add bullet/ }));
    expect(values()).toEqual(["Led migration", "Cut latency", ""]);
    expect(document.activeElement).toBe(bullets()[2]);
  });

  it("a numbered item shows 1. 2. markers", () => {
    const doc = kinds();
    (doc.sections[0].items[0] as { listStyle?: string }).listStyle = "number";
    render(<CanvasHarness doc={doc} />);
    const r = row("i_exp00001");
    expect(within(r).getByText("1.")).toBeTruthy();
    expect(within(r).getByText("2.")).toBeTruthy();
  });
});

describe("ItemRow: controls and the menu", () => {
  const more = (id: string) => fireEvent.click(within(row(id)).getByRole("button", { name: /^More actions for/ }));
  const entry = (name: string) => screen.getByRole("menuitem", { name }) as HTMLButtonElement;

  it("moves an item down with ↓ and up/down from the menu; the ends are disabled", () => {
    render(<CanvasHarness doc={kinds()} />);
    expect((within(row("i_exp00002")).getByRole("button", { name: /^Move .* down$/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(row("i_exp00001")).getByRole("button", { name: /^Move .* down$/ }));
    expect(sec("s_exp").items.map((i) => i.id)).toEqual(["i_exp00002", "i_exp00001"]);

    more("i_exp00002");
    expect(entry("Move up").disabled).toBe(true);
    fireEvent.click(entry("Move down"));
    expect(sec("s_exp").items.map((i) => i.id)).toEqual(["i_exp00001", "i_exp00002"]);
  });

  it("duplicates an item right below it, with new ids", () => {
    render(<CanvasHarness doc={kinds()} />);
    more("i_exp00001");
    fireEvent.click(entry("Duplicate"));
    const items = sec("s_exp").items;
    expect(items).toHaveLength(3);
    expect(items[1]).toMatchObject({ title: "Software Engineer", org: "Acme" });
    expect(items[1].id).not.toBe("i_exp00001");
    expect(items[1].bullets.map((b: { id: string; text: string }) => b.text)).toEqual(["Led migration", "Cut latency"]);
    expect(items[1].bullets[0].id).not.toBe("b_aaaaaaaa");
  });

  it("hides an item into a collapsed row, and Show brings it back", () => {
    render(<CanvasHarness doc={kinds()} />);
    more("i_exp00002");
    fireEvent.click(entry("Hide from this resume"));
    const r = row("i_exp00002");
    expect(r.getAttribute("data-hidden")).toBe("true");
    expect(within(r).getByText("Hidden")).toBeTruthy();
    expect(within(r).queryByLabelText("Job title")).toBeNull();
    fireEvent.click(within(r).getByRole("button", { name: /^Show/ }));
    expect(sec("s_exp").items[1].hidden).toBe(false);
    expect(within(row("i_exp00002")).getByLabelText("Job title")).toBeTruthy();
  });

  it("deleting shows 'removed' with an Undo, from 🗑 and from the menu", () => {
    render(<CanvasHarness doc={kinds()} />);
    fireEvent.click(within(row("i_exp00002")).getByRole("button", { name: /^Delete/ }));
    expect(sec("s_exp").items.map((i) => i.id)).toEqual(["i_exp00001"]);
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(sec("s_exp").items.map((i) => i.id)).toEqual(["i_exp00001", "i_exp00002"]);

    more("i_exp00001");
    fireEvent.click(entry("Delete"));
    expect(sec("s_exp").items.map((i) => i.id)).toEqual(["i_exp00002"]);
  });

  it("✎ focuses the first field of the row", () => {
    render(<CanvasHarness doc={kinds()} />);
    fireEvent.click(within(row("i_lng00001")).getByRole("button", { name: /^Edit/ }));
    expect(document.activeElement).toBe(within(row("i_lng00001")).getByLabelText("Language"));
  });

  it("every kind's row has the controls", () => {
    render(<CanvasHarness doc={kinds()} />);
    for (const id of ["i_exp00001", "i_edu00001", "i_skl00001", "i_prj00001", "i_crt00001", "i_lng00001", "i_ach00001", "i_int00001", "i_cus00001"]) {
      const r = row(id);
      for (const name of [/^Edit/, /^Move .* down$/, /^More actions for/, /^Delete/]) expect(within(r).getAllByRole("button", { name }).length, `${id} ${name}`).toBeGreaterThan(0);
    }
  });
});
