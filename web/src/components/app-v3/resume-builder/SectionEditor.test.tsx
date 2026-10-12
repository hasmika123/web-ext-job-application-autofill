import { useReducer } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import SectionEditor, { DATE_OK, normalizeDate } from "./SectionEditor";
import { currentDoc, editorReducer } from "./state/reducer";
import { testState } from "./state/test-doc";

afterEach(cleanup);

/** SectionEditor wired to the real reducer, as ResumeEditor does it. */
function Harness({ sectionId }: { sectionId: string }) {
  const [state, dispatch] = useReducer(editorReducer, undefined, () => testState());
  const section = currentDoc(state).sections.find((s) => s.id === sectionId)!;
  return <SectionEditor section={section} dispatch={dispatch} />;
}

const bullets = () => screen.getAllByLabelText(/^Bullet \d+$/) as HTMLTextAreaElement[];
const values = () => bullets().map((b) => b.value);

describe("SectionEditor: summary", () => {
  it("edits the summary text", () => {
    render(<Harness sectionId="s_sum" />);
    const box = screen.getByLabelText("Summary") as HTMLTextAreaElement;
    expect(box.value).toBe("Engineer.");
    fireEvent.change(box, { target: { value: "Backend engineer." } });
    expect((screen.getByLabelText("Summary") as HTMLTextAreaElement).value).toBe("Backend engineer.");
  });
});

describe("SectionEditor: experience bullets", () => {
  it("renders the items with their fields", () => {
    render(<Harness sectionId="s_exp" />);
    expect((screen.getAllByLabelText("Job title")[0] as HTMLInputElement).value).toBe("Software Engineer");
    expect((screen.getAllByLabelText("Company")[0] as HTMLInputElement).value).toBe("Acme");
    expect(values()).toEqual(["Led migration", "Cut latency"]);
    // "current" disables the End field.
    expect((screen.getAllByLabelText("End")[0] as HTMLInputElement).disabled).toBe(true);
  });

  it("Enter splits the bullet at the caret and moves focus to the new one", () => {
    render(<Harness sectionId="s_exp" />);
    const first = bullets()[0];
    first.focus();
    first.setSelectionRange(4, 4);
    fireEvent.keyDown(first, { key: "Enter" });
    expect(values()).toEqual(["Led ", "migration", "Cut latency"]);
    expect(document.activeElement).toBe(bullets()[1]);
    expect(bullets()[1].selectionStart).toBe(0);
  });

  it("Shift+Enter does not create a bullet", () => {
    render(<Harness sectionId="s_exp" />);
    fireEvent.keyDown(bullets()[0], { key: "Enter", shiftKey: true });
    expect(values()).toEqual(["Led migration", "Cut latency"]);
  });

  it("Backspace in an empty bullet deletes it and focuses the one above", () => {
    render(<Harness sectionId="s_exp" />);
    const first = bullets()[0];
    first.setSelectionRange(first.value.length, first.value.length);
    fireEvent.keyDown(first, { key: "Enter" }); // new empty bullet below
    const fresh = bullets()[1];
    expect(fresh.value).toBe("");
    fresh.setSelectionRange(0, 0);
    fireEvent.keyDown(fresh, { key: "Backspace" });
    expect(values()).toEqual(["Led migration", "Cut latency"]);
    expect(document.activeElement).toBe(bullets()[0]);
    expect(bullets()[0].selectionStart).toBe("Led migration".length);
  });

  it("Backspace at the start of a non-empty bullet merges it into the one above", () => {
    render(<Harness sectionId="s_exp" />);
    const second = bullets()[1];
    second.setSelectionRange(0, 0);
    fireEvent.keyDown(second, { key: "Backspace" });
    expect(values()).toEqual(["Led migrationCut latency"]);
    expect(document.activeElement).toBe(bullets()[0]);
    expect(bullets()[0].selectionStart).toBe("Led migration".length);
  });

  it("Backspace mid-text, or at the start of the first bullet, is left to the browser", () => {
    render(<Harness sectionId="s_exp" />);
    const first = bullets()[0];
    first.setSelectionRange(0, 0);
    expect(fireEvent.keyDown(first, { key: "Backspace" })).toBe(true); // not default-prevented
    const second = bullets()[1];
    second.setSelectionRange(3, 3);
    expect(fireEvent.keyDown(second, { key: "Backspace" })).toBe(true);
    expect(values()).toEqual(["Led migration", "Cut latency"]);
  });

  it("'Add bullet' appends and focuses an empty bullet; 'Add experience' adds a card on top", () => {
    render(<Harness sectionId="s_exp" />);
    fireEvent.click(screen.getAllByRole("button", { name: /Add bullet/ })[0]);
    expect(values()).toEqual(["Led migration", "Cut latency", ""]);
    expect(document.activeElement).toBe(bullets()[2]);

    fireEvent.click(screen.getByRole("button", { name: /Add experience/ }));
    expect(screen.getAllByLabelText("Job title")).toHaveLength(3);
    expect((screen.getAllByLabelText("Job title")[0] as HTMLInputElement).value).toBe("");
  });

  it("only valid dates reach the document; a bad one shows the format error", () => {
    render(<Harness sectionId="s_exp" />);
    const start = screen.getAllByLabelText("Start")[0] as HTMLInputElement;
    fireEvent.change(start, { target: { value: "20" } });
    expect(start.value).toBe("20"); // kept as a draft
    expect(screen.getByText("Use YYYY-MM or YYYY")).toBeTruthy();
    fireEvent.change(start, { target: { value: "2023-09" } });
    expect(screen.queryByText("Use YYYY-MM or YYYY")).toBeNull();
    expect(start.value).toBe("2023-09");
    fireEvent.change(start, { target: { value: "9/2021" } });
    fireEvent.blur(start);
    expect(start.value).toBe("2021-09");
  });

  it("lists read-only sections honestly", () => {
    render(<Harness sectionId="s_skl" />);
    expect(screen.getByText(/arrives in a later release/)).toBeTruthy();
  });
});

describe("date helpers", () => {
  it("normalises MM/YYYY and YYYY/MM", () => {
    expect(normalizeDate("6/2022")).toBe("2022-06");
    expect(normalizeDate(" 11.2020 ")).toBe("2020-11");
    expect(normalizeDate("2019/3")).toBe("2019-03");
    expect(normalizeDate("2022")).toBe("2022");
  });

  it("matches the server's date rule", () => {
    for (const ok of ["2022", "2022-06", "1999-12"]) expect(DATE_OK.test(ok)).toBe(true);
    for (const bad of ["22", "2022-13", "2022-6", "1899", "June 2022"]) expect(DATE_OK.test(bad)).toBe(false);
  });
});
