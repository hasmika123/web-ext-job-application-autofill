import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ChoiceGroup from "./ChoiceGroup";

afterEach(cleanup);

describe("ChoiceGroup", () => {
  it("is a radiogroup with one tab stop and arrow keys that move and pick", () => {
    const onChange = vi.fn();
    render(<ChoiceGroup aria-label="Work" options={["Remote", "Hybrid", "On-site"]} value="Remote" onChange={onChange} />);
    const radios = screen.getAllByRole("radio");
    expect(radios.map((r) => r.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]);
    fireEvent.keyDown(radios[0], { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith("Hybrid");
  });

  it("allowClear un-picks the picked option", () => {
    const onChange = vi.fn();
    render(<ChoiceGroup aria-label="x" options={["Yes", "No"]} value="Yes" onChange={onChange} allowClear />);
    fireEvent.click(screen.getByRole("radio", { name: "Yes" }));
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("size lg is a grid of 56 px tiles (2 on a phone), and only the picked tile pops", () => {
    render(<ChoiceGroup aria-label="Who" size="lg" columns={4} options={[{ value: "a", label: "Student" }, { value: "b", label: "First job" }]} value="a" onChange={vi.fn()} />);
    const group = screen.getByRole("radiogroup");
    expect(group.className).toContain("grid-cols-2");
    expect(group.className).toContain("sm:grid-cols-4");
    const [picked, other] = screen.getAllByRole("radio");
    expect(picked.className).toContain("min-h-14");
    expect(picked.className).toContain("kiwi-pop");
    expect(other.className).not.toContain("kiwi-pop");
  });

  it("the default size is unchanged: wrapped pills, no pop", () => {
    render(<ChoiceGroup aria-label="x" options={["Yes", "No"]} value="Yes" onChange={vi.fn()} />);
    expect(screen.getByRole("radiogroup").className).toContain("flex-wrap");
    expect(screen.getByRole("radio", { name: "Yes" }).className).not.toContain("kiwi-pop");
  });
});
