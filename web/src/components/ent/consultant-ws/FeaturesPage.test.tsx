// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/w/consultant/features" }));

import { ToastProvider } from "@kiwiply/ui";
import FeaturesPage from "./FeaturesPage";

type W = Record<string, unknown>;

const feat = (o: W): W => ({
  key: "x", title: "X", description: "d", tone: "accent", icon: "search", status: "ENABLED", premium: false, allowance: null, used: null, usedLastMonth: null,
  unit: "credits", usedNote: "used this month", resetsOn: null, href: "/w/consultant/matches", actionLabel: "View", overview: false, sample: true, ...o,
});

const full = (): W => ({
  orgId: 2,
  generatedAt: "2026-10-13T20:00:00Z",
  name: "Anika Rao",
  entitlementsSample: true,
  tiles: { active: 5, activeSample: true, creditsLeft: 50, creditsTotal: 50, creditsSample: true, usedThisMonth: 6, usedDeltaPct: 20, premium: 3, premiumSample: true, expiringSoon: 1, renewsOn: "2026-10-31", expiringSample: true },
  features: [
    feat({ key: "job-matching", title: "AI Job Matching", used: 2, unit: "matches", usedNote: "viewed this month" }),
    feat({ key: "resume-tailoring", title: "AI Resume Tailoring", premium: true, allowance: 50, used: null, resetsOn: "2026-11-01", actionLabel: "Use", href: "/w/consultant/resumes", overview: true }),
    feat({ key: "interview-prep", title: "Interview Prep", premium: true, allowance: 20, used: 18, unit: "sessions", resetsOn: "2026-11-01", actionLabel: "Use", href: "/w/consultant/interview-prep", overview: true }),
    feat({ key: "application-tracking", title: "Email Application Tracking", used: 1, unit: "applications", usedNote: "tracked", overview: true }),
  ],
});

const empty = (): W => ({ ...full(), tiles: { ...(full().tiles as W), usedThisMonth: 0, usedDeltaPct: null }, features: [] });

let calls: string[];
let reply: () => { status: number; body: unknown };

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false });
  calls = [];
  reply = () => ({ status: 200, body: full() });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(url);
      const r = reply();
      return new Response(JSON.stringify(r.body), { status: r.status, headers: { "content-type": "application/json" } });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function mount() {
  render(
    <ToastProvider>
      <FeaturesPage orgId={2} firstName="Anika Rao" />
    </ToastProvider>,
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(20);
  });
}

const rowsOf = () => [...document.querySelectorAll("[data-feature-row]")].map((e) => e.getAttribute("data-feature-row"));

describe("My Features from real data", () => {
  it("asks the BFF once and draws the feature table, with no tiles, usage overview, recommended tools, tips, Quick Actions or help card", async () => {
    await mount();
    expect(calls).toEqual(["/api/orgs/2/me-workspace/features"]);
    expect(document.querySelector("[data-consultant-features]")!.getAttribute("data-status")).toBe("ready");
    expect(rowsOf()).toEqual(["job-matching", "resume-tailoring", "interview-prep", "application-tracking"]);
    expect(document.querySelector("[data-tile-value]")).toBeNull();
    expect(document.querySelector("[data-usage-card]")).toBeNull();
    expect(document.querySelector("[data-recommended]")).toBeNull();
    expect(document.querySelector("[data-features-quick]")).toBeNull();
    expect(screen.queryByText(/Quick Actions|Ask a question|Usage Overview|Recommended Tools|Tips to Get More Value|vs last month/)).toBeNull();
    expect(document.querySelectorAll("[data-sample]").length).toBeGreaterThan(0);
  });

  it("shows unlimited, metered and untracked usage honestly, and no price anywhere", async () => {
    await mount();
    const row = (k: string) => document.querySelector(`[data-feature-row="${k}"]`) as HTMLElement;
    expect(within(row("job-matching")).getByText("Unlimited")).toBeTruthy();
    expect(within(row("job-matching")).getByText("2 viewed this month")).toBeTruthy();
    expect(within(row("interview-prep")).getByText("18 / 20 sessions")).toBeTruthy();
    expect(within(row("interview-prep")).getByText("Resets Nov 1, 2026")).toBeTruthy();
    expect(row("resume-tailoring").textContent).not.toMatch(/arrives with this tool|not tracked yet/);
    expect(within(row("resume-tailoring")).queryByRole("progressbar")).toBeNull();
    expect(within(row("interview-prep")).getByRole("progressbar").getAttribute("aria-valuenow")).toBe("90");
    expect(document.body.textContent).not.toMatch(/\$|price|billing|margin/i);
  });

  it("filters to what needs attention and to premium tools", async () => {
    await mount();
    const select = screen.getByLabelText("Filter features");
    fireEvent.change(select, { target: { value: "attention" } });
    expect(rowsOf()).toEqual(["interview-prep"]);
    fireEvent.change(select, { target: { value: "premium" } });
    expect(rowsOf()).toEqual(["resume-tailoring", "interview-prep"]);
    fireEvent.change(select, { target: { value: "enabled" } });
    expect(rowsOf()).toHaveLength(4);
  });

  it("links each action to the right page, pointing at the tab a moved page became", async () => {
    await mount();
    const use = screen.getByLabelText("Use Interview Prep") as HTMLAnchorElement;
    expect(use.getAttribute("href")).toBe("/w/consultant/interviews?tab=prepare");
  });

  it("has an honest empty state when there are no features", async () => {
    reply = () => ({ status: 200, body: empty() });
    await mount();
    expect(screen.getByText("No features match this filter.")).toBeTruthy();
  });

  it("shows the role panel on 404 and a retry on a failure", async () => {
    reply = () => ({ status: 404, body: { code: "not_found" } });
    await mount();
    expect(screen.getByText("This page isn't part of your role")).toBeTruthy();
    cleanup();
    reply = () => ({ status: 500, body: {} });
    await mount();
    expect(document.querySelector("[data-consultant-features]")!.getAttribute("data-status")).toBe("failed");
  });
});
