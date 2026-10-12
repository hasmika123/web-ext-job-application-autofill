import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdminHistoryRow, AdminResult } from "@/lib/admin-client";
import AttentionBadge from "./AttentionBadge";
import HistoryDrawer, { dottedKey, shortValue } from "./HistoryDrawer";
import { DESKTOP, stubViewport } from "./kit-test-utils";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const row = (over: Partial<AdminHistoryRow>): AdminHistoryRow => ({
  id: 1,
  key: "jobs.match_threshold",
  oldValue: "60",
  newValue: "70",
  actorLogin: "admin",
  reason: "tuning",
  changedAt: "2026-10-12T16:00:00Z",
  ...over,
});

describe("HistoryDrawer", () => {
  it("loads the newest changes when it opens and shows who, what and why", async () => {
    stubViewport(DESKTOP);
    const load = vi.fn(async (): Promise<AdminResult<AdminHistoryRow[]>> => ({ ok: true, data: [row({}), row({ id: 2, oldValue: null, newValue: "x", actorLogin: null, reason: null })] }));
    render(<HistoryDrawer open onClose={() => undefined} load={load} />);
    await screen.findByText("jobs · match_threshold", { selector: "span" }).catch(() => undefined);
    await waitFor(() => expect(load).toHaveBeenCalledWith(50));
    expect(await screen.findAllByText("jobs · match_threshold")).toHaveLength(2);
    expect(screen.getByText(/by admin · “tuning”/)).toBeTruthy();
    expect(screen.getByText(/by system$/)).toBeTruthy();
    expect(screen.getByText("none")).toBeTruthy(); // a null old value
  });

  it("does not read anything while closed", () => {
    stubViewport(DESKTOP);
    const load = vi.fn(async (): Promise<AdminResult<AdminHistoryRow[]>> => ({ ok: true, data: [] }));
    render(<HistoryDrawer open={false} onClose={() => undefined} load={load} />);
    expect(load).not.toHaveBeenCalled();
  });

  it("an empty history and a failed read are both honest, and Retry reads again", async () => {
    stubViewport(DESKTOP);
    const load = vi
      .fn<() => Promise<AdminResult<AdminHistoryRow[]>>>()
      .mockResolvedValueOnce({ ok: false, status: 500, code: null, error: "The API did not answer.", extra: {} })
      .mockResolvedValueOnce({ ok: true, data: [] });
    render(<HistoryDrawer open onClose={() => undefined} load={load} emptyTitle="No changes yet." />);
    expect(await screen.findByText("The API did not answer.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("No changes yet.")).toBeTruthy();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("formatKey lets a page drop a prefix", async () => {
    stubViewport(DESKTOP);
    render(<HistoryDrawer open onClose={() => undefined} load={async () => ({ ok: true, data: [row({ key: "ai.route.map.model" })] })} formatKey={(k) => dottedKey(k.replace(/^ai\./, ""))} />);
    expect(await screen.findByText("route · map · model")).toBeTruthy();
  });

  it("shortValue cuts long values", () => {
    expect(shortValue(null)).toBe("none");
    expect(shortValue("")).toBe("none");
    expect(shortValue("true")).toBe("true");
    expect(shortValue("x".repeat(200))).toHaveLength(78);
  });
});

describe("AttentionBadge", () => {
  it("draws nothing for 0, null or a bad count", () => {
    const { container, rerender } = render(<AttentionBadge count={0} label="failed jobs" />);
    expect(container.firstChild).toBeNull();
    rerender(<AttentionBadge count={null} label="failed jobs" />);
    expect(container.firstChild).toBeNull();
    rerender(<AttentionBadge count={Number.NaN} label="failed jobs" />);
    expect(container.firstChild).toBeNull();
  });

  it("shows the count, names it for screen readers, and caps at 99+", () => {
    const { rerender } = render(<AttentionBadge count={3} label="failed jobs" />);
    expect(screen.getByRole("status", { name: "3 failed jobs" }).textContent).toBe("3");
    rerender(<AttentionBadge count={250} label="failed jobs" tone="alert" />);
    expect(screen.getByRole("status", { name: "250 failed jobs" }).textContent).toBe("99+");
  });
});
