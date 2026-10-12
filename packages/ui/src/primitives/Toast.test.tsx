import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider, useToast } from "./Toast";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function Fire({ duration, onUndo }: { duration?: number; onUndo?: () => void }) {
  const toast = useToast();
  return (
    <button type="button" onClick={() => toast({ title: "Skipped Acme", duration, action: onUndo ? { label: "Undo", onClick: onUndo } : undefined })}>
      fire
    </button>
  );
}
const show = (props = {}) => {
  render(
    <ToastProvider>
      <Fire {...props} />
    </ToastProvider>,
  );
  fireEvent.click(screen.getByText("fire"));
};
const tick = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

describe("Toast", () => {
  it("goes away after its duration (4 s by default)", () => {
    show();
    expect(screen.getByText("Skipped Acme")).toBeTruthy();
    tick(3900);
    expect(screen.queryByText("Skipped Acme")).not.toBeNull();
    tick(200);
    expect(screen.queryByText("Skipped Acme")).toBeNull();
  });

  it("the action runs and closes the toast", () => {
    const onUndo = vi.fn();
    show({ onUndo });
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Skipped Acme")).toBeNull();
  });

  it("waits while the pointer is over it, then runs the time it had left", () => {
    show();
    const toast = screen.getByText("Skipped Acme").closest("[role=status]") as HTMLElement;
    tick(3000);
    fireEvent.mouseEnter(toast);
    tick(60_000);
    expect(screen.queryByText("Skipped Acme")).not.toBeNull();
    fireEvent.mouseLeave(toast);
    tick(900);
    expect(screen.queryByText("Skipped Acme")).not.toBeNull();
    tick(200);
    expect(screen.queryByText("Skipped Acme")).toBeNull();
  });

  it("waits while focus is inside it (the Undo button), and resumes when focus leaves", () => {
    show({ onUndo: vi.fn() });
    const toast = screen.getByText("Skipped Acme").closest("[role=status]") as HTMLElement;
    const undo = screen.getByRole("button", { name: "Undo" });
    fireEvent.focus(undo);
    tick(30_000);
    expect(screen.queryByText("Skipped Acme")).not.toBeNull();
    fireEvent.blur(undo, { relatedTarget: document.body });
    expect(toast.isConnected).toBe(true);
    tick(4100);
    expect(screen.queryByText("Skipped Acme")).toBeNull();
  });

  it("duration 0 stays until dismissed", () => {
    show({ duration: 0 });
    tick(60_000);
    expect(screen.queryByText("Skipped Acme")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText("Skipped Acme")).toBeNull();
  });
});
