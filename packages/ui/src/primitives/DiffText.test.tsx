import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import DiffText from "./DiffText";

afterEach(cleanup);

describe("DiffText", () => {
  it("draws added words in <ins>, removed words in <del> and the rest plain", () => {
    const { container } = render(
      <DiffText
        parts={[
          { type: "same", text: "Led " },
          { type: "del", text: "a " },
          { type: "ins", text: "the whole " },
          { type: "same", text: "migration" },
        ]}
      />,
    );
    expect(container.querySelector("ins")?.textContent).toContain("the whole");
    expect(container.querySelector("del")?.textContent).toContain("a ");
    expect(container.textContent).toContain("Led ");
  });

  it("names the group by what changed, and brackets each change for screen readers", () => {
    render(
      <DiffText
        parts={[
          { type: "del", text: "old words here " },
          { type: "ins", text: "new " },
        ]}
      />,
    );
    expect(screen.getByRole("group", { name: "Changes: 1 word added, 3 words removed" })).toBeTruthy();
    expect(screen.getByText("[added:")).toBeTruthy();
    expect(screen.getByText("[removed:")).toBeTruthy();
  });

  it("says so when nothing changed, and an explicit label wins", () => {
    render(<DiffText parts={[{ type: "same", text: "Same text" }]} />);
    expect(screen.getByRole("group", { name: "No changes" })).toBeTruthy();
    cleanup();
    render(<DiffText parts={[]} aria-label="Version 3 against now" />);
    expect(screen.getByRole("group", { name: "Version 3 against now" })).toBeTruthy();
  });
});
