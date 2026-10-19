// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/w/consultant/opportunities", useSearchParams: () => new URLSearchParams("") }));

let compact = false;
vi.mock("./useCompact", () => ({ useCompact: () => compact }));

import { ToastProvider } from "@kiwiply/ui";
import OpportunitiesPage from "./OpportunitiesPage";
import { CONFIRM_TEXT, PHONE_NOTE } from "@/lib/ent/consultant-ws/prepareBatch";

const tile = (value: number) => ({ value, previous: 1, deltaPct: null, sparkline: [0, 1, value] });
const orow = (over: Record<string, unknown>) => ({
  matchId: 1, requirementId: 10, title: "Senior Java Developer", skills: ["Java"], company: "TechCorp", location: "San Jose, CA", workMode: "ONSITE", marketer: "Michael Torres",
  status: "NEW", priority: "HIGH", priorityDerived: false, dueOn: "2026-10-16", dueDerived: false, daysLeft: 2, score: 94, missingSkills: 1, interestSent: false, assignedAt: "2026-10-01T00:00:00Z",
  sourceUrl: "https://jobs.example.com/acme/" + (over.matchId ?? 1), sourceName: "Company site", quickInfo: null, sourceSample: false, ...over,
});
const page = () => ({
  orgId: 2, generatedAt: "2026-10-14T00:00:00Z", name: "Anika Rao",
  tiles: { total: tile(4), high: tile(1), awaiting: tile(0), inReview: tile(1), declined: tile(1) },
  rows: [
    orow({ matchId: 1 }),
    orow({ matchId: 2, title: "Cloud Architect", status: "IN_REVIEW" }),
    orow({ matchId: 3, title: "Data Engineer", status: "DECLINED" }),
    orow({ matchId: 4, title: "Rust Developer", sourceUrl: null, sourceName: null }),
  ],
  page: 0, size: 50, total: 4, sort: "due",
  nextSteps: { toRespond: 1, soonestDueDays: 2, resumeGaps: 0, upcomingInterviews: 0, hasMarketer: true },
});

type Call = { method: string; url: string; body?: string };
let calls: Call[];
let status: unknown;
let createRes: { status: number; body: unknown };
let sessionBody: unknown;
let ackMode: "ack" | "none" | "refuse";

const statusOn = (over: Record<string, unknown> = {}) => ({ enabled: true, maxBatch: 10, remainingToday: 28, remainingMonth: 298, dailyCap: 30, monthlyCap: 300, reason: null, ...over });
const statusOff = (reason: string) => ({ enabled: false, maxBatch: 0, remainingToday: 0, remainingMonth: 0, dailyCap: 0, monthlyCap: 0, reason });
const createdBody = {
  sessionId: 9, expiresAt: "2026-10-16T16:00:00Z",
  jobs: [{ matchId: 1, url: "https://jobs.example.com/acme/1", title: "Senior Java Developer", company: "TechCorp" }, { matchId: 2, url: "https://jobs.example.com/acme/2", title: "Cloud Architect", company: "TechCorp" }],
  skipped: [], remainingToday: 26, remainingMonth: 296,
};
const sessionOf = (states: string[], applied = false) => ({
  sessionId: 9, expiresAt: "2026-10-16T16:00:00Z",
  items: [1, 2].map((id, i) => ({ matchId: id, url: "https://jobs.example.com/acme/" + id, title: id === 1 ? "Senior Java Developer" : "Cloud Architect", company: "TechCorp", state: states[i], detail: states[i] === "NEEDS_INPUT" ? "2 required fields are empty" : null, applied: applied && i === 0, updatedAt: "2026-10-16T12:00:00Z" })),
});

beforeEach(() => {
  calls = [];
  compact = false;
  status = statusOn();
  createRes = { status: 200, body: createdBody };
  sessionBody = sessionOf(["WAITING", "WAITING"]);
  ackMode = "ack";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? "GET";
      calls.push({ method, url, body: init.body as string | undefined });
      const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });
      if (url.endsWith("/consultant/prepare/status")) return json(status);
      if (url.endsWith("/consultant/prepare") && method === "POST") return json(createRes.body, createRes.status);
      if (/\/consultant\/prepare\/\d+$/.test(url)) return json(sessionBody);
      if (method !== "GET") return json({});
      return json(page());
    }),
  );
  vi.spyOn(window, "postMessage").mockImplementation((m: unknown) => {
    const msg = m as { type?: string; sessionId?: number } | null;
    if (msg?.type !== "KIWIPLY_PREPARE_BATCH" || ackMode === "none") return;
    queueMicrotask(() => window.dispatchEvent(new MessageEvent("message", { data: { type: "KIWIPLY_PREPARE_ACK", sessionId: msg.sessionId, ...(ackMode === "refuse" ? { accepted: false, reason: "not-connected" } : { accepted: true }) }, origin: window.location.origin, source: window })));
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const tick = (ms = 20) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
async function mount() {
  vi.useFakeTimers({ toFake: ["setTimeout", "setInterval", "clearTimeout", "clearInterval"] });
  const v = render(
    <ToastProvider>
      <OpportunitiesPage orgId={2} firstName="Anika Rao" />
    </ToastProvider>,
  );
  await tick();
  await tick();
  return v;
}
const check = (id: number) => document.querySelector(`[data-prepare-check="${id}"]`) as HTMLInputElement;
const posts = () => calls.filter((c) => c.method === "POST" && c.url.endsWith("/consultant/prepare"));

describe("Prepare selected openings on Assigned Opportunities", () => {
  it("shows nothing at all while the feature is off", async () => {
    status = statusOff("PLATFORM_OFF");
    await mount();
    expect(document.querySelector("[data-prepare-bar]")).toBeNull();
    expect(document.querySelector("[data-prepare-check]")).toBeNull();
    expect(document.querySelector("[data-prepare-phone-note]")).toBeNull();
    expect(document.querySelector("[data-prepare-off-note]")).toBeNull();
  });

  it("when the organization has not turned it on: no checkboxes, no bar, one calm line", async () => {
    status = statusOff("ORG_OFF");
    await mount();
    expect(document.querySelector("[data-prepare-bar]")).toBeNull();
    expect(document.querySelector("[data-prepare-check]")).toBeNull();
    expect(screen.queryByRole("button", { name: /Prepare selected/ })).toBeNull();
    expect(document.querySelector("[data-prepare-off-note]")!.textContent).toBe("Your organization hasn't turned on preparing applications.");
  });

  it("when the license lacks the add-on: no checkboxes, no bar, a calm line about the license", async () => {
    status = statusOff("NO_LICENSE");
    await mount();
    expect(document.querySelector("[data-prepare-bar]")).toBeNull();
    expect(document.querySelector("[data-prepare-check]")).toBeNull();
    expect(document.querySelector("[data-prepare-off-note]")!.textContent).toBe("Your organization's license doesn't include preparing applications.");
  });

  it("the page's own call stays first; the status is read after it", async () => {
    await mount();
    expect(calls[0]!.url).toBe("/api/orgs/2/me-workspace/opportunities?sort=due&size=50");
    expect(calls.some((c) => c.url === "/api/orgs/2/consultant/prepare/status")).toBe(true);
  });

  it("draws a checkbox per row, the caps, and says why a row cannot be ticked", async () => {
    await mount();
    expect(screen.getByRole("button", { name: "Prepare selected (0)" }).hasAttribute("disabled")).toBe(true);
    expect(document.querySelector("[data-prepare-caps]")!.textContent).toBe("Today 28 left · This month 298 left · Up to 10 at a time");
    expect(check(1).disabled).toBe(false);
    expect(check(2).disabled).toBe(false);
    expect(check(3).disabled).toBe(true);
    expect(check(4).disabled).toBe(true);
    const row3 = document.querySelector('tr[data-opp="3"]') as HTMLElement;
    expect(within(row3).getByText(/Can't prepare: Declined/)).toBeTruthy();
    const row4 = document.querySelector('tr[data-opp="4"]') as HTMLElement;
    expect(within(row4).getByText(/Can't prepare: Your marketer hasn't added the link yet/)).toBeTruthy();
    expect(check(3).getAttribute("title")).toMatch(/Declined/);
  });

  it("stops at the batch limit and says so", async () => {
    status = statusOn({ maxBatch: 1 });
    await mount();
    fireEvent.click(check(1));
    expect(check(2).disabled).toBe(true);
    expect(check(2).getAttribute("title")).toBe("You can prepare up to 1 at a time.");
    expect(check(1).disabled).toBe(false);
    fireEvent.click(check(1));
    expect(check(2).disabled).toBe(false);
  });

  it("confirms plainly, plans the batch, hands it to the extension and shows each opening's progress", async () => {
    await mount();
    fireEvent.click(check(1));
    fireEvent.click(check(2));
    fireEvent.click(screen.getByRole("button", { name: "Prepare selected (2)" }));
    await tick();
    const dialog = document.querySelector("[data-prepare-dialog]") as HTMLElement;
    expect(dialog.textContent).toContain(CONFIRM_TEXT);
    expect(within(dialog).getByText(/Senior Java Developer/)).toBeTruthy();
    expect(posts()).toHaveLength(0);

    fireEvent.click(document.querySelector("[data-prepare-confirm]")!);
    await tick();
    await tick();
    expect(posts()).toHaveLength(1);
    expect(JSON.parse(posts()[0]!.body!)).toEqual({ matchIds: [1, 2] });
    const sent = (window.postMessage as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => c[0] as { type?: string }).find((m) => m.type === "KIWIPLY_PREPARE_BATCH") as unknown as Record<string, unknown>;
    expect(sent).toMatchObject({ type: "KIWIPLY_PREPARE_BATCH", version: 1, sessionId: "9", orgId: 2 });
    expect((sent.jobs as unknown[]).length).toBe(2);
    expect(document.querySelector("[data-prepare-acked]")).toBeTruthy();
    expect(document.querySelector("[data-prepare-no-extension]")).toBeNull();
    // the selection is cleared and the limits shown are the ones the API returned
    expect(check(1).checked).toBe(false);
    expect(document.querySelector("[data-prepare-caps]")!.textContent).toContain("Today 26 left");

    const item = (id: number) => document.querySelector(`[data-prepare-item="${id}"]`) as HTMLElement;
    expect(within(item(1)).getByText("Waiting")).toBeTruthy();

    sessionBody = sessionOf(["FILLED", "NEEDS_INPUT"]);
    await tick(3000);
    expect(within(item(1)).getByText("Filled")).toBeTruthy();
    expect(within(item(2)).getByText("Needs your input")).toBeTruthy();
    expect(item(2).textContent).toContain("2 required fields are empty");

    sessionBody = sessionOf(["SUBMITTED", "CLOSED"], true);
    await tick(3000);
    expect(within(item(1)).getByText("Submitted")).toBeTruthy();
    expect(within(item(1)).getByText("Application tracked")).toBeTruthy();
    expect(within(item(2)).getByText("Closed")).toBeTruthy();

    // everything is final: the panel stops polling
    const reads = calls.filter((c) => /\/consultant\/prepare\/9$/.test(c.url)).length;
    await tick(9000);
    expect(calls.filter((c) => /\/consultant\/prepare\/9$/.test(c.url)).length).toBe(reads);
  });

  it("with no acknowledgement in 3 seconds it says the extension was not detected and offers the links one by one", async () => {
    ackMode = "none";
    await mount();
    fireEvent.click(check(1));
    fireEvent.click(screen.getByRole("button", { name: "Prepare selected (1)" }));
    await tick();
    fireEvent.click(document.querySelector("[data-prepare-confirm]")!);
    await tick(2900);
    expect(document.querySelector("[data-prepare-no-extension]")).toBeNull();
    expect(document.querySelector("[data-prepare-waiting]")).toBeTruthy();
    await tick(200);
    const guide = document.querySelector("[data-prepare-no-extension]") as HTMLElement;
    expect(guide.textContent).toContain("Extension not detected");
    const link = within(document.querySelector('[data-prepare-item="1"]') as HTMLElement).getByRole("link", { name: /Open job link/ }) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("https://jobs.example.com/acme/1");
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("an extension that refuses (not signed in to this organization) is treated as not detected", async () => {
    ackMode = "refuse";
    await mount();
    fireEvent.click(check(1));
    fireEvent.click(screen.getByRole("button", { name: "Prepare selected (1)" }));
    await tick();
    fireEvent.click(document.querySelector("[data-prepare-confirm]")!);
    await tick();
    await tick();
    expect(document.querySelector("[data-prepare-no-extension]")).toBeTruthy();
  });

  it("an over-the-limit answer stays in the dialog with the numbers, and nothing is sent to the extension", async () => {
    createRes = { status: 409, body: { code: "PREPARE_CAP_REACHED", error: "That would go over your preparation limit.", remainingToday: 1, remainingMonth: 5 } };
    await mount();
    fireEvent.click(check(1));
    fireEvent.click(check(2));
    fireEvent.click(screen.getByRole("button", { name: "Prepare selected (2)" }));
    await tick();
    fireEvent.click(document.querySelector("[data-prepare-confirm]")!);
    await tick();
    await tick();
    const err = document.querySelector("[data-prepare-error]") as HTMLElement;
    expect(err.textContent).toContain("over your preparation limit");
    expect(err.textContent).toContain("Today 1 left, this month 5 left");
    expect(document.querySelector("[data-prepare-progress]")).toBeNull();
    expect((window.postMessage as unknown as { mock: { calls: unknown[][] } }).mock.calls.some((c) => (c[0] as { type?: string })?.type === "KIWIPLY_PREPARE_BATCH")).toBe(false);
  });

  it("nothing eligible: no session, no extension message, the reasons are listed", async () => {
    createRes = { status: 200, body: { sessionId: null, expiresAt: null, jobs: [], skipped: [{ matchId: 2, reason: "JOB_NOT_OPEN" }], remainingToday: 28, remainingMonth: 298 } };
    await mount();
    fireEvent.click(check(2));
    fireEvent.click(screen.getByRole("button", { name: "Prepare selected (1)" }));
    await tick();
    fireEvent.click(document.querySelector("[data-prepare-confirm]")!);
    await tick();
    await tick();
    const panel = document.querySelector("[data-prepare-progress]") as HTMLElement;
    expect(panel.textContent).toContain("Nothing to prepare");
    expect(document.querySelector("[data-prepare-skipped]")!.textContent).toContain("Cloud Architect (the job is no longer open)");
    expect((window.postMessage as unknown as { mock: { calls: unknown[][] } }).mock.calls.some((c) => (c[0] as { type?: string })?.type === "KIWIPLY_PREPARE_BATCH")).toBe(false);
  });

  it("on a phone or touch tablet the batch action is hidden with a note", async () => {
    compact = true;
    await mount();
    expect(document.querySelector("[data-prepare-check]")).toBeNull();
    expect(screen.queryByRole("button", { name: /Prepare selected/ })).toBeNull();
    expect(document.querySelector("[data-prepare-phone-note]")!.textContent).toBe(PHONE_NOTE);
    // the single-job path is still there
    expect(within(document.querySelector('tr[data-opp="1"]') as HTMLElement).getByRole("link", { name: /Open job link/ })).toBeTruthy();
  });
});
