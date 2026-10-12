/**
 * Rewrite with AI inside the real editor (R4.2): the section / bullet buttons, the diff sheet, Apply through the
 * reducer (so Undo works) and the autosave controller adopting the server's version instead of saving again.
 * The fetchers are mocked; everything between them and the screen is real.
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@kiwiply/ui";
import type { ApplyOutcome, AiOutcome, AiProposal } from "@/lib/resume-ai";
import type { ResumeDocDTO, SaveResult } from "@/lib/resume-doc";
import { testDoc } from "./state/test-doc";

const putDoc = vi.fn<(id: number, version: number, body: { doc: ReturnType<typeof testDoc> }) => Promise<SaveResult>>();
vi.mock("@/lib/resume-doc", async (orig) => ({
  ...(await orig<typeof import("@/lib/resume-doc")>()),
  putDoc: (...a: Parameters<typeof putDoc>) => putDoc(...a),
  patchTemplate: vi.fn(),
  patchTheme: vi.fn(),
  requestPdfNow: vi.fn().mockResolvedValue(true),
  getPdfStatus: vi.fn().mockResolvedValue(null),
}));
const requestRewrite = vi.fn<(id: number, refs: readonly string[], mode: string) => Promise<AiOutcome>>();
const applyProposal = vi.fn<(pid: number, keep: readonly string[], alts: Record<string, number>) => Promise<ApplyOutcome>>();
const dismissProposal = vi.fn<(pid: number) => Promise<boolean>>();
const listOpenProposals = vi.fn<(id: number) => Promise<AiProposal[]>>();
vi.mock("@/lib/resume-ai", async (orig) => ({
  ...(await orig<typeof import("@/lib/resume-ai")>()),
  requestRewrite: (id: number, refs: readonly string[], mode: string) => requestRewrite(id, refs, mode),
  applyProposal: (pid: number, keep: readonly string[], alts: Record<string, number>) => applyProposal(pid, keep, alts),
  dismissProposal: (pid: number) => dismissProposal(pid),
  listOpenProposals: (id: number) => listOpenProposals(id),
}));
const track = vi.fn<(event: string, params?: Record<string, unknown>) => void>();
vi.mock("@/lib/analytics", () => ({ track: (...a: Parameters<typeof track>) => track(...a) }));
vi.mock("@/lib/resume-meta", async (orig) => {
  const { testLineage, testMeta, testVersions } = await import("./test-meta");
  return {
    ...(await orig<typeof import("@/lib/resume-meta")>()),
    getMeta: async () => ({ kind: "ok", value: testMeta({ name: "Backend SWE" }) }),
    getAccess: async () => ({ kind: "ok", value: { org: null, grants: [], links: [], viewers: 0 } }),
    getViews: async () => ({ kind: "ok", value: [] }),
    getLineage: async () => ({ kind: "ok", value: testLineage() }),
    listVersions: async () => ({ kind: "ok", value: testVersions() }),
  };
});
vi.mock("@/lib/api", () => ({ serverApiFetch: vi.fn() }));
vi.mock("next/link", () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/marketing/BrandLogo", () => ({ default: () => <span>Kiwiply logo</span> }));

import { DEFAULT_BUILDER_CONFIG, type ResumeBuilderConfig } from "@/lib/resume-builder-config";
import ResumeEditor from "./ResumeEditor";

const PRO: ResumeBuilderConfig = { ...DEFAULT_BUILDER_CONFIG, plan: "PRO", aiAllowed: true };

const dto = (): ResumeDocDTO => ({
  resumeId: 42,
  label: "Backend SWE",
  kind: "BUILT",
  doc: testDoc(),
  schemaVersion: 2,
  templateId: "modern",
  theme: null,
  docVersion: 3,
  contentHash: null,
  profileSyncedAt: null,
  exportedAt: null,
  exportedHash: null,
  updatedAt: null,
});

const renderEditor = (config: ResumeBuilderConfig = PRO) =>
  render(
    <ToastProvider>
      <ResumeEditor initial={dto()} plan={config.aiAllowed ? "PRO" : "FREE"} config={config} />
    </ToastProvider>,
  );

const flush = (ms = 0) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const summaryBox = () => screen.getByRole("textbox", { name: "Summary" }) as HTMLTextAreaElement;
const sheet = () => screen.getByRole("dialog", { name: "Rewrite with AI" });
const status = () => document.querySelector("[data-save-status]")!.getAttribute("data-save-status");

const summaryProposal = (over: Partial<AiProposal> = {}): AiProposal => ({
  id: 7,
  task: "rewrite",
  mode: "stronger",
  stale: false,
  model: "flash-lite",
  aiCallId: 99,
  changes: [{ ref: "i_sum0001", section: "Summary", before: "Engineer.", after: "Senior engineer who ships.", reason: "Adds scope", sources: ["i_sum0001"] }],
  ...over,
});
const bulletProposal = (): AiProposal => ({
  id: 8,
  task: "rewrite",
  mode: "shorter",
  stale: false,
  changes: [
    {
      ref: "b_aaaaaaaa",
      section: "Software Engineer · Acme",
      before: "Led migration",
      after: "Drove the migration",
      alternatives: ["Drove the migration", "Ran the migration"],
      reason: "Stronger verb",
    },
  ],
});
const okOutcome = (p: AiProposal): AiOutcome => ({ kind: "result", result: { status: "ok", proposal: p, usage: { used: 10, limit: 100, resetsAt: "2026-11-01T00:00:00Z" } } });
const applied = (docVersion: number): ApplyOutcome => ({ kind: "ok", dto: { ...dto(), docVersion } });

/** Summary block → "Rewrite with AI" → a mode, then let the (mocked) answer arrive. */
async function rewriteSummary(label = "Stronger") {
  fireEvent.click(screen.getByRole("button", { name: "Rewrite with AI: Summary" }));
  fireEvent.click(screen.getByRole("menuitem", { name: new RegExp(`^${label}`) }));
  await flush();
}

beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(window, "innerWidth", { value: 1440, configurable: true, writable: true });
  window.localStorage.clear();
  putDoc.mockReset().mockImplementation(async (_id, version) => ({ kind: "ok", version: version + 1, contentHash: null }));
  requestRewrite.mockReset();
  applyProposal.mockReset();
  dismissProposal.mockReset().mockResolvedValue(true);
  listOpenProposals.mockReset().mockResolvedValue([]);
  track.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Rewrite with AI - Pro", () => {
  it("Summary: pick a mode, review the diff, Apply writes it, Undo takes it back, and nothing is saved twice", async () => {
    requestRewrite.mockResolvedValue(okOutcome(summaryProposal()));
    applyProposal.mockResolvedValue(applied(9));
    renderEditor();
    await rewriteSummary("Shorter");

    expect(requestRewrite).toHaveBeenCalledWith(42, ["i_sum0001"], "shorter");
    expect(within(sheet()).getByText(/Senior/)).toBeTruthy();
    expect(within(sheet()).getByText(/10% of your Kiwiply AI used/)).toBeTruthy();

    fireEvent.click(within(sheet()).getByRole("button", { name: "Apply 1 selected" }));
    await flush();

    expect(applyProposal).toHaveBeenCalledWith(7, ["i_sum0001"], { i_sum0001: 0 });
    expect(summaryBox().value).toBe("Senior engineer who ships.");
    await flush(300); // the sheet slides out
    expect(screen.queryByRole("dialog", { name: "Rewrite with AI" })).toBeNull();
    expect(screen.getByText("Applied 1 change")).toBeTruthy();
    expect(track).toHaveBeenCalledWith("resume_ai_apply", { task: "rewrite", kept: 1, total: 1 });

    // the autosave moved to the server's version 9: applying did not make a second save of the same text
    await flush(2000);
    expect(putDoc).not.toHaveBeenCalled();
    expect(status()).toBe("saved");

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await flush();
    expect(summaryBox().value).toBe("Engineer.");
    await flush(1000);
    expect(putDoc).toHaveBeenCalledTimes(1);
    expect(putDoc.mock.calls[0][1]).toBe(9); // the undo saves against the version Apply returned
  });

  it("a bullet: its own control sends one ref, and the chosen wording is what is written", async () => {
    requestRewrite.mockResolvedValue(okOutcome(bulletProposal()));
    applyProposal.mockResolvedValue(applied(9));
    renderEditor();
    fireEvent.click(screen.getAllByRole("button", { name: "Rewrite bullet 1 with AI" })[0]);
    fireEvent.click(screen.getByRole("menuitem", { name: /^Stronger/ }));
    await flush();
    expect(requestRewrite).toHaveBeenCalledWith(42, ["b_aaaaaaaa"], "stronger");
    expect(within(sheet()).getByText("This bullet", { exact: false })).toBeTruthy();

    fireEvent.click(within(sheet()).getByRole("radio", { name: "Wording 2 of 2 for Software Engineer · Acme" }));
    fireEvent.click(within(sheet()).getByRole("button", { name: "Apply 1 selected" }));
    await flush();

    expect(applyProposal).toHaveBeenCalledWith(8, ["b_aaaaaaaa"], { b_aaaaaaaa: 1 });
    expect((screen.getAllByLabelText("Bullet 1")[0] as HTMLTextAreaElement).value).toBe("Ran the migration");
  });

  it("an Experience header sends the section's lines, longest first", async () => {
    requestRewrite.mockResolvedValue(okOutcome(bulletProposal()));
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Rewrite with AI: Experience" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /^Plain language/ }));
    await flush();
    expect(requestRewrite).toHaveBeenCalledWith(42, ["b_aaaaaaaa", "b_bbbbbbbb"], "plain"); // "Led migration" (13) before "Cut latency" (11)
  });

  it("switching the mode in the sheet asks again", async () => {
    requestRewrite.mockResolvedValue(okOutcome(summaryProposal()));
    renderEditor();
    await rewriteSummary();
    fireEvent.click(within(sheet()).getByRole("radio", { name: "Fix grammar" }));
    await flush();
    expect(requestRewrite).toHaveBeenLastCalledWith(42, ["i_sum0001"], "grammar");
  });

  it("Dismiss discards the proposal and leaves the resume alone", async () => {
    requestRewrite.mockResolvedValue(okOutcome(summaryProposal()));
    renderEditor();
    await rewriteSummary();
    fireEvent.click(within(sheet()).getByRole("button", { name: "Dismiss" }));
    await flush();
    expect(dismissProposal).toHaveBeenCalledWith(7);
    expect(applyProposal).not.toHaveBeenCalled();
    expect(summaryBox().value).toBe("Engineer.");
    expect(track).toHaveBeenCalledWith("resume_ai_dismiss", { task: "rewrite" });
  });

  it("closing with the X keeps the proposal as an 'unreviewed rewrite' to come back to", async () => {
    requestRewrite.mockResolvedValue(okOutcome(summaryProposal()));
    renderEditor();
    await rewriteSummary();
    fireEvent.click(within(sheet()).getByRole("button", { name: "Close Rewrite with AI" }));
    await flush(300);
    expect(dismissProposal).not.toHaveBeenCalled();
    const bar = screen.getByRole("region", { name: "Unreviewed AI rewrite" });
    fireEvent.click(within(bar).getByRole("button", { name: "Review" }));
    await flush();
    expect(within(sheet()).getByRole("button", { name: "Apply 1 selected" })).toBeTruthy();
  });

  it("after a refresh, an open proposal from before is offered again", async () => {
    listOpenProposals.mockResolvedValue([summaryProposal({ id: 31 })]);
    renderEditor();
    await flush();
    expect(listOpenProposals).toHaveBeenCalledWith(42);
    const bar = screen.getByRole("region", { name: "Unreviewed AI rewrite" });
    expect(bar.textContent).toContain("1 line");
    fireEvent.click(within(bar).getByRole("button", { name: "Discard" }));
    await flush();
    expect(dismissProposal).toHaveBeenCalledWith(31);
    expect(screen.queryByRole("region", { name: "Unreviewed AI rewrite" })).toBeNull();
  });

  it("stale on Apply: says the resume changed and Ask again requests a fresh rewrite", async () => {
    requestRewrite.mockResolvedValue(okOutcome(summaryProposal()));
    applyProposal.mockResolvedValue({ kind: "stale" });
    renderEditor();
    await rewriteSummary();
    fireEvent.click(within(sheet()).getByRole("button", { name: "Apply 1 selected" }));
    await flush();
    expect(within(sheet()).getByText("Your resume changed since this was made")).toBeTruthy();
    expect(summaryBox().value).toBe("Engineer.");
    fireEvent.click(within(sheet()).getByRole("button", { name: "Ask again" }));
    await flush();
    expect(requestRewrite).toHaveBeenCalledTimes(2);
  });

  it("a rewrite is asked for only after pending edits are saved", async () => {
    requestRewrite.mockResolvedValue(okOutcome(summaryProposal()));
    renderEditor();
    fireEvent.change(summaryBox(), { target: { value: "Engineer, edited." } });
    await rewriteSummary();
    expect(putDoc).toHaveBeenCalledTimes(1);
    expect(putDoc.mock.invocationCallOrder[0]).toBeLessThan(requestRewrite.mock.invocationCallOrder[0]);
  });

  it("402 PRO_REQUIRED from the server shows the lock card in the sheet", async () => {
    requestRewrite.mockResolvedValue({ kind: "locked" });
    renderEditor();
    await rewriteSummary();
    expect(within(sheet()).getByText("AI rewriting is part of Pro")).toBeTruthy();
    expect(within(sheet()).getByRole("link", { name: "See Pro" }).getAttribute("href")).toBe("/pricing");
  });

  it("quota used up: the period sentence, and the Resume Score tips as the free alternative", async () => {
    requestRewrite.mockResolvedValue({ kind: "result", result: { status: "quotaExceeded", usage: { used: 100, limit: 100, resetsAt: "2026-11-01T00:00:00Z" } } });
    renderEditor();
    await rewriteSummary();
    expect(within(sheet()).getByText("This period's Kiwiply AI is used up")).toBeTruthy();
    fireEvent.click(within(sheet()).getByRole("button", { name: "Run the Resume Score tips" }));
    await flush(300);
    expect(screen.queryByRole("dialog", { name: "Rewrite with AI" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Tips to improve" })).toBeTruthy();
  });

  it("a provider failure shows the error with Try again, and the resume is untouched", async () => {
    requestRewrite.mockResolvedValueOnce({ kind: "error", status: 502, message: "Couldn't reach Kiwiply AI right now - try again.", retry: true });
    requestRewrite.mockResolvedValueOnce(okOutcome(summaryProposal()));
    renderEditor();
    await rewriteSummary();
    expect(within(sheet()).getByRole("alert").textContent).toContain("Couldn't reach Kiwiply AI right now");
    fireEvent.click(within(sheet()).getByRole("button", { name: "Try again" }));
    await flush();
    expect(within(sheet()).getByRole("button", { name: "Apply 1 selected" })).toBeTruthy();
    expect(summaryBox().value).toBe("Engineer.");
  });
});

describe("Rewrite with AI - Free", () => {
  it("every Rewrite button is a lock that leads to Pro, and no request is ever made", async () => {
    renderEditor(DEFAULT_BUILDER_CONFIG);
    const lock = screen.getByRole("button", { name: "Rewrite with AI: Summary (Pro)" });
    fireEvent.click(lock);
    expect(screen.getByRole("link", { name: "See Pro" }).getAttribute("href")).toBe("/pricing");
    expect(track).toHaveBeenCalledWith("resume_ai_locked_click", { task: "rewrite", from: "section" });
    expect(screen.getByRole("button", { name: "Rewrite with AI: Experience (Pro)" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Rewrite bullet 1 with AI (Pro)" }).length).toBeGreaterThan(0);
    await flush();
    expect(requestRewrite).not.toHaveBeenCalled();
    expect(listOpenProposals).not.toHaveBeenCalled();
  });
});
