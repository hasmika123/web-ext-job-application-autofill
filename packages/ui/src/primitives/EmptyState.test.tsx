import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import EmptyState from "./EmptyState";
import ErrorState from "./ErrorState";
import { ListSkeleton, TableSkeleton, TileSkeleton } from "./ListSkeleton";
import SaveStatusChip, { chipTone, savedAgo, statusLabel } from "./SaveStatusChip";

afterEach(cleanup);

describe("EmptyState", () => {
  it("defaults to the page variant: dashed surface, title, copy and one action", () => {
    const { container } = render(<EmptyState title="No applications yet" description="Save a job to start." action={<button>Find jobs</button>} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.getAttribute("data-empty-state")).toBe("page");
    expect(root.className).toContain("border-dashed");
    expect(screen.getByRole("heading", { name: "No applications yet" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Find jobs" })).toBeTruthy();
  });

  it("the page variant shows the mascot only when asked", () => {
    const { container, rerender } = render(<EmptyState title="Nothing" />);
    expect(container.querySelector("svg")).toBeNull();
    rerender(<EmptyState title="Nothing" mascot />);
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("the inline variant is compact: no dashed border, no heading element, mascot ignored", () => {
    const { container } = render(<EmptyState variant="inline" mascot title="No notes" description="Add one." />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.getAttribute("data-empty-state")).toBe("inline");
    expect(root.className).not.toContain("border-dashed");
    expect(container.querySelector("svg")).toBeNull();
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.getByText("No notes")).toBeTruthy();
  });
});

describe("ErrorState", () => {
  it("says what could not load, offers Retry, and shows the request id when there is one", () => {
    let retried = 0;
    render(<ErrorState what="your applications" requestId="req-42" onRetry={() => retried++} />);
    expect(screen.getByRole("alert").textContent).toContain("Couldn't load your applications");
    screen.getByRole("button", { name: "Retry" }).click();
    expect(retried).toBe(1);
    expect(screen.getByText("Request id: req-42")).toBeTruthy();
  });

  it("has no Retry button without a handler and no request id line without an id", () => {
    render(<ErrorState what="the board" />);
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    expect(screen.queryByText(/Request id/)).toBeNull();
  });
});

describe("skeletons", () => {
  it("each is a labelled busy status region of the asked size", () => {
    const { container } = render(
      <>
        <ListSkeleton count={3} label="Loading applications" />
        <TileSkeleton count={4} />
        <TableSkeleton count={2} columns={3} />
      </>,
    );
    expect(screen.getByRole("status", { name: "Loading applications" }).childElementCount).toBe(3);
    expect(container.querySelector("[data-skeleton='tiles']")!.childElementCount).toBe(4);
    // header row + 2 body rows
    expect(container.querySelector("[data-skeleton='table']")!.childElementCount).toBe(3);
  });
});

describe("SaveStatusChip", () => {
  it("labels each state and picks the tone", () => {
    const now = 1_000_000;
    expect(statusLabel("saving", null, now, null)).toBe("Saving…");
    expect(statusLabel("saved", now - 5_000, now, null)).toBe("Saved");
    expect(savedAgo(now - 5 * 60_000, now)).toBe("Saved 5 minutes ago");
    expect(savedAgo(null, now)).toBe("All changes saved");
    expect(statusLabel("saved", now, now, null, false)).toContain("Offline");
    expect(chipTone("saved", true)).toBe("calm");
    expect(chipTone("retrying", true)).toBe("warn");
    expect(chipTone("error", true)).toBe("error");
    expect(chipTone("saved", false)).toBe("warn");
  });

  it("offers Retry only while a save is failing", () => {
    let n = 0;
    const { rerender } = render(<SaveStatusChip status="saved" savedAt={null} now={0} error={null} onRetry={() => n++} />);
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    rerender(<SaveStatusChip status="retrying" savedAt={null} now={0} error={null} onRetry={() => n++} />);
    screen.getByRole("button", { name: "Retry" }).click();
    expect(n).toBe(1);
    expect(screen.getByRole("status").getAttribute("data-save-tone")).toBe("warn");
  });
});
