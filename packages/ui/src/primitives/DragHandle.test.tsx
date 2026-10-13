import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import DragHandle from "./DragHandle";

afterEach(cleanup);

describe("DragHandle", () => {
  it("is a labelled button that passes the sortable props through", () => {
    render(<DragHandle aria-label="Drag Experience" aria-roledescription="sortable" data-x="1" />);
    const b = screen.getByRole("button", { name: "Drag Experience" });
    expect(b.getAttribute("type")).toBe("button");
    expect(b.getAttribute("aria-roledescription")).toBe("sortable");
    expect(b.getAttribute("data-x")).toBe("1");
    expect(b.className).toContain("touch-none");
    expect(b.querySelector("svg")).not.toBeNull();
  });

  it("renders disabled for a row that cannot move", () => {
    render(<DragHandle aria-label="Locked" disabled />);
    expect((screen.getByRole("button", { name: "Locked" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
