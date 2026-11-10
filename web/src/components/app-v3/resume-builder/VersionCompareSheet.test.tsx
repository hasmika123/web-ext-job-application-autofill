import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getVersionText = vi.fn();
const exportText = vi.fn();
vi.mock("@/lib/resume-meta", async (orig) => ({ ...(await orig<typeof import("@/lib/resume-meta")>()), getVersionText: (...a: unknown[]) => getVersionText(...a) }));
vi.mock("@/lib/resume-doc", async (orig) => ({ ...(await orig<typeof import("@/lib/resume-doc")>()), exportText: (...a: unknown[]) => exportText(...a) }));

import type { ResumeVersion } from "@/lib/resume-meta";
import VersionCompareSheet from "./VersionCompareSheet";

const version: ResumeVersion = { versionNo: 5, reason: "NAMED", name: "Sent to Acme", createdAt: "2026-10-10T10:00:00Z", contentHash: "h", by: null, kind: "named" };
const ensureSaved = vi.fn<() => Promise<boolean>>();
const onRestore = vi.fn();
const onClose = vi.fn();
const blob = (text: string) => ({ text: async () => text }) as unknown as Blob; // jsdom's Blob has no text()

const renderSheet = () =>
  render(<VersionCompareSheet open resumeId={42} version={version} phone={false} ensureSaved={ensureSaved} onRestore={onRestore} onClose={onClose} />);

beforeEach(() => {
  getVersionText.mockReset();
  exportText.mockReset();
  ensureSaved.mockReset().mockResolvedValue(true);
  onRestore.mockReset();
  onClose.mockReset();
});
afterEach(cleanup);

describe("VersionCompareSheet", () => {
  it("draws the version's text against the saved document as a word diff, and Restore hands the version back", async () => {
    getVersionText.mockResolvedValue({ kind: "ok", value: "Led a migration\n" });
    exportText.mockResolvedValue({ kind: "ok", blob: blob("Led the migration\n"), fileName: "r.txt" });
    renderSheet();
    const sheet = screen.getByRole("dialog", { name: "Compare versions" });
    expect(within(sheet).getByText("v5 · Sent to Acme against your resume now")).toBeTruthy();
    const diff = await within(sheet).findByRole("group", { name: "Changes: 1 word added, 1 word removed" });
    expect(diff.querySelector("del")?.textContent).toContain("a");
    expect(diff.querySelector("ins")?.textContent).toContain("the");
    expect(getVersionText).toHaveBeenCalledWith(42, 5);
    fireEvent.click(within(sheet).getByRole("button", { name: "Restore this version" }));
    expect(onRestore).toHaveBeenCalledWith(version);
  });

  it("says so, and disables Restore, when the version reads the same as now", async () => {
    getVersionText.mockResolvedValue({ kind: "ok", value: "Same words\n" });
    exportText.mockResolvedValue({ kind: "ok", blob: blob("Same  words\n"), fileName: "r.txt" });
    renderSheet();
    expect(await screen.findByText(/No differences/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Restore this version" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("refuses to compare while the latest edits are not saved", async () => {
    ensureSaved.mockResolvedValue(false);
    renderSheet();
    expect((await screen.findByRole("alert")).textContent).toMatch(/aren't saved yet/);
    expect(getVersionText).not.toHaveBeenCalled();
  });

  it("shows the server's sentence when a text cannot be loaded", async () => {
    getVersionText.mockResolvedValue({ kind: "error", status: 404, message: "Version not found" });
    exportText.mockResolvedValue({ kind: "ok", blob: blob("x"), fileName: "r.txt" });
    renderSheet();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Version not found"));
    expect((screen.getByRole("button", { name: "Restore this version" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("is closed without a version", () => {
    render(<VersionCompareSheet open resumeId={42} version={null} phone={false} ensureSaved={ensureSaved} onRestore={onRestore} onClose={onClose} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
