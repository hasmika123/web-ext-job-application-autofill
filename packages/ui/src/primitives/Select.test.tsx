import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Select, { MENU_GAP, MENU_MAX, menuPlacement } from "./Select";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("menuPlacement", () => {
  it("opens under the trigger when the list fits below", () => {
    expect(menuPlacement({ top: 100, bottom: 140 }, 900, 120)).toEqual({ top: 140 + MENU_GAP, maxHeight: MENU_MAX });
  });

  it("opens ABOVE the trigger near the bottom of the window, ending just above it", () => {
    const p = menuPlacement({ top: 790, bottom: 830 }, 900, 120);
    expect(p.top).toBeUndefined();
    expect(p.bottom).toBe(900 - 790 + MENU_GAP);
    expect(p.maxHeight).toBeGreaterThanOrEqual(120);
  });

  it("stays below when there is less room above than below, and caps the height to the room it has", () => {
    const p = menuPlacement({ top: 150, bottom: 190 }, 400, 400);
    expect(p.top).toBe(190 + MENU_GAP);
    expect(p.maxHeight).toBe(400 - 190 - MENU_GAP - 8);
  });

  it("never asks for more than the list's tallest height", () => {
    expect(menuPlacement({ top: 850, bottom: 890 }, 1000, 2000).maxHeight).toBe(MENU_MAX);
  });
});

describe("Select near the bottom of the window", () => {
  it("renders its open list above the trigger", () => {
    render(<Select aria-label="Availability" value="a" onChange={() => {}} options={[{ value: "a", label: "Available" }, { value: "b", label: "On Project" }, { value: "c", label: "Unavailable" }]} />);
    const trigger = screen.getByRole("button", { name: "Availability" });
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue({ top: window.innerHeight - 40, bottom: window.innerHeight - 4, left: 20, right: 220, width: 200, height: 36, x: 20, y: window.innerHeight - 40, toJSON: () => ({}) } as DOMRect);
    fireEvent.click(trigger);
    const list = screen.getByRole("listbox", { name: "Availability" });
    expect(list.style.top).toBe("");
    expect(list.style.bottom).toBe(`${40 + MENU_GAP}px`);
    expect(screen.getByRole("option", { name: /Unavailable/ })).toBeTruthy();
  });
});
