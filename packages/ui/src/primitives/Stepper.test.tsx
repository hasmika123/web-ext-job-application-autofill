import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import Stepper from "./Stepper";

afterEach(cleanup);

const steps = [
  { key: "a", label: "Resume" },
  { key: "b", label: "Review" },
  { key: "c", label: "Done" },
];

describe("Stepper", () => {
  it("marks exactly the current step and names the whole indicator", () => {
    const { container } = render(<Stepper label="Profile setup" steps={steps} current={1} />);
    expect(screen.getByRole("navigation", { name: "Profile setup" })).toBeTruthy();
    const current = container.querySelectorAll('[aria-current="step"]');
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toContain("Review");
  });

  it("says which steps are done to a screen reader and gives the phone caption", () => {
    render(<Stepper label="Profile setup" steps={steps} current={2} />);
    expect(screen.getByText(/\(done\)\s*Resume/)).toBeTruthy();
    expect(screen.getByText(/Step 3 of 3/)).toBeTruthy();
  });

  it("clamps a current index past the end instead of throwing", () => {
    render(<Stepper label="Profile setup" steps={steps} current={9} />);
    expect(screen.getByText(/Step 3 of 3/)).toBeTruthy();
  });
});
