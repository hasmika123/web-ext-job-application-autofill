import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import MonthPicker, { isMonthValue } from "./MonthPicker";

afterEach(cleanup);

function Harness({ initial = "" }: { initial?: string }) {
  const [v, setV] = useState(initial);
  return (
    <>
      <MonthPicker aria-label="Start date" value={v} onChange={setV} />
      <output data-testid="out">{v}</output>
    </>
  );
}
const out = () => screen.getByTestId("out").textContent;

describe("MonthPicker", () => {
  it("names the pair and each control", () => {
    render(<Harness />);
    expect(screen.getByRole("group", { name: "Start date" })).toBeTruthy();
    expect(screen.getByLabelText("Year")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Month" })).toBeTruthy();
  });

  it("a year alone is YYYY, and picking a month makes it YYYY-MM", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Year"), { target: { value: "2021" } });
    expect(out()).toBe("2021");
    fireEvent.click(screen.getByRole("button", { name: "Month" }));
    fireEvent.click(screen.getByRole("option", { name: "September" }));
    expect(out()).toBe("2021-09");
  });

  it("keeps a month chosen before the year, and keeps digits only", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Month" }));
    fireEvent.click(screen.getByRole("option", { name: "March" }));
    expect(out()).toBe("-03");
    fireEvent.change(screen.getByLabelText("Year"), { target: { value: "20a24" } });
    expect(out()).toBe("2024-03");
  });

  it("shows an existing value and clears back to empty", () => {
    render(<Harness initial="2019-06" />);
    expect((screen.getByLabelText("Year") as HTMLInputElement).value).toBe("2019");
    expect(screen.getByRole("button", { name: "Month" }).textContent).toBe("June");
    fireEvent.change(screen.getByLabelText("Year"), { target: { value: "" } });
    expect(out()).toBe("-06");
  });

  it("isMonthValue accepts only YYYY and YYYY-MM with a real month", () => {
    expect(isMonthValue("2021")).toBe(true);
    expect(isMonthValue("2021-12")).toBe(true);
    for (const bad of ["", "20", "-03", "2021-13", "2021-00", "2021-3", "21-03"]) expect(isMonthValue(bad)).toBe(false);
  });
});
