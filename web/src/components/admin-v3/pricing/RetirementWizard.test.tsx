import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CoverageResult, RetirementDefaults } from "@/lib/admin-retirements";
import { DESKTOP, PHONE, stubViewport } from "../common/kit-test-utils";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));

type Call = { method: string; path: string; body?: Record<string, unknown> };
const calls: Call[] = [];
let respond: (c: Call) => { status?: number; code?: string; error?: string; data?: unknown };
vi.mock("@/lib/admin-client", async (orig) => {
  const real = await orig<typeof import("@/lib/admin-client")>();
  return {
    ...real,
    adminFetch: vi.fn(async (method: string, path: string, body?: Record<string, unknown>) => {
      const call = { method, path, body };
      calls.push(call);
      const out = respond(call);
      if (out.status && out.status >= 400) return { ok: false, status: out.status, code: out.code ?? null, error: out.error ?? "refused", extra: {} };
      return { ok: true, data: out.data };
    }),
  };
});

import RetirementWizard from "./RetirementWizard";

const DEFAULTS: RetirementDefaults = {
  minNoticeDays: 30,
  noticeScheduleDays: [60, 30, 7, 1],
  channels: ["EMAIL", "IN_APP"],
  availableChannels: ["EMAIL", "IN_APP", "PUSH"],
  allowedOutcomes: ["FREE", "MIGRATE_AT_RENEWAL", "CANCEL"],
  noticeDayMin: 1,
  noticeDayMax: 120,
  messageMax: 2000,
  reasonMin: 20,
};

const SUCCESSORS: Record<string, CoverageResult["successors"][number]> = {
  PRO_STUDENT: { planKey: "PRO_STUDENT", name: "Pro Student", fullyCovered: 198, withGaps: 14, wouldPayMore: 9, sellable: true, gapFeatures: [{ featureKey: "autopilot.prepare", name: "Autopilot prepare", subscribers: 9 }] },
  AUTOPILOT: { planKey: "AUTOPILOT", name: "Autopilot", fullyCovered: 212, withGaps: 0, wouldPayMore: 0, sellable: true, gapFeatures: [] },
};

const coverage = (keys: string[]): CoverageResult => ({
  planKey: "PRO",
  planName: "Pro",
  planVersion: 1,
  impact: {
    subscribers: 212,
    mrrMinor: 423888,
    currency: "USD",
    byInterval: { MONTH: 180, QUARTER: 32, YEAR: 0 },
    withAddons: 38,
    earliestEffectiveAt: "2026-11-15T00:00:00Z",
    latestEffectiveAt: "2027-01-11T00:00:00Z",
  },
  successors: keys.map((k) => SUCCESSORS[k]),
  defaults: DEFAULTS,
});

const PLAN = { planKey: "PRO", name: "Pro", status: "PUBLISHED" };
const CANDIDATES = [
  { planKey: "PRO_STUDENT", name: "Pro Student" },
  { planKey: "AUTOPILOT", name: "Autopilot" },
];

beforeEach(() => {
  calls.length = 0;
  push.mockReset();
  stubViewport(DESKTOP);
  respond = (c) => {
    if (c.path.startsWith("/retirements/coverage")) {
      const keys = new URLSearchParams(c.path.split("?")[1]).get("successors");
      return { data: coverage(keys ? keys.split(",") : []) };
    }
    if (c.path.startsWith("/retirements/notices/preview")) return { data: { subject: "Your Pro plan is changing on Nov 15", body: "We're retiring Pro.", sampleEffectiveAt: "2026-11-15T00:00:00Z" } };
    if (c.method === "POST" && c.path === "/retirements") return { data: { id: 7 } };
    return { status: 404 };
  };
});
afterEach(() => cleanup());

const next = async () => {
  const b = screen.getByRole("button", { name: "Next" }) as HTMLButtonElement;
  await waitFor(() => expect(b.disabled).toBe(false));
  fireEvent.click(b);
};

async function toStep(n: number) {
  for (let i = 0; i < n; i += 1) await next();
}

describe("RetirementWizard (K10.9)", () => {
  it("opens on the default: retire at renewal, nothing typed, and shows the impact tiles from the API", async () => {
    render(<RetirementWizard plan={PLAN} candidates={CANDIDATES} />);
    expect(screen.getByRole("radio", { name: /Retire at each subscriber's next renewal/ }).getAttribute("aria-checked")).toBe("true");
    await toStep(1);
    expect(await screen.findByText("212")).toBeTruthy();
    expect(screen.getByText("$4,238.88")).toBeTruthy();
    expect(screen.getByText("Monthly")).toBeTruthy();
    expect(screen.getByText("180")).toBeTruthy();
    expect(screen.getByText("32")).toBeTruthy();
  });

  it("selects Free + read-only by default and offers the other outcomes only when the API lists them", async () => {
    render(<RetirementWizard plan={PLAN} candidates={CANDIDATES} />);
    await toStep(3);
    expect(screen.getByRole("radio", { name: /Free, with a read-only lock/ }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: /Move to the first successor/ })).toBeTruthy();
    expect(await screen.findByTestId("notice-preview")).toBeTruthy();
  });

  it("shows coverage per successor and refuses MIGRATE_AT_RENEWAL when 9 would pay more", async () => {
    render(<RetirementWizard plan={PLAN} candidates={CANDIDATES} />);
    await toStep(2);
    fireEvent.click(screen.getByRole("button", { name: "Add a successor" }));
    fireEvent.click(await screen.findByRole("option", { name: /Pro Student/ }));
    expect(await screen.findByText(/198 fully covered · 14 with gaps · 9 would pay more/)).toBeTruthy();
    expect(screen.getByText(/Autopilot prepare \(9\)/)).toBeTruthy();
    expect(screen.getByTestId("price-check").textContent).toMatch(/needs no price check/);
    await next();
    fireEvent.click(screen.getByRole("radio", { name: /Move to the first successor/ }));
    expect(screen.getByTestId("outcome-refusal").textContent).toMatch(/9 subscribers would pay more under Pro Student/);
    await next();
    const start = screen.getByRole("button", { name: "Start retirement" }) as HTMLButtonElement;
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Pro v1 is replaced by a cheaper plan" } });
    fireEvent.change(screen.getByLabelText("Plan key to confirm"), { target: { value: "PRO" } });
    expect(start.disabled).toBe(true);
    expect(screen.getByText("Some subscribers would pay more under the first successor.")).toBeTruthy();
  });

  it("rejects an effective date inside the minimum notice and blocks Next", async () => {
    render(<RetirementWizard plan={PLAN} candidates={CANDIDATES} />);
    await waitFor(() => expect(calls.some((c) => c.path.startsWith("/retirements/coverage"))).toBe(true));
    const input = await screen.findByLabelText("Earliest effective date");
    const soon = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
    fireEvent.change(input, { target: { value: soon } });
    expect(screen.getByText(/at least 30 days of notice/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Next" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("starts only after the plan key is typed and a reason is given, posts the exact body, then opens the progress page", async () => {
    render(<RetirementWizard plan={PLAN} candidates={CANDIDATES} />);
    await toStep(4);
    const start = screen.getByRole("button", { name: "Start retirement" }) as HTMLButtonElement;
    expect(start.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "too short" } });
    fireEvent.change(screen.getByLabelText("Plan key to confirm"), { target: { value: "PRO" } });
    expect(start.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Pro v1 is replaced by Pro v3 for all new buyers" } });
    fireEvent.change(screen.getByLabelText("Plan key to confirm"), { target: { value: "pro" } });
    expect(start.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Plan key to confirm"), { target: { value: "PRO" } });
    expect(start.disabled).toBe(false);
    fireEvent.click(start);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/pricing/retirements/7"));
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.path).toBe("/retirements");
    expect(post.body).toMatchObject({
      planKey: "PRO",
      mode: "RETIRE_AT_RENEWAL",
      defaultOutcome: "FREE",
      noticeScheduleDays: [60, 30, 7, 1],
      channels: ["EMAIL", "IN_APP"],
      successors: [],
      confirmPlanKey: "PRO",
    });
  });

  it("keeps an API refusal inline and does not navigate", async () => {
    const base = respond;
    respond = (c) => (c.method === "POST" ? { status: 422, code: "NOTICE_TOO_SHORT", error: "Subscribers must get at least 30 days of notice." } : base(c));
    render(<RetirementWizard plan={PLAN} candidates={CANDIDATES} />);
    await toStep(4);
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Pro v1 is replaced by Pro v3 for all new buyers" } });
    fireEvent.change(screen.getByLabelText("Plan key to confirm"), { target: { value: "PRO" } });
    fireEvent.click(screen.getByRole("button", { name: "Start retirement" }));
    expect((await screen.findByTestId("start-error")).textContent).toMatch(/at least 30 days/);
    expect(push).not.toHaveBeenCalled();
  });

  it("explains a plan that is already retiring instead of showing the steps", () => {
    render(<RetirementWizard plan={{ ...PLAN, status: "RETIRING" }} candidates={CANDIDATES} />);
    expect(screen.getByText("This plan is not on sale")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
  });

  it("renders the notice preview behind a button on a phone", async () => {
    stubViewport(PHONE);
    render(<RetirementWizard plan={PLAN} candidates={CANDIDATES} />);
    await toStep(3);
    expect(screen.getByRole("button", { name: "Preview the notice" })).toBeTruthy();
    expect(screen.queryByTestId("notice-preview")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Preview the notice" }));
    expect(await screen.findByTestId("notice-preview")).toBeTruthy();
  });
});
