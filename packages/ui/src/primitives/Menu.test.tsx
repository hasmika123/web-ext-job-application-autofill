import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import IconButton from "./IconButton";
import Menu from "./Menu";

afterEach(cleanup);

describe("Menu trigger", () => {
  it("a button trigger IS the menu's button: one tab stop, no button nested in a button, menu semantics on it", () => {
    render(<Menu trigger={<IconButton aria-label="More options">⋯</IconButton>} items={[{ label: "Rename", onSelect: vi.fn() }]} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    const trigger = buttons[0];
    expect(trigger.getAttribute("aria-label")).toBe("More options");
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.parentElement?.getAttribute("role")).toBeNull(); // its wrapper is not a second button
    expect(trigger.querySelector('[role="button"], button')).toBeNull();
  });

  it("click opens it, a menu item runs and closes it; Arrow Down also opens", () => {
    const onSelect = vi.fn();
    const own = vi.fn();
    render(<Menu trigger={<IconButton aria-label="More options" onClick={own}>⋯</IconButton>} items={[{ label: "Rename", onSelect }]} />);
    const trigger = screen.getByRole("button", { name: "More options" });
    fireEvent.click(trigger);
    expect(own).toHaveBeenCalledTimes(1); // the trigger's own handler still runs
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(screen.getByRole("menu")).toBeTruthy();
  });

  it("a disabled menu does not open", () => {
    render(<Menu disabled trigger={<IconButton aria-label="More options">⋯</IconButton>} items={[{ label: "Rename", onSelect: vi.fn() }]} />);
    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByRole("button", { name: "More options" }).getAttribute("aria-disabled")).toBe("true");
  });

  it("a trigger that is not a button (an avatar div) is wrapped in a role=button span, as before", () => {
    render(<Menu trigger={<div>Sam</div>} items={[{ label: "Sign out", onSelect: vi.fn() }]} />);
    const trigger = screen.getByRole("button");
    expect(trigger.tagName).toBe("SPAN");
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(screen.getByRole("menu")).toBeTruthy();
  });
  it("scrolling INSIDE the open menu keeps it open; the page scrolling away closes it (X4.5: a long list must stay reachable)", () => {
    render(<Menu trigger={<IconButton aria-label="More options">⋯</IconButton>} items={[{ label: "Rename", onSelect: vi.fn() }]} />);
    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    fireEvent.scroll(screen.getByRole("menu"));
    expect(screen.getByRole("menu")).toBeTruthy();
    fireEvent.scroll(window);
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
