/**
 * AI Suggestions inside the real editor (R4.6): the stored cards are read on open, the count badge, the carousel, "Apply
 * Suggestion" (server apply, then one reducer step, so Undo works), "Preview" (the same diff sheet), stale -> Refresh,
 * "Get suggestions" and the Free lock. The fetchers are mocked; everything between them and the screen is real.
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@kiwiply/ui";
import type { ApplyOutcome, AiProposal, SuggestOutcome, SuggestionsResult } from "@/lib/resume-ai";
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
const listSuggestions = vi.fn<(id: number) => Promise<SuggestionsResult | null>>();
const requestSuggestions = vi.fn<(id: number, refresh: boolean) => Promise<SuggestOutcome>>();
const applyProposal = vi.fn<(pid: number, keep: readonly string[], alts: Record<string, number>) => Promise<ApplyOutcome>>();
const dismissProposal = vi.fn<(pid: number) => Promise<boolean>>();
vi.mock("@/lib/resume-ai", async (orig) => ({
  ...(await orig<typeof import("@/lib/resume-ai")>()),
  listSuggestions: (id: number) => listSuggestions(id),
  requestSuggestions: (id: number, refresh: boolean) => requestSuggestions(id, refresh),
  applyProposal: (pid: number, keep: readonly string[], alts: Record<string, number>) => applyProposal(pid, keep, alts),
  dismissProposal: (pid: number) => dismissProposal(pid),
  listOpenProposals: vi.fn().mockResolvedValue([]),
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
const openTab = () => fireEvent.click(screen.getAllByRole("tab", { name: /AI Suggestions/ })[0]);

const summaryCard = (over: Partial<AiProposal> = {}): AiProposal => ({
  id: 11,
  task: "suggest",
  kind: "summary",
  title: "Make your summary stronger",
  body: "Add more impact with specific skills.",
  stale: false,
  model: "flash-lite",
  aiCallId: 77,
  changes: [{ ref: "i_sum0001", section: "Summary", before: "Engineer.", after: "Senior engineer who ships.", reason: "Adds scope", sources: ["i_sum0001"] }],
  ...over,
});
const bulletsCard = (over: Partial<AiProposal> = {}): AiProposal => ({
  id: 12,
  task: "suggest",
  kind: "bullets",
  title: "Lead with a strong verb",
  body: "Start bullets with what you did.",
  stale: false,
  changes: [
    { ref: "b_aaaaaaaa", section: "Software Engineer · Acme", before: "Led migration", after: "Drove the migration", reason: "Stronger verb", sources: ["b_aaaaaaaa"] },
    { ref: "b_bbbbbbbb", section: "Software Engineer · Acme", before: "Cut latency", after: "Slashed latency", reason: "Active verb", sources: ["b_bbbbbbbb"] },
  ],
  ...over,
});
const cards = (...c: AiProposal[]): SuggestionsResult => ({ status: "ok", suggestions: c, contentHash: "h" });
const applied = (docVersion: number): ApplyOutcome => ({ kind: "ok", dto: { ...dto(), docVersion } });

beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(window, "innerWidth", { value: 1440, configurable: true, writable: true });
  window.localStorage.clear();
  putDoc.mockReset().mockImplementation(async (_id, version) => ({ kind: "ok", version: version + 1, contentHash: null }));
  listSuggestions.mockReset().mockResolvedValue(cards(bulletsCard(), summaryCard()));
  requestSuggestions.mockReset();
  applyProposal.mockReset();
  dismissProposal.mockReset().mockResolvedValue(true);
  track.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("AI Suggestions - Pro", () => {
  it("reads the stored cards on open (no AI call), shows the count and the summary card first", async () => {
    renderEditor();
    await flush();
    expect(listSuggestions).toHaveBeenCalledWith(42);
    expect(requestSuggestions).not.toHaveBeenCalled();
    // the badge on the tab, and the card of the highest-priority kind (summary) first
    expect(within(screen.getAllByRole("tab", { name: /AI Suggestions/ })[0]).getByLabelText("2 suggestions")).toBeTruthy();
    openTab();
    expect(screen.getByText("Make your summary stronger")).toBeTruthy();
    expect(screen.getByRole("group", { name: "1 of 2" }).getAttribute("aria-roledescription")).toBe("slide");
    expect(screen.getByRole("button", { name: "Apply Suggestion" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Preview" })).toBeTruthy();
    expect(screen.getByText("AI · review before you use it")).toBeTruthy();
  });

  it("the carousel: arrows, dots and the arrow keys move between cards", async () => {
    renderEditor();
    await flush();
    openTab();
    const root = document.querySelector("[data-carousel]") as HTMLElement;
    expect(root.getAttribute("aria-roledescription")).toBe("carousel");
    expect((screen.getByRole("button", { name: "Previous suggestion" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Next suggestion" }));
    expect(screen.getByText("Lead with a strong verb")).toBeTruthy();
    expect(screen.getByRole("group", { name: "2 of 2" })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Next suggestion" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(root, { key: "ArrowLeft" });
    expect(screen.getByText("Make your summary stronger")).toBeTruthy();
    fireEvent.keyDown(root, { key: "ArrowRight" });
    expect(screen.getByText("Lead with a strong verb")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Suggestion 1 of 2" }));
    expect(screen.getByText("Make your summary stronger")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Suggestion 1 of 2" }).getAttribute("aria-current")).toBe("true");
  });

  it("Apply Suggestion applies every change of the card at once, Undo takes it back, and nothing is saved twice", async () => {
    applyProposal.mockResolvedValue(applied(9));
    renderEditor();
    await flush();
    openTab();
    fireEvent.click(screen.getByRole("button", { name: "Next suggestion" })); // the bullets card: two changes
    fireEvent.click(screen.getByRole("button", { name: "Apply Suggestion" }));
    await flush();

    expect(applyProposal).toHaveBeenCalledWith(12, ["b_aaaaaaaa", "b_bbbbbbbb"], {});
    expect((screen.getAllByLabelText("Bullet 1")[0] as HTMLTextAreaElement).value).toBe("Drove the migration");
    expect(screen.getByText("Applied 2 changes")).toBeTruthy();
    expect(track).toHaveBeenCalledWith("resume_ai_apply", { task: "suggest", kept: 2, total: 2 });
    await flush(2000);
    expect(putDoc).not.toHaveBeenCalled(); // the autosave adopted the server's version

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await flush();
    expect((screen.getAllByLabelText("Bullet 1")[0] as HTMLTextAreaElement).value).toBe("Led migration");
  });

  it("after an apply the cards are read again: the one used leaves, the badge follows", async () => {
    applyProposal.mockResolvedValue(applied(9));
    renderEditor();
    await flush();
    openTab();
    listSuggestions.mockResolvedValue(cards(bulletsCard())); // what the server answers once the summary card is used
    fireEvent.click(screen.getByRole("button", { name: "Apply Suggestion" })); // the summary card is first
    await flush();
    expect(applyProposal).toHaveBeenCalledWith(11, ["i_sum0001"], {});
    expect(summaryBox().value).toBe("Senior engineer who ships.");
    expect(listSuggestions).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("Make your summary stronger")).toBeNull();
    expect(screen.getByText("Lead with a strong verb")).toBeTruthy();
    expect(within(screen.getAllByRole("tab", { name: /AI Suggestions/ })[0]).getByLabelText("1 suggestions")).toBeTruthy();
  });

  it("Preview opens the same diff sheet, titled for the suggestion, with no mode picker; Apply selected writes only those", async () => {
    applyProposal.mockResolvedValue(applied(9));
    renderEditor();
    await flush();
    openTab();
    fireEvent.click(screen.getByRole("button", { name: "Next suggestion" }));
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    await flush();
    const sheet = screen.getByRole("dialog", { name: "AI suggestion" });
    expect(within(sheet).queryByText("Rewrite as")).toBeNull();
    expect(within(sheet).getAllByRole("checkbox")).toHaveLength(2);
    fireEvent.click(within(sheet).getAllByRole("checkbox", { name: "Apply change to Software Engineer · Acme" })[1]); // untick the second change
    fireEvent.click(within(sheet).getByRole("button", { name: /^Apply 1 selected/ }));
    await flush();
    expect(applyProposal).toHaveBeenCalledTimes(1);
    expect(applyProposal.mock.calls[0][0]).toBe(12);
    expect(applyProposal.mock.calls[0][1]).toEqual(["b_aaaaaaaa"]);
    expect(track).toHaveBeenCalledWith("resume_ai_suggestion_preview", { kind: "bullets", changes: 2 });
  });

  it("Dismiss in the preview removes the card", async () => {
    renderEditor();
    await flush();
    openTab();
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    await flush();
    listSuggestions.mockResolvedValue(cards(bulletsCard()));
    fireEvent.click(within(screen.getByRole("dialog", { name: "AI suggestion" })).getByRole("button", { name: "Dismiss" }));
    await flush(300);
    expect(dismissProposal).toHaveBeenCalledWith(11);
    expect(screen.queryByText("Make your summary stronger")).toBeNull();
  });

  it("a card with a [add a number] gap opens the preview instead of applying", async () => {
    listSuggestions.mockResolvedValue(
      cards(summaryCard({ changes: [{ ref: "i_sum0001", section: "Summary", before: "Engineer.", after: "Engineer who cut costs by [add a number]." }] })),
    );
    renderEditor();
    await flush();
    openTab();
    fireEvent.click(screen.getByRole("button", { name: "Apply Suggestion" }));
    await flush();
    expect(applyProposal).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "AI suggestion" })).toBeTruthy();
  });

  it("a 409 on Apply says the resume changed and the cards are read again", async () => {
    applyProposal.mockResolvedValue({ kind: "stale" });
    renderEditor();
    await flush();
    openTab();
    fireEvent.click(screen.getByRole("button", { name: "Apply Suggestion" }));
    await flush();
    expect(screen.getAllByText("Resume changed").length).toBeGreaterThan(0);
    expect(listSuggestions).toHaveBeenCalledTimes(2);
    expect(summaryBox().value).toBe("Engineer.");
  });

  it("editing the resume makes the cards stale: Refresh asks again (saving first) and replaces them", async () => {
    renderEditor();
    await flush();
    openTab();
    expect(screen.queryByRole("button", { name: "Refresh" })).toBeNull();
    fireEvent.change(summaryBox(), { target: { value: "Engineer, edited." } });
    expect(screen.getByText("These were made from an earlier version of your resume.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Apply Suggestion" }) as HTMLButtonElement).disabled).toBe(true);

    requestSuggestions.mockResolvedValue({ kind: "result", result: cards(bulletsCard({ id: 21, title: "Fresh idea" })) });
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await flush();
    expect(putDoc).toHaveBeenCalledTimes(1);
    expect(putDoc.mock.invocationCallOrder[0]).toBeLessThan(requestSuggestions.mock.invocationCallOrder[0]);
    expect(requestSuggestions).toHaveBeenCalledWith(42, true);
    expect(screen.getByText("Fresh idea")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Refresh" })).toBeNull();
  });

  it("nothing is requested by itself: auto-refresh is off by default", async () => {
    renderEditor();
    await flush();
    openTab();
    fireEvent.change(summaryBox(), { target: { value: "Engineer, edited." } });
    await flush(30 * 60 * 1000);
    expect(requestSuggestions).not.toHaveBeenCalled();
  });

  it("with auto-refresh switched on, a quiet document is refreshed after suggestStaleMinutes", async () => {
    requestSuggestions.mockResolvedValue({ kind: "result", result: cards(summaryCard({ id: 31, title: "Auto" })) });
    renderEditor({ ...PRO, ai: { ...PRO.ai, suggestAutoRefresh: true, suggestStaleMinutes: 5 } });
    await flush();
    fireEvent.change(summaryBox(), { target: { value: "Engineer, edited." } });
    await flush(4 * 60 * 1000);
    expect(requestSuggestions).not.toHaveBeenCalled();
    await flush(61 * 1000);
    expect(requestSuggestions).toHaveBeenCalledWith(42, true);
  });

  it("empty: 'Get suggestions' asks, and the cards arrive", async () => {
    listSuggestions.mockResolvedValue(cards());
    requestSuggestions.mockResolvedValue({ kind: "result", result: cards(summaryCard(), bulletsCard()) });
    renderEditor();
    await flush();
    openTab();
    expect(screen.getByText("No suggestions yet")).toBeTruthy();
    expect(within(screen.getAllByRole("tab", { name: /AI Suggestions/ })[0]).queryByLabelText(/suggestions$/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Get suggestions" }));
    await flush();
    expect(requestSuggestions).toHaveBeenCalledWith(42, false);
    expect(screen.getByText("Make your summary stronger")).toBeTruthy();
  });

  it("the refusals: nothing to improve, quota used up, a provider failure", async () => {
    listSuggestions.mockResolvedValue(cards());
    requestSuggestions.mockResolvedValueOnce({ kind: "result", result: { status: "nothingToChange", suggestions: [], dropped: 0 } });
    renderEditor();
    await flush();
    openTab();
    fireEvent.click(screen.getByRole("button", { name: "Get suggestions" }));
    await flush();
    expect(screen.getByText("Nothing to improve right now")).toBeTruthy();

    requestSuggestions.mockResolvedValueOnce({ kind: "result", result: { status: "nothingToChange", suggestions: [], dropped: 3 } });
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    await flush();
    expect(screen.getByText("Nothing safe to suggest")).toBeTruthy();

    requestSuggestions.mockResolvedValueOnce({ kind: "result", result: { status: "quotaExceeded", suggestions: [], usage: { used: 100, limit: 100, resetsAt: "2026-11-01T00:00:00Z" } } });
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    await flush();
    expect(screen.getByText("This period's Kiwiply AI is used up")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Get suggestions" })).toBeNull();
  });

  it("a provider failure keeps the cards that were there and says so", async () => {
    requestSuggestions.mockResolvedValue({ kind: "error", status: 502, message: "Couldn't reach Kiwiply AI right now - try again.", retry: true });
    renderEditor();
    await flush();
    openTab();
    fireEvent.change(summaryBox(), { target: { value: "Engineer, edited." } });
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await flush();
    expect(screen.getByRole("alert").textContent).toContain("Couldn't reach Kiwiply AI right now");
    expect(screen.getByText("Make your summary stronger")).toBeTruthy();
  });

  it("See all lists every card with the same buttons and applies from the list", async () => {
    applyProposal.mockResolvedValue(applied(9));
    renderEditor();
    await flush();
    openTab();
    fireEvent.click(screen.getByRole("button", { name: /See all/ }));
    await flush();
    const sheet = screen.getByRole("dialog", { name: "AI Suggestions" });
    const items = within(sheet).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    fireEvent.click(within(items[1]).getByRole("button", { name: "Apply Suggestion" }));
    await flush();
    expect(applyProposal).toHaveBeenCalledWith(12, ["b_aaaaaaaa", "b_bbbbbbbb"], {});
  });

  it("the usage line of the AI meter sits under the cards", async () => {
    render(
      <ToastProvider>
        <ResumeEditor initial={dto()} plan="PRO" config={PRO} aiUsageLine={{ headline: "12% of your Kiwiply AI used", detail: "Resets Nov 1." }} />
      </ToastProvider>,
    );
    await flush();
    openTab();
    expect(screen.getByText(/12% of your Kiwiply AI used/)).toBeTruthy();
  });
});

describe("AI Suggestions - Free", () => {
  it("one locked card with the way to Pro; no cards are read and the badge never shows", async () => {
    renderEditor(DEFAULT_BUILDER_CONFIG);
    await flush();
    openTab();
    expect(screen.getByText("AI suggestions are part of Pro")).toBeTruthy();
    expect(screen.getByRole("link", { name: "See Pro" }).getAttribute("href")).toBe("/pricing");
    expect(listSuggestions).not.toHaveBeenCalled();
    expect(requestSuggestions).not.toHaveBeenCalled();
    expect(within(screen.getAllByRole("tab", { name: /AI Suggestions/ })[0]).queryByLabelText(/suggestions$/)).toBeNull();
  });

  it("a 402 from the server (the plan lapsed) turns the tab into the lock", async () => {
    listSuggestions.mockResolvedValue(cards());
    requestSuggestions.mockResolvedValue({ kind: "locked" });
    renderEditor();
    await flush();
    openTab();
    fireEvent.click(screen.getByRole("button", { name: "Get suggestions" }));
    await flush();
    expect(screen.getByText("AI suggestions are part of Pro")).toBeTruthy();
  });
});
