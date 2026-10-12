import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminFilterBar, { SEARCH_DEBOUNCE_MS, clearFilters, hasActiveFilters } from "./AdminFilterBar";
import { fakeList } from "./kit-test-utils";

const PLANS = [
  { value: "FREE", label: "Free" },
  { value: "PRO", label: "Pro" },
];

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const box = () => screen.getByRole("searchbox") as HTMLInputElement;

describe("AdminFilterBar", () => {
  it("debounces typing into one setQuery, and Enter sends at once", () => {
    const list = fakeList({});
    render(<AdminFilterBar list={list} search={{ placeholder: "Search users" }} />);
    fireEvent.change(box(), { target: { value: "pri" } });
    fireEvent.change(box(), { target: { value: "priya" } });
    expect(list.spies.setQuery).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    });
    expect(list.spies.setQuery).toHaveBeenCalledTimes(1);
    expect(list.spies.setQuery).toHaveBeenCalledWith("priya");

    fireEvent.change(box(), { target: { value: "sam" } });
    fireEvent.keyDown(box(), { key: "Enter" });
    expect(list.spies.setQuery).toHaveBeenLastCalledWith("sam");
    act(() => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS * 2);
    });
    expect(list.spies.setQuery).toHaveBeenCalledTimes(2); // the debounce timer did not send "sam" a second time
  });

  it("Escape clears the box", () => {
    const list = fakeList({});
    render(<AdminFilterBar list={list} />);
    fireEvent.change(box(), { target: { value: "x" } });
    fireEvent.keyDown(box(), { key: "Escape" });
    expect(box().value).toBe("");
  });

  it("adopts a query that arrives from outside (the URL on load) without sending it back", () => {
    const first = fakeList({ q: "" });
    const { rerender } = render(<AdminFilterBar list={first} />);
    const next = fakeList({ q: "from-url" });
    rerender(<AdminFilterBar list={next} />);
    expect(box().value).toBe("from-url");
    act(() => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS * 2);
    });
    expect(next.spies.setQuery).not.toHaveBeenCalled();
  });

  it("does not clobber what the admin typed while the list catches up", () => {
    const list = fakeList({ q: "" });
    const { rerender } = render(<AdminFilterBar list={list} />);
    fireEvent.change(box(), { target: { value: "a" } });
    act(() => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    });
    fireEvent.change(box(), { target: { value: "ab" } }); // typed again before the list's q came back
    rerender(<AdminFilterBar list={fakeList({ q: "a" })} />);
    expect(box().value).toBe("ab");
  });

  it("a filter select sets its filter; the first option means no filter", async () => {
    const list = fakeList({});
    render(<AdminFilterBar list={list} filters={[{ name: "plan", label: "Plan", options: PLANS }]} />);
    fireEvent.click(screen.getByRole("button", { name: "Plan" }));
    expect(screen.getByRole("option", { name: "Any plan" })).toBeTruthy();
    fireEvent.click(screen.getByRole("option", { name: "Pro" }));
    expect(list.spies.setFilter).toHaveBeenCalledWith("plan", "PRO");
  });

  it("shows Clear filters only while something is applied, and clears search and filters", () => {
    const idle = fakeList({ filters: { plan: undefined } });
    const { rerender } = render(<AdminFilterBar list={idle} filters={[{ name: "plan", label: "Plan", options: PLANS }]} />);
    expect(screen.queryByRole("button", { name: "Clear filters" })).toBeNull();

    const active = fakeList({ q: "pri", filters: { plan: "PRO" } });
    rerender(<AdminFilterBar list={active} filters={[{ name: "plan", label: "Plan", options: PLANS }]} />);
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(active.spies.setQuery).toHaveBeenCalledWith("");
    expect(active.spies.setFilter).toHaveBeenCalledWith("plan", "");
  });

  it("search: false leaves only the filters", () => {
    render(<AdminFilterBar list={fakeList({})} search={false} filters={[{ name: "plan", label: "Plan", options: PLANS }]} />);
    expect(screen.queryByRole("searchbox")).toBeNull();
  });
});

describe("hasActiveFilters / clearFilters", () => {
  it("reads q and every filter value (arrays too)", () => {
    expect(hasActiveFilters({ q: "", filters: {} })).toBe(false);
    expect(hasActiveFilters({ q: "  ", filters: { a: "", b: undefined, c: null } })).toBe(false);
    expect(hasActiveFilters({ q: "x", filters: {} })).toBe(true);
    expect(hasActiveFilters({ q: "", filters: { a: ["PRO"] } })).toBe(true);
  });

  it("clearFilters empties the query and each declared filter", () => {
    const list = fakeList({ q: "x", filters: { plan: "PRO", status: "ACTIVE" } });
    clearFilters(list);
    expect(list.spies.setQuery).toHaveBeenCalledWith("");
    expect(list.spies.setFilter).toHaveBeenCalledWith("plan", "");
    expect(list.spies.setFilter).toHaveBeenCalledWith("status", "");
  });
});
