import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const syncMaster = vi.fn();
const applySyncMaster = vi.fn();
vi.mock("@/lib/resume-meta", async (orig) => ({
  ...(await orig<typeof import("@/lib/resume-meta")>()),
  syncMaster: (...a: unknown[]) => syncMaster(...a),
  applySyncMaster: (...a: unknown[]) => applySyncMaster(...a),
}));

import SyncDiffSheet, { describeChangeValue } from "./SyncDiffSheet";

const ensureSaved = vi.fn<() => Promise<boolean>>();
const onApplied = vi.fn();
const onClose = vi.fn();
const changes = [
  { id: "c1", kind: "changed", section: "Summary", before: "Old summary", after: "New summary" },
  { id: "c2", kind: "added", section: "Experience", after: { title: "Staff Engineer", org: "Acme", bullets: [{ text: "Led the platform team" }] } },
  { id: "c3", kind: "removed", section: "Skills", before: { group: "Legacy", skills: ["COBOL", "Perl"] } },
];

const renderSheet = () => render(<SyncDiffSheet open resumeId={42} masterName="Master CV" phone={false} ensureSaved={ensureSaved} onApplied={onApplied} onClose={onClose} />);

beforeEach(() => {
  syncMaster.mockReset().mockResolvedValue({ kind: "ok", value: { changes } });
  applySyncMaster.mockReset();
  ensureSaved.mockReset().mockResolvedValue(true);
  onApplied.mockReset();
  onClose.mockReset();
});
afterEach(cleanup);

describe("SyncDiffSheet", () => {
  it("lists every change from the master, all ticked, as before and after", async () => {
    renderSheet();
    const sheet = screen.getByRole("dialog", { name: "Pull changes from master" });
    expect(within(sheet).getByText("What changed in Master CV since this copy")).toBeTruthy();
    expect(await within(sheet).findByText("New summary")).toBeTruthy();
    expect(within(sheet).getByText("Old summary")).toBeTruthy();
    expect(within(sheet).getByText("Staff Engineer · Acme")).toBeTruthy();
    expect(within(sheet).getByText("• Led the platform team")).toBeTruthy();
    expect(within(sheet).getByText("COBOL, Perl")).toBeTruthy();
    const boxes = within(sheet).getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes.map((b) => b.checked)).toEqual([true, true, true]);
    expect(within(sheet).getByRole("button", { name: "Apply 3 changes" })).toBeTruthy();
  });

  it("select / apply ids: only the ticked changes are sent, and the merged document is handed back", async () => {
    const merged = { resumeId: 42, docVersion: 9 };
    applySyncMaster.mockResolvedValue({ kind: "ok", value: merged });
    renderSheet();
    const sheet = screen.getByRole("dialog", { name: "Pull changes from master" });
    await within(sheet).findByText("New summary");
    fireEvent.click(within(sheet).getAllByRole("checkbox")[1]);
    fireEvent.click(within(sheet).getByRole("button", { name: "Apply 2 changes" }));
    await waitFor(() => expect(applySyncMaster).toHaveBeenCalledWith(42, ["c1", "c3"]));
    await waitFor(() => expect(onApplied).toHaveBeenCalledWith(merged, 2));
  });

  it("Select none disables Apply; Select all brings it back", async () => {
    renderSheet();
    const sheet = screen.getByRole("dialog", { name: "Pull changes from master" });
    await within(sheet).findByText("New summary");
    fireEvent.click(within(sheet).getByRole("button", { name: "Select none" }));
    expect((within(sheet).getByRole("button", { name: "Apply 0 changes" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(sheet).getByRole("button", { name: "Select all" }));
    expect((within(sheet).getByRole("button", { name: "Apply 3 changes" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("says there is nothing to pull when the copy is up to date", async () => {
    syncMaster.mockResolvedValue({ kind: "ok", value: { changes: [] } });
    renderSheet();
    expect(await screen.findByText("This resume already has everything from the master.")).toBeTruthy();
  });

  it("shows a refusal from apply and stays open", async () => {
    applySyncMaster.mockResolvedValue({ kind: "error", status: 409, message: "The master changed again" });
    renderSheet();
    await screen.findByText("New summary");
    fireEvent.click(screen.getByRole("button", { name: "Apply 3 changes" }));
    expect((await screen.findByText("The master changed again")).getAttribute("role")).toBe("alert");
    expect(onApplied).not.toHaveBeenCalled();
  });

  it("does not compare while the latest edits are unsaved", async () => {
    ensureSaved.mockResolvedValue(false);
    renderSheet();
    expect((await screen.findByRole("alert")).textContent).toMatch(/aren't saved yet/);
    expect(syncMaster).not.toHaveBeenCalled();
  });
});

describe("describeChangeValue", () => {
  it("reads strings, items, bullets and skills as lines", () => {
    expect(describeChangeValue("A line")).toEqual(["A line"]);
    expect(describeChangeValue(null)).toEqual([]);
    expect(describeChangeValue({ title: "Dev", org: "Acme", bullets: [{ text: "Did X" }, "Did Y"] })).toEqual(["Dev · Acme", "• Did X", "• Did Y"]);
    expect(describeChangeValue({ group: "Langs", skills: ["Go", "Rust"] })).toEqual(["Langs", "Go, Rust"]);
    expect(describeChangeValue(["a", "b"])).toEqual(["a", "b"]);
  });
});
